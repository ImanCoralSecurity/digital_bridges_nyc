"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DEFAULT_REASONING_EFFORT,
  GPT_MODEL_GROUPS,
  REASONING_OPTIONS,
} from "../../models";
import { Badge, Tile, fetchJson } from "../../ui";
import type { Job, Project, ProjectSession, ReasoningEffort } from "@/lib/types";

const ACTIVE_SESSION_STATUSES = new Set<ProjectSession["status"]>([
  "queued",
  "running",
  "pause-requested",
  "paused",
  "cancel-requested",
]);

function isActiveSession(session: ProjectSession): boolean {
  if (session.status === "paused") return session.jobStatus === "paused";
  return ACTIVE_SESSION_STATUSES.has(session.status);
}

function projectStatusKind(status: Project["status"]): string {
  if (status === "completed") return "green";
  if (status === "active") return "amber";
  return "gray";
}

function sessionStatusKind(status: ProjectSession["status"]): string {
  if (status === "completed" || status === "ready") return "green";
  if (status === "failed" || status === "cancelled") return "red";
  if (ACTIVE_SESSION_STATUSES.has(status)) return "amber";
  return "gray";
}

function sessionStatusLabel(status: ProjectSession["status"]): string {
  if (status === "pause-requested") return "Pause requested";
  if (status === "cancel-requested") return "Cancel requested";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function jobLinkLabel(session: ProjectSession): string {
  if (session.status === "paused" && session.jobStatus === "paused") {
    return "Continue paused job →";
  }
  if (session.status === "pause-requested") return "Manage pause request →";
  if (session.status === "cancel-requested") return "Cancellation pending →";
  return "View background job →";
}

function maxRoundsForRoster(attendeeCount: number): number {
  if (!attendeeCount) return 1;
  return Math.max(1, Math.min(10, Math.floor(60 / attendeeCount)));
}

export default function ProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [publicationAction, setPublicationAction] = useState<
    "publish" | "update" | "unpublish" | null
  >(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  async function load() {
    try {
      setProject(await fetchJson<Project>(`/api/projects/${id}`));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hasActiveSession = Boolean(
    project?.sessions.some(isActiveSession),
  );
  useEffect(() => {
    if (!hasActiveSession) return;
    const timer = window.setInterval(() => {
      fetchJson<Project>(`/api/projects/${id}`).then(setProject).catch(() => {});
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveSession, id]);

  function markQueued(sessionId: string) {
    setProject((current) =>
      current
        ? {
            ...current,
            status: "active",
            sessions: current.sessions.map((session) =>
              session.id === sessionId
                ? { ...session, status: "queued", statusReason: "Submitting background job…" }
                : session,
            ),
          }
        : current,
    );
  }

  async function removeProject() {
    if (!project) return;
    if (project.published) {
      setError("Unpublish this project before removing it from the workspace.");
      return;
    }
    const confirmed = window.confirm(
      `Remove project “${project.name}” and its remaining session plans? ` +
        "Historical runs and transcripts are preserved and remain accessible. " +
        "A project with active work cannot be removed. This cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingProject(true);
    setError("");
    setNotice("");
    try {
      await fetchJson<unknown>(`/api/projects/${project.id}`, { method: "DELETE" });
      router.replace("/");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(`Could not remove project. ${message}`);
      setDeletingProject(false);
    }
  }

  async function removeSession(session: ProjectSession) {
    if (!project) return;
    if (isActiveSession(session)) {
      setError(
        `Session ${session.number} cannot be removed while its job is ${sessionStatusLabel(session.status).toLowerCase()}. Use the Jobs controls first.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `Remove Session ${session.number} from “${project.name}”? ` +
        "Historical runs and transcripts are preserved and remain accessible. " +
        "A session with active work cannot be removed. This cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingSessionId(session.id);
    setError("");
    setNotice("");
    try {
      await fetchJson<unknown>(
        `/api/projects/${project.id}/sessions/${session.id}`,
        { method: "DELETE" },
      );
      setProject((current) =>
        current
          ? {
              ...current,
              sessionCount: Math.max(0, current.sessionCount - 1),
              sessions: current.sessions.filter((item) => item.id !== session.id),
            }
          : current,
      );
      setNotice(
        `Session ${session.number} was removed. Its historical runs and transcripts were preserved.`,
      );
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(`Could not remove Session ${session.number}. ${message}`);
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function setPublication(nextPublished: boolean) {
    if (!project) return;
    const updating = nextPublished && project.published;
    const action = updating ? "update" : nextPublished ? "publish" : "unpublish";
    const confirmed = window.confirm(
      updating
        ? `Update the public page for “${project.name}”? This replaces its public snapshot with the current persona profiles and latest successfully completed transcripts.`
        : nextPublished
        ? `Publish “${project.name}” for anyone to view? Its persona profiles and completed session transcripts will be public and read only.`
        : `Unpublish “${project.name}”? Its public link will stop working immediately.`,
    );
    if (!confirmed) return;

    setPublicationAction(action);
    setError("");
    setNotice("");
    try {
      const updated = await fetchJson<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: nextPublished }),
      });
      setProject(updated);
      setNotice(
        updating
          ? "Public page updated with the current persona profiles and latest successfully completed transcripts."
          : nextPublished
          ? "Project published. Its public page now shows the persona profiles and completed session transcripts."
          : "Project unpublished. Its public page is no longer accessible.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPublicationAction(null);
    }
  }

  if (error && !project) return <div className="banner err">{error}</div>;
  if (!project) return <p className="meta">Loading project…</p>;

  const muslim = project.attendees.filter((attendee) => attendee.group === "muslim");
  const jewish = project.attendees.filter((attendee) => attendee.group === "jewish");
  const challengeIds = new Set(project.controversialAgentIds);
  const completed = project.sessions.filter((session) => session.status === "completed").length;
  const publicationBusy = publicationAction !== null;
  const maxRounds = maxRoundsForRoster(project.attendeeIds.length);

  return (
    <>
      <p className="meta"><Link href="/">← Projects</Link></p>
      <div className="section-head">
        <div>
          <h1>{project.name}</h1>
          <div className="inline" style={{ marginTop: 7 }}>
            <Badge kind={projectStatusKind(project.status)}>{project.status}</Badge>
            {project.published && <Badge kind="green">published</Badge>}
            <Badge kind="gray">{project.provider}</Badge>
            <Badge kind="gray">{project.model}</Badge>
            {project.reasoningEffort && <Badge kind="gray">{project.reasoningEffort} reasoning</Badge>}
            <Badge kind="gray">{project.selection}</Badge>
            {project.mock && <Badge kind="gray">mock</Badge>}
          </div>
          <p className="meta mono" style={{ marginBottom: 0 }}>{project.id}</p>
        </div>
        <div className="inline">
          {project.published && (
            <Link
              href={`/public/projects/${project.id}`}
              className="button-link secondary-link"
              target="_blank"
              rel="noreferrer"
            >
              View public page ↗
            </Link>
          )}
          {project.published ? (
            <>
              <button
                type="button"
                disabled={publicationBusy || deletingProject || deletingSessionId !== null}
                onClick={() => void setPublication(true)}
              >
                {publicationAction === "update" ? "Updating public page…" : "Update public page"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={publicationBusy || deletingProject || deletingSessionId !== null}
                onClick={() => void setPublication(false)}
              >
                {publicationAction === "unpublish" ? "Unpublishing…" : "Unpublish"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={
                publicationBusy ||
                deletingProject ||
                deletingSessionId !== null
              }
              onClick={() => void setPublication(true)}
            >
              {publicationAction === "publish" ? "Publishing…" : "Publish project"}
            </button>
          )}
          <button
            type="button"
            className="danger"
            disabled={
              deletingProject ||
              deletingSessionId !== null ||
              publicationBusy ||
              project.published
            }
            title={project.published ? "Unpublish this project before removing it." : undefined}
            aria-label={`Remove project ${project.name}`}
            onClick={() => void removeProject()}
          >
            {deletingProject ? "Removing project…" : "Remove project"}
          </button>
        </div>
      </div>

      {error && <div className="banner err">{error}</div>}
      {notice && <div className="banner info" aria-live="polite">{notice}</div>}

      <div className={`banner ${project.published ? "info" : "warn"}`}>
        {project.published ? (
          <>
            This project is public and read only. It is a frozen snapshot: workspace edits and
            reruns stay private until you choose Update public page. {" "}
            <Link href={`/public/projects/${project.id}`}>Open the public page →</Link>
          </>
        ) : (
          "This project is private. Publishing captures only successfully completed, non-empty transcripts and will verify that at least one is available."
        )}
      </div>

      <div className="grid grid-3">
        <Tile label="Sessions complete" value={`${completed} / ${project.sessionCount}`} />
        <Tile
          label="Shared roster"
          value={project.attendeeIds.length}
          sub={`${muslim.length} Muslim · ${jewish.length} Jewish`}
        />
        <Tile
          label="Challenge voices"
          value={`${project.controversialPerCommunity} + ${project.controversialPerCommunity}`}
          sub="fixed assignment across sessions"
        />
      </div>

      {project.projectIntroduction && (
        <section className="card" style={{ marginTop: 18 }}>
          <h2 className="card-title">Session 1 project introduction</h2>
          <p style={{ marginBottom: 0 }}>{project.projectIntroduction}</p>
          <p className="meta" style={{ marginBottom: 0 }}>
            Sam speaks this overview, followed by his degree and professional background, only in Session 1.
          </p>
        </section>
      )}

      <h2>Shared roster</h2>
      <p className="meta">
        These students attend every session. Challenge is a project-scoped dialogue role, assigned
        once at creation; it is not part of a persona&apos;s identity.
      </p>
      <div className="grid grid-2">
        <RosterPanel title="Muslim students" attendees={muslim} challengeIds={challengeIds} kind="muslim" />
        <RosterPanel title="Jewish students" attendees={jewish} challengeIds={challengeIds} kind="jewish" />
      </div>

      <div className="section-head">
        <div>
          <h2>Sessions</h2>
          <p className="meta" style={{ margin: 0 }}>
            Configure a topic and number of go-rounds, save, then run each session independently.
            With {project.attendeeIds.length} attendees, the safety cap allows at most {maxRounds} rounds
            ({project.attendeeIds.length * maxRounds} persona turns) per session.
          </p>
        </div>
      </div>
      <div className="banner info">
        Session runs use a persistent background queue. After submission you may refresh, navigate
        away, or close this tab. Pause, Continue, and Kill controls are in the{" "}
        <Link href="/jobs">Jobs tab</Link>. Controls on a running job take effect after its current
        safe dialogue step; Continue resumes the same paused run.
      </div>

      {project.sessions
        .slice()
        .sort((a, b) => a.number - b.number)
        .map((session) => (
          <SessionCard
            key={session.id}
            projectId={project.id}
            attendeeCount={project.attendeeIds.length}
            maxRounds={maxRounds}
            session={session}
            projectModel={project.model}
            projectReasoningEffort={project.reasoningEffort}
            onProject={setProject}
            onQueued={() => markQueued(session.id)}
            onDelete={() => void removeSession(session)}
            deleting={deletingSessionId === session.id}
            destructiveBusy={deletingProject || deletingSessionId !== null}
            reload={load}
          />
        ))}
    </>
  );
}

function RosterPanel({
  title,
  attendees,
  challengeIds,
  kind,
}: {
  title: string;
  attendees: Project["attendees"];
  challengeIds: Set<string>;
  kind: "muslim" | "jewish";
}) {
  return (
    <section className="card roster-panel">
      <h3>{title} ({attendees.length})</h3>
      <div className="roster-list">
        {attendees.map((attendee) => (
          <div key={attendee.id} className="roster-person">
            <Badge kind={kind}>{attendee.name}</Badge>
            {challengeIds.has(attendee.id) && <Badge kind="amber">challenge voice</Badge>}
          </div>
        ))}
      </div>
    </section>
  );
}

function SessionCard({
  projectId,
  attendeeCount,
  maxRounds,
  session,
  projectModel,
  projectReasoningEffort,
  onProject,
  onQueued,
  onDelete,
  deleting,
  destructiveBusy,
  reload,
}: {
  projectId: string;
  attendeeCount: number;
  maxRounds: number;
  session: ProjectSession;
  projectModel: string;
  projectReasoningEffort?: ReasoningEffort;
  onProject: (project: Project) => void;
  onQueued: () => void;
  onDelete: () => void;
  deleting: boolean;
  destructiveBusy: boolean;
  reload: () => Promise<void>;
}) {
  const [topic, setTopic] = useState(session.topic);
  const [rounds, setRounds] = useState(session.rounds ?? Math.min(2, maxRounds));
  const [runModel, setRunModel] = useState(projectModel);
  const [runReasoningEffort, setRunReasoningEffort] = useState<ReasoningEffort>(
    projectReasoningEffort ?? DEFAULT_REASONING_EFFORT,
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setTopic(session.topic);
    setRounds(session.rounds ?? Math.min(2, maxRounds));
  }, [maxRounds, session.topic, session.rounds]);

  const dirty = topic.trim() !== session.topic || rounds !== session.rounds;
  const valid =
    topic.trim().length > 0 &&
    topic.length <= 500 &&
    Number.isInteger(rounds) &&
    rounds >= 1 &&
    rounds <= maxRounds;
  const locked =
    isActiveSession(session) || session.status === "completed" || destructiveBusy;
  const runnable =
    !dirty &&
    !submitting &&
    !destructiveBusy &&
    (session.status === "ready" ||
      (session.status === "paused" && !isActiveSession(session)) ||
      session.status === "failed" ||
      session.status === "completed" ||
      session.status === "cancelled");

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await fetchJson<Project>(
        `/api/projects/${projectId}/sessions/${session.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ topic, rounds }),
        },
      );
      onProject(updated);
      setNotice("Configuration saved. This session is ready to run.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function run() {
    setSubmitting(true);
    setError("");
    setNotice("");
    onQueued();
    try {
      const result = await fetchJson<{
        project: Project;
        job: Job;
        reused: boolean;
      }>(
        `/api/projects/${projectId}/sessions/${session.id}/run`,
        {
          method: "POST",
          body: JSON.stringify({
            model: runModel,
            reasoningEffort: runReasoningEffort,
          }),
        },
      );
      onProject(result.project);
      setNotice(
        result.reused
          ? `Job ${result.job.id} is already ${result.job.status}.`
          : `Job ${result.job.id} was submitted. You may close or refresh this page.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article id={session.id} className="card session-card">
      <div className="section-head compact">
        <div>
          <div className="inline">
            <h3 style={{ margin: 0 }}>Session {session.number}</h3>
            <Badge kind={sessionStatusKind(session.status)}>
              {sessionStatusLabel(session.status)}
            </Badge>
            {session.mandatoryIntroductionRound && <Badge kind="amber">introduction first</Badge>}
          </div>
          <span className="meta mono">{session.id}</span>
        </div>
        <div className="inline">
          {session.jobId && (
            <Link href="/jobs" className="button-link secondary-link">
              {jobLinkLabel(session)}
            </Link>
          )}
          {session.runId && (
            <Link href={`/runs/${session.runId}`} className="button-link secondary-link">
              Latest transcript →
            </Link>
          )}
          <button
            type="button"
            className="danger small"
            disabled={
              destructiveBusy ||
              saving ||
              submitting ||
              isActiveSession(session)
            }
            aria-label={`Remove Session ${session.number}`}
            title={
              isActiveSession(session)
                ? "Use the Jobs controls to stop active work before removing this session."
                : "Remove this session plan; historical runs and transcripts are preserved."
            }
            onClick={onDelete}
          >
            {deleting ? "Removing…" : "Remove session"}
          </button>
        </div>
      </div>

      {session.mandatoryIntroductionRound && (
        <p className="meta">
          Round 1 is the mandatory introduction go-round and counts toward the total below. Later
          rounds use this session&apos;s topic.
        </p>
      )}

      <div className="session-form">
        <div>
          <label htmlFor={`topic-${session.id}`}>Topic / opening invitation</label>
          <textarea
            id={`topic-${session.id}`}
            maxLength={500}
            rows={3}
            value={topic}
            disabled={locked}
            onChange={(event) => {
              setTopic(event.target.value);
              setNotice("");
            }}
            placeholder="Invite first-person stories and curiosity rather than abstract debate."
          />
          <span className="meta">{topic.length} / 500 characters</span>
        </div>
        <div className="round-control">
          <label htmlFor={`rounds-${session.id}`}>Rounds</label>
          <input
            id={`rounds-${session.id}`}
            type="number"
            min={1}
            max={maxRounds}
            value={rounds}
            disabled={locked}
            onChange={(event) => {
              setRounds(Number(event.target.value));
              setNotice("");
            }}
          />
          <span className="meta">
            {attendeeCount} × {Number.isFinite(rounds) ? rounds : 0} = {attendeeCount * (Number.isFinite(rounds) ? rounds : 0)} persona turns
          </span>
        </div>
      </div>

      {session.statusReason && !isActiveSession(session) && (
        <div
          className={`banner ${
            session.status === "failed" || session.status === "cancelled" ? "err" : "info"
          }`}
        >
          {session.statusReason}
        </div>
      )}
      {isActiveSession(session) && (
        <div className="banner info" aria-live="polite">
          {session.status === "queued" && (
            <>Session {session.number} is queued in the background.</>
          )}
          {session.status === "running" && (
            <>Session {session.number} is running in the background.</>
          )}
          {session.status === "pause-requested" && (
            <>
              Pause requested. The job will pause after its current safe dialogue step; you can
              withdraw the request from Jobs.
            </>
          )}
          {session.status === "paused" && (
            <>
              This job is paused at a safe dialogue checkpoint. Continue it from Jobs to resume the
              same run.
            </>
          )}
          {session.status === "cancel-requested" && (
            <>
              Cancellation requested. The job will stop after its current safe dialogue step.
            </>
          )}{" "}
          <Link href="/jobs">Open Jobs for controls and live status →</Link>
        </div>
      )}
      {error && <div className="banner err" role="alert">{error}</div>}
      {notice && <div className="banner info" aria-live="polite">{notice}</div>}

      {!isActiveSession(session) && (
        <div className="row" style={{ marginTop: 14 }}>
          <div>
            <label htmlFor={`run-model-${session.id}`}>Model for this run</label>
            <select
              id={`run-model-${session.id}`}
              value={runModel}
              disabled={submitting || destructiveBusy}
              onChange={(event) => setRunModel(event.target.value)}
            >
              {GPT_MODEL_GROUPS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`run-effort-${session.id}`}>Reasoning effort</label>
            <select
              id={`run-effort-${session.id}`}
              value={runReasoningEffort}
              disabled={submitting || destructiveBusy}
              onChange={(event) =>
                setRunReasoningEffort(event.target.value as ReasoningEffort)}
            >
              {REASONING_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="inline session-actions">
        <button
          type="button"
          className="secondary"
          disabled={locked || saving || submitting || !valid || !dirty}
          onClick={save}
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {!isActiveSession(session) && (
          <button type="button" disabled={!runnable} onClick={run}>
            {submitting
              ? "Submitting…"
              : session.status === "failed" ||
                  session.status === "paused" ||
                  session.status === "cancelled" ||
                  session.status === "completed"
                ? "Run session again"
                : "Run session"}
          </button>
        )}
        {isActiveSession(session) && (
          <span className="meta">Use the existing job controls in Jobs.</span>
        )}
        {dirty && valid && <span className="meta">Save changes before running.</span>}
      </div>
    </article>
  );
}
