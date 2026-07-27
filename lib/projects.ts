// Persistent project/session planning above the existing Run execution engine.

import { getConfig } from "./config";
import {
  deleteProjectPublication,
  getJob,
  getProject,
  insertProject,
  listRuns,
  listTurnsByRunIds,
  mutateProject,
  upsertProjectPublication,
} from "./db";
import { newId } from "./hash";
import { startRun } from "./orchestrator";
import {
  MAX_PROJECT_SESSIONS,
  createSessionPlan,
  deriveProjectStatus,
  maxRoundsForRoster,
  requireInteger,
  selectControversialAgentIds,
} from "./projectRules";
import {
  defaultModelForProvider,
  modelMatchesProvider,
  normalizeReasoningEffort,
  resolveProvider,
} from "./providers";
import { getPersona } from "./personas";
import type {
  AgentProvider,
  Persona,
  Project,
  ProjectPublicationSnapshot,
  ProjectSessionStatus,
  ReasoningEffort,
  Run,
  SelectionStrategy,
} from "./types";

export interface CreateProjectInput {
  name: string;
  projectIntroduction?: string;
  sessionCount: number;
  attendeeIds: string[];
  controversialPerCommunity: number;
  provider?: AgentProvider;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  selection?: SelectionStrategy;
  budgetUsd?: number;
  mock?: boolean;
}

function normalizedProjectIntroduction(
  value: string | undefined,
  projectName: string,
  sessionCount: number,
): string {
  const supplied = String(value ?? "").trim();
  const fallback =
    `${projectName} is a ${sessionCount}-session Digital Bridges NYC dialogue project ` +
    "where this student cohort will explore difficult subjects through personal experience, careful listening, and honest difference.";
  const source = supplied || fallback;
  if (source.length > 800) {
    throw new Error("Project introduction must be 800 characters or fewer.");
  }
  return source;
}

function resolveStudentRoster(ids: string[]): Persona[] {
  if (!Array.isArray(ids)) throw new Error("attendeeIds must be an array.");
  const unique = [...new Set(ids.map(String))];
  const attendees = unique.map(getPersona);
  if (attendees.length < 2) throw new Error("Select at least two students for the project.");
  if (attendees.some((persona) => persona.group !== "muslim" && persona.group !== "jewish")) {
    throw new Error("Only Muslim and Jewish student personas can attend a project.");
  }
  const muslim = attendees.filter((persona) => persona.group === "muslim").length;
  const jewish = attendees.filter((persona) => persona.group === "jewish").length;
  if (!muslim || !jewish) {
    throw new Error("A project needs at least one Muslim and one Jewish student.");
  }
  return attendees;
}

export async function createProject(
  input: CreateProjectInput,
  random: () => number = Math.random,
): Promise<Project> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Project name is required.");
  if (name.length > 120) throw new Error("Project name must be 120 characters or fewer.");
  const sessionCount = requireInteger(
    "Number of sessions",
    Number(input.sessionCount),
    1,
    MAX_PROJECT_SESSIONS,
  );
  const projectIntroduction = normalizedProjectIntroduction(
    input.projectIntroduction,
    name,
    sessionCount,
  );
  const attendees = resolveStudentRoster(input.attendeeIds);
  const controversialPerCommunity = Number(input.controversialPerCommunity);
  const controversialAgentIds = selectControversialAgentIds(
    attendees,
    controversialPerCommunity,
    random,
  );

  const appConfig = getConfig();
  const provider = input.provider
    ? resolveProvider(input.provider, input.model)
    : input.model
      ? resolveProvider(undefined, input.model)
      : appConfig.defaultProvider;
  const model =
    input.model ||
    (provider === appConfig.defaultProvider
      ? appConfig.defaultModel
      : defaultModelForProvider(provider));
  if (!modelMatchesProvider(provider, model)) {
    throw new Error(`Model "${model}" is not compatible with provider "${provider}".`);
  }
  const reasoningEffort =
    provider === "codex"
      ? normalizeReasoningEffort(input.reasoningEffort ?? appConfig.defaultReasoningEffort)
      : undefined;
  const budgetUsd = input.budgetUsd ?? appConfig.defaultBudgetUsd;
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new Error("Budget must be a positive number.");
  }

  const now = new Date().toISOString();
  const id = newId("project");
  const project: Project = {
    id,
    name,
    projectIntroduction,
    published: false,
    createdAt: now,
    updatedAt: now,
    status: "planned",
    sessionCount,
    attendeeIds: attendees.map((persona) => persona.id),
    attendees: attendees.map((persona) => ({
      id: persona.id,
      name: persona.displayName,
      group: persona.group,
    })),
    controversialPerCommunity,
    controversialAgentIds,
    provider,
    model,
    reasoningEffort,
    selection: input.selection === "random" ? "random" : "round-robin",
    budgetUsd,
    mock: appConfig.forceMock || input.mock === true,
    sessions: createSessionPlan(id, sessionCount, now),
  };
  return insertProject(project);
}

