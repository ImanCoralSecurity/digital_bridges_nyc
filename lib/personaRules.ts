// Pure roster invariants shared by the persona loader and tests.

export const STUDENTS_PER_COMMUNITY = 15;
export const TOTAL_STUDENTS = STUDENTS_PER_COMMUNITY * 2;

const NYC_BOROUGH_RE = /\b(Bronx|Brooklyn|Manhattan|Queens|Staten Island)\b/i;
const NYC_CITY_RE = /\b(New York City|NYC)\b/i;

export function isNycRaisedLocation(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NYC_BOROUGH_RE.test(value) &&
    NYC_CITY_RE.test(value)
  );
}

interface RosterEntry {
  id: string;
  group: string;
  raisedIn?: string;
}

export function assertStudentRoster(personas: RosterEntry[]): void {
  const ids = new Set<string>();
  for (const persona of personas) {
    if (ids.has(persona.id)) throw new Error(`Duplicate persona id: ${persona.id}`);
    ids.add(persona.id);
  }

  const muslim = personas.filter((persona) => persona.group === "muslim");
  const jewish = personas.filter((persona) => persona.group === "jewish");
  for (const student of [...muslim, ...jewish]) {
    if (!isNycRaisedLocation(student.raisedIn)) {
      throw new Error(
        `Student persona ${student.id}: raisedIn must name a New York City borough and NYC.`,
      );
    }
  }
  if (
    muslim.length !== STUDENTS_PER_COMMUNITY ||
    jewish.length !== STUDENTS_PER_COMMUNITY
  ) {
    throw new Error(
      `Persona roster must contain exactly ${STUDENTS_PER_COMMUNITY} Muslim and ` +
        `${STUDENTS_PER_COMMUNITY} Jewish students; found ${muslim.length} and ${jewish.length}.`,
    );
  }
  const facilitators = personas.filter((persona) => persona.group === "facilitator");
  const judges = personas.filter((persona) => persona.group === "judge");
  if (facilitators.length !== 1 || judges.length !== 1) {
    throw new Error(
      `Persona roster must contain exactly one facilitator and one judge; found ` +
        `${facilitators.length} and ${judges.length}.`,
    );
  }
}
