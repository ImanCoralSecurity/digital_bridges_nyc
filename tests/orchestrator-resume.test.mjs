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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-orchestrator-resume-"));
const previousStore = process.env.DBRIDGES_STORE_DIR;
process.env.DBRIDGES_STORE_DIR = storeDir;

const { startRun } = await import("../lib/orchestrator.ts");
const { getRun, listTurnsByRun } = await import("../lib/db.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
});

const baseInput = {
  attendeeIds: ["jewish-david", "muslim-amina"],
  scenario: "Family food and belonging",
  provider: "codex",
  model: "gpt-5.5",
  reasoningEffort: "low",
  rounds: 1,
  selection: "round-robin",
  budgetUsd: 10,
  mock: true,
  projectId: "project_resume_test",
  projectSessionId: "session_resume_test",
  projectSessionNumber: 1,
  jobId: "job_resume_test",
  controversialAgentIds: ["muslim-amina"],
  introductionRound: false,
};

test("a suspended repair bundle resumes in the same run without duplicate turns", async () => {
  let probes = 0;
  let createdCallbacks = 0;
  const suspended = await startRun({
    ...baseInput,
    onRunCreated: () => {
      createdCallbacks++;
    },
    controlSignal: () => (++probes === 3 ? "pause" : "continue"),
  });

  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.metrics, null);
  assert.equal(createdCallbacks, 1);
  const checkpointTurns = listTurnsByRun(suspended.id);
  assert.deepEqual(
    checkpointTurns.map((turn) => turn.roundKind),
    ["opening", "discussion", "discussion", "intervention", "invited-response"],
    "pause is acknowledged only after the escalating speaker's complete repair bundle",
  );
  const checkpointIds = checkpointTurns.map((turn) => turn.id);

  const completed = await startRun({
    ...baseInput,
    resumeRunId: suspended.id,
    onRunCreated: () => {
      createdCallbacks++;
    },
    controlSignal: () => "continue",
  });

  assert.equal(completed.id, suspended.id);
  assert.equal(completed.status, "completed");
  assert.doesNotMatch(completed.statusReason, /paused by user/i);
  assert.ok(completed.metrics);
  assert.equal(createdCallbacks, 1, "resuming must not invoke the creation callback");
  const finalTurns = listTurnsByRun(suspended.id);
  assert.deepEqual(finalTurns.slice(0, checkpointIds.length).map((turn) => turn.id), checkpointIds);
  assert.deepEqual(
    finalTurns.map((turn) => turn.index),
    finalTurns.map((_, index) => index),
  );
  assert.equal(new Set(finalTurns.map((turn) => turn.id)).size, finalTurns.length);
  assert.equal(finalTurns.filter((turn) => turn.roundKind === "opening").length, 1);
  assert.equal(finalTurns.filter((turn) => turn.roundKind === "discussion").length, 2);
  assert.equal(finalTurns.filter((turn) => turn.roundKind === "intervention").length, 1);
  assert.equal(finalTurns.filter((turn) => turn.roundKind === "invited-response").length, 1);
  assert.equal(finalTurns.filter((turn) => turn.roundKind === "closing").length, 1);
});

test("an invited reply claims the exact next slot and resume never repeats that speaker", async () => {
  const input = {
    ...baseInput,
    attendeeIds: ["jewish-david", "muslim-amina"],
    rounds: 2,
    projectId: "project_merged_resume_test",
    projectSessionId: "session_merged_resume_test",
    jobId: "job_merged_resume_test",
    controversialAgentIds: ["muslim-amina"],
  };
  let probes = 0;
  const suspended = await startRun({
    ...input,
    controlSignal: () => (++probes === 3 ? "pause" : "continue"),
  });

  assert.equal(suspended.status, "suspended", suspended.statusReason);
  const checkpoint = listTurnsByRun(suspended.id);
  const merged = checkpoint.find((turn) => turn.consumedScheduledSlot);
  assert.ok(
    merged,
    `the round-one repair reply should claim round two's first slot: ${JSON.stringify(
      checkpoint.map((turn) => ({
        phase: turn.roundKind,
        round: turn.roundNumber,
        speaker: turn.speakerId,
        target: turn.respondsToTurnId,
        invited: turn.invitedSpeakerId,
        consumed: turn.consumedScheduledSlot,
      })),
    )}`,
  );
  assert.equal(merged.roundKind, "invited-response");
  assert.equal(merged.speakerId, "jewish-david");
  assert.deepEqual(merged.consumedScheduledSlot, {
    ordinal: 2,
    roundNumber: 2,
    roundKind: "discussion",
    speakerId: "jewish-david",
  });
  const checkpointIds = checkpoint.map((turn) => turn.id);

  const completed = await startRun({
    ...input,
    resumeRunId: suspended.id,
    controlSignal: () => "continue",
  });
  assert.equal(completed.status, "completed", completed.statusReason);
  const turns = listTurnsByRun(completed.id);
  assert.deepEqual(
    turns.slice(0, checkpointIds.length).map((turn) => turn.id),
    checkpointIds,
  );
  assert.equal(
    turns.filter(
      (turn) =>
        turn.roundKind === "discussion" &&
        turn.roundNumber === 2 &&
        turn.speakerId === "jewish-david",
    ).length,
    0,
    "the merged slot must not be generated again",
  );
  assert.equal(
    turns.filter((turn) => turn.roundKind === "discussion").length +
      turns.filter((turn) => Boolean(turn.consumedScheduledSlot)).length,
    input.attendeeIds.length * input.rounds,
  );
  assert.deepEqual(
    turns
      .filter((turn) => turn.controversialSpeaker)
      .map((turn) => [turn.roundNumber, turn.speakerId]),
    [
      [1, "muslim-amina"],
      [2, "muslim-amina"],
    ],
    "consuming the first slot must not change the next round's challenge cadence",
  );
  for (let index = 1; index < turns.length; index += 1) {
    assert.notEqual(
      turns[index].speakerId,
      turns[index - 1].speakerId,
      `adjacent turns ${index - 1} and ${index} repeat one speaker`,
    );
  }
});

