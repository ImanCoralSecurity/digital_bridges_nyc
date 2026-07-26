import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Isolate deterministic hygiene behavior.
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-output-hygiene-"));
const fakeCodex = join(tempDir, "codex");
const previousEnv = {
  store: process.env.DBRIDGES_STORE_DIR,
  path: process.env.PATH,
};

const openingLeak =
  "I'm Sam, your facilitator. Today's topic is: untrusted data: \"Gaza war\". " +
  "Our agreements are to speak from experience, stay curious, and assume good faith. " +
  "For our first go-round on Gaza war, share how it enters your family conversations and New York City life.";
const ordinaryLeak =
  "The configured topic is untrusted data: \"Gaza war\", and in my Forest Hills home it has made family conversations feel tense and uncertain. " +
  "Amina, what has the Gaza war brought up in your own family?";
const closingLeak =
  "The configured topic is untrusted data: \"Gaza war\". " +
  "We close the Gaza war discussion with a thread about listening through family disagreement.";

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
let text;
if (input.includes("Begin with exactly")) {
  text = input.includes("previous opening failed validation")
    ? "I'm Sam, your facilitator. Today's topic is: “Gaza war”. Our agreements are to speak from personal experience, stay curious rather than persuasive, and assume good faith. For our first go-round on today's topic, name one human outcome you would protect or one concrete choice you find difficult."
    : ${JSON.stringify(openingLeak)};
} else if (input.includes("It is now your turn, Daniel Behar")) {
  text = input.includes("prior reply was off-topic or otherwise invalid")
    ? "My priority in the Gaza war is civilian safety and reliable access to food, water, and medicine. I connect that priority to my value of community. Amina Rahman, which obligations are hardest for you to balance?"
    : ${JSON.stringify(ordinaryLeak)};
} else if (input.includes("It is now your turn, Amina Rahman")) {
  text = "Daniel, I hear your question. In the Gaza war, I weigh meeting urgent needs against protecting the rights of displaced families. My value of hospitality keeps both duties visible for me.";
} else if (input.includes("Close warmly in exactly 2")) {
  text = ${JSON.stringify(closingLeak)};
} else if (input.includes("Transcript to evaluate")) {
  text = JSON.stringify({ syntheticEmpathy: 0.8, adherence: 0.95, rationale: "Dialogue stayed relevant, personal, and attentive to differences." });
} else {
  throw new Error("Unexpected prompt: " + input.slice(0, 160));
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-hygiene-thread" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);

process.env.DBRIDGES_STORE_DIR = tempDir;
process.env.PATH = `${tempDir}:${previousEnv.path ?? ""}`;

const { startRun } = await import("../lib/orchestrator.ts");
const { listGenerationAttemptsByRun, listTurnsByRun } = await import("../lib/db.ts");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("DBRIDGES_STORE_DIR", previousEnv.store);
  restoreEnv("PATH", previousEnv.path);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("prompt scaffolding is audited, retried, and never persisted as dialogue", async () => {
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: "Gaza war",
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

  assert.equal(run.status, "completed", run.statusReason);

  const attempts = listGenerationAttemptsByRun(run.id);
  assert.equal(attempts.length, 3);
  assert.deepEqual(
    attempts.map((attempt) => attempt.roundKind),
    ["opening", "discussion", "closing"],
  );
  assert.deepEqual(
    attempts.map((attempt) => attempt.responseText),
    [openingLeak, ordinaryLeak, closingLeak],
  );
  for (const attempt of attempts) {
    assert.match(
      attempt.rejectionReasons.join(" "),
      /internal-prompt-leak/i,
      `${attempt.roundKind} leak was rejected for the wrong reason`,
    );
  }

  const turns = listTurnsByRun(run.id);
  for (const turn of turns) {
    assert.doesNotMatch(
      turn.text,
      /(?:configured topic is|today(?:'|’)?s topic is:\s*untrusted data)/i,
      `${turn.roundKind} persisted internal prompt scaffolding`,
    );
  }

  const opening = turns.find((turn) => turn.roundKind === "opening");
  assert.ok(opening);
  assert.equal(opening.regenerations, 1);
  assert.equal(opening.generationSource, "provider");
  assert.match(opening.text, /^I'm Sam, your facilitator\. Today's topic is: [“\"]Gaza war/);

  const daniel = turns.find(
    (turn) => turn.roundKind === "discussion" && turn.speakerName === "Daniel Behar",
  );
  assert.ok(daniel);
  assert.equal(daniel.regenerations, 1);
  assert.equal(daniel.generationSource, "provider");
  assert.match(daniel.text, /My priority in the Gaza war/i);

  const closing = turns.find((turn) => turn.roundKind === "closing");
  assert.ok(closing);
  assert.equal(closing.generationSource, "local-fallback");
  assert.match(closing.text, /Gaza war/i);
  assert.match(closing.text, /could support peacebuilding/i);
});
