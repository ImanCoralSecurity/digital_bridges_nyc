// Persistent, single-worker queue for project session runs.
//
// Jobs are written before execution and the worker is detached from the HTTP
// request, so closing or refreshing the browser cannot cancel a run. The JSON
// store and worker are intentionally single-node; job claiming still enforces
// one active record so duplicate module instances cannot run work in parallel.

import {
  deleteProject as deleteProjectRecord,
  deleteProjectSession as deleteProjectSessionRecord,
  getJob,
  getProject,
  getRun,
  insertJob,
  listJobs,
  listProjects,
  listRuns,
  mutateJobs,
  updateRun,
} from "./db";
import { newId } from "./hash";
import {
  acknowledgeCancel,
  claimOldestQueuedJob,
  completeJob,
  continueJob,
  createSessionJob,
  durationBetween,
  failJob,
  jobOccupiesWorker,
  requestCancel,
  requestPause,
} from "./jobRules";
import { log } from "./logger";
import {
  failProjectSessionJob,
  finishProjectSessionJob,
  queueProjectSession,
  runProjectSession,
  setProjectSessionJobStatus,
} from "./projects";
import type { Job, JobStatus, Project, ProjectSessionStatus, Run } from "./types";

interface QueueProcessState {
  workerPromise?: Promise<void>;
  recoveryPromise?: Promise<void>;
  enqueueTail: Promise<void>;
}

const globalForQueue = globalThis as typeof globalThis & {
  __digitalBridgesQueueState?: QueueProcessState;
};

function queueState(): QueueProcessState {
  return (
    globalForQueue.__digitalBridgesQueueState ??
    (globalForQueue.__digitalBridgesQueueState = {
      enqueueTail: Promise.resolve(),
    })
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const compact = raw.replace(/\s+/g, " ").trim();
  return (compact || "Background job failed.").slice(0, 800);
}

async function withEnqueueLock<T>(work: () => Promise<T>): Promise<T> {
  const state = queueState();
  const previous = state.enqueueTail;
  let release!: () => void;
  state.enqueueTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

function transitionJob(id: string, transition: (job: Job) => Job): Promise<Job> {
  return mutateJobs((jobs) => {
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error(`Job not found: ${id}`);
    const next = jobs.slice();
    next[index] = transition(jobs[index]);
    return { jobs: next, result: next[index] };
  });
}

export interface EnqueueProjectSessionResult {
  job: Job;
  project: Project;
  reused: boolean;
}

export interface EnqueueProjectSessionOptions {
  model?: string;
  reasoningEffort?: Job["reasoningEffort"];
}

export type JobControlAction = "pause" | "continue" | "cancel";

const ACTIVE_JOB_STATUSES = new Set<JobStatus>([
  "queued",
  "running",
  "pause-requested",
  "paused",
  "cancel-requested",
]);

const IN_FLIGHT_SESSION_STATUSES = new Set<ProjectSessionStatus>([
  "queued",
  "running",
  "pause-requested",
  "paused",
  "cancel-requested",
]);

/** Error carrying an HTTP-compatible conflict status for API callers. */
export class ProjectDeletionConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ProjectDeletionConflictError";
  }
}

export interface DeleteProjectResult {
  deleted: true;
  projectId: string;
  preservedRunCount: number;
  preservedJobCount: number;
}

function assertProjectDeletionIsIdle(
  project: Project,
  sessionId?: string,
): void {
  const scopedJobs = listJobs().filter(
    (job) =>
      job.projectId === project.id &&
      (!sessionId || job.sessionId === sessionId),
  );
  const activeJob = scopedJobs.find((job) => ACTIVE_JOB_STATUSES.has(job.status));
  if (activeJob) {
    const target = sessionId ? `Session ${sessionId}` : `Project ${project.id}`;
    throw new ProjectDeletionConflictError(
      `${target} cannot be deleted while linked job ${activeJob.id} is ${activeJob.status}. Finish or kill that job first.`,
    );
  }

  // Normally every in-flight session has an active Job. Keep this independent
  // guard for the cross-file crash window where a session was marked active but
  // its Job record was never persisted or has not yet been reconciled.
  const inFlightSession = project.sessions.find((session) => {
    if (sessionId && session.id !== sessionId) return false;
    if (!IN_FLIGHT_SESSION_STATUSES.has(session.status)) return false;

    // A completed Job may intentionally leave its Run/session at `paused`
    // after an automatic budget or safety stop. That state is terminal and is
    // not the resumable user pause represented by Job status `paused`.
    const linkedJob = session.jobId
      ? scopedJobs.find((job) => job.id === session.jobId)
      : undefined;
    return !(session.status === "paused" && linkedJob?.status === "completed");
  });
  if (inFlightSession) {
    throw new ProjectDeletionConflictError(
      `Session ${inFlightSession.id} cannot be deleted while its planning state is ${inFlightSession.status}. Reconcile or cancel the session first.`,
    );
  }
}

