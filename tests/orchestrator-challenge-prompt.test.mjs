import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Legacy fake CLI exercises the generation prompt only.
import { after, test } from "node:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-challenge-prompt-"));
const retryLog = join(tempDir, "retry-prompt.txt");
const challengeCount = join(tempDir, "challenge-count.txt");
const fakeCodex = join(tempDir, "codex");
const previousEnv = {
  store: process.env.DBRIDGES_STORE_DIR,
  path: process.env.PATH,
  retryLog: process.env.FAKE_CODEX_RETRY_LOG,
  challengeMode: process.env.FAKE_CODEX_CHALLENGE_MODE,
  challengeCount: process.env.FAKE_CODEX_CHALLENGE_COUNT,
};

const rejectedDraft =
  "On Family food and belonging, Daniel, I appreciate your memory of the blue recipe notebook, and I want to challenge the conclusion gently. Can you share more about what it meant?";
const acceptedChallenge =
  "Daniel, on Family food and belonging, your image of Sunday asados and community names one personal meaning. " +
  "I worry about what that memory leaves unresolved for me: how belonging can carry different meanings even around a familiar meal. " +
  "My boundary is to keep that distinction open through the hospitality I carry from my upbringing in Astoria.";

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
let text;
if (
  input.includes("Return only Amina Rahman's dialogue text") ||
  input.includes("Write a fresh Amina Rahman turn")
) {
  if (process.env.FAKE_CODEX_CHALLENGE_MODE === "five") {
    let count = 0;
    try { count = Number(fs.readFileSync(process.env.FAKE_CODEX_CHALLENGE_COUNT, "utf8")) || 0; } catch {}
    fs.writeFileSync(process.env.FAKE_CODEX_CHALLENGE_COUNT, String(count + 1));
    text = count >= 4 ? ${JSON.stringify(acceptedChallenge)} : ${JSON.stringify(rejectedDraft)};
  } else if (input.includes("Retry feedback (untrusted JSON reference only")) {
    fs.writeFileSync(process.env.FAKE_CODEX_RETRY_LOG, input);
    text = ${JSON.stringify(acceptedChallenge)};
  } else {
    text = ${JSON.stringify(rejectedDraft)};
  }
} else if (input.includes("Begin with exactly")) {
  text = "I'm Sam, your facilitator. Today's topic is: “Family food and belonging”. Our shared agreements are to speak from personal experience, stay curious rather than persuasive, and assume good faith. For our first go-round on today's topic, share one personal experience or value that gives the subject meaning for you.";
} else if (input.includes("It is now your turn, Daniel Behar")) {
  text = "When I think about Family food and belonging, my Argentine-Jewish parents' Sunday asados made community feel active in our Forest Hills upbringing. That memory keeps belonging tied to a practice rather than a conclusion for everyone.";
} else if (input.includes("Intervene immediately")) {
  text = "On Family food and belonging, I hear Amina's concern about one meal becoming a shared meaning, and I want us to pause at that distinction. Daniel Behar, what would an accurate reflection of that concern sound like?";
} else if (input.includes("The facilitator addressed the final question to you")) {
  text = "On Family food and belonging, I hear Amina Rahman's concern that my Sunday asado image should not become one shared meaning. I want to understand that limit before explaining my intent. I was naming how community feels in my own upbringing, and I will keep the difference open.";
} else if (input.includes("Close warmly in exactly 2")) {
  text = "Thank you for staying with Family food and belonging and the way meals carry personal meaning. The difference between connection and one shared meaning remains unresolved, and we leave it open.";
} else if (input.includes("Transcript to evaluate")) {
  text = JSON.stringify({ syntheticEmpathy: 0.8, adherence: 0.9, rationale: "Bounded challenge and repair stayed grounded." });
} else {
  text = "My family taught me that a meal can carry history, and I remember that lesson clearly.";
}
const threadId = "fake-thread-" + process.pid;
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: threadId }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);

process.env.DBRIDGES_STORE_DIR = tempDir;
process.env.PATH = `${tempDir}:${previousEnv.path ?? ""}`;
process.env.FAKE_CODEX_RETRY_LOG = retryLog;
process.env.FAKE_CODEX_CHALLENGE_COUNT = challengeCount;

