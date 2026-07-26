// Pure project/session rules. Kept independent from persistence and orchestration
// so cardinality, planning, and turn-cap invariants are easy to test.

import { randomUUID } from "node:crypto";
import type { PersonaGroup, ProjectSession, ProjectStatus } from "./types";

export const MAX_PROJECT_SESSIONS = 20;
export const MAX_SESSION_ROUNDS = 10;
export const MAX_PERSONA_TURNS_PER_SESSION = 60;

export interface CommunityCandidate {
  id: string;
  group: PersonaGroup;
}

export function requireInteger(
  label: string,
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("Random source must return values from 0 (inclusive) to 1 (exclusive).");
    }
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Select exactly N students from each community, without replacement. */
export function selectControversialAgentIds(
  attendees: CommunityCandidate[],
  n: number,
  random: () => number = Math.random,
): string[] {
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error("Challenge voices per community must be a non-negative whole number.");
  }
  const muslim = attendees.filter((attendee) => attendee.group === "muslim");
  const jewish = attendees.filter((attendee) => attendee.group === "jewish");
  if (n > muslim.length || n > jewish.length) {
    throw new Error(
      `Cannot assign ${n} challenge voice(s) per community from ${muslim.length} Muslim and ${jewish.length} Jewish attendees.`,
    );
  }
  return [
    ...shuffled(muslim, random).slice(0, n).map((attendee) => attendee.id),
    ...shuffled(jewish, random).slice(0, n).map((attendee) => attendee.id),
  ];
}

export function createSessionPlan(projectId: string, count: number, now: string): ProjectSession[] {
  requireInteger("Number of sessions", count, 1, MAX_PROJECT_SESSIONS);
  return Array.from({ length: count }, (_, index) => ({
    id: `session_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    projectId,
    number: index + 1,
    topic: "",
    rounds: null,
    mandatoryIntroductionRound: index === 0,
    status: "unconfigured" as const,
    statusReason: "",
    createdAt: now,
    updatedAt: now,
  }));
}

export function maxRoundsForRoster(attendeeCount: number): number {
  if (!Number.isInteger(attendeeCount) || attendeeCount < 1) return 0;
  return Math.min(MAX_SESSION_ROUNDS, Math.floor(MAX_PERSONA_TURNS_PER_SESSION / attendeeCount));
}

export function deriveProjectStatus(sessions: ProjectSession[]): ProjectStatus {
  if (sessions.length && sessions.every((session) => session.status === "completed")) return "completed";
  if (sessions.some((session) => session.status !== "unconfigured")) return "active";
  return "planned";
}
