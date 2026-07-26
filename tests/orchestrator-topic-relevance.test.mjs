import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Legacy fake CLI exercises heuristic diagnostics.
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-topic-retry-"));
const fakeCodex = join(tempDir, "codex");
const retryLog = join(tempDir, "topic-retry.txt");
const judgeLog = join(tempDir, "judge-prompt.txt");
const previousEnv = {
  store: process.env.DBRIDGES_STORE_DIR,
  path: process.env.PATH,
  retryLog: process.env.FAKE_TOPIC_RETRY_LOG,
  judgeLog: process.env.FAKE_TOPIC_JUDGE_LOG,
};

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
let text;
if (input.includes("Begin with exactly")) {
  text = "I'm Sam, your facilitator. Today's topic is: Gaza war. Our agreements are to speak from experience, stay curious, and assume good faith. For our first go-round on today's topic, name one concrete aspect, value, or uncertainty you want the circle to hold.";
} else if (input.includes("It is now your turn, Daniel Behar")) {
  if (input.includes("prior reply was off-topic")) {
    fs.writeFileSync(process.env.FAKE_TOPIC_RETRY_LOG, input);
    text = "My first priority in the Gaza war is civilian safety and reliable access to food and medicine. Amina Rahman, which two obligations within Gaza war are hardest for you to weigh?";
  } else {
    text = "My grandfather told jokes over dinner, and I learned that laughter can carry a family through a difficult evening. Amina, what food made your home feel safe?";
  }
} else if (input.includes("It is now your turn, Amina Rahman")) {
  text = "Daniel, I hear your question. In the Gaza war, I am torn between protecting civilians from immediate harm and preserving accountability for that harm; I cannot let either obligation erase the other.";
} else if (input.includes("Close warmly in exactly 2")) {
  text = "We close our discussion of the Gaza war with civilian safety as one shared priority and an unresolved difference about how to weigh immediate protection against accountability. Thank you for leaving that choice open without forcing consensus.";
} else if (input.includes("Transcript to evaluate")) {
  fs.writeFileSync(process.env.FAKE_TOPIC_JUDGE_LOG, input);
  text = JSON.stringify({ syntheticEmpathy: 0.8, adherence: 0.95, rationale: "Every discussion turn remained directly connected to the session subject through lived experience." });
} else {
  throw new Error("Unexpected prompt: " + input.slice(0, 120));
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-topic-thread" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);

process.env.DBRIDGES_STORE_DIR = tempDir;
process.env.PATH = `${tempDir}:${previousEnv.path ?? ""}`;
process.env.FAKE_TOPIC_RETRY_LOG = retryLog;
process.env.FAKE_TOPIC_JUDGE_LOG = judgeLog;

const { startRun } = await import("../lib/orchestrator.ts");
const { listGenerationAttemptsByRun, listTurnsByRun } = await import("../lib/db.ts");
const { assessTopicRelevance } = await import("../lib/topicRelevance.ts");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("DBRIDGES_STORE_DIR", previousEnv.store);
  restoreEnv("PATH", previousEnv.path);
  restoreEnv("FAKE_TOPIC_RETRY_LOG", previousEnv.retryLog);
  restoreEnv("FAKE_TOPIC_JUDGE_LOG", previousEnv.judgeLog);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("off-topic provider text is audited and retried with the selected topic", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 5,
    mock: false,
    controversialAgentIds: [],
    introductionRound: false,
  });

  assert.equal(run.status, "completed");
  assert.equal(run.metrics?.topicRelevanceRate, 1);

  const attempts = listGenerationAttemptsByRun(run.id);
  const offTopicAttempt = attempts.find(
    (attempt) =>
      attempt.speakerName === "Daniel Behar" &&
      attempt.roundKind === "discussion" &&
      /did not stay anchored/i.test(attempt.rejectionReasons.join(" ")),
  );
  assert.ok(offTopicAttempt);
  assert.match(offTopicAttempt.rejectionReasons.join(" "), /gaza/i);
  assert.match(offTopicAttempt.rejectionReasons.join(" "), /war/i);

  const unsupportedClosingDifference = attempts.find(
    (attempt) =>
      attempt.roundKind === "closing" &&
      /latest subject positions|materially compatible|unresolved difference/i.test(
        attempt.rejectionReasons.join(" "),
      ),
  );
  assert.ok(
    unsupportedClosingDifference,
    "a session without a challenge must not invent an unresolved difference",
  );

  const retryPrompt = readFileSync(retryLog, "utf8");
  assert.match(retryPrompt, /prior reply was off-topic/i);
  assert.match(retryPrompt, /Gaza war/);

  const turns = listTurnsByRun(run.id);
  for (const turn of turns) {
    assert.equal(assessTopicRelevance(turn.text, topic).relevant, true);
  }
  const daniel = turns.find(
    (turn) => turn.speakerName === "Daniel Behar" && turn.roundKind === "discussion",
  );
  assert.equal(daniel?.regenerations, 1);
  assert.notEqual(daniel?.generationSource, "local-fallback");

  const judgePrompt = readFileSync(judgeLog, "utf8");
  assert.match(judgePrompt, /session subject[^]*Gaza war/i);
  assert.match(judgePrompt, /do not reward avoiding/i);
});
