export const CHALLENGE_VOICES_PER_DISCUSSION_ROUND = 2;

interface ChallengeCadenceAttendee {
  id: string;
  group: string;
}

/**
 * Select up to two configured challenge voices for each discussion go-round.
 *
 * The project-level assignment remains stable, while the session offset and
 * two-seat round stride rotate the burden of creating tension instead of
 * making every assigned student adversarial every time they speak.
 */
export function challengeSpeakersForDiscussionRound(input: {
  controversialAgentIds: readonly string[];
  attendees: readonly ChallengeCadenceAttendee[];
  discussionRoundIndex: number;
  projectSessionNumber?: number;
  maxVoices?: number;
}): string[] {
  const attendeeGroups = new Map(
    input.attendees.map((attendee) => [attendee.id, attendee.group]),
  );
  const roster = Array.from(
    new Set(input.controversialAgentIds.filter((id) => attendeeGroups.has(id))),
  );
  if (roster.length === 0) return [];

  const roundIndex = Math.max(0, Math.trunc(input.discussionRoundIndex));
  const sessionOffset = Math.max(
    0,
    Math.trunc(input.projectSessionNumber ?? 1) - 1,
  );
  const maxVoices = Math.max(
    0,
    Math.min(
      CHALLENGE_VOICES_PER_DISCUSSION_ROUND,
      Math.trunc(input.maxVoices ?? CHALLENGE_VOICES_PER_DISCUSSION_ROUND),
    ),
  );
  if (maxVoices === 0) return [];

  // With the project's balanced Muslim/Jewish pool, assign one voice from
  // each community and rotate within each community independently.
  const rostersByGroup = new Map<string, string[]>();
  for (const id of roster) {
    const group = attendeeGroups.get(id)!;
    const groupRoster = rostersByGroup.get(group) ?? [];
    groupRoster.push(id);
    rostersByGroup.set(group, groupRoster);
  }
  if (maxVoices > 1 && rostersByGroup.size > 1) {
    return Array.from(rostersByGroup.values())
      .slice(0, maxVoices)
      .map((groupRoster) =>
        groupRoster[(sessionOffset + roundIndex) % groupRoster.length]
      );
  }

  const start = (
    sessionOffset + roundIndex * maxVoices
  ) % roster.length;
  const count = Math.min(maxVoices, roster.length);
  return Array.from(
    { length: count },
    (_, offset) => roster[(start + offset) % roster.length],
  );
}
