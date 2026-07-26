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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-job-controls-"));
process.env.DBRIDGES_STORE_DIR = storeDir;
process.env.DBRIDGES_DISABLE_JOB_WORKER = "1";

const db = await import("../lib/db.ts");
const { createSessionJob } = await import("../lib/jobRules.ts");
const { controlProjectSessionJob, recoverInterruptedJobs } = await import("../lib/jobQueue.ts");

const NOW = "2026-07-19T12:00:00.000Z";

function projectFor(job, sessionStatus = "queued") {
  return {
    id: job.projectId,
    name: job.projectName,
    createdAt: NOW,
    updatedAt: NOW,
    status: "active",
    sessionCount: 1,
    attendeeIds: ["muslim-amina", "jewish-david"],
    attendees: [
      { id: "muslim-amina", name: "Amina Rahman", group: "muslim" },
      { id: "jewish-david", name: "David Cohen", group: "jewish" },
    ],
    controversialPerCommunity: 0,
    controversialAgentIds: [],
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "low",
    selection: "round-robin",
    budgetUsd: 10,
    mock: true,
    sessions: [
      {
        id: job.sessionId,
        projectId: job.projectId,
        number: 1,
        topic: "Share a family story.",
        rounds: 1,
        mandatoryIntroductionRound: true,
        status: sessionStatus,
        statusReason: "",
        jobId: job.id,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  };
}

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  delete process.env.DBRIDGES_STORE_DIR;
  delete process.env.DBRIDGES_DISABLE_JOB_WORKER;
});

test("queued pause, priority continue, and kill persist across job and project stores", async () => {
  const job = createSessionJob({
    id: "job_control_queued",
    projectId: "project_control_queued",
    projectName: "Queued controls",
    sessionId: "session_control_queued",
    sessionNumber: 1,
    now: NOW,
  });
  await db.insertProject(projectFor(job));
  await db.insertJob(job);

  const paused = await controlProjectSessionJob(job.id, "pause", "2026-07-19T12:00:01.000Z");
  assert.equal(paused.job.status, "paused");
  assert.equal(paused.project.sessions[0].status, "paused");

  const resumed = await controlProjectSessionJob(job.id, "continue", "2026-07-19T12:00:02.000Z");
  assert.equal(resumed.job.status, "queued");
  assert.equal(resumed.job.priorityRequestedAt, "2026-07-19T12:00:02.000Z");
  assert.equal(resumed.project.sessions[0].status, "queued");

  const killed = await controlProjectSessionJob(job.id, "cancel", "2026-07-19T12:00:03.000Z");
  assert.equal(killed.job.status, "cancelled");
  assert.equal(killed.project.sessions[0].status, "cancelled");
  assert.equal(db.getJob(job.id)?.status, "cancelled");
  assert.equal(db.getProject(job.projectId)?.sessions[0].status, "cancelled");
});

test("running controls persist requests and Continue withdraws a pending pause", async () => {
  const base = createSessionJob({
    id: "job_control_running",
    projectId: "project_control_running",
    projectName: "Running controls",
    sessionId: "session_control_running",
    sessionNumber: 1,
    now: NOW,
  });
  const running = {
    ...base,
    status: "running",
    startedAt: "2026-07-19T12:00:01.000Z",
    currentStartedAt: "2026-07-19T12:00:01.000Z",
    attempts: 1,
  };
  await db.insertProject(projectFor(running, "running"));
  await db.insertJob(running);

  const pausing = await controlProjectSessionJob(
    running.id,
    "pause",
    "2026-07-19T12:00:02.000Z",
  );
  assert.equal(pausing.job.status, "pause-requested");
  assert.equal(pausing.project.sessions[0].status, "pause-requested");

  const continued = await controlProjectSessionJob(
    running.id,
    "continue",
    "2026-07-19T12:00:03.000Z",
  );
  assert.equal(continued.job.status, "running");
  assert.equal(continued.project.sessions[0].status, "running");

  const cancelling = await controlProjectSessionJob(
    running.id,
    "cancel",
    "2026-07-19T12:00:04.000Z",
  );
  assert.equal(cancelling.job.status, "cancel-requested");
  assert.equal(cancelling.project.sessions[0].status, "cancel-requested");
});

