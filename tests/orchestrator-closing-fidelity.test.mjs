import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Legacy fake CLI returns dialogue, not validator JSON.
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-closing-fidelity-"));
const fakeCodex = join(tempDir, "codex");
const previousEnv = {
  store: process.env.DBRIDGES_STORE_DIR,
  path: process.env.PATH,
  closingMode: process.env.FAKE_CLOSING_FIDELITY_MODE,
};

const unsupportedClosing =
  "As we close the Gaza war, I'm holding the concrete human stake of children's everyday safety—missed calls, lost electricity, and uncertain access to medicine making routine, sleep, and reassurance fracture in ways that feel life-threatening. " +
  "One unresolved tension remains between urgency to act and the limits of certainty.";
const unsupportedCampClosing =
  "Thank you for this work on Gaza war; the concrete stake is continuous medical access alongside family reunification during displacement. " +
  "The unresolved difference is that one commitment centers uninterrupted care, while another insists that displaced-family rights must come first.";
const naturalThanksClosing =
  "I'd like to thank everyone for staying with the Gaza war and the concrete concern of access to medicine. " +
  "This discussion could support peacebuilding by keeping that human stake visible without claiming consensus.";

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
let text;
if (input.includes("Begin with exactly")) {
  text = "I'm Sam, your facilitator. Today's topic is: “Gaza war”. Our shared agreements are to speak from personal experience, stay curious rather than persuasive, and assume good faith. For our first go-round on today's topic, name one concrete aspect, value, or uncertainty you want the circle to hold.";
} else if (input.includes("It is now your turn, Daniel Behar")) {
  text = "When I think about the Gaza war, I worry that communication outages can keep a parent from confirming a child's safety, while I remain uncertain about what I cannot verify from New York. Amina Rahman, what value helps you hold that uncertainty?";
} else if (input.includes("It is now your turn, Amina Rahman")) {
  text = "Daniel, I hold hospitality alongside uncertainty when I think about the Gaza war and disruptions to medicine, sleep, and communication. I want to keep those concrete harms visible without claiming experiences that are not mine.";
} else if (input.includes("Close warmly in exactly 2")) {
  text = process.env.FAKE_CLOSING_FIDELITY_MODE === "camp"
    ? ${JSON.stringify(unsupportedCampClosing)}
    : process.env.FAKE_CLOSING_FIDELITY_MODE === "thanks"
      ? ${JSON.stringify(naturalThanksClosing)}
      : ${JSON.stringify(unsupportedClosing)};
} else if (input.includes("Transcript to evaluate")) {
  text = JSON.stringify({ syntheticEmpathy: 0.8, adherence: 0.9, rationale: "The dialogue stayed with the subject and preserved uncertainty." });
} else {
  throw new Error("Unexpected prompt: " + input.slice(0, 180));
}
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-closing-fidelity" }) + "\\n");
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
  restoreEnv("FAKE_CLOSING_FIDELITY_MODE", previousEnv.closingMode);
});

test("closing rejects an anonymous priority camp that no participant stated", async () => {
  process.env.FAKE_CLOSING_FIDELITY_MODE = "camp";
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
  const rejectedClosing = listGenerationAttemptsByRun(run.id).find(
    (attempt) =>
      attempt.roundKind === "closing" &&
      attempt.responseText === unsupportedCampClosing,
  );
  assert.ok(rejectedClosing, "false priority camp should be audited as rejected");
  assert.match(
    rejectedClosing.rejectionReasons.join(" "),
    /anonymous positions into camps|decisive ordering|must come first/i,
  );
  const closing = listTurnsByRun(run.id).find(
    (turn) => turn.roundKind === "closing",
  );
  assert.ok(closing);
  assert.notEqual(closing.text, unsupportedCampClosing);
  assert.doesNotMatch(closing.text, /another insists/i);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("closing rejects a severe consequence that no accepted turn stated", async () => {
  delete process.env.FAKE_CLOSING_FIDELITY_MODE;
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
  const rejectedClosing = listGenerationAttemptsByRun(run.id).find(
    (attempt) => attempt.roundKind === "closing" && attempt.responseText === unsupportedClosing,
  );
  assert.ok(rejectedClosing, "unsupported closing should be audited as a rejected attempt");
  assert.match(
    rejectedClosing.rejectionReasons.join(" "),
    /unsupported|severe|severity|life-threatening|source/i,
  );
  assert.match(
    rejectedClosing.rejectionReasons.join(" "),
    /positioning Sam|personally holding/i,
  );

  const closing = listTurnsByRun(run.id).find((turn) => turn.roundKind === "closing");
  assert.ok(closing);
  assert.notEqual(closing.text, unsupportedClosing);
  assert.doesNotMatch(closing.text, /life-threatening/i);
});

test("closing accepts 'I'd like to thank' as courtesy rather than an invented example", async () => {
  process.env.FAKE_CLOSING_FIDELITY_MODE = "thanks";
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
  const closing = listTurnsByRun(run.id).find(
    (turn) => turn.roundKind === "closing",
  );
  assert.ok(closing);
  assert.equal(closing.text, naturalThanksClosing);
  assert.match(closing.text, /could support peacebuilding/i);
  assert.equal(closing.generationSource, "provider");
  assert.equal(
    listGenerationAttemptsByRun(run.id).some(
      (attempt) =>
        attempt.roundKind === "closing" &&
        attempt.responseText === naturalThanksClosing,
    ),
    false,
  );
});
