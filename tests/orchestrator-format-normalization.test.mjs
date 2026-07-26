import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Isolate output normalization from semantic review.
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-format-normalization-"));
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
  text = "I'm Sam, your facilitator. Today's topic is: **Gaza war**. Our shared agreements are to speak from personal experience, stay curious rather than persuasive, and assume good faith. For our first go-round on today's topic, share one concrete human consequence or uncertainty.";
} else if (input.includes("It is now your turn, Daniel Behar")) {
  text = "My priority in **Gaza war** is civilian safety and reliable access to food, water, and medicine. I connect that priority to my value of community. Amina Rahman, which obligations are hardest for you to balance?";
} else if (input.includes("It is now your turn, Amina Rahman")) {
  text = "Daniel, I hear your question. In the _Gaza war_, I weigh meeting urgent needs against protecting the rights of displaced families. My value of hospitality keeps both duties visible for me.";
} else if (input.includes("Close warmly in exactly 2")) {
  text = "As we close **Gaza war**, one connection was concern for people directly affected. Thank you for naming uncertainty without claiming everyone reached the same answer.";
} else if (input.includes("Transcript to evaluate")) {
  text = JSON.stringify({ syntheticEmpathy: 0.8, adherence: 0.9, rationale: "The dialogue stayed concrete and careful." });
} else {
  throw new Error("Unexpected prompt: " + input.slice(0, 160));
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-format-thread" }) + "\\n");
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

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
});

test("provider Markdown decoration is normalized before visible dialogue is stored", async () => {
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
  });

  assert.equal(run.status, "completed", run.statusReason);
  assert.equal(listGenerationAttemptsByRun(run.id).length, 0);
  const turns = listTurnsByRun(run.id);
  assert.ok(turns.length > 0);
  for (const turn of turns) {
    assert.doesNotMatch(turn.text, /\*\*|(?<!\w)_(?=\S)|`/);
    assert.notEqual(turn.generationSource, "local-fallback");
  }
});