test("startup recovery acknowledges a safely suspended run without replaying it", async () => {
  const base = createSessionJob({
    id: "job_control_recovery",
    projectId: "project_control_recovery",
    projectName: "Recovery controls",
    sessionId: "session_control_recovery",
    sessionNumber: 1,
    now: NOW,
  });
  const job = {
    ...base,
    status: "pause-requested",
    runId: "run_control_recovery",
    runStatus: "running",
    startedAt: "2026-07-19T12:00:01.000Z",
    currentStartedAt: "2026-07-19T12:00:01.000Z",
    pauseRequestedAt: "2026-07-19T12:00:02.000Z",
    attempts: 1,
  };
  await db.insertProject(projectFor(job, "pause-requested"));
  await db.insertJob(job);
  await db.insertRun({
    id: job.runId,
    createdAt: "2026-07-19T12:00:01.000Z",
    updatedAt: "2026-07-19T12:00:03.000Z",
    status: "suspended",
    statusReason: "Paused by user at a safe dialogue checkpoint.",
    config: {
      attendeeIds: ["muslim-amina", "jewish-david"],
      scenario: "Share a family story.",
      provider: "codex",
      model: "gpt-5.5",
      reasoningEffort: "low",
      rounds: 1,
      selection: "round-robin",
      budgetUsd: 10,
      mock: true,
      projectId: job.projectId,
      projectSessionId: job.sessionId,
      projectSessionNumber: 1,
      jobId: job.id,
      controversialAgentIds: [],
      introductionRound: true,
    },
    attendees: projectFor(job).attendees,
    costUsd: 0,
    costAvailable: true,
    metrics: null,
    methodologyVersion: "test",
    personaVersions: {},
  });

  await recoverInterruptedJobs("2026-07-19T12:00:04.000Z");

  assert.equal(db.getJob(job.id)?.status, "paused");
  assert.equal(db.getJob(job.id)?.runStatus, "suspended");
  assert.equal(db.getProject(job.projectId)?.sessions[0].status, "paused");
  assert.equal(db.getProject(job.projectId)?.sessions[0].runId, job.runId);
});

test("startup recovery repairs control transitions interrupted between job and project writes", async () => {
  const pausedBase = createSessionJob({
    id: "job_control_cross_file_pause",
    projectId: "project_control_cross_file_pause",
    projectName: "Cross-file pause",
    sessionId: "session_control_cross_file_pause",
    sessionNumber: 1,
    now: NOW,
  });
  const paused = {
    ...pausedBase,
    status: "paused",
    pausedAt: "2026-07-19T12:00:01.000Z",
    statusReason: "Paused before the worker started.",
  };
  await db.insertProject(projectFor(paused, "queued"));
  await db.insertJob(paused);

  const cancelledBase = createSessionJob({
    id: "job_control_cross_file_cancel",
    projectId: "project_control_cross_file_cancel",
    projectName: "Cross-file cancel",
    sessionId: "session_control_cross_file_cancel",
    sessionNumber: 1,
    now: NOW,
  });
  const cancelled = {
    ...cancelledBase,
    status: "cancelled",
    cancelledAt: "2026-07-19T12:00:01.000Z",
    completedAt: "2026-07-19T12:00:01.000Z",
    statusReason: "Cancelled by user.",
  };
  await db.insertProject(projectFor(cancelled, "queued"));
  await db.insertJob(cancelled);

  await recoverInterruptedJobs("2026-07-19T12:00:02.000Z");

  assert.equal(db.getProject(paused.projectId)?.sessions[0].status, "paused");
  assert.equal(db.getProject(cancelled.projectId)?.sessions[0].status, "cancelled");
});
