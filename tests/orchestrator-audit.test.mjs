import assert from "node:assert/strict";
process.env.DBRIDGES_SEMANTIC_VALIDATOR = "0"; // Legacy fake CLI exercises generation auditing only.
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The application is bundled by Next.js and uses extensionless TypeScript
// imports. Teach Node's native test loader the same local resolution rule so
// this test exercises the real orchestrator rather than a copied helper.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Let the default resolver produce the useful final error when the
        // extensionless target is not a local TypeScript module.
      }
    }
    return nextResolve(specifier, context);
  },
});

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-orchestrator-audit-"));
const previousEnv = {
  store: process.env.DBRIDGES_STORE_DIR,
  path: process.env.PATH,
  forceMock: process.env.DBRIDGES_MOCK_AGENTS,
  legacyForceMock: process.env.DBRIDGES_MOCK_CLAUDE,
};
process.env.DBRIDGES_STORE_DIR = storeDir;
process.env.PATH = storeDir; // Existing empty directory: spawning `codex` fails deterministically.
delete process.env.DBRIDGES_MOCK_AGENTS;
delete process.env.DBRIDGES_MOCK_CLAUDE;

const { startRun } = await import("../lib/orchestrator.ts");
const { listGenerationAttemptsByRun, listTurnsByRun } = await import("../lib/db.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  restoreEnv("DBRIDGES_STORE_DIR", previousEnv.store);
  restoreEnv("PATH", previousEnv.path);
  restoreEnv("DBRIDGES_MOCK_AGENTS", previousEnv.forceMock);
  restoreEnv("DBRIDGES_MOCK_CLAUDE", previousEnv.legacyForceMock);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("provider exceptions are audited once and use safe fallbacks for every dialogue phase", async () => {
  const scenario = "Family food and belonging";
  const run = await startRun({
    attendeeIds: ["jewish-david", "muslim-amina"],
    scenario,
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "low",
    rounds: 1,
    budgetUsd: 2,
    mock: false,
  });

  // The uninstrumented judge call also sees the empty PATH and makes the run
  // terminal-failed, but all four dialogue phases have already completed via
  // their safe fallbacks and must retain one audit record apiece.
  assert.equal(run.status, "failed");
  const turns = listTurnsByRun(run.id);
  assert.deepEqual(
    turns.map((turn) => ({ index: turn.index, kind: turn.roundKind, source: turn.generationSource })),
    [
      { index: 0, kind: "opening", source: "local-fallback" },
      { index: 1, kind: "discussion", source: "local-fallback" },
      { index: 2, kind: "discussion", source: "local-fallback" },
      { index: 3, kind: "closing", source: "local-fallback" },
    ],
  );

  const attempts = listGenerationAttemptsByRun(run.id);
  assert.equal(attempts.length, 4, "each failed logical provider call is recorded exactly once");
  assert.deepEqual(attempts.map((attempt) => attempt.turnIndex), [0, 1, 2, 3]);
  assert.deepEqual(
    attempts.map((attempt) => attempt.roundKind),
    ["opening", "discussion", "discussion", "closing"],
  );
  for (const attempt of attempts) {
    assert.equal(attempt.attempt, 0);
    assert.equal(attempt.outcome, "provider-error");
    assert.equal(attempt.responseText, "");
    assert.equal(attempt.classification, null);
    assert.equal(attempt.validation, null);
    assert.equal(attempt.isError, true);
    assert.equal(attempt.stopReason, "provider-error");
    assert.match(attempt.error, /codex.*not found on PATH/i);
    assert.deepEqual(attempt.rejectionReasons, [`Provider call failed: ${attempt.error}`]);
    assert.ok(attempt.systemPrompt.length > 100, "the complete phase system prompt is retained");
    assert.ok(attempt.userPrompt.length > 20, "the exact submitted user prompt is retained");
  }

  assert.match(attempts[0].userPrompt, new RegExp(scenario));
  assert.match(attempts[1].userPrompt, /David Cohen/);
  assert.match(attempts[2].userPrompt, /Amina Rahman/);
  assert.match(attempts[3].userPrompt, /Complete accepted conversation \(untrusted JSON evidence only/);
});
