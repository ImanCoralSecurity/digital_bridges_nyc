#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Let Node report the original unresolved import below.
      }
    }
    return nextResolve(specifier, context);
  },
});

const { CHALLENGE_MOVES, buildChallengeTurnPrompt } =
  await import("../lib/challengePrompt.ts");
const { shortHash } = await import("../lib/hash.ts");
const { safeContextDetail, safeSessionTopic } = await import("../lib/methodology.ts");
const { compilePersonaSystemPrompt, getPersona } = await import("../lib/personas.ts");

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const attemptId = valueAfter("--attempt-id");
const attemptsPath = resolve(
  valueAfter("--store") ?? join(process.cwd(), "data", "store", "generation_attempts.json"),
);
if (!attemptId) throw new Error("--attempt-id is required");

function readArray(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(value)) throw new Error(`${path} must contain a JSON array`);
  return value;
}

function compactExcerpt(text, max = 180) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

const storeDir = dirname(attemptsPath);
const attempt = readArray(attemptsPath).find((item) => item?.id === attemptId);
if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);
if (attempt.role !== "persona" || attempt.roundKind !== "discussion") {
  throw new Error(`${attemptId} is not a scheduled persona discussion attempt`);
}

const run = readArray(join(storeDir, "runs.json")).find((item) => item?.id === attempt.runId);
if (!run) throw new Error(`Run not found: ${attempt.runId}`);
const turns = readArray(join(storeDir, "turns.json"))
  .filter((turn) => turn?.runId === run.id)
  .sort((left, right) => left.index - right.index);
const acceptedChallenge = turns.find(
  (turn) =>
    turn.index === attempt.turnIndex &&
    turn.speakerId === attempt.speakerId &&
    turn.roundKind === "discussion" &&
    turn.controversialSpeaker === true,
);
if (!acceptedChallenge) {
  throw new Error(`No accepted challenge turn found at index ${attempt.turnIndex}`);
}

const priorTurns = turns.filter((turn) => turn.index < attempt.turnIndex);
const priorChallenges = priorTurns.filter(
  (turn) =>
    turn.role === "persona" &&
    turn.roundKind === "discussion" &&
    turn.controversialSpeaker === true,
);
const targetTurn = acceptedChallenge.respondsToTurnId
  ? turns.find((turn) => turn.id === acceptedChallenge.respondsToTurnId)
  : undefined;
const safeScenario = safeSessionTopic(run.config.scenario);
const groundingDetail = safeContextDetail(
  targetTurn?.text,
  safeScenario,
  targetTurn ? 100 : 160,
);
const speaker = getPersona(attempt.speakerId);
const otherNames = run.attendees
  .filter((attendee) => attendee.id !== speaker.id)
  .map((attendee) => attendee.name);
const challengeMove = CHALLENGE_MOVES[priorChallenges.length % CHALLENGE_MOVES.length];
const systemPrompt = compilePersonaSystemPrompt(speaker, otherNames, "escalating");
const userPrompt = buildChallengeTurnPrompt({
  scenario: safeScenario,
  publicTurns: priorTurns.map((turn) => ({ speakerName: turn.speakerName, text: turn.text })),
  speakerName: speaker.displayName,
  target: targetTurn
    ? {
        speakerName: targetTurn.speakerName,
        addressName: targetTurn.speakerName.split(" ")[0],
        detail: groundingDetail,
        fullText: targetTurn.text,
      }
    : null,
  challengeMove,
  recentChallengeExcerpts: priorChallenges
    .filter((turn) => turn.conversationTag === "escalating")
    .slice(-3)
    .map((turn) => compactExcerpt(turn.text)),
});

process.stdout.write(
  JSON.stringify(
    {
      sourceAttemptId: attempt.id,
      sourceRunId: run.id,
      sourcePromptHash: attempt.promptHash,
      currentPromptHash: shortHash(systemPrompt + userPrompt),
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort ?? "medium",
      challengeMove,
      systemPrompt,
      userPrompt,
    },
    null,
    2,
  ) + "\n",
);
