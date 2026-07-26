import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acknowledgeCancel,
  acknowledgePause,
  claimOldestQueuedJob,
  completeJob,
  continueJob,
  createSessionJob,
  failJob,
  requestCancel,
  requestPause,
} from "../lib/jobRules.ts";

const CREATED_AT = "2026-07-19T12:00:00.000Z";

function queuedJob(id, createdAt = CREATED_AT, overrides = {}) {
  return {
    ...createSessionJob({
      id,
      projectId: `project_${id}`,
      projectName: `Project ${id}`,
      sessionId: `session_${id}`,
      sessionNumber: 1,
      now: createdAt,
    }),
    ...overrides,
  };
}

test("createSessionJob creates the complete persistent queued-job schema", () => {
  assert.deepEqual(
    createSessionJob({
      id: "job_schema",
      projectId: "project_schema",
      projectName: "Schema project",
      sessionId: "session_schema",
      sessionNumber: 3,
      now: CREATED_AT,
    }),
    {
      id: "job_schema",
      type: "project-session-run",
      status: "queued",
      projectId: "project_schema",
      projectName: "Schema project",
      sessionId: "session_schema",
      sessionNumber: 3,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      queuedAt: CREATED_AT,
      attempts: 0,
      resumeCount: 0,
      statusReason: "Waiting for a background worker.",
    },
  );
});

test("claimOldestQueuedJob is FIFO and retains insertion order for timestamp ties", () => {
  const newest = queuedJob("newest", "2026-07-19T12:00:03.000Z");
  const tiedFirst = queuedJob("tied-first", "2026-07-19T12:00:01.000Z");
  const tiedSecond = queuedJob("tied-second", "2026-07-19T12:00:01.000Z");
  const middle = queuedJob("middle", "2026-07-19T12:00:02.000Z");
  let jobs = [newest, tiedFirst, tiedSecond, middle];

  const expected = ["tied-first", "tied-second", "middle", "newest"];
  for (const [index, id] of expected.entries()) {
    const claimedAt = `2026-07-19T12:01:0${index}.000Z`;
    const claim = claimOldestQueuedJob(jobs, claimedAt);
    assert.equal(claim.claimed?.id, id);
    assert.equal(claim.claimed?.status, "running");

    // Mark this job terminal so the single-running-job rule permits the next claim.
    jobs = claim.jobs.map((job) =>
      job.id === id
        ? completeJob(job, claimedAt, { runId: `run_${id}`, runStatus: "completed" })
        : job,
    );
  }

  assert.equal(claimOldestQueuedJob(jobs, "2026-07-19T12:02:00.000Z").claimed, undefined);
});

test("claimOldestQueuedJob refuses a second claim while any job is running", () => {
  const running = queuedJob("running", CREATED_AT, {
    status: "running",
    startedAt: "2026-07-19T12:01:00.000Z",
    attempts: 1,
  });
  const queued = queuedJob("waiting", "2026-07-19T12:00:01.000Z");
  const input = [running, queued];

  const result = claimOldestQueuedJob(input, "2026-07-19T12:02:00.000Z");

  assert.equal(result.claimed, undefined);
  assert.strictEqual(result.jobs, input);
  assert.equal(result.jobs[1].status, "queued");
});

test("claiming increments attempts, preserves cumulative duration, and clears stale terminal data", () => {
  const stale = queuedJob("retry", CREATED_AT, {
    attempts: 2,
    startedAt: "2026-07-19T11:00:00.000Z",
    completedAt: "2026-07-19T11:01:00.000Z",
    durationMs: 60_000,
    error: "interrupted",
  });
  const now = "2026-07-19T12:05:00.000Z";

  const result = claimOldestQueuedJob([stale], now);

  assert.equal(result.claimed?.status, "running");
  assert.equal(result.claimed?.attempts, 3);
  assert.equal(result.claimed?.startedAt, "2026-07-19T11:00:00.000Z");
  assert.equal(result.claimed?.currentStartedAt, now);
  assert.equal(result.claimed?.updatedAt, now);
  assert.equal(result.claimed?.completedAt, undefined);
  assert.equal(result.claimed?.durationMs, 60_000);
  assert.equal(result.claimed?.error, undefined);
  assert.equal(stale.attempts, 2, "the input job must not be mutated");
});

test("promoted queued jobs run before ordinary FIFO work without preemption", () => {
  const oldest = queuedJob("oldest", "2026-07-19T12:00:00.000Z");
  const promoted = continueJob(
    queuedJob("promoted", "2026-07-19T12:00:10.000Z"),
    "2026-07-19T12:00:20.000Z",
  );
  const claim = claimOldestQueuedJob([oldest, promoted], "2026-07-19T12:01:00.000Z");
  assert.equal(claim.claimed?.id, "promoted");

  const occupied = queuedJob("occupied", CREATED_AT, { status: "pause-requested" });
  assert.equal(
    claimOldestQueuedJob([oldest, occupied], "2026-07-19T12:01:00.000Z").claimed,
    undefined,
  );
});

