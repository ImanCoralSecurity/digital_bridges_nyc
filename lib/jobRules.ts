// Pure state transitions for persistent background jobs. Keeping these free of
// I/O makes queue ordering, control races, and timing semantics independently
// testable.

import type { Job, RunStatus } from "./types";

export interface NewSessionJobInput {
  id: string;
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionNumber: number;
  model?: string;
  reasoningEffort?: Job["reasoningEffort"];
  now: string;
}

const WORKER_SLOT_STATUSES = new Set<Job["status"]>([
  "running",
  "pause-requested",
  "cancel-requested",
]);

export function jobOccupiesWorker(status: Job["status"]): boolean {
  return WORKER_SLOT_STATUSES.has(status);
}

export function createSessionJob(input: NewSessionJobInput): Job {
  return {
    id: input.id,
    type: "project-session-run",
    status: "queued",
    projectId: input.projectId,
    projectName: input.projectName,
    sessionId: input.sessionId,
    sessionNumber: input.sessionNumber,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    createdAt: input.now,
    updatedAt: input.now,
    queuedAt: input.now,
    attempts: 0,
    resumeCount: 0,
    statusReason: "Waiting for a background worker.",
  };
}

export function durationBetween(startedAt: string | undefined, completedAt: string): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function activeDurationAt(job: Job, now: string): number {
  const accumulated = job.durationMs ?? 0;
  if (!jobOccupiesWorker(job.status)) return accumulated;
  return accumulated + durationBetween(job.currentStartedAt ?? job.startedAt, now);
}

/**
 * Claim the next queued job while enforcing one worker slot per store.
 * Explicitly promoted jobs run before ordinary FIFO work; each group is FIFO.
 */
export function claimOldestQueuedJob(
  jobs: Job[],
  now: string,
): { jobs: Job[]; claimed?: Job } {
  if (jobs.some((job) => jobOccupiesWorker(job.status))) return { jobs };
  let candidate = -1;
  for (let index = 0; index < jobs.length; index++) {
    if (jobs[index].status !== "queued") continue;
    if (candidate === -1) {
      candidate = index;
      continue;
    }
    const currentPromoted = Boolean(jobs[index].priorityRequestedAt);
    const candidatePromoted = Boolean(jobs[candidate].priorityRequestedAt);
    if (currentPromoted !== candidatePromoted) {
      if (currentPromoted) candidate = index;
      continue;
    }
    const currentOrder = jobs[index].priorityRequestedAt ?? jobs[index].createdAt;
    const candidateOrder = jobs[candidate].priorityRequestedAt ?? jobs[candidate].createdAt;
    if (currentOrder.localeCompare(candidateOrder) < 0) candidate = index;
  }
  if (candidate === -1) return { jobs };
  const claimed: Job = {
    ...jobs[candidate],
    status: "running",
    runStatus: jobs[candidate].runId ? "running" : jobs[candidate].runStatus,
    startedAt: jobs[candidate].startedAt ?? now,
    currentStartedAt: now,
    completedAt: undefined,
    priorityRequestedAt: undefined,
    pauseRequestedAt: undefined,
    cancelRequestedAt: undefined,
    error: undefined,
    statusReason: "Running in the background.",
    attempts: jobs[candidate].attempts + 1,
    updatedAt: now,
  };
  const next = jobs.slice();
  next[candidate] = claimed;
  return { jobs: next, claimed };
}

export function requestPause(job: Job, now: string): Job {
  if (job.status === "paused" || job.status === "pause-requested") return job;
  if (job.status === "queued") {
    return {
      ...job,
      status: "paused",
      pausedAt: now,
      priorityRequestedAt: undefined,
      statusReason: "Paused before the worker started.",
      updatedAt: now,
    };
  }
  if (job.status === "running") {
    return {
      ...job,
      status: "pause-requested",
      pauseRequestedAt: now,
      statusReason: "Pause requested; finishing the current safe dialogue step.",
      updatedAt: now,
    };
  }
  throw new Error(`Job ${job.id} cannot be paused while ${job.status}.`);
}

/** Continue a paused job, withdraw a pending pause, or promote queued work. */
export function continueJob(job: Job, now: string): Job {
  if (job.status === "queued") {
    return {
      ...job,
      priorityRequestedAt: job.priorityRequestedAt ?? now,
      statusReason: "Prioritized to run next when the worker is free.",
      updatedAt: now,
    };
  }
  if (job.status === "pause-requested") {
    return {
      ...job,
      status: "running",
      pauseRequestedAt: undefined,
      statusReason: "Pause withdrawn; continuing the current run.",
      updatedAt: now,
    };
  }
  if (job.status === "paused") {
    return {
      ...job,
      status: "queued",
      queuedAt: now,
      priorityRequestedAt: now,
      pauseRequestedAt: undefined,
      completedAt: undefined,
      error: undefined,
      resumeCount: (job.resumeCount ?? 0) + 1,
      statusReason: "Queued to resume this same run next.",
      updatedAt: now,
    };
  }
  if (job.status === "running") return job;
  throw new Error(`Job ${job.id} cannot continue while ${job.status}.`);
}

