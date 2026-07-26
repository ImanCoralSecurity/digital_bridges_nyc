import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Legacy fallback fixtures predate validator JSON calls.
import { after, test } from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-topic-fallbacks-"));
const fakeCodex = join(tempDir, "codex");
const previousStore = process.env.DBRIDGES_STORE_DIR;
const previousPath = process.env.PATH;

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
let text;
if (input.includes("Begin with exactly")) {
  text = "I'm Sam, your facilitator. Today's topic is: Gaza war. Our agreements are to speak from experience, stay curious, and assume good faith. For our first go-round on today's topic, share its lived impact without speaking for whole communities.";
} else if (input.includes("Transcript to evaluate")) {
  text = JSON.stringify({ syntheticEmpathy: 0.7, adherence: 0.9, rationale: "Topic-preserving fallbacks kept the simulated dialogue grounded." });
} else if (input.includes("Close warmly in exactly 2")) {
  text = "Thank you for staying with this Gaza war conversation and the life-threatening New York moments it affects, like Astoria dinners or subway rides. The difference remains unresolved between emotional safety, as Amina and Ari emphasized, and direct suffering, as Bilal and Daniel warned.";
} else if (input.includes("Intervene immediately")) {
  text = "Please slow down and listen carefully. What family ritual helps everyone feel welcome?";
} else if (input.includes("The facilitator addressed the final question to you")) {
  text = "I hear the concern and want to understand it. What should I reflect back?";
} else if (
  input.includes("It is now your turn, Ari Feldman") &&
  input.includes("immediately previous speaker")
) {
  text = "Amina, your question makes me focus on verification in Gaza war. I try to name only what I can verify about safety and medicine while keeping the rest uncertain. Bilal Osman, which value helps you balance urgency and incomplete facts?";
} else {
  text = "My family shared food and jokes when a room felt tense, and those evenings taught me to listen.";
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-fallback-thread" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);
process.env.DBRIDGES_STORE_DIR = tempDir;
process.env.PATH = `${tempDir}:${previousPath ?? ""}`;

const { startRun } = await import("../lib/orchestrator.ts");
const { listGenerationAttemptsByRun, listTurnsByRun } = await import("../lib/db.ts");
const {
  assessInvitedResponseFidelity,
  challengeFidelityRejectionReasons,
  dialogueNoveltyRejectionReasons,
  globalSemanticMotifSaturationRejectionReasons,
  personaFidelityRejectionReasons,
  sameSpeakerSemanticReuseRejectionReasons,
  semanticMotifSaturationRejectionReasons,
  substantiveTopicRejectionReasons,
} = await import("../lib/dialogueQuality.ts");
const { assessTopicRelevance } = await import("../lib/topicRelevance.ts");
const {
  classifyConversation,
  validateTurn,
  visiblePromptScaffoldingFlags,
} = await import("../lib/methodology.ts");
const { controlledChallengeRejectionReasons } = await import("../lib/challengePrompt.ts");
const { getPersona } = await import("../lib/personas.ts");
const {
  detectPublicEngagementLanes,
  subjectLevelEngagementRejectionReasons,
} = await import("../lib/topicDepth.ts");

const fallbackScaffolding =
  /\b(?:my earlier position remains|add that concern to my weighting|position i actually stated|naming both alternatives does not settle|protected outcome|the challenge leaves unresolved|from my own standpoint|subject-level (?:position|priority|choice)|bounded response)\b/i;

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
});