function buildProjectPublication(
  project: Project,
  publishedAt: string,
  updatedAt: string,
): ProjectPublicationSnapshot {
  const sessionIds = new Set(project.sessions.map((session) => session.id));
  const completedRuns = listRuns().filter(
    (run) =>
      run.status === "completed" &&
      run.config.projectId === project.id &&
      Boolean(run.config.projectSessionId && sessionIds.has(run.config.projectSessionId)),
  );
  const turnsByRun = new Map<string, ReturnType<typeof listTurnsByRunIds>>();
  for (const turn of listTurnsByRunIds(completedRuns.map((run) => run.id))) {
    const turns = turnsByRun.get(turn.runId) ?? [];
    turns.push(turn);
    turnsByRun.set(turn.runId, turns);
  }

  // listRuns() is newest-first. Keep the latest successful, non-empty run for
  // each stable session and ignore failed/partial reruns completely.
  const runBySession = new Map<string, Run>();
  for (const run of completedRuns) {
    const sessionId = run.config.projectSessionId;
    if (!sessionId || runBySession.has(sessionId)) continue;
    if (!(turnsByRun.get(run.id)?.length)) continue;
    runBySession.set(sessionId, run);
  }

  const sessions = project.sessions
    .slice()
    .sort((a, b) => a.number - b.number)
    .flatMap((session) => {
      const run = runBySession.get(session.id);
      if (!run) return [];
      const turns = turnsByRun.get(run.id) ?? [];
      return [{
        id: session.id,
        number: session.number,
        topic: run.config.scenario,
        rounds: run.config.rounds,
        turns: turns.map((turn) => ({
          index: turn.index,
          role: turn.role,
          speakerName: turn.speakerName,
          speakerGroup: turn.speakerGroup,
          text: turn.text,
          roundNumber: turn.roundNumber,
          roundKind: turn.roundKind,
        })),
      }];
    });
  if (!sessions.length) {
    throw new Error(
      "Complete at least one project session with an accepted transcript before publishing.",
    );
  }

  const personas = project.attendeeIds.map((id) => {
    const persona = getPersona(id);
    if (persona.group !== "muslim" && persona.group !== "jewish") {
      throw new Error(`Project attendee is not a student persona: ${id}`);
    }
    return {
      id: persona.id,
      displayName: persona.displayName,
      group: persona.group,
      fictional: true as const,
      raisedIn: persona.raisedIn ?? "New York City",
      background: persona.background,
      regionalHistory: persona.regionalHistory,
      culturalBaseline: persona.culturalBaseline,
      values: [...persona.values],
      communicationStyle: persona.communicationStyle,
    };
  });

  return {
    schemaVersion: 1,
    projectId: project.id,
    name: project.name,
    introduction: project.projectIntroduction ?? "",
    publishedAt,
    updatedAt,
    sourceProjectUpdatedAt: project.updatedAt,
    sourceSessionCount: project.sessions.length,
    personas,
    sessions,
  };
}

/** Publish/update a frozen safe snapshot, or remove it from public access. */
export async function setProjectPublication(
  projectId: string,
  published: boolean,
): Promise<Project> {
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  if (!published) {
    const updated = project.published
      ? await mutateProject(projectId, (current) => ({
          ...current,
          published: false,
          publishedAt: undefined,
        }))
      : project;
    await deleteProjectPublication(projectId);
    return updated;
  }

  const updatedAt = new Date().toISOString();
  const publishedAt = project.publishedAt ?? updatedAt;
  const publication = buildProjectPublication(project, publishedAt, updatedAt);
  await upsertProjectPublication(publication);
  return mutateProject(projectId, (current) => {
    if (current.id !== project.id) {
      throw new Error("Project changed while its public snapshot was being prepared.");
    }
    return {
      ...current,
      published: true,
      publishedAt,
    };
  });
}