export function requestCancel(job: Job, now: string): Job {
  if (job.status === "cancelled" || job.status === "cancel-requested") return job;
  if (job.status === "queued" || job.status === "paused") {
    return {
      ...job,
      status: "cancelled",
      cancelledAt: now,
      completedAt: now,
      priorityRequestedAt: undefined,
      currentStartedAt: undefined,
      statusReason: "Cancelled by user.",
      updatedAt: now,
    };
  }
  if (job.status === "running" || job.status === "pause-requested") {
    return {
      ...job,
      status: "cancel-requested",
      cancelRequestedAt: now,
      pauseRequestedAt: undefined,
      statusReason: "Cancellation requested; finishing the current safe dialogue step.",
      updatedAt: now,
    };
  }
  throw new Error(`Job ${job.id} cannot be cancelled while ${job.status}.`);
}

export function acknowledgePause(
  job: Job,
  now: string,
  result: { runId: string; runStatus: RunStatus },
): Job {
  if (job.status !== "pause-requested" || result.runStatus !== "suspended") {
    throw new Error(`Job ${job.id} did not reach a resumable pause checkpoint.`);
  }
  return {
    ...job,
    status: "paused",
    runId: result.runId,
    runStatus: result.runStatus,
    pausedAt: now,
    durationMs: activeDurationAt(job, now),
    currentStartedAt: undefined,
    statusReason: "Paused at a safe dialogue checkpoint; Continue resumes this run.",
    updatedAt: now,
  };
}

export function acknowledgeCancel(
  job: Job,
  now: string,
  result?: { runId?: string; runStatus?: RunStatus },
): Job {
  if (job.status !== "cancel-requested" && job.status !== "cancelled") {
    throw new Error(`Job ${job.id} has no pending cancellation.`);
  }
  if (job.status === "cancelled") return job;
  return {
    ...job,
    status: "cancelled",
    runId: result?.runId ?? job.runId,
    runStatus: result?.runStatus ?? job.runStatus,
    cancelledAt: now,
    completedAt: now,
    durationMs: activeDurationAt(job, now),
    currentStartedAt: undefined,
    statusReason: "Cancelled by user.",
    updatedAt: now,
  };
}

export function completeJob(
  job: Job,
  now: string,
  result: { runId: string; runStatus: RunStatus },
): Job {
  if (job.status === "pause-requested" && result.runStatus === "suspended") {
    return acknowledgePause(job, now, result);
  }
  if (job.status === "cancel-requested" && result.runStatus === "cancelled") {
    return acknowledgeCancel(job, now, result);
  }
  if (job.status === "cancel-requested") {
    return acknowledgeCancel(job, now, {
      runId: result.runId,
      runStatus: "cancelled",
    });
  }
  const finishing = job.status === "pause-requested"
    ? { ...job, status: "running" as const }
    : job;
  if (finishing.status !== "running") {
    throw new Error(`Job ${job.id} cannot finish while ${job.status}.`);
  }
  const failed = result.runStatus === "failed";
  return {
    ...finishing,
    status: failed ? "failed" : "completed",
    runId: result.runId,
    runStatus: result.runStatus,
    completedAt: now,
    durationMs: activeDurationAt(finishing, now),
    currentStartedAt: undefined,
    error: failed ? job.error || "Run failed." : undefined,
    statusReason: failed ? job.error || "Run failed." : "Background run finished.",
    updatedAt: now,
  };
}

export function failJob(
  job: Job,
  now: string,
  error: string,
  result?: { runId?: string; runStatus?: RunStatus },
): Job {
  if (job.status === "cancel-requested") {
    return acknowledgeCancel(job, now, {
      runId: result?.runId ?? job.runId,
      runStatus: "cancelled",
    });
  }
  return {
    ...job,
    status: "failed",
    runId: result?.runId ?? job.runId,
    runStatus: result?.runStatus ?? job.runStatus,
    completedAt: now,
    durationMs: activeDurationAt(job, now),
    currentStartedAt: undefined,
    error: error || "Job failed.",
    statusReason: error || "Job failed.",
    updatedAt: now,
  };
}