/**
 * Remove a project planning aggregate while preserving immutable execution
 * history. Sharing the enqueue/control lock prevents a new Job from appearing
 * between the active-work check and the project-file deletion.
 */
export function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  return withEnqueueLock(async () => {
    const project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    assertProjectDeletionIsIdle(project);
    const preservedRunCount = listRuns().filter(
      (run) => run.config.projectId === projectId,
    ).length;
    const preservedJobCount = listJobs().filter(
      (job) => job.projectId === projectId,
    ).length;
    await deleteProjectRecord(projectId);
    return {
      deleted: true,
      projectId,
      preservedRunCount,
      preservedJobCount,
    };
  });
}

/**
 * Remove one idle session shell. Stable session numbers and every historical
 * Job/Run/audit record are retained; the DB layer rejects deleting the last
 * remaining shell.
 */
export function deleteProjectSession(
  projectId: string,
  sessionId: string,
): Promise<Project> {
  return withEnqueueLock(async () => {
    const project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (!project.sessions.some((session) => session.id === sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    assertProjectDeletionIsIdle(project, sessionId);
    return deleteProjectSessionRecord(projectId, sessionId);
  });
}

function controlSignal(jobId: string): "continue" | "pause" | "cancel" {
  const status = getJob(jobId)?.status;
  if (status === "cancel-requested" || status === "cancelled") return "cancel";
  if (status === "pause-requested" || status === "paused") return "pause";
  return "continue";
}

function projectStatusForJob(job: Job): Extract<
  ProjectSessionStatus,
  | "queued"
  | "running"
  | "pause-requested"
  | "paused"
  | "cancel-requested"
  | "cancelled"
> {
  if (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "pause-requested" ||
    job.status === "paused" ||
    job.status === "cancel-requested" ||
    job.status === "cancelled"
  ) return job.status;
  throw new Error(`Job ${job.id} has no active project-session state.`);
}

export interface JobControlResult {
  job: Job;
  project: Project;
}

/** Persist a user control request before mirroring it to the owning session. */
async function applyProjectSessionJobControl(
  jobId: string,
  action: JobControlAction,
  now = nowIso(),
): Promise<JobControlResult> {
  let job = await transitionJob(jobId, (current) => {
    const next =
      action === "pause"
        ? requestPause(current, now)
        : action === "continue"
          ? continueJob(current, now)
          : requestCancel(current, now);
    return next.status === "cancelled" && next.runId
      ? { ...next, runStatus: "cancelled" as const }
      : next;
  });

  if (job.status === "cancelled" && job.runId) {
    const run = getRun(job.runId);
    if (run && run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      await updateRun(run.id, { status: "cancelled", statusReason: "Cancelled by user." });
    }
    job = getJob(job.id) ?? job;
  }

  const project = await setProjectSessionJobStatus(
    job.projectId,
    job.sessionId,
    job.id,
    projectStatusForJob(job),
    job.statusReason || `Job is ${job.status}.`,
    job.runId,
  );

  log.info("background job control updated", {
    jobId: job.id,
    action,
    status: job.status,
    runId: job.runId,
  });
  if (action === "continue") void startJobWorker();
  return { job, project };
}

export function controlProjectSessionJob(
  jobId: string,
  action: JobControlAction,
  now = nowIso(),
): Promise<JobControlResult> {
  return withEnqueueLock(() => applyProjectSessionJobControl(jobId, action, now));
}

/**
 * Submit one session. Repeated clicks while queued/running return the same job
 * rather than creating duplicate model work.
 */
export async function enqueueProjectSessionJob(
  projectId: string,
  sessionId: string,
  options: EnqueueProjectSessionOptions = {},
): Promise<EnqueueProjectSessionResult> {
  const result = await withEnqueueLock(async () => {
    let project = getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    let session = project.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    if (
      session.status === "queued" ||
      session.status === "running" ||
      session.status === "pause-requested" ||
      session.status === "paused" ||
      session.status === "cancel-requested"
    ) {
      const existing = session.jobId ? getJob(session.jobId) : undefined;
      if (existing && ACTIVE_JOB_STATUSES.has(existing.status)) {
        if (existing.status === "paused" || existing.status === "pause-requested") {
          const resumed = await applyProjectSessionJobControl(existing.id, "continue");
          return { job: resumed.job, project: resumed.project, reused: true };
        }
        if (existing.status === "cancel-requested") {
          throw new Error(`Job ${existing.id} is already being cancelled.`);
        }
        return { job: existing, project, reused: true };
      }
      await failProjectSessionJob(
        projectId,
        sessionId,
        session.jobId || "missing-job",
        "The previous queue record was missing or terminal. Submit the session again.",
      );
      project = getProject(projectId)!;
      session = project.sessions.find((item) => item.id === sessionId)!;
    }

    const createdAt = nowIso();
    const job = createSessionJob({
      id: newId("job"),
      projectId,
      projectName: project.name,
      sessionId,
      sessionNumber: session.number,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      now: createdAt,
    });

    // Mark the session first so the UI locks its configuration. If the process
    // dies before insertJob, startup reconciliation fails the stranded session.
    const queuedProject = await queueProjectSession(projectId, sessionId, job.id);
    try {
      await insertJob(job);
    } catch (error) {
      await failProjectSessionJob(
        projectId,
        sessionId,
        job.id,
        `Could not persist queue job: ${errorMessage(error)}`,
      );
      throw error;
    }
    return { job, project: queuedProject, reused: false };
  });

  void startJobWorker();
  return result;
}

/** Atomically claim the oldest queued job, unless another job is running. */
export function claimNextJob(now = nowIso()): Promise<Job | undefined> {
  return mutateJobs((jobs) => {
    const claimed = claimOldestQueuedJob(jobs, now);
    return { jobs: claimed.jobs, result: claimed.claimed };
  });
}

export function finishJob(jobId: string, run: Run, now = nowIso()): Promise<Job> {
  return transitionJob(jobId, (job) =>
    run.status === "failed"
      ? failJob(job, now, run.statusReason || "Run failed.", {
          runId: run.id,
          runStatus: run.status,
        })
      : completeJob(job, now, { runId: run.id, runStatus: run.status }),
  );
}

export function failQueuedJob(
  jobId: string,
  error: string,
  now = nowIso(),
  result?: { runId?: string; runStatus?: Run["status"] },
): Promise<Job> {
  return transitionJob(jobId, (job) => failJob(job, now, error, result));
}

async function executeJob(job: Job): Promise<void> {
  try {
    const { run } = await runProjectSession(
      job.projectId,
      job.sessionId,
      job.id,
      {
        resumeRunId: job.runId,
        model: job.model,
        reasoningEffort: job.reasoningEffort,
        controlSignal: () => controlSignal(job.id),
        onRunCreated: async (createdRun) => {
          await transitionJob(job.id, (current) => ({
            ...current,
            runId: createdRun.id,
            runStatus: createdRun.status,
            updatedAt: nowIso(),
          }));
        },
      },
    );
    const finished = await finishJob(job.id, run);
    const reconciledRun =
      finished.status === "cancelled" && run.status !== "cancelled"
        ? await updateRun(run.id, {
            status: "cancelled",
            statusReason: "Cancelled by user.",
          })
        : run;
    // A control request can race with the orchestrator's terminal project
    // update. Re-apply the winning job/run outcome after the atomic job finish.
    await finishProjectSessionJob(
      job.projectId,
      job.sessionId,
      job.id,
      reconciledRun,
    );
  } catch (error) {
    const message = errorMessage(error);
    const failed = await failQueuedJob(job.id, message).catch((persistError) => {
      log.error("failed to persist background job failure", {
        jobId: job.id,
        error: errorMessage(persistError),
      });
      return undefined;
    });
    if (failed?.status === "cancelled") {
      await setProjectSessionJobStatus(
        job.projectId,
        job.sessionId,
        job.id,
        "cancelled",
        failed.statusReason || "Cancelled by user.",
        failed.runId,
      ).catch(() => undefined);
    } else {
      await failProjectSessionJob(job.projectId, job.sessionId, job.id, message);
    }
  }
}

async function drainJobQueue(): Promise<void> {
  while (true) {
    const job = await claimNextJob();
    if (!job) return;
    log.info("background session job started", {
      jobId: job.id,
      projectId: job.projectId,
      sessionId: job.sessionId,
      attempts: job.attempts,
    });
    await executeJob(job);
    const terminal = getJob(job.id);
    log.info("background session job finished", {
      jobId: job.id,
      status: terminal?.status,
      runId: terminal?.runId,
      durationMs: terminal?.durationMs,
    });
  }
}

function matchingRun(job: Job): Run | undefined {
  return listRuns().find(
    (run) =>
      run.config.projectId === job.projectId &&
      run.config.projectSessionId === job.sessionId &&
      run.config.jobId === job.id,
  );
}

/** Make pre-queue project runs visible in the Previous jobs history. */
export function backfillHistoricalJobs(): Promise<number> {
  const projectById = new Map(listProjects().map((project) => [project.id, project]));
  const historical = listRuns().filter(
    (run) =>
      run.config.projectId &&
      run.config.projectSessionId &&
      !run.config.jobId &&
      (run.status === "completed" || run.status === "paused" || run.status === "failed"),
  );
  return mutateJobs((jobs) => {
    const knownRuns = new Set(jobs.map((job) => job.runId).filter(Boolean));
    const next = jobs.slice();
    let added = 0;
    for (const run of historical) {
      if (knownRuns.has(run.id)) continue;
      const projectId = run.config.projectId!;
      const sessionId = run.config.projectSessionId!;
      const project = projectById.get(projectId);
      const session = project?.sessions.find((item) => item.id === sessionId);
      const completedAt = run.updatedAt || run.createdAt;
      next.push({
        id: `job_legacy_${run.id.replace(/^run_/, "")}`,
        type: "project-session-run",
        status: run.status === "failed" ? "failed" : "completed",
        projectId,
        projectName: project?.name || "Historical project",
        sessionId,
        sessionNumber: run.config.projectSessionNumber ?? session?.number ?? 0,
        runId: run.id,
        runStatus: run.status,
        createdAt: run.createdAt,
        updatedAt: completedAt,
        startedAt: run.createdAt,
        completedAt,
        durationMs: durationBetween(run.createdAt, completedAt),
        error: run.status === "failed" ? run.statusReason || "Run failed." : undefined,
        attempts: 1,
      });
      knownRuns.add(run.id);
      added++;
    }
    return { jobs: next, result: added };
  });
}

/**
 * Startup reconciliation. Queued and explicitly paused work remains durable.
 * Work interrupted inside an active provider call is still failed rather than
 * replayed automatically, because that call may already have incurred cost.
 */
export async function recoverInterruptedJobs(now = nowIso()): Promise<void> {
  const historicalAdded = await backfillHistoricalJobs();
  if (historicalAdded) {
    log.info("historical project runs added to job history", { count: historicalAdded });
  }
  const interrupted = listJobs().filter(
    (job) =>
      job.status === "running" ||
      job.status === "pause-requested" ||
      job.status === "cancel-requested",
  );
  for (const job of interrupted) {
    const project = getProject(job.projectId);
    const session = project?.sessions.find((item) => item.id === job.sessionId);
    const run =
      (job.runId ? getRun(job.runId) : undefined) ??
      (session?.runId ? getRun(session.runId) : undefined) ??
      matchingRun(job);
    const belongsToJob =
      run &&
      run.createdAt >= job.createdAt &&
      run.config.projectId === job.projectId &&
      run.config.projectSessionId === job.sessionId &&
      run.config.jobId === job.id;

    if (job.status === "cancel-requested") {
      const cancelledRun = (belongsToJob ? run : undefined) ?? matchingRun(job);
      if (
        cancelledRun &&
        cancelledRun.status !== "completed" &&
        cancelledRun.status !== "failed" &&
        cancelledRun.status !== "cancelled"
      ) {
        await updateRun(cancelledRun.id, {
          status: "cancelled",
          statusReason: "Cancellation completed during server recovery.",
        });
      }
      const cancelled = await transitionJob(job.id, (current) =>
        acknowledgeCancel(current, now, {
          runId: cancelledRun?.id ?? current.runId,
          runStatus: cancelledRun ? "cancelled" : current.runStatus,
        }),
      );
      await setProjectSessionJobStatus(
        job.projectId,
        job.sessionId,
        job.id,
        "cancelled",
        cancelled.statusReason || "Cancelled by user.",
        cancelled.runId,
      ).catch(() => undefined);
      continue;
    }

    if (
      session?.jobId === job.id &&
      belongsToJob &&
      run.status !== "running" &&
      run.status !== "pending"
    ) {
      await finishJob(job.id, run, now);
      await finishProjectSessionJob(job.projectId, job.sessionId, job.id, run);
      continue;
    }

    const orphanRun = matchingRun(job);
    const reason =
      "Job was interrupted by a server restart. It was not replayed automatically to avoid duplicate model calls; submit the session again.";
    if (orphanRun && (orphanRun.status === "running" || orphanRun.status === "pending")) {
      await updateRun(orphanRun.id, { status: "failed", statusReason: reason });
    }
    await failQueuedJob(job.id, reason, now, orphanRun
      ? { runId: orphanRun.id, runStatus: "failed" }
      : undefined);
    await failProjectSessionJob(job.projectId, job.sessionId, job.id, reason);
  }

  // Repair the cross-file crash window where a session was marked queued but
  // its corresponding job record was never written.
  for (const project of listProjects()) {
    for (const session of project.sessions) {
      if (
        session.status !== "queued" &&
        session.status !== "running" &&
        session.status !== "pause-requested" &&
        session.status !== "paused" &&
        session.status !== "cancel-requested"
      ) continue;
      const job = session.jobId ? getJob(session.jobId) : undefined;
      if (job && ACTIVE_JOB_STATUSES.has(job.status)) {
        const desired = projectStatusForJob(job);
        if (session.status !== desired || (job.runId && session.runId !== job.runId)) {
          await setProjectSessionJobStatus(
            project.id,
            session.id,
            job.id,
            desired,
            job.statusReason || `Job is ${job.status}.`,
            job.runId,
          );
        }
        continue;
      }
      if (job?.status === "cancelled") {
        await setProjectSessionJobStatus(
          project.id,
          session.id,
          job.id,
          "cancelled",
          job.statusReason || "Cancelled by user.",
          job.runId,
        );
        continue;
      }
      if (job?.status === "completed" && job.runId) {
        const completedRun = getRun(job.runId);
        if (completedRun) {
          await finishProjectSessionJob(project.id, session.id, job.id, completedRun);
          continue;
        }
      }
      await failProjectSessionJob(
        project.id,
        session.id,
        session.jobId || "missing-job",
        "Session queue state was incomplete after a server restart. Submit it again.",
      );
    }
  }
}

function ensureRecovery(): Promise<void> {
  const state = queueState();
  if (!state.recoveryPromise) {
    state.recoveryPromise = recoverInterruptedJobs().catch((error) => {
      log.error("background queue recovery failed", { error: errorMessage(error) });
      throw error;
    });
  }
  return state.recoveryPromise;
}

/** Start (or reuse) the detached process-wide worker and return its idle promise. */
export function startJobWorker(): Promise<void> {
  if (process.env.DBRIDGES_DISABLE_JOB_WORKER === "1") return Promise.resolve();
  const state = queueState();
  if (state.workerPromise) return state.workerPromise;
  const worker = (async () => {
    // Defer past the current request handler so submission can return first.
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    await ensureRecovery();
    await drainJobQueue();
  })().catch((error) => {
    log.error("background queue worker failed", { error: errorMessage(error) });
  });
  state.workerPromise = worker.finally(() => {
    state.workerPromise = undefined;
    const jobs = listJobs();
    if (
      jobs.some((job) => job.status === "queued") &&
      !jobs.some((job) => jobOccupiesWorker(job.status))
    ) {
      void startJobWorker();
    }
  });
  return state.workerPromise;
}

/** Test/operations seam: resolves once the current worker has drained. */
export async function waitForJobWorkerIdle(): Promise<void> {
  const active = queueState().workerPromise;
  if (active) await active;
}