export async function configureProjectSession(
  projectId: string,
  sessionId: string,
  input: { topic: string; rounds: number },
): Promise<Project> {
  const topic = String(input.topic ?? "").trim();
  if (!topic) throw new Error("Session topic is required.");
  if (topic.length > 500) throw new Error("Session topic must be 500 characters or fewer.");

  return mutateProject(projectId, (project) => {
    const maxRounds = maxRoundsForRoster(project.attendeeIds.length);
    const rounds = requireInteger("Rounds", Number(input.rounds), 1, maxRounds);
    const index = project.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) throw new Error(`Session not found: ${sessionId}`);
    const current = project.sessions[index];
    if (
      current.status === "queued" ||
      current.status === "running" ||
      current.status === "pause-requested" ||
      (current.status === "paused" &&
        Boolean(current.jobId && getJob(current.jobId)?.status === "paused")) ||
      current.status === "cancel-requested" ||
      current.status === "completed"
    ) {
      throw new Error(`Session ${current.number} cannot be changed while ${current.status}.`);
    }
    const now = new Date().toISOString();
    const sessions = project.sessions.slice();
    sessions[index] = {
      ...current,
      topic,
      rounds,
      status: "ready",
      statusReason: "",
      jobId: undefined,
      runId: undefined,
      updatedAt: now,
    };
    return { ...project, sessions, status: deriveProjectStatus(sessions) };
  });
}

function finishSession(project: Project, sessionId: string, jobId: string, run: Run): Project {
  const terminalStatus: ProjectSessionStatus =
    run.status === "pending"
      ? "running"
      : run.status === "suspended"
        ? "paused"
        : run.status;
  const sessions = project.sessions.map((session) =>
    session.id === sessionId && session.jobId === jobId
      ? {
          ...session,
          status: terminalStatus,
          statusReason: run.statusReason,
          runId: run.id,
          updatedAt: new Date().toISOString(),
        }
      : session,
  );
  return { ...project, sessions, status: deriveProjectStatus(sessions) };
}

/** Reconcile the owning session to a run's terminal or suspended state. */
export function finishProjectSessionJob(
  projectId: string,
  sessionId: string,
  jobId: string,
  run: Run,
): Promise<Project> {
  return mutateProject(projectId, (project) => finishSession(project, sessionId, jobId, run));
}

export async function runProjectSession(
  projectId: string,
  sessionId: string,
  jobId: string,
  options: {
    onRunCreated?: (run: Run) => void | Promise<void>;
    resumeRunId?: string;
    controlSignal?: () => "continue" | "pause" | "cancel";
    model?: string;
    reasoningEffort?: ReasoningEffort;
  } = {},
): Promise<{ project: Project; run: Run }> {
  const claimed = await mutateProject(projectId, (project) => {
    const index = project.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) throw new Error(`Session not found: ${sessionId}`);
    const current = project.sessions[index];
    if (!current.topic || current.rounds === null) {
      throw new Error(`Configure session ${current.number} before running it.`);
    }
    if (current.jobId !== jobId) {
      throw new Error(`Job ${jobId} no longer owns session ${current.number}.`);
    }
    if (current.status !== "queued" && current.status !== "running") {
      throw new Error(`Session ${current.number} is ${current.status}, not queued for this job.`);
    }
    const sessions = project.sessions.slice();
    sessions[index] = {
      ...current,
      status: "running",
      statusReason: "",
      updatedAt: new Date().toISOString(),
    };
    return { ...project, status: "active", sessions };
  });
  const session = claimed.sessions.find((item) => item.id === sessionId)!;
  const selectedModel = options.model ?? claimed.model;
  const selectedProvider = options.model
    ? resolveProvider(undefined, selectedModel)
    : claimed.provider;

  try {
    const run = await startRun({
      attendeeIds: claimed.attendeeIds,
      scenario: session.topic,
      provider: selectedProvider,
      model: selectedModel,
      reasoningEffort: options.reasoningEffort ?? claimed.reasoningEffort,
      rounds: session.rounds!,
      selection: claimed.selection,
      budgetUsd: claimed.budgetUsd,
      mock: claimed.mock,
      projectId: claimed.id,
      projectSessionId: session.id,
      projectSessionNumber: session.number,
      projectIntroduction:
        session.number === 1 && session.mandatoryIntroductionRound
          ? claimed.projectIntroduction ??
            `${claimed.name} is a ${claimed.sessionCount}-session Digital Bridges NYC dialogue project where this student cohort will explore difficult subjects through personal experience, careful listening, and honest difference.`
          : undefined,
      jobId,
      controversialAgentIds: claimed.controversialAgentIds,
      introductionRound: session.mandatoryIntroductionRound,
      resumeRunId: options.resumeRunId,
      controlSignal: options.controlSignal,
      onRunCreated: options.onRunCreated,
    });
    const project = await finishProjectSessionJob(projectId, sessionId, jobId, run);
    return { project, run };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mutateProject(projectId, (project) => {
      const sessions = project.sessions.map((item) =>
        item.id === sessionId && item.jobId === jobId
          ? { ...item, status: "failed" as const, statusReason: message, updatedAt: new Date().toISOString() }
          : item,
      );
      return { ...project, status: deriveProjectStatus(sessions), sessions };
    });
    throw error;
  }
}

