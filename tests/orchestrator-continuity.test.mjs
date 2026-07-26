import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-continuity-"));
const previousStore = process.env.DBRIDGES_STORE_DIR;
process.env.DBRIDGES_STORE_DIR = storeDir;

const { startRun } = await import("../lib/orchestrator.ts");
const { listTurnsByRun } = await import("../lib/db.ts");
const {
  contributionAfterFirstSentence,
  firstSpokenSentence,
} = await import("../lib/dialogueContinuity.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
});

test("ordinary discussion turns bridge from the immediately previous participant", async () => {
  const run = await startRun({
    attendeeIds: [
      "muslim-amina",
      "muslim-bilal",
      "jewish-ari",
      "jewish-daniel",
    ],
    scenario: "Jewish-Muslim relationship building in New York City",
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 10,
    mock: true,
    controversialAgentIds: [],
    introductionRound: false,
  });
  assert.equal(run.status, "completed", run.statusReason);

  let previousParticipant;
  let ordinaryWithPredecessor = 0;
  for (const turn of listTurnsByRun(run.id).sort((a, b) => a.index - b.index)) {
    if (turn.role !== "persona") continue;
    if (
      turn.roundKind === "discussion" &&
      turn.controversialSpeaker !== true &&
      previousParticipant
    ) {
      ordinaryWithPredecessor += 1;
      const firstSentence = firstSpokenSentence(turn.text);
      const priorFirstName = previousParticipant.speakerName.split(/\s+/)[0];
      assert.match(firstSentence, new RegExp(`\\b${priorFirstName}\\b`, "i"));
      assert.ok(
        firstSentence.length >= 60,
        `continuity sentence was only a generic acknowledgment: ${firstSentence}`,
      );
      assert.ok(
        contributionAfterFirstSentence(turn.text).length > 0,
        `turn did not add its own contribution after the summary: ${turn.text}`,
      );
    }
    previousParticipant = turn;
  }
  assert.ok(ordinaryWithPredecessor >= 2);
});