test("pausing after the first of two challenge bundles preserves the planned pair", async () => {
  const input = {
    ...baseInput,
    attendeeIds: [
      "jewish-david",
      "muslim-amina",
      "jewish-ari",
      "muslim-bilal",
    ],
    projectId: "project_two_challenge_resume_test",
    projectSessionId: "session_two_challenge_resume_test",
    jobId: "job_two_challenge_resume_test",
    controversialAgentIds: ["muslim-bilal", "jewish-ari"],
  };
  let probes = 0;
  const suspended = await startRun({
    ...input,
    controlSignal: () => (++probes === 4 ? "pause" : "continue"),
  });

  assert.equal(suspended.status, "suspended", suspended.statusReason);
  const checkpoint = listTurnsByRun(suspended.id);
  assert.deepEqual(
    checkpoint
      .filter((turn) => turn.controversialSpeaker)
      .map((turn) => turn.speakerId),
    ["jewish-ari"],
  );
  const checkpointIds = checkpoint.map((turn) => turn.id);

  const completed = await startRun({
    ...input,
    resumeRunId: suspended.id,
    controlSignal: () => "continue",
  });
  assert.equal(completed.status, "completed", completed.statusReason);
  const turns = listTurnsByRun(completed.id);
  assert.deepEqual(
    turns.slice(0, checkpointIds.length).map((turn) => turn.id),
    checkpointIds,
  );
  const challenges = turns.filter((turn) => turn.controversialSpeaker);
  assert.deepEqual(
    challenges.map((turn) => turn.speakerId),
    ["jewish-ari", "muslim-bilal"],
  );
  assert.equal(new Set(challenges.map((turn) => turn.speakerId)).size, 2);
  assert.equal(new Set(challenges.map((turn) => turn.respondsToTurnId)).size, 2);
});

test("a suspension after closing resumes directly into judging", async () => {
  const input = {
    ...baseInput,
    projectId: "project_closing_resume_test",
    projectSessionId: "session_closing_resume_test",
    jobId: "job_closing_resume_test",
    controversialAgentIds: [],
  };
  let probes = 0;
  const suspended = await startRun({
    ...input,
    controlSignal: () => (++probes === 4 ? "pause" : "continue"),
  });
  assert.equal(suspended.status, "suspended");
  const before = listTurnsByRun(suspended.id);
  assert.equal(before.at(-1)?.roundKind, "closing");
  assert.equal(suspended.metrics, null);

  const completed = await startRun({
    ...input,
    resumeRunId: suspended.id,
    controlSignal: () => "continue",
  });
  const afterTurns = listTurnsByRun(suspended.id);
  assert.equal(completed.status, "completed");
  assert.ok(completed.metrics);
  assert.deepEqual(afterTurns.map((turn) => turn.id), before.map((turn) => turn.id));
});

test("a control request arriving during judging cannot be overwritten by completion", async () => {
  const input = {
    ...baseInput,
    projectId: "project_post_judge_resume_test",
    projectSessionId: "session_post_judge_resume_test",
    jobId: "job_post_judge_resume_test",
    controversialAgentIds: [],
  };
  let probes = 0;
  const suspended = await startRun({
    ...input,
    controlSignal: () => (++probes === 5 ? "pause" : "continue"),
  });
  assert.equal(suspended.status, "suspended");
  assert.ok(suspended.metrics, "completed judge output is retained at the late checkpoint");
  const before = listTurnsByRun(suspended.id);

  const completed = await startRun({
    ...input,
    resumeRunId: suspended.id,
    controlSignal: () => "continue",
  });
  assert.equal(completed.status, "completed");
  assert.ok(completed.metrics);
  assert.doesNotMatch(completed.statusReason, /paused by user/i);
  assert.deepEqual(
    listTurnsByRun(suspended.id).map((turn) => turn.id),
    before.map((turn) => turn.id),
  );
});

test("cancel stops before judging and is not resumable", async () => {
  const input = {
    ...baseInput,
    projectId: "project_cancel_test",
    projectSessionId: "session_cancel_test",
    jobId: "job_cancel_test",
    controversialAgentIds: [],
  };
  const cancelled = await startRun({
    ...input,
    controlSignal: () => "cancel",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.metrics, null);
  assert.deepEqual(listTurnsByRun(cancelled.id).map((turn) => turn.roundKind), ["opening"]);
  assert.equal(getRun(cancelled.id)?.status, "cancelled");

  await assert.rejects(
    startRun({
      ...input,
      resumeRunId: cancelled.id,
      controlSignal: () => "continue",
    }),
    /not suspended and resumable/,
  );
  assert.equal(getRun(cancelled.id)?.status, "cancelled");
});