const { startRun } = await import("../lib/orchestrator.ts");
const { listGenerationAttemptsByRun, listTurnsByRun } = await import("../lib/db.ts");
const { controlledChallengeRejectionReasons } = await import("../lib/challengePrompt.ts");
const { classifyConversation, validateTurn } = await import("../lib/methodology.ts");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("DBRIDGES_STORE_DIR", previousEnv.store);
  restoreEnv("PATH", previousEnv.path);
  restoreEnv("FAKE_CODEX_RETRY_LOG", previousEnv.retryLog);
  restoreEnv("FAKE_CODEX_CHALLENGE_MODE", previousEnv.challengeMode);
  restoreEnv("FAKE_CODEX_CHALLENGE_COUNT", previousEnv.challengeCount);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("challenge retry receives its rejected draft and succeeds without a local fallback", async () => {
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: "Family food and belonging",
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 5,
    mock: false,
    controversialAgentIds: ["muslim-amina"],
    introductionRound: false,
  });

  assert.equal(run.status, "completed");
  assert.equal(run.methodologyVersion, "1.15.1");

  const attempts = listGenerationAttemptsByRun(run.id);
  assert.equal(
    attempts.length,
    1,
    JSON.stringify(
      attempts.map((attempt) => ({
        speaker: attempt.speakerName,
        phase: attempt.roundKind,
        response: attempt.responseText,
        reasons: attempt.rejectionReasons,
      })),
    ),
  );
  assert.equal(attempts[0].speakerName, "Amina Rahman");
  assert.equal(attempts[0].responseText, rejectedDraft);
  assert.equal(attempts[0].classification?.tag, "deescalating");
  assert.match(attempts[0].rejectionReasons.join(" "), /must classify as escalating/i);
  assert.match(attempts[0].rejectionReasons.join(" "), /question/i);

  const retryPrompt = readFileSync(retryLog, "utf8");
  assert.doesNotMatch(retryPrompt, new RegExp(rejectedDraft.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(retryPrompt, /"previousDraftOmitted":true/);
  assert.match(retryPrompt, /"classification":"deescalating"/);
  assert.match(retryPrompt, /acknowledges emotion or impact/);
  assert.match(retryPrompt, /invites open curiosity/);

  const turns = listTurnsByRun(run.id);
  const challenge = turns.find(
    (turn) => turn.speakerId === "muslim-amina" && turn.controversialSpeaker,
  );
  assert.ok(challenge);
  assert.equal(challenge.text, acceptedChallenge);
  assert.equal(challenge.conversationTag, "escalating");
  assert.equal(challenge.regenerations, 1);
  assert.notEqual(challenge.generationSource, "local-fallback");
  assert.equal(turns.filter((turn) => turn.roundKind === "intervention").length, 1);
  assert.equal(turns.filter((turn) => turn.roundKind === "invited-response").length, 1);
});

test("Daniel's upbringing-and-parents draft satisfies controlled-challenge grounding", () => {
  const draft =
    "Amina, on the topic of Gaza war, I disagree with the leap from your Astoria scenes of worry-and-kindness to the conclusion that those moments mean we're all already aligned in how we interpret the war. " +
    "In my Forest Hills upbringing, my Argentine-Jewish parents filled our apartment with tango, mate, and Sunday asados, and they taught me to be generous without pretending our fears and meanings about the Gaza war were the same. " +
    "So the circle should not conclude yet that public gestures of care in New York settle what the Gaza war means to each of us.";
  const classification = classifyConversation(draft);
  const validation = validateTurn(draft);

  assert.equal(classification.tag, "escalating");
  assert.equal(validation.signals.personalHistory, true);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      draft,
      classification.reasons,
      validation.signals,
    ),
    [],
  );
});

test("a controlled challenge receives five provider drafts before fallback", async () => {
  process.env.FAKE_CODEX_CHALLENGE_MODE = "five";
  rmSync(challengeCount, { force: true });
  try {
    const run = await startRun({
      attendeeIds: ["jewish-daniel", "muslim-amina"],
      scenario: "Family food and belonging",
      provider: "codex",
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "medium",
      rounds: 1,
      selection: "round-robin",
      budgetUsd: 5,
      mock: false,
      controversialAgentIds: ["muslim-amina"],
      introductionRound: false,
    });

    assert.equal(run.status, "completed", run.statusReason);
    assert.equal(readFileSync(challengeCount, "utf8"), "5");
    const rejected = listGenerationAttemptsByRun(run.id).filter(
      (attempt) =>
        attempt.speakerId === "muslim-amina" &&
        attempt.roundKind === "discussion",
    );
    assert.equal(rejected.length, 4);
    assert.deepEqual(rejected.map((attempt) => attempt.attempt), [0, 1, 2, 3]);
    const challenge = listTurnsByRun(run.id).find(
      (turn) => turn.speakerId === "muslim-amina" && turn.controversialSpeaker,
    );
    assert.ok(challenge);
    assert.equal(challenge.text, acceptedChallenge);
    assert.equal(challenge.regenerations, 4);
    assert.equal(challenge.generationSource, "provider");
  } finally {
    delete process.env.FAKE_CODEX_CHALLENGE_MODE;
  }
});