test("every dialogue fallback preserves the configured political topic", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 10,
    mock: false,
    controversialAgentIds: ["jewish-daniel", "muslim-amina"],
    introductionRound: false,
  });

  const turns = listTurnsByRun(run.id);
  assert.equal(
    run.status,
    "completed",
    `${run.statusReason}\n${JSON.stringify(turns.map((turn) => ({
      phase: turn.roundKind,
      speaker: turn.speakerName,
      text: turn.text,
    })), null, 2)}`,
  );
  assert.equal(run.metrics?.topicRelevanceRate, 1);
  for (const turn of turns) {
    assert.equal(
      assessTopicRelevance(turn.text, topic).relevant,
      true,
      `${turn.roundKind} fallback was off topic: ${turn.text}`,
    );
    assert.deepEqual(
      visiblePromptScaffoldingFlags(turn.text),
      [],
      `${turn.roundKind} fallback exposed prompt scaffolding: ${turn.text}`,
    );
  }

  for (const kind of ["discussion", "intervention", "invited-response", "closing"]) {
    const phaseTurns = turns.filter((turn) => turn.roundKind === kind);
    assert.ok(phaseTurns.length > 0, `expected at least one ${kind}`);
    assert.ok(
      phaseTurns.every((turn) => turn.generationSource === "local-fallback"),
      `${kind} did not consistently use its validated local fallback`,
    );
  }
  for (const turn of turns.filter((entry) => entry.generationSource === "local-fallback")) {
    assert.doesNotMatch(turn.text, fallbackScaffolding, turn.text);
  }

  const challenge = turns.find((turn) => turn.controversialSpeaker);
  assert.ok(challenge);
  const target = turns.find((turn) => turn.id === challenge.respondsToTurnId);
  if (target) {
    assert.deepEqual(
      challengeFidelityRejectionReasons(challenge.text, target.text),
      [],
      challenge.text,
    );
  }
  assert.doesNotMatch(
    challenge.text,
    /becomes an easy shared conclusion|respectful conversation is not the same as resolution/i,
  );
  const closing = turns.find((turn) => turn.roundKind === "closing");
  assert.ok(closing);
  assert.doesNotMatch(closing.text, /\b(?:Amina|Ari|Bilal|Daniel)\b/i);
  assert.doesNotMatch(closing.text, /\b(?:like|such as|for example|for instance)\b/i);
  const rejectedClosing = listGenerationAttemptsByRun(run.id).find(
    (attempt) => attempt.roundKind === "closing",
  );
  assert.ok(rejectedClosing);
  assert.match(rejectedClosing.rejectionReasons.join(" "), /severe consequence/i);
});

test("two discussion rounds can use distinct validated local challenge fallbacks", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["muslim-amina", "muslim-bilal", "jewish-ari", "jewish-daniel"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 2,
    selection: "round-robin",
    budgetUsd: 10,
    mock: false,
    projectSessionNumber: 2,
    controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
    introductionRound: false,
  });

  const turns = listTurnsByRun(run.id);
  assert.equal(
    run.status,
    "completed",
    `${run.statusReason}\n${JSON.stringify(turns.map((turn) => ({
      phase: turn.roundKind,
      speaker: turn.speakerName,
      text: turn.text,
    })), null, 2)}`,
  );
  const challenges = turns.filter((turn) => turn.controversialSpeaker);
  assert.equal(challenges.length, 4);
  for (const roundNumber of [1, 2]) {
    assert.deepEqual(
      challenges
        .filter((turn) => turn.roundNumber === roundNumber)
        .map((turn) => turn.speakerId)
        .sort(),
      ["jewish-daniel", "muslim-bilal"],
    );
  }
  assert.ok(
    challenges.every((turn) => turn.generationSource === "local-fallback"),
    challenges.map((turn) => turn.generationSource).join(", "),
  );
  assert.doesNotMatch(
    challenges.find((turn) => turn.speakerId === "jewish-daniel")?.text ?? "",
    /\bvalue of (?:joy|humor)\b/i,
    "a difficult-public-topic fallback should prefer Daniel's sober authored values",
  );

  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const priorChallengeTexts = [];
  for (const challenge of challenges) {
    const target = byId.get(challenge.respondsToTurnId);
    assert.ok(target, `missing target for ${challenge.speakerName}`);
    assert.equal(target.roundKind, "discussion");
    assert.equal(target.controversialSpeaker, false);
    assert.equal(classifyConversation(challenge.text).tag, "escalating", challenge.text);
    assert.equal(validateTurn(challenge.text).compliant, true, challenge.text);
    assert.deepEqual(
      controlledChallengeRejectionReasons(
        challenge.text,
        classifyConversation(challenge.text).reasons,
        validateTurn(challenge.text).signals,
      ),
      [],
      challenge.text,
    );
    assert.deepEqual(
      challengeFidelityRejectionReasons(challenge.text, target.text, priorChallengeTexts),
      [],
      challenge.text,
    );
    assert.deepEqual(
      substantiveTopicRejectionReasons(challenge.text, topic),
      [],
      challenge.text,
    );
    assert.deepEqual(
      personaFidelityRejectionReasons(
        challenge.text,
        getPersona(challenge.speakerId),
        { topic },
      ),
      [],
      challenge.text,
    );
    assert.deepEqual(
      dialogueNoveltyRejectionReasons(challenge.text, priorChallengeTexts, topic),
      [],
      challenge.text,
    );
    assert.doesNotMatch(challenge.text, fallbackScaffolding, challenge.text);
    assert.match(challenge.text, new RegExp(`\\b${target.speakerName.split(" ")[0]}\\b`, "i"));
    assert.doesNotMatch(challenge.text, /\bthe detail\b/i);
    priorChallengeTexts.push(challenge.text);
  }
  assert.match(
    challenges[1].text,
    /\b(?:your point about [a-z][a-z -]{1,50}|that point about [a-z][a-z -]{1,50}|that concrete experience)\b/i,
  );
  assert.match(
    challenges[1].text,
    /(?:human consequence|people directly affected|people in danger|dignity|urgent|immediate (?:human need|relief)|civilian harm|civilian safety|hostage|humanitarian access|rights)/i,
  );
  assert.doesNotMatch(
    challenges[1].text,
    /care can harden into certainty about experiences we do not own|care for one concrete need can become a claim about the right response|one New York perspective set the scale/i,
  );
  assert.doesNotMatch(challenges[1].text, /circle|group (?:may|might|could)/i);
  assert.doesNotMatch(challenges[1].text, /…|\.\.\.|["“][^"”]{40,}/);
  assert.notEqual(challenges[0].text, challenges[1].text);
});