/** Claim a configured session for one persistent queue job. */
export function queueProjectSession(
  projectId: string,
  sessionId: string,
  jobId: string,
): Promise<Project> {
  return mutateProject(projectId, (project) => {
    const index = project.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) throw new Error(`Session not found: ${sessionId}`);
    const current = project.sessions[index];
    if (!current.topic || current.rounds === null) {
      throw new Error(`Configure session ${current.number} before running it.`);
    }
    if (current.status === "queued" || current.status === "running") {
      throw new Error(`Session ${current.number} already has an active job.`);
    }
    if (
      current.status !== "ready" &&
      current.status !== "paused" &&
      current.status !== "cancelled" &&
      current.status !== "failed" &&
      current.status !== "completed"
    ) {
      throw new Error(`Session ${current.number} is not ready to run.`);
    }
    const now = new Date().toISOString();
    const sessions = project.sessions.slice();
    sessions[index] = {
      ...current,
      status: "queued",
      statusReason: "Waiting for a background worker.",
      jobId,
      updatedAt: now,
    };
    return { ...project, status: "active", sessions };
  });
}

/** Mirror a persistent job control transition onto the session it still owns. */
export function setProjectSessionJobStatus(
  projectId: string,
  sessionId: string,
  jobId: string,
  status: Extract<
    ProjectSessionStatus,
    | "queued"
    | "running"
    | "pause-requested"
    | "paused"
    | "cancel-requested"
    | "cancelled"
  >,
  reason: string,
  runId?: string,
): Promise<Project> {
  return mutateProject(projectId, (project) => {
    const index = project.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) throw new Error(`Session not found: ${sessionId}`);
    const current = project.sessions[index];
    if (current.jobId !== jobId) {
      throw new Error(`Job ${jobId} no longer owns session ${current.number}.`);
    }
    const sessions = project.sessions.slice();
    sessions[index] = {
      ...current,
      status,
      statusReason: reason,
      runId: runId ?? current.runId,
      updatedAt: new Date().toISOString(),
    };
    return { ...project, sessions, status: deriveProjectStatus(sessions) };
  });
}

/** Fail only the session still owned by this job; stale jobs cannot overwrite a rerun. */
export function failProjectSessionJob(
  projectId: string,
  sessionId: string,
  jobId: string,
  reason: string,
): Promise<Project> {
  return mutateProject(projectId, (project) => {
    const index = project.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) return project;
    const current = project.sessions[index];
    if (current.jobId !== jobId) return project;
    if (
      current.status !== "queued" &&
      current.status !== "running" &&
      current.status !== "pause-requested" &&
      current.status !== "paused" &&
      current.status !== "cancel-requested"
    ) return project;
    const sessions = project.sessions.slice();
    sessions[index] = {
      ...current,
      status: "failed",
      statusReason: reason,
      updatedAt: new Date().toISOString(),
    };
    return { ...project, sessions, status: deriveProjectStatus(sessions) };
  });
}
