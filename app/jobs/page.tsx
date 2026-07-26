"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Tile, fetchJson, statusKind } from "../ui";
import type { Job } from "@/lib/types";

const POLL_INTERVAL_MS = 3_000;
const CLOCK_INTERVAL_MS = 1_000;

type JobControlAction = "pause" | "continue" | "kill";

const ACTIVE_JOB_STATUSES = new Set<Job["status"]>([
  "queued",
  "running",
  "pause-requested",
  "paused",
  "cancel-requested",
]);

function isActive(status: Job["status"]): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

function jobStatusKind(status: Job["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed" || status === "cancelled" || status === "cancel-requested") {
    return "red";
  }
  if (status === "running") return "muslim";
  if (status === "queued" || status === "pause-requested" || status === "paused") {
    return "amber";
  }
  return "gray";
}

function runStatusKind(status: NonNullable<Job["runStatus"]>): string {
  if (status === "cancelled") return "red";
  if (status === "suspended" || status === "paused") return "amber";
  return statusKind(status);
}

function statusLabel(status: Job["status"]): string {
  if (status === "pause-requested") return "Pause requested";
  if (status === "cancel-requested") return "Cancel requested";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function jobTypeLabel(type: string): string {
  return type
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function timestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function elapsedMs(start?: string, end?: string, nowMs = Date.now()): number | null {
  if (!start) return null;
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : nowMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, endMs - startMs);
}

function duration(value: number | null): string {
  if (value === null) return "—";
  const totalSeconds = Math.floor(value / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function jobDuration(job: Job, nowMs: number): { label: string; value: string } {
  if (job.status === "queued") {
    return {
      label: "Waiting",
      value: duration(elapsedMs(job.queuedAt ?? job.createdAt, undefined, nowMs)),
    };
  }

  if (
    job.status === "running" ||
    job.status === "pause-requested" ||
    job.status === "cancel-requested"
  ) {
    const currentSegment = elapsedMs(
      job.currentStartedAt ?? job.startedAt,
      undefined,
      nowMs,
    ) ?? 0;
    const label = job.status === "pause-requested"
      ? "Pausing"
      : job.status === "cancel-requested"
        ? "Cancelling"
        : "Running";
    return {
      label,
      value: duration((job.durationMs ?? 0) + currentSegment),
    };
  }

  if (job.status === "paused") {
    return {
      label: "Active time",
      value: duration(
        job.durationMs ?? elapsedMs(job.startedAt, job.pausedAt, nowMs) ?? 0,
      ),
    };
  }

  return {
    label: "Duration",
    value: duration(
      job.durationMs ??
        (job.startedAt ? elapsedMs(job.startedAt, job.completedAt, nowMs) : 0),
    ),
  };
}

function controlsFor(job: Job): Array<{ action: JobControlAction; label: string }> {
  if (job.status === "queued") {
    return [
      { action: "pause", label: "Pause" },
      { action: "continue", label: "Continue now" },
      { action: "kill", label: "Kill" },
    ];
  }
  if (job.status === "running") {
    return [
      { action: "pause", label: "Pause" },
      { action: "kill", label: "Kill" },
    ];
  }
  if (job.status === "pause-requested") {
    return [
      { action: "continue", label: "Continue (withdraw)" },
      { action: "kill", label: "Kill" },
    ];
  }
  if (job.status === "paused") {
    return [
      { action: "continue", label: "Continue" },
      { action: "kill", label: "Kill" },
    ];
  }
  return [];
}

function pendingLabel(action: JobControlAction): string {
  if (action === "pause") return "Pausing…";
  if (action === "continue") return "Continuing…";
  return "Killing…";
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<
    Record<string, JobControlAction | undefined>
  >({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async (initial = false) => {
    if (!initial) setRefreshing(true);
    try {
      const result = await fetchJson<{ jobs: Job[] }>("/api/jobs");
      setJobs(result.jobs);
      setLastUpdatedAt(new Date().toISOString());
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => isActive(job.status)),
    [jobs],
  );
  const previousJobs = useMemo(
    () => jobs.filter((job) => !isActive(job.status)),
    [jobs],
  );
  const hasActiveJobs = activeJobs.length > 0;
  const hasTimedJobs = activeJobs.some((job) => job.status !== "paused");

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, load]);

  useEffect(() => {
    if (!hasTimedJobs) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasTimedJobs]);

  const queuedCount = activeJobs.filter((job) => job.status === "queued").length;
  const runningCount = activeJobs.filter((job) => job.status === "running").length;
  const pauseRequestedCount = activeJobs.filter(
    (job) => job.status === "pause-requested",
  ).length;
  const pausedCount = activeJobs.filter((job) => job.status === "paused").length;
  const cancelRequestedCount = activeJobs.filter(
    (job) => job.status === "cancel-requested",
  ).length;
  const completedCount = previousJobs.filter((job) => job.status === "completed").length;
  const failedCount = previousJobs.filter((job) => job.status === "failed").length;
  const cancelledCount = previousJobs.filter((job) => job.status === "cancelled").length;

  const controlJob = useCallback(async (job: Job, action: JobControlAction) => {
    if (action === "kill") {
      const deferred = job.status === "running" || job.status === "pause-requested";
      const confirmed = window.confirm(
        deferred
          ? `Kill job ${job.id}? It will stop after the current safe dialogue step.`
          : `Kill job ${job.id}? This takes effect immediately.`,
      );
      if (!confirmed) return;
    }

    setPendingActions((current) => ({ ...current, [job.id]: action }));
    setActionErrors((current) => ({ ...current, [job.id]: undefined }));
    try {
      const result = await fetchJson<{ job: Job; project: unknown }>(`/api/jobs/${job.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setJobs((current) => current.map((item) => item.id === result.job.id ? result.job : item));
      setLastUpdatedAt(new Date().toISOString());
    } catch (caught) {
      setActionErrors((current) => ({
        ...current,
        [job.id]: caught instanceof Error ? caught.message : String(caught),
      }));
    } finally {
      setPendingActions((current) => ({ ...current, [job.id]: undefined }));
    }
  }, []);

  return (
    <>
      <div className="section-head">
        <div>
          <h1>Jobs</h1>
          <p className="subtitle">
            Session runs continue in the background after submission. You can close or refresh the
            page, then return here to follow active work and open completed transcripts.
          </p>
        </div>
        <button
          type="button"
          className="secondary small"
          disabled={refreshing}
          onClick={() => void load()}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="banner err" role="alert">Could not refresh jobs: {error}</div>}

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <Tile label="Running" value={runningCount} sub="executing now" />
        <Tile label="Queued" value={queuedCount} sub="waiting to start" />
        <Tile label="Pausing" value={pauseRequestedCount} sub="waiting for a safe step" />
        <Tile label="Paused" value={pausedCount} sub="resumable jobs" />
        <Tile label="Cancelling" value={cancelRequestedCount} sub="waiting for a safe step" />
        <Tile
          label="Previous"
          value={previousJobs.length}
          sub={`${completedCount} completed · ${cancelledCount} cancelled · ${failedCount} failed`}
        />
      </div>

      <div className="banner info jobs-control-note">
        Pause and Kill requests for a running job take effect after its current safe dialogue step.
        Pausing or killing queued work is immediate. Continue resumes the same paused run; on queued
        work, <b>Continue now</b> promotes it ahead of ordinary FIFO jobs.
      </div>

      <div className="section-head compact">
        <div>
          <h2>Active jobs</h2>
          <p className="meta" style={{ margin: 0 }} aria-live="polite">
            {hasActiveJobs
              ? `Auto-refreshing every ${POLL_INTERVAL_MS / 1_000} seconds.`
              : "Nothing is queued, running, paused, or awaiting a control request."}
            {lastUpdatedAt ? ` Last checked ${timestamp(lastUpdatedAt)}.` : ""}
          </p>
        </div>
      </div>
      {loading ? (
        <div className="card"><p className="meta">Loading jobs…</p></div>
      ) : activeJobs.length === 0 ? (
        <div className="card job-empty">
          <p>No active jobs.</p>
          <p className="meta">
            Start a configured session from its <Link href="/">project</Link>; it will appear here
            as soon as it is submitted.
          </p>
        </div>
      ) : (
        <JobsTable
          jobs={activeJobs}
          nowMs={nowMs}
          pendingActions={pendingActions}
          actionErrors={actionErrors}
          onControl={controlJob}
        />
      )}

      <div className="section-head compact jobs-history-heading">
        <div>
          <h2>Previous jobs</h2>
          <p className="meta" style={{ margin: 0 }}>
            Completed, cancelled, and failed jobs, newest first.
          </p>
        </div>
      </div>
      {!loading && previousJobs.length === 0 ? (
        <div className="card job-empty">
          <p>No previous jobs yet.</p>
        </div>
      ) : previousJobs.length > 0 ? (
        <JobsTable
          jobs={previousJobs}
          nowMs={nowMs}
          pendingActions={pendingActions}
          actionErrors={actionErrors}
          onControl={controlJob}
        />
      ) : null}
    </>
  );
}

function JobsTable({
  jobs,
  nowMs,
  pendingActions,
  actionErrors,
  onControl,
}: {
  jobs: Job[];
  nowMs: number;
  pendingActions: Record<string, JobControlAction | undefined>;
  actionErrors: Record<string, string | undefined>;
  onControl: (job: Job, action: JobControlAction) => Promise<void>;
}) {
  return (
    <div className="card jobs-card">
      <div className="table-wrap">
        <table className="jobs-table">
          <thead>
            <tr>
              <th scope="col">Job</th>
              <th scope="col">Status</th>
              <th scope="col">Project / session</th>
              <th scope="col">Submitted</th>
              <th scope="col">Started</th>
              <th scope="col">Finished</th>
              <th scope="col">Elapsed</th>
              <th scope="col">Result</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const elapsed = jobDuration(job, nowMs);
              const controls = controlsFor(job);
              const pendingAction = pendingActions[job.id];
              const actionError = actionErrors[job.id];
              return (
                <tr key={job.id}>
                  <td>
                    <div>{jobTypeLabel(job.type)}</div>
                    <div className="meta mono">{job.id}</div>
                    {job.attempts > 1 && <div className="meta">attempt {job.attempts}</div>}
                  </td>
                  <td>
                    <Badge kind={jobStatusKind(job.status)}>{statusLabel(job.status)}</Badge>
                    {job.runStatus && (
                      <div className="job-run-status">
                        <Badge kind={runStatusKind(job.runStatus)}>run {job.runStatus}</Badge>
                      </div>
                    )}
                    {job.statusReason && (
                      <div className="job-status-reason">{job.statusReason}</div>
                    )}
                  </td>
                  <td>
                    <Link href={`/projects/${job.projectId}`}>{job.projectName}</Link>
                    <div>
                      <Link
                        href={`/projects/${job.projectId}#${job.sessionId}`}
                        className="meta"
                      >
                        Session {job.sessionNumber}
                      </Link>
                    </div>
                  </td>
                  <td className="job-timestamp">{timestamp(job.createdAt)}</td>
                  <td className="job-timestamp">{timestamp(job.startedAt)}</td>
                  <td className="job-timestamp">{timestamp(job.completedAt)}</td>
                  <td>
                    <div className={isActive(job.status) ? "job-live-duration" : undefined}>
                      {elapsed.value}
                    </div>
                    <div className="meta">{elapsed.label}</div>
                  </td>
                  <td>
                    {job.runId && (
                      <Link href={`/runs/${job.runId}`} className="button-link secondary-link">
                        Transcript →
                      </Link>
                    )}
                    {job.error && (
                      <span className="job-error" title={job.error}>{job.error}</span>
                    )}
                    {!job.runId && !job.error && (
                      <span className="meta">—</span>
                    )}
                  </td>
                  <td className="job-actions-cell" aria-busy={pendingAction ? "true" : undefined}>
                    {controls.length > 0 ? (
                      <div className="job-control-buttons">
                        {controls.map((control) => (
                          <button
                            key={control.action}
                            type="button"
                            className={`${control.action === "kill" ? "danger " : "secondary "}small`}
                            disabled={Boolean(pendingAction)}
                            aria-label={`${control.label} job ${job.id}, session ${job.sessionNumber}`}
                            title={
                              job.status === "pause-requested" && control.action === "continue"
                                ? "Withdraw the pending pause request"
                                : undefined
                            }
                            onClick={() => void onControl(job, control.action)}
                          >
                            {pendingAction === control.action
                              ? pendingLabel(control.action)
                              : control.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="meta">
                        {job.status === "cancel-requested" ? "Waiting for safe step…" : "—"}
                      </span>
                    )}
                    {pendingAction && (
                      <div className="job-control-message" role="status" aria-live="polite">
                        {pendingLabel(pendingAction)}
                      </div>
                    )}
                    {actionError && (
                      <div className="job-control-error" role="alert">
                        Action failed: {actionError}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