test("pause and continue transitions cover queued, running, and checkpointed jobs", () => {
  const pausedBeforeStart = requestPause(queuedJob("queued-pause"), "2026-07-19T12:00:01.000Z");
  assert.equal(pausedBeforeStart.status, "paused");
  assert.equal(pausedBeforeStart.attempts, 0);

  const resumedBeforeStart = continueJob(pausedBeforeStart, "2026-07-19T12:00:02.000Z");
  assert.equal(resumedBeforeStart.status, "queued");
  assert.equal(resumedBeforeStart.resumeCount, 1);
  assert.equal(resumedBeforeStart.priorityRequestedAt, "2026-07-19T12:00:02.000Z");

  const running = queuedJob("running-pause", CREATED_AT, {
    status: "running",
    startedAt: "2026-07-19T12:00:01.000Z",
    currentStartedAt: "2026-07-19T12:00:01.000Z",
    attempts: 1,
  });
  const requested = requestPause(running, "2026-07-19T12:00:03.000Z");
  assert.equal(requested.status, "pause-requested");
  assert.equal(continueJob(requested, "2026-07-19T12:00:04.000Z").status, "running");

  const checkpointed = acknowledgePause(requested, "2026-07-19T12:00:06.000Z", {
    runId: "run_resume",
    runStatus: "suspended",
  });
  assert.equal(checkpointed.status, "paused");
  assert.equal(checkpointed.runId, "run_resume");
  assert.equal(checkpointed.durationMs, 5_000);
  assert.equal(checkpointed.currentStartedAt, undefined);

  const resumed = continueJob(checkpointed, "2026-07-19T12:01:00.000Z");
  const reclaimed = claimOldestQueuedJob([resumed], "2026-07-19T12:01:01.000Z").claimed;
  assert.equal(reclaimed?.runId, "run_resume");
  assert.equal(reclaimed?.startedAt, "2026-07-19T12:00:01.000Z");
  assert.equal(reclaimed?.currentStartedAt, "2026-07-19T12:01:01.000Z");
  assert.equal(reclaimed?.durationMs, 5_000);
});

test("kill is immediate before execution and cooperative while running", () => {
  const killedQueued = requestCancel(queuedJob("kill-queued"), "2026-07-19T12:00:02.000Z");
  assert.equal(killedQueued.status, "cancelled");
  assert.equal(killedQueued.completedAt, "2026-07-19T12:00:02.000Z");

  const running = queuedJob("kill-running", CREATED_AT, {
    status: "running",
    runId: "run_kill",
    startedAt: "2026-07-19T12:00:01.000Z",
    currentStartedAt: "2026-07-19T12:00:01.000Z",
    attempts: 1,
  });
  const requested = requestCancel(running, "2026-07-19T12:00:03.000Z");
  assert.equal(requested.status, "cancel-requested");
  const racedCompletion = completeJob(requested, "2026-07-19T12:00:04.000Z", {
    runId: "run_kill",
    runStatus: "completed",
  });
  assert.equal(racedCompletion.status, "cancelled", "a persisted kill request wins the finish race");
  const killed = acknowledgeCancel(requested, "2026-07-19T12:00:05.000Z", {
    runId: "run_kill",
    runStatus: "cancelled",
  });
  assert.equal(killed.status, "cancelled");
  assert.equal(killed.runStatus, "cancelled");
  assert.equal(killed.durationMs, 4_000);
});

