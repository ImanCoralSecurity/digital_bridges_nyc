"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Tile, fetchJson } from "./ui";
import {
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  DEFAULT_REASONING_EFFORT,
  GPT_MODEL_GROUPS,
  REASONING_OPTIONS,
  isKnownUiModel,
} from "./models";
import type {
  AgentProvider,
  Project,
  ReasoningEffort,
  SelectionStrategy,
} from "@/lib/types";

interface PersonaLite {
  id: string;
  displayName: string;
  group: string;
  raisedIn?: string;
  reviewed: boolean;
}

interface ProviderHealth {
  installed: boolean;
  available: boolean;
  version: string;
  authStatus?: string;
}

interface Health {
  forceMock: boolean;
  defaultProvider: AgentProvider;
  defaultModel: string;
  defaultReasoningEffort: ReasoningEffort;
  defaultBudgetUsd: number;
  providers: Record<AgentProvider, ProviderHealth>;
}

function projectStatusKind(status: Project["status"]): string {
  if (status === "completed") return "green";
  if (status === "active") return "amber";
  return "gray";
}

export default function ProjectsDashboard() {
  const [personas, setPersonas] = useState<PersonaLite[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  const [name, setName] = useState("");
  const [projectIntroduction, setProjectIntroduction] = useState("");
  const [sessionCount, setSessionCount] = useState(3);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [challengePerCommunity, setChallengePerCommunity] = useState(1);
  const provider: AgentProvider = DEFAULT_PROVIDER_ID;
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(DEFAULT_REASONING_EFFORT);
  const [selection, setSelection] = useState<SelectionStrategy>("round-robin");
  const [mock, setMock] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Project | null>(null);

  async function loadProjects() {
    setProjects(await fetchJson<Project[]>("/api/projects"));
  }

  useEffect(() => {
    (async () => {
      try {
        const [p, h, projectList] = await Promise.all([
          fetchJson<PersonaLite[]>("/api/personas"),
          fetchJson<Health>("/api/health"),
          fetchJson<Project[]>("/api/projects"),
        ]);
        setPersonas(p);
        setHealth(h);
        setProjects(projectList);
        setModel(
          h.defaultProvider === "codex" && isKnownUiModel(h.defaultModel)
            ? h.defaultModel
            : DEFAULT_MODEL_ID,
        );
        setReasoningEffort(h.defaultReasoningEffort || DEFAULT_REASONING_EFFORT);
        setMock(Boolean(h.forceMock || !h.providers.codex?.available));
        setAttendeeIds(
          p
            .filter((persona) => persona.group === "muslim" || persona.group === "jewish")
            .map((persona) => persona.id),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const muslim = personas.filter((persona) => persona.group === "muslim");
  const jewish = personas.filter((persona) => persona.group === "jewish");
  const students = [...muslim, ...jewish];
  const selectedMuslim = attendeeIds.filter((id) =>
    muslim.some((persona) => persona.id === id),
  ).length;
  const selectedJewish = attendeeIds.filter((id) =>
    jewish.some((persona) => persona.id === id),
  ).length;
  const challengeLimit = Math.min(selectedMuslim, selectedJewish);
  const providerHealth = health?.providers[provider];
  const mockLocked = Boolean(!health || health.forceMock || !providerHealth?.available);
  const valid =
    name.trim().length > 0 &&
    projectIntroduction.trim().length > 0 &&
    projectIntroduction.trim().length <= 800 &&
    Number.isInteger(sessionCount) &&
    sessionCount >= 1 &&
    sessionCount <= 20 &&
    selectedMuslim >= 1 &&
    selectedJewish >= 1 &&
    Number.isInteger(challengePerCommunity) &&
    challengePerCommunity >= 0 &&
    challengePerCommunity <= challengeLimit;

  const completedSessions = projects.reduce(
    (total, project) =>
      total + project.sessions.filter((session) => session.status === "completed").length,
    0,
  );
  const totalSessions = projects.reduce((total, project) => total + project.sessionCount, 0);

  useEffect(() => {
    setChallengePerCommunity((current) => Math.min(current, challengeLimit));
  }, [challengeLimit]);

  function toggleAttendee(id: string) {
    setAttendeeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function createProject() {
    setSubmitting(true);
    setError("");
    setNotice(null);
    try {
      const project = await fetchJson<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          projectIntroduction,
          sessionCount,
          attendeeIds,
          controversialPerCommunity: challengePerCommunity,
          provider,
          model,
          reasoningEffort,
          selection,
          budgetUsd: health?.defaultBudgetUsd,
          mock: mockLocked ? true : mock,
        }),
      });
      setNotice(project);
      setName("");
      setProjectIntroduction("");
      await loadProjects();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h1>Projects</h1>
          <p className="subtitle">
            Plan a series of facilitated sessions around one shared student cohort, then configure
            and run each conversation separately.
          </p>
        </div>
      </div>

      {health &&
        (health.forceMock ? (
          <div className="banner info">Global mock mode is ON — no CLI calls or cost.</div>
        ) : providerHealth?.available ? (
          <div className="banner info">
            Codex CLI detected ({providerHealth.version}). New projects default to real Codex runs.
          </div>
        ) : (
          <div className="banner warn">
            Codex CLI is unavailable
            {providerHealth?.authStatus ? `: ${providerHealth.authStatus}` : ""} — new projects will
            use deterministic mock mode.
          </div>
        ))}
      {error && <div className="banner err">{error}</div>}
      {notice && (
        <div className="banner info">
          Created <b>{notice.name}</b> with {notice.sessionCount} sessions. {" "}
          <Link href={`/projects/${notice.id}`}>Configure its sessions →</Link>
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <Tile label="Projects" value={projects.length} />
        <Tile
          label="Active projects"
          value={projects.filter((project) => project.status === "active").length}
        />
        <Tile
          label="Sessions complete"
          value={`${completedSessions} / ${totalSessions}`}
          sub={totalSessions ? "across all projects" : "no sessions planned yet"}
        />
      </div>

      <div className="card">
        <h2 className="card-title">Create a project</h2>
        <p className="meta" style={{ marginTop: 0 }}>
          The roster and randomly assigned challenge-voice pool are fixed for every session in this
          project. One eligible voice from each community rotates into every discussion round. Topics and rounds are
          configured later, one session at a time.
        </p>

        <div className="row">
          <div style={{ flex: 2 }}>
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              type="text"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Morningside summer dialogue series"
            />
          </div>
          <div>
            <label htmlFor="session-count">Number of sessions</label>
            <input
              id="session-count"
              type="number"
              min={1}
              max={20}
              value={sessionCount}
              onChange={(event) => setSessionCount(Number(event.target.value))}
            />
          </div>
          <div>
            <label htmlFor="challenge-count">Challenge-voice pool per community</label>
            <input
              id="challenge-count"
              type="number"
              min={0}
              max={challengeLimit}
              value={challengePerCommunity}
              onChange={(event) => setChallengePerCommunity(Number(event.target.value))}
            />
            <span className="meta">Assigned once per project; one voice per community rotates into each discussion round.</span>
          </div>
        </div>

        <label htmlFor="project-introduction">Project introduction for Sam</label>
        <textarea
          id="project-introduction"
          rows={4}
          maxLength={800}
          value={projectIntroduction}
          onChange={(event) => setProjectIntroduction(event.target.value)}
          placeholder="Describe the purpose and arc of the whole project in the words Sam should use to welcome participants."
        />
        <span className="meta">
          Spoken verbatim by Sam only in Session 1, before the shared agreements. Any text up to 800 characters is accepted; Sam adds his credentials separately.
        </span>

        <fieldset className="roster-fieldset">
          <legend>Shared student roster</legend>
          <div className="row">
            <div>
              <label>Muslim students ({selectedMuslim} of {muslim.length})</label>
              <div className="checklist">
                {muslim.map((persona) => (
                  <label key={persona.id} className="chk">
                    <input
                      type="checkbox"
                      checked={attendeeIds.includes(persona.id)}
                      onChange={() => toggleAttendee(persona.id)}
                    />
                    <span>
                      {persona.displayName}
                      {persona.raisedIn ? <span className="meta"> · {persona.raisedIn}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label>Jewish students ({selectedJewish} of {jewish.length})</label>
              <div className="checklist">
                {jewish.map((persona) => (
                  <label key={persona.id} className="chk">
                    <input
                      type="checkbox"
                      checked={attendeeIds.includes(persona.id)}
                      onChange={() => toggleAttendee(persona.id)}
                    />
                    <span>
                      {persona.displayName}
                      {persona.raisedIn ? <span className="meta"> · {persona.raisedIn}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="inline" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="small secondary"
              onClick={() => setAttendeeIds(students.map((persona) => persona.id))}
            >
              Select all
            </button>
            <button
              type="button"
              className="small secondary"
              onClick={() => setAttendeeIds([])}
            >
              Clear
            </button>
            <span className="meta">
              {attendeeIds.length} shared attendees · {selectedMuslim} Muslim · {selectedJewish} Jewish
            </span>
          </div>
        </fieldset>

        <h3 style={{ marginTop: 18 }}>Run defaults for every session</h3>
        <div className="row">
          <div>
            <label htmlFor="project-model">GPT model</label>
            <select id="project-model" value={model} onChange={(event) => setModel(event.target.value)}>
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
            <label htmlFor="project-reasoning">Reasoning effort</label>
            <select
              id="project-reasoning"
              value={reasoningEffort}
              onChange={(event) => setReasoningEffort(event.target.value as ReasoningEffort)}
            >
              {REASONING_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="project-order">Turn order</label>
            <select
              id="project-order"
              value={selection}
              onChange={(event) => setSelection(event.target.value as SelectionStrategy)}
            >
              <option value="round-robin">Round-robin (alternate communities)</option>
              <option value="random">Random order each round</option>
            </select>
          </div>
        </div>

        <div className="check">
          <input
            id="project-mock"
            type="checkbox"
            checked={mockLocked ? true : mock}
            disabled={mockLocked}
            onChange={(event) => setMock(event.target.checked)}
          />
          <label htmlFor="project-mock">
            Mock mode (deterministic, no cost)
            {mockLocked ? " — required because Codex is unavailable or global mock is enabled" : ""}
          </label>
        </div>

        {selectedMuslim === 0 || selectedJewish === 0 ? (
          <div className="banner warn" style={{ marginTop: 14 }}>
            Select at least one Muslim and one Jewish student for the shared roster.
          </div>
        ) : challengePerCommunity > challengeLimit ? (
          <div className="banner warn" style={{ marginTop: 14 }}>
            Challenge voices cannot exceed the smaller community in the selected roster.
          </div>
        ) : null}

        <div className="spacer" />
        <button type="button" onClick={createProject} disabled={submitting || loading || !valid}>
          {submitting ? "Creating project…" : `Create project with ${sessionCount} sessions`}
        </button>
      </div>

      <div className="section-head">
        <h2>Project workspace</h2>
        <span className="meta">Newest first</span>
      </div>
      {loading ? (
        <div className="card"><p className="meta">Loading projects…</p></div>
      ) : projects.length === 0 ? (
        <div className="card"><p className="meta">No projects yet. Create the first series above.</p></div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => {
            const completed = project.sessions.filter((session) => session.status === "completed").length;
            const muslimCount = project.attendees.filter((attendee) => attendee.group === "muslim").length;
            const jewishCount = project.attendees.filter((attendee) => attendee.group === "jewish").length;
            const progress = project.sessionCount ? completed / project.sessionCount : 0;
            return (
              <article key={project.id} className="card project-card">
                <div className="inline">
                  <h3 style={{ margin: 0 }}><Link href={`/projects/${project.id}`}>{project.name}</Link></h3>
                  <Badge kind={projectStatusKind(project.status)}>{project.status}</Badge>
                  {project.mock && <Badge kind="gray">mock</Badge>}
                </div>
                <p className="meta mono" style={{ margin: "5px 0 12px" }}>{project.id}</p>
                <div className="progress-track" aria-label={`${completed} of ${project.sessionCount} sessions completed`}>
                  <span style={{ width: `${progress * 100}%` }} />
                </div>
                <p style={{ margin: "8px 0" }}>
                  <b>{completed} of {project.sessionCount}</b> sessions completed
                </p>
                <div className="chips">
                  <Badge kind="muslim">{muslimCount} Muslim</Badge>
                  <Badge kind="jewish">{jewishCount} Jewish</Badge>
                  <Badge kind="amber">{project.controversialPerCommunity} challenge / community</Badge>
                </div>
                <p className="meta" style={{ margin: "12px 0" }}>
                  {project.model}
                  {project.reasoningEffort ? ` · ${project.reasoningEffort} reasoning` : ""}
                  {` · ${project.selection}`}
                </p>
                <Link href={`/projects/${project.id}`} className="button-link">Open project →</Link>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
