// Small, high-confidence pre-gate that runs before the LLM semantic reviewer.
// Keep this module deliberately literal: it enforces only hard safety, visible
// control-text hygiene, and exact state-machine/routing facts. Meaning-level
// questions belong to lib/semanticValidator.ts.

import {
  facilitatorQuestionStructureReasons,
  selectFinalQuestionAttendee,
} from "./dialogueFlow";
import { firstSpokenSentence } from "./dialogueContinuity";
import {
  openingBeginsWithFacilitatorIdentity,
  facilitatorCredentialSentence,
  openingInvitesResponseToTopic,
  openingOmitsFacilitatorCredentials,
  openingStatesFacilitatorCredentials,
  openingStatesProjectIntroduction,
  openingStatesSharedAgreements,
  openingStatesTopic,
  openingStatesTopicImmediately,
  openingWithoutProjectIntroduction,
} from "./facilitatorOpening";
import type { FacilitatorOpeningValidationOptions } from "./facilitatorOpening";
import {
  classifyConversation,
  visiblePromptScaffoldingFlags,
} from "./methodology";
import type { RoundKind } from "./types";

export interface DeterministicGateAttendee {
  id: string;
  displayName: string;
}

export interface DeterministicTurnGateInput {
  text: string;
  phase: RoundKind;
  topic: string;
  attendees?: readonly DeterministicGateAttendee[];
  controlledChallenge?: boolean;
  targetName?: string;
  /** Exact participant whose accepted turn immediately precedes an ordinary discussion turn. */
  previousSpeakerName?: string;
  expectedNextSpeakerId?: string;
  expectedInviteeId?: string;
  triggeringSpeakerName?: string;
  openingRequirements?: FacilitatorOpeningValidationOptions;
  /** One-based round that a deterministic transition must explicitly announce. */
  expectedRoundNumber?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsName(text: string, name: string): boolean {
  const full = name.trim();
  const first = full.split(/\s+/)[0] ?? "";
  return [full, first]
    .filter(Boolean)
    .some((candidate) => new RegExp(`\\b${escapeRegex(candidate)}\\b`, "i").test(text));
}

function containsFacilitatorSelfIntroduction(text: string): boolean {
  return /\b(?:i['\u2019]m|i am|my name is)\s+sam\b/i.test(text);
}

function exactlyOneFinalQuestion(text: string): boolean {
  return (
    (text.match(/\?/g) ?? []).length === 1 &&
    /\?(?:["'\u2019\u201d)\]]*)\s*$/.test(text.trim())
  );
}

function endsWithQuestion(text: string): boolean {
  return /\?(?:["'\u2019\u201d)\]]*)\s*$/.test(text.trim());
}

function sentenceCount(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])(?:["'\u2019\u201d)\]]*)\s+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

const ROUND_NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

function mentionsExpectedRound(text: string, roundNumber: number): boolean {
  const word = ROUND_NUMBER_WORDS[roundNumber];
  const alternatives = [String(roundNumber), word]
    .filter((value): value is string => Boolean(value))
    .map(escapeRegex)
    .join("|");
  return new RegExp(`\\bround\\s+(?:${alternatives})\\b`, "i").test(text);
}

/** A closing must use thanks language whose object is participation itself. */
export function closingExplicitlyThanksParticipants(text: string): boolean {
  return /\bthank(?:s|ed|ing)?\s+(?:you(?:\s+all)?|everyone|everybody|all\s+(?:of\s+)?you|(?:the|each|every|all)\s+participants?)\b[^.!?]{0,60}\bfor\s+(?:(?:your|their)\s+)?(?:participat(?:ion|ing)|contribut(?:ions?|ing)|taking\s+part)\b/i.test(
    text,
  );
}

// Keep this deliberately narrow. Collective-reference phrases such as "all of
// them" or "those people" can occur in protective, non-blaming statements.
// Only explicit negative conduct or character attributed to a whole group is
// deterministic enough for this pre-gate; ambiguous cases belong to the LLM.
const CLEAR_COLLECTIVE_BLAME =
  /\b(?:you people|your people|those people|all of them|they)\s+(?:(?:always|all)\s+)?(?:lie|cheat|steal|betray|exploit|manipulate|oppress|terrorize|hate|hurt|attack|destroy|ignore|dismiss)(?:s|ed|ing)?\b|\b(?:you people|your people|those people|all of them|they)\s+(?:never|do not|don't)\s+(?:care|listen|help|respect|understand)\b|\b(?:you people|your people|those people|all of them|they)\s+(?:are|were)\s+(?:all\s+)?(?:evil|dishonest|violent|dangerous|heartless|criminals?|terrorists?)\b/i;

/** Return only unconditional, machine-verifiable rejection reasons. */
export function deterministicTurnGateRejectionReasons(
  input: DeterministicTurnGateInput,
): string[] {
  const text = input.text.trim();
  const authorizedProjectOpening =
    input.phase === "opening"
      ? input.openingRequirements?.sessionOneOpening
      : undefined;
  const generatedText = authorizedProjectOpening
    ? openingWithoutProjectIntroduction(
        text,
        authorizedProjectOpening.projectIntroduction,
        facilitatorCredentialSentence(authorizedProjectOpening),
      )
    : text;
  const reasons: string[] = [];
  if (!text) return ["Generated dialogue is empty."];
  if (text.length > 6_000) {
    reasons.push("Generated dialogue exceeds the hard 6,000-character output limit.");
  }

  for (const flag of visiblePromptScaffoldingFlags(generatedText)) {
    reasons.push(`Hard output hygiene (${flag.code}): ${flag.reason}`);
  }
  for (const flag of classifyConversation(generatedText).hardUnsafe) {
    reasons.push(`Hard unsafe (${flag.code}): ${flag.reason}`);
  }
  if (CLEAR_COLLECTIVE_BLAME.test(generatedText)) {
    reasons.push("Hard unsafe (collective-blame): assigns conduct to an entire group.");
  }

  const attendees = [...(input.attendees ?? [])];
  const questionCount = (text.match(/\?/g) ?? []).length;
  if (input.phase === "opening") {
    const openingRequirements = input.openingRequirements ?? {};
    if (!openingBeginsWithFacilitatorIdentity(generatedText)) {
      reasons.push("Opening must begin with Sam identifying himself as facilitator.");
    }
    if (!openingStatesTopic(generatedText, input.topic)) {
      reasons.push("Opening must contain the complete configured topic.");
    }
    if (!openingStatesTopicImmediately(generatedText, input.topic)) {
      reasons.push("Opening topic sentence must immediately follow Sam's identity.");
    }
    if (
      !openingInvitesResponseToTopic(generatedText, input.topic, {
        allowAdditionalTopicMentions:
          openingRequirements.allowAdditionalTopicMentions ??
          Boolean(openingRequirements.sessionOneOpening),
      })
    ) {
      reasons.push("Opening invitation must explicitly route the first go-round to the topic.");
    }
    if (!openingStatesSharedAgreements(generatedText)) {
      reasons.push("Opening must state the agreements as shared by the circle.");
    }
    if (
      openingRequirements.sessionOneOpening &&
      !openingStatesProjectIntroduction(
        text,
        openingRequirements.sessionOneOpening.projectIntroduction,
      )
    ) {
      reasons.push("First project-session opening must contain the complete project introduction.");
    }
    if (
      openingRequirements.sessionOneOpening &&
      !openingStatesFacilitatorCredentials(
        text,
        openingRequirements.sessionOneOpening,
      )
    ) {
      reasons.push("First project-session opening must contain Sam's exact credential sentence.");
    }
    if (
      openingRequirements.forbiddenCredentials &&
      !openingOmitsFacilitatorCredentials(
        text,
        openingRequirements.forbiddenCredentials,
      )
    ) {
      reasons.push("Later project-session opening must not repeat Sam's credentials.");
    }
  } else if (input.phase === "round-transition") {
    if (sentenceCount(text) !== 1) {
      reasons.push("Round transition must contain exactly one natural spoken sentence.");
    }
    if (questionCount !== 0) {
      reasons.push("Round transition must be a statement and contain no question.");
    }
    if (containsFacilitatorSelfIntroduction(text)) {
      reasons.push("Sam must not re-introduce himself during a round transition.");
    }
    if (!Number.isInteger(input.expectedRoundNumber)) {
      reasons.push("Round transition validation requires the expected round number.");
    } else if (!mentionsExpectedRound(text, input.expectedRoundNumber as number)) {
      reasons.push(
        `Round transition must explicitly announce round ${input.expectedRoundNumber}.`,
      );
    }
  } else if (input.phase === "discussion") {
    if (input.controlledChallenge) {
      if (endsWithQuestion(text)) {
        reasons.push("Controlled challenge must end as a statement.");
      }
      if (input.targetName && !mentionsName(text, input.targetName)) {
        reasons.push(`Controlled challenge must explicitly address ${input.targetName}.`);
      }
    } else {
      if (
        input.previousSpeakerName &&
        !mentionsName(firstSpokenSentence(text), input.previousSpeakerName)
      ) {
        reasons.push(
          `Ordinary discussion turn must name the immediately previous participant, ${input.previousSpeakerName}, in its first sentence.`,
        );
      }
      if (input.expectedNextSpeakerId) {
        if (!exactlyOneFinalQuestion(text)) {
          reasons.push("Scheduled discussion turn must contain exactly one final question.");
        }
        const invitee = selectFinalQuestionAttendee(text, attendees);
        if (invitee?.id !== input.expectedNextSpeakerId) {
          reasons.push("Final question must unambiguously address the next scheduled speaker.");
        }
      } else if (endsWithQuestion(text)) {
        reasons.push("This response must not end with a new unanswered question.");
      }
    }
  } else if (input.phase === "intervention") {
    if (sentenceCount(text) !== 2) {
      reasons.push("Facilitator intervention must contain exactly two natural spoken sentences.");
    }
    if (!exactlyOneFinalQuestion(text)) {
      reasons.push("Facilitator intervention must contain exactly one question at the end.");
    }
    reasons.push(...facilitatorQuestionStructureReasons(text, attendees));
    const invitee = selectFinalQuestionAttendee(text, attendees);
    if (input.expectedInviteeId && invitee?.id !== input.expectedInviteeId) {
      reasons.push("Facilitator intervention must unambiguously address the expected invitee.");
    }
    if (containsFacilitatorSelfIntroduction(text)) {
      reasons.push("Sam must not re-introduce himself during an intervention.");
    }
  } else if (input.phase === "invited-response") {
    if (endsWithQuestion(text)) {
      reasons.push("Invited response must end as a statement.");
    }
    if (
      input.triggeringSpeakerName &&
      !mentionsName(text, input.triggeringSpeakerName)
    ) {
      reasons.push(
        `Invited response must explicitly address ${input.triggeringSpeakerName}.`,
      );
    }
  } else if (input.phase === "closing") {
    if (endsWithQuestion(text)) {
      reasons.push("Closing must not end with a new question.");
    }
    if (containsFacilitatorSelfIntroduction(text)) {
      reasons.push("Sam must not re-introduce himself in the closing.");
    }
    if (sentenceCount(text) !== 2) {
      reasons.push("Closing must contain exactly two natural spoken sentences.");
    }
    if (!closingExplicitlyThanksParticipants(text)) {
      reasons.push(
        "Closing must explicitly thank participants for participating, contributing, or taking part.",
      );
    }
  }

  return Array.from(new Set(reasons));
}