test("completeJob records exact duration and maps completed, paused, and failed run statuses", () => {
  const startedAt = "2026-07-19T12:00:01.000Z";
  const completedAt = "2026-07-19T12:00:06.432Z";
  const running = queuedJob("complete", CREATED_AT, {
    status: "running",
    startedAt,
    updatedAt: startedAt,
    attempts: 1,
  });

  const completed = completeJob(running, completedAt, {
    runId: "run_completed",
    runStatus: "completed",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.runId, "run_completed");
  assert.equal(completed.runStatus, "completed");
  assert.equal(completed.completedAt, completedAt);
  assert.equal(completed.updatedAt, completedAt);
  assert.equal(completed.durationMs, 5_432);
  assert.equal(completed.error, undefined);

  const paused = completeJob(running, completedAt, {
    runId: "run_paused",
    runStatus: "paused",
  });
  assert.equal(paused.status, "completed");
  assert.equal(paused.runStatus, "paused");
  assert.equal(paused.durationMs, 5_432);

  const failed = completeJob(running, completedAt, {
    runId: "run_failed",
    runStatus: "failed",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.runId, "run_failed");
  assert.equal(failed.runStatus, "failed");
  assert.equal(failed.error, "Run failed.");
  assert.equal(failed.durationMs, 5_432);
});

test("failJob records exact duration, error fallback, and optional run mapping", () => {
  const startedAt = "2026-07-19T12:00:01.000Z";
  const failedAt = "2026-07-19T12:00:04.250Z";
  const running = queuedJob("failure", CREATED_AT, {
    status: "running",
    startedAt,
    updatedAt: startedAt,
    attempts: 1,
  });

  const failed = failJob(running, failedAt, "provider unavailable", {
    runId: "run_failure",
    runStatus: "failed",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.runId, "run_failure");
  assert.equal(failed.runStatus, "failed");
  assert.equal(failed.completedAt, failedAt);
  assert.equal(failed.updatedAt, failedAt);
  assert.equal(failed.durationMs, 3_250);
  assert.equal(failed.error, "provider unavailable");

  assert.equal(failJob(running, failedAt, "").error, "Job failed.");
});

// lib/db.ts captures DBRIDGES_STORE_DIR when evaluated, so set it before the
// dynamic import and keep all repository checks in this isolated process store.
const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-job-db-"));
const jobsPath = join(storeDir, "jobs.json");
process.env.DBRIDGES_STORE_DIR = storeDir;
const db = await import("../lib/db.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  delete process.env.DBRIDGES_STORE_DIR;
});

test("job repository persists insert, sorted list, update, and atomic mutation", async () => {
  const older = queuedJob("db-older", "2026-07-19T10:00:00.000Z");
  const newer = queuedJob("db-newer", "2026-07-19T11:00:00.000Z");

  assert.deepEqual(await db.insertJob(older), older);
  assert.deepEqual(await db.insertJob(newer), newer);
  assert.equal(db.getJob(older.id)?.id, older.id);
  assert.deepEqual(db.listJobs().map((job) => job.id), [newer.id, older.id]);

  const updatedAt = "2026-07-19T11:01:00.000Z";
  const updated = await db.updateJob(newer.id, {
    id: "job-id-cannot-be-replaced",
    status: "completed",
    completedAt: updatedAt,
    durationMs: 1_000,
    updatedAt,
  });
  assert.equal(updated.id, newer.id);
  assert.equal(updated.status, "completed");
  assert.equal(db.getJob(newer.id)?.durationMs, 1_000);

  const claimed = await db.mutateJobs((jobs) => {
    const transition = claimOldestQueuedJob(jobs, "2026-07-19T11:02:00.000Z");
    return { jobs: transition.jobs, result: transition.claimed };
  });
  assert.equal(claimed?.id, older.id);
  assert.equal(db.getJob(older.id)?.status, "running");
  assert.equal(db.getJob(older.id)?.attempts, 1);

  const disk = JSON.parse(readFileSync(jobsPath, "utf8"));
  assert.equal(disk.length, 2);
  assert.ok(disk.some((job) => job.id === older.id && job.status === "running"));
});

test("job repository atomically rejects duplicate ids and active session jobs", async () => {
  const sameId = queuedJob("db-newer", "2026-07-19T11:03:00.000Z", {
    projectId: "another-project",
    sessionId: "another-session",
  });
  await assert.rejects(db.insertJob(sameId), /Job already exists: db-newer/);

  const first = queuedJob("db-race-a", "2026-07-19T11:04:00.000Z", {
    projectId: "project-race",
    sessionId: "session-race",
  });
  const second = queuedJob("db-race-b", "2026-07-19T11:04:01.000Z", {
    projectId: "project-race",
    sessionId: "session-race",
  });
  const settled = await Promise.allSettled([db.insertJob(first), db.insertJob(second)]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
  const rejection = settled.find((result) => result.status === "rejected");
  assert.match(String(rejection.reason), /already has an active job/);
  assert.equal(
    db.listJobs().filter(
      (job) => job.projectId === "project-race" && job.sessionId === "session-race",
    ).length,
    1,
  );

  const active = db.listJobs().find(
    (job) => job.projectId === "project-race" && job.sessionId === "session-race",
  );
  await db.updateJob(active.id, {
    status: "failed",
    completedAt: "2026-07-19T11:05:00.000Z",
    updatedAt: "2026-07-19T11:05:00.000Z",
  });
  const rerun = queuedJob("db-rerun", "2026-07-19T11:06:00.000Z", {
    projectId: "project-race",
    sessionId: "session-race",
  });
  assert.equal((await db.insertJob(rerun)).id, rerun.id);
});

test("job repository fails closed without overwriting a corrupt jobs file", async () => {
  const corrupt = "{ definitely not valid JSON";
  writeFileSync(jobsPath, corrupt, "utf8");

  assert.throws(() => db.listJobs(), /Cannot read persistent job store .*jobs\.json/);
  await assert.rejects(
    db.insertJob(queuedJob("after-corruption")),
    /Cannot read persistent job store .*jobs\.json/,
  );
  assert.equal(readFileSync(jobsPath, "utf8"), corrupt);
});