test("two repairs for Amina select distinct novelty-safe invited-response fallbacks", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["muslim-amina", "muslim-bilal", "jewish-ari", "jewish-daniel"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 2,
    selection: "round-robin",
    budgetUsd: 10,
    mock: false,
    projectSessionNumber: 2,
    controversialAgentIds: ["jewish-ari", "jewish-daniel"],
    introductionRound: false,
  });

  const turns = listTurnsByRun(run.id);
  assert.equal(
    run.status,
    "completed",
    `${run.statusReason}\n${JSON.stringify(turns.map((turn) => ({
      phase: turn.roundKind,
      speaker: turn.speakerName,
      text: turn.text,
    })), null, 2)}`,
  );
  const aminaRepairs = turns.filter(
    (turn) =>
      turn.speakerId === "muslim-amina" &&
      turn.roundKind === "invited-response",
  );
  assert.equal(aminaRepairs.length, 2);
  assert.ok(
    aminaRepairs.every((turn) => turn.generationSource === "local-fallback"),
  );
  assert.notEqual(aminaRepairs[0].text, aminaRepairs[1].text);
  assert.deepEqual(
    dialogueNoveltyRejectionReasons(
      aminaRepairs[1].text,
      [aminaRepairs[0].text],
      topic,
    ),
    [],
    aminaRepairs[1].text,
  );

  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  for (const response of aminaRepairs) {
    assert.doesNotMatch(response.text, /\?/);
    assert.doesNotMatch(response.text, fallbackScaffolding, response.text);
    const intervention = byId.get(response.invitedByTurnId);
    const trigger = intervention
      ? byId.get(intervention.triggeredByTurnId)
      : undefined;
    const target = trigger ? byId.get(trigger.respondsToTurnId) : undefined;
    assert.ok(trigger);
    assert.ok(target);
    assert.match(
      response.text,
      new RegExp(`\\b${trigger.speakerName.split(" ")[0]}\\b`, "i"),
    );
    const fidelity = assessInvitedResponseFidelity({
      text: response.text,
      challengerName: trigger.speakerName,
      challengerText: trigger.text,
      targetName: target.speakerName,
      targetText: target.text,
      topic,
    });
    assert.equal(
      fidelity.acceptable,
      true,
      fidelity.rejectionReasons.join("; "),
    );
  }
});

