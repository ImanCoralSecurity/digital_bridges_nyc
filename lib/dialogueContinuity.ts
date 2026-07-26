import { safeContextDetail } from "./methodology.ts";

export interface PreviousParticipantTurn {
  speakerName: string;
  text: string;
  /** Meaning-focused text to summarize when the visible turn contains routing or other scaffolding. */
  summaryText?: string;
}

export const CONTINUITY_FORM_COUNT = 4;

function continuityFormIndex(variationIndex: number): number {
  if (!Number.isFinite(variationIndex)) return 0;
  return (
    (Math.trunc(variationIndex) % CONTINUITY_FORM_COUNT) +
    CONTINUITY_FORM_COUNT
  ) % CONTINUITY_FORM_COUNT;
}

/**
 * Select a stable sentence shape for direct engagement with the prior speaker.
 * The caller can use its schedule ordinal as the variation index, which makes
 * wording reproducible without teaching every speaker the same stock phrase.
 */
export function continuityFormInstruction(
  previousSpeakerName: string,
  variationIndex: number,
): string {
  const firstName = previousSpeakerName.trim().split(/\s+/)[0] || "the previous speaker";
  const forms = [
    `Address ${firstName} and state one specific point they made before saying how you will build on it.`,
    `Address ${firstName} and begin by building directly on one concrete detail from their turn.`,
    `Address ${firstName} and name the specific part of their turn you are carrying forward.`,
    `Address ${firstName} and explain how one concrete point they named creates room for your next consideration.`,
  ] as const;
  const selected = continuityFormIndex(variationIndex);
  return `${forms[selected]} Do not use the stock phrases “I hear you saying” or “you are saying.”`;
}

/** Return the first natural spoken sentence without attempting to judge meaning. */
export function firstSpokenSentence(text: string): string {
  return (
    text
      .trim()
      .split(/(?<=[.!?])(?:["'\u2019\u201d)\]]*)\s+/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );
}

/** Remove the mandatory continuity sentence before evaluating the new contribution. */
export function contributionAfterFirstSentence(text: string): string {
  const trimmed = text.trim();
  const first = firstSpokenSentence(trimmed);
  if (!first) return "";
  return trimmed.slice(first.length).trim();
}

function shiftFirstPersonToSecondPerson(text: string): string {
  return text
    .replace(/^["“]|["”]$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\bfor me\b/gi, "for you")
    .replace(/\bi am\b/gi, "you are")
    .replace(/\bi['\u2019]m\b/gi, "you're")
    .replace(/\bi['\u2019]ve\b/gi, "you've")
    .replace(/\bi['\u2019]d\b/gi, "you'd")
    .replace(/\bi['\u2019]ll\b/gi, "you'll")
    .replace(/\bmyself\b/gi, "yourself")
    .replace(/\bmine\b/gi, "yours")
    .replace(/\bmy\b/gi, "your")
    .replace(/\bme\b/gi, "you")
    .replace(/\bi\b/gi, "you")
    .replace(/\byou was\b/gi, "you were")
    .replace(/\byou has\b/gi, "you have")
    .replace(/\byou does\b/gi, "you do")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fail-safe continuity bridge used only when a provider draft cannot be used.
 * It is extractive rather than inferential, so it cannot invent what the prior
 * participant meant while still shifting obvious first-person grammar.
 */
export function extractiveContinuityBridge(
  previous: PreviousParticipantTurn,
  fallbackContext: string,
  variationIndex = 0,
): string {
  const firstName = previous.speakerName.trim().split(/\s+/)[0] || "You";
  const sourceText = previous.summaryText?.trim() || previous.text;
  const detail = safeContextDetail(sourceText, fallbackContext, 190);
  const shifted = (
    shiftFirstPersonToSecondPerson(detail) || "you named a concrete concern"
  ).replace(/\byou(?:'re| are) saying\b/gi, "you said");
  const forms = [
    `${firstName}, you put this specific point forward: ${shifted}; I want to build on it directly.`,
    `${firstName}, I want to build on this part of what you shared: ${shifted}.`,
    `${firstName}, the part of your turn I’m carrying forward is this: ${shifted}.`,
    `${firstName}, your comment put this point on the table: ${shifted}.`,
  ] as const;
  const selected = continuityFormIndex(variationIndex);
  return forms[selected];
}
