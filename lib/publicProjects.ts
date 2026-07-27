// Server-only read model for frozen, allowlisted public project snapshots.
// The public site never reads operator Run, Turn, Job, audit, or persona files.

import {
  getProject,
  getProjectPublication,
  listProjectPublications,
  listProjects,
} from "./db";
import type {
  Project,
  ProjectPublicationSnapshot,
  PublicPersonaSnapshot,
  PublicSessionSnapshot,
  PublicTurnSnapshot,
} from "./types";

export interface PublicProjectSummary {
  id: string;
  name: string;
  introduction: string;
  publishedAt: string;
  personaCount: number;
  sessionCount: number;
  completedSessionCount: number;
}

export type PublicPersona = PublicPersonaSnapshot;
export type PublicTurn = PublicTurnSnapshot;

export interface PublicProjectSession extends PublicSessionSnapshot {
  transcriptAvailable: true;
}

export interface PublicProject extends PublicProjectSummary {
  personas: PublicPersona[];
  sessions: PublicProjectSession[];
}

function isCurrentPublication(
  project: Project | undefined,
  publication: ProjectPublicationSnapshot,
): boolean {
  return Boolean(
    project?.published === true &&
      project.publishedAt === publication.publishedAt,
  );
}

function toSummary(publication: ProjectPublicationSnapshot): PublicProjectSummary {
  return {
    id: publication.projectId,
    name: publication.name,
    introduction: publication.introduction,
    publishedAt: publication.publishedAt,
    personaCount: publication.personas.length,
    sessionCount: publication.sourceSessionCount,
    completedSessionCount: publication.sessions.length,
  };
}

function toPublicPersona(persona: PublicPersonaSnapshot): PublicPersona {
  return {
    id: persona.id,
    displayName: persona.displayName,
    group: persona.group,
    fictional: true,
    raisedIn: persona.raisedIn,
    background: persona.background,
    regionalHistory: persona.regionalHistory,
    culturalBaseline: persona.culturalBaseline,
    values: [...persona.values],
    communicationStyle: persona.communicationStyle,
  };
}

function toPublicTurn(turn: PublicTurnSnapshot): PublicTurn {
  return {
    index: turn.index,
    role: turn.role,
    speakerName: turn.speakerName,
    speakerGroup: turn.speakerGroup,
    text: turn.text,
    roundNumber: turn.roundNumber,
    roundKind: turn.roundKind,
  };
}

function toPublicSession(session: PublicSessionSnapshot): PublicProjectSession {
  return {
    id: session.id,
    number: session.number,
    topic: session.topic,
    rounds: session.rounds,
    transcriptAvailable: true,
    turns: session.turns.map(toPublicTurn),
  };
}

export function listPublishedProjectSummaries(): PublicProjectSummary[] {
  const projectById = new Map(listProjects().map((project) => [project.id, project]));
  return listProjectPublications()
    .filter((publication) =>
      isCurrentPublication(projectById.get(publication.projectId), publication),
    )
    .map(toSummary);
}

/** Returns undefined for missing, stale, or private snapshots to prevent discovery. */
export function getPublishedProject(id: string): PublicProject | undefined {
  const project = getProject(id);
  const publication = getProjectPublication(id);
  if (!publication || !isCurrentPublication(project, publication)) return undefined;

  return {
    ...toSummary(publication),
    personas: publication.personas.map(toPublicPersona),
    sessions: publication.sessions.map(toPublicSession),
  };
}