test("a non-war public topic gets a natural topic-agnostic challenge fallback", async () => {
  const topic = "NYC mayoral election";
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 10,
    mock: false,
    controversialAgentIds: ["muslim-amina"],
    introductionRound: false,
  });

  const turns = listTurnsByRun(run.id);
  assert.equal(run.status, "completed", run.statusReason);
  const challenge = turns.find((turn) => turn.controversialSpeaker);
  assert.ok(challenge);
  assert.equal(challenge.speakerId, "muslim-amina");
  assert.equal(challenge.generationSource, "local-fallback");
  assert.match(challenge.text, /NYC mayoral election/i);
  assert.doesNotMatch(challenge.text, /from my own standpoint/i);
  assert.match(challenge.text, /\b(?:priority|obligation|condition|choice)\s+i\s+(?:hold|carry|cannot|can'?t)|\bmy\s+(?:priority|standard|criterion)\b/i);
  assert.doesNotMatch(challenge.text, /from my own life in Astoria, Queens/i);
  assert.match(challenge.text, /need to challenge/i);
  assert.match(challenge.text, /(?:leaves out|leaves unanswered|does not address)/i);
  assert.ok(detectPublicEngagementLanes(challenge.text, topic).length > 0);
  assert.deepEqual(
    subjectLevelEngagementRejectionReasons(challenge.text, topic),
    [],
    challenge.text,
  );
  assert.doesNotMatch(
    challenge.text,
    /\b(?:war|armed conflict|civilian|hostage|ceasefire|humanitarian|displaced)\b/i,
  );

  const target = turns.find((turn) => turn.id === challenge.respondsToTurnId);
  assert.ok(target);
  assert.deepEqual(
    challengeFidelityRejectionReasons(challenge.text, target.text),
    [],
    challenge.text,
  );
  assert.deepEqual(
    substantiveTopicRejectionReasons(challenge.text, topic),
    [],
    challenge.text,
  );
});

test("a second public-topic fallback surfaces a tension without inverting uncertainty", async () => {
  const topic = "climate change";
  const run = await startRun({
    attendeeIds: ["muslim-amina", "muslim-bilal", "jewish-ari", "jewish-daniel"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 2,
    selection: "round-robin",
    budgetUsd: 10,
    mock: false,
    projectSessionNumber: 2,
    controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
    introductionRound: false,
  });

  assert.equal(run.status, "completed", run.statusReason);
  const turns = listTurnsByRun(run.id);
  const challenges = turns.filter(
    (turn) => turn.controversialSpeaker,
  );
  assert.equal(challenges.length, 4);
  const second = challenges[1];
  assert.match(
    second.text,
    /(?:flood|heat|emissions|safe housing|public health|environmental harm|immediate danger)/i,
  );
  assert.ok(detectPublicEngagementLanes(second.text, topic).length > 0);
  assert.deepEqual(
    subjectLevelEngagementRejectionReasons(second.text, topic),
    [],
    second.text,
  );
  assert.doesNotMatch(second.text, /harden into certainty/i);

  const target = turns.find((turn) => turn.id === second.respondsToTurnId);
  assert.ok(target);
  assert.deepEqual(
    challengeFidelityRejectionReasons(second.text, target.text),
    [],
    second.text,
  );
  const priorScheduled = turns.filter(
    (turn) =>
      turn.index < second.index &&
      turn.role === "persona" &&
      turn.roundKind === "discussion",
  );
  assert.deepEqual(
    semanticMotifSaturationRejectionReasons(
      second.text,
      priorScheduled
        .filter((turn) => turn.speakerId !== second.speakerId)
        .map((turn) => ({ speakerId: turn.speakerId, text: turn.text })),
    ),
    [],
    second.text,
  );
  assert.deepEqual(
    sameSpeakerSemanticReuseRejectionReasons(
      second.text,
      priorScheduled
        .filter((turn) => turn.speakerId === second.speakerId)
        .map((turn) => turn.text),
    ),
    [],
    second.text,
  );
  assert.deepEqual(
    globalSemanticMotifSaturationRejectionReasons(
      second.text,
      priorScheduled.map((turn) => ({
        speakerId: turn.speakerId,
        text: turn.text,
      })),
    ),
    [],
    second.text,
  );
});
