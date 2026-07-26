// Pure facilitator-opening helpers. The orchestration layer uses these to
// guarantee that the visible opening stays grounded in the configured topic,
// even when provider output needs to be replaced locally.

import { classifyConversation, validateTurn } from "./methodology.ts";
import { isDifficultPublicTopic } from "./topicDepth.ts";

export interface FacilitatorOpeningCredentials {
  facilitatorDegree: string;
  facilitatorProfessionalBackground: string;
}

export interface SessionOneOpeningRequirements
  extends FacilitatorOpeningCredentials {
  projectIntroduction: string;
}

export interface FacilitatorOpeningValidationOptions {
  /** Content that must appear in the first session's opening. */
  sessionOneOpening?: SessionOneOpeningRequirements;
  /** Known credential text that must not reappear after the first project session. */
  forbiddenCredentials?: FacilitatorOpeningCredentials;
  /** Project introductions can legitimately repeat the configured topic. */
  allowAdditionalTopicMentions?: boolean;
}

export interface BuildFacilitatorOpeningOptions {
  /** Supply this only for the first session in a project. */
  sessionOneOpening?: SessionOneOpeningRequirements;
}

function normalizeForTopicMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function spokenTopic(value: string): string {
  return value
    .replace(/\bjewish\b/gi, "Jewish")
    .replace(/\bjews\b/gi, "Jews")
    .replace(/\bmuslims\b/gi, "Muslims")
    .replace(/\bmuslim\b/gi, "Muslim")
    .replace(/\bnew york city\b/gi, "New York City")
    .replace(/\bnew york\b/gi, "New York");
}

/** True only when the complete sanitized topic is visible in the opening. */
export function openingStatesTopic(text: string, safeTopic: string): boolean {
  const normalizedText = normalizeForTopicMatch(text);
  const normalizedTopic = normalizeForTopicMatch(safeTopic);
  return normalizedTopic.length > 0 && normalizedText.includes(normalizedTopic);
}

function containsNormalizedPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForTopicMatch(phrase);
  return (
    normalizedPhrase.length > 0 &&
    normalizeForTopicMatch(text).includes(normalizedPhrase)
  );
}

export function facilitatorCredentialSentence(
  credentials: FacilitatorOpeningCredentials,
): string {
  return `My academic background is ${credentials.facilitatorDegree.trim()}, and my professional background is ${credentials.facilitatorProfessionalBackground.trim()}.`;
}

/** The complete user-defined project introduction appears without paraphrase. */
export function openingStatesProjectIntroduction(
  text: string,
  projectIntroduction: string,
): boolean {
  const exactIntroduction = projectIntroduction.trim();
  return exactIntroduction.length > 0 && text.includes(exactIntroduction);
}

/**
 * Remove the exact administrator-authored project introduction before judging
 * Sam's generated dialogue. The introduction is opaque display data: its text
 * must be preserved, but it is never interpreted as a model instruction or as
 * Sam's own generated position.
 */
export function openingWithoutProjectIntroduction(
  text: string,
  projectIntroduction: string,
  followingGeneratedText?: string,
): string {
  return openingWithProjectIntroductionReplaced(
    text,
    projectIntroduction,
    "",
    followingGeneratedText,
  );
}

export function openingWithProjectIntroductionReplaced(
  text: string,
  projectIntroduction: string,
  replacement: string,
  followingGeneratedText?: string,
): string {
  const exactIntroduction = projectIntroduction.trim();
  if (!exactIntroduction) return text;
  const followingIndex = followingGeneratedText
    ? text.lastIndexOf(followingGeneratedText)
    : -1;
  const start = followingIndex >= 0
    ? text.lastIndexOf(exactIntroduction, Math.max(0, followingIndex - 1))
    : text.lastIndexOf(exactIntroduction);
  if (start < 0) return text;
  return `${text.slice(0, start)}${replacement}${text.slice(start + exactIntroduction.length)}`;
}

/** Both credentials appear in the required, deterministic sentence. */
export function openingStatesFacilitatorCredentials(
  text: string,
  credentials: FacilitatorOpeningCredentials,
): boolean {
  return containsNormalizedPhrase(text, facilitatorCredentialSentence(credentials));
}

/** Known facilitator credential values are absent from a later-session opening. */
export function openingOmitsFacilitatorCredentials(
  text: string,
  credentials: FacilitatorOpeningCredentials,
): boolean {
  return (
    !containsNormalizedPhrase(text, credentials.facilitatorDegree) &&
    !containsNormalizedPhrase(text, credentials.facilitatorProfessionalBackground)
  );
}

/** The topic is stated once, then a linked first-go-round invitation refers to it naturally. */
export function openingInvitesResponseToTopic(
  text: string,
  safeTopic: string,
  options: Pick<FacilitatorOpeningValidationOptions, "allowAdditionalTopicMentions"> = {},
): boolean {
  const normalizedText = normalizeForTopicMatch(text);
  const normalizedTopic = normalizeForTopicMatch(safeTopic);
  if (!normalizedTopic) return false;

  const paddedText = ` ${normalizedText} `;
  const paddedTopic = ` ${normalizedTopic} `;
  const topicIndexes: number[] = [];
  let from = 0;
  while (from < paddedText.length) {
    const index = paddedText.indexOf(paddedTopic, from);
    if (index < 0) break;
    topicIndexes.push(index);
    from = index + paddedTopic.length;
  }
  if (
    topicIndexes.length < 1 ||
    (!options.allowAdditionalTopicMentions && topicIndexes.length !== 1)
  ) {
    return false;
  }

  const afterTopic = paddedText.slice(topicIndexes[0] + paddedTopic.length);
  const firstRoundMatch = /\b(?:for|in|during)\s+(?:(?:our|the)\s+)?first\s+(?:discussion\s+)?(?:go\s+round|round)\b/.exec(
    afterTopic,
  );
  if (!firstRoundMatch) return false;

  const invitation = afterTopic.slice(firstRoundMatch.index, firstRoundMatch.index + 280);
  const linksToTopic =
    /\b(?:on|about|for|in\s+response\s+to|returning\s+to)\s+(?:(?:today\s+s|this|that)\s+)?(?:topic|question|subject)\b/.test(
      invitation,
    );
  const asksForContribution =
    /\b(?:name|share|identify|describe|reflect|consider|choose|tell|offer|say|respond)\b/.test(
      invitation,
    );
  return linksToTopic && asksForContribution;
}

/**
 * The facilitator must establish their identity before any welcome, topic, or
 * instructions. Common first-person variants are accepted, but mentioning Sam
 * later in the opening does not satisfy the contract.
 */
export function openingBeginsWithFacilitatorIdentity(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed) return false;

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const sentenceBoundary = firstLine.search(/[.!?](?=\s|$)/);
  const firstSentence =
    sentenceBoundary >= 0 ? firstLine.slice(0, sentenceBoundary + 1) : firstLine;

  return (
    /^(?:(?:i['\u2019]m|i am|my name is)\s+sam\b|sam\s+here\b)/i.test(
      firstSentence,
    ) && /\b(?:your|the)\s+facilitator\b/i.test(firstSentence)
  );
}

/** Detect visible commentary about how the hidden agreement prompt was written. */
export function openingHasAgreementInstructionCommentary(text: string): boolean {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  return [
    /\bthese are commitments for everyone\b/i,
    /\bnot\s+["']?i will["']?\s+(?:promises?|commitments?|statements?|language)\b/i,
    /\bnot\s+(?:promises?|commitments?)\s+(?:phrased|worded|framed|written|stated)\s+as\b/i,
    /\b(?:do not|don't|never|avoid)\s+(?:phrase|word|frame|write|state|present)\b[^.!?]{0,100}\b(?:agreements?|commitments?|promises?|i will)\b/i,
    /\b(?:phrase|word|frame|write|state|present)\b[^.!?]{0,100}\b(?:agreements?|commitments?|promises?)\b[^.!?]{0,60}\b(?:as|using)\s+["']?i will\b/i,
  ].some((pattern) => pattern.test(normalized));
}

/** Opening agreements belong to the whole circle, not to Sam personally. */
export function openingStatesSharedAgreements(text: string): boolean {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const sharedFrame =
    /\b(?:our|this circle's|the (?:group|circle)'s) (?:three )?(?:shared )?(?:agreements|ground rules|commitments)\b/i.test(
      normalized,
    ) ||
    /\bthe (?:three )?(?:shared )?(?:agreements|ground rules|commitments) (?:for|of) (?:this|our|the) (?:group|circle)\b/i.test(
      normalized,
    ) ||
    /\bas a (?:group|circle),? we (?:all )?(?:agree|commit) to\b/i.test(normalized) ||
    /\bwe (?:all )?(?:agree|commit) to\b/i.test(normalized);
  const personalFrame =
    /\bmy (?:three )?(?:agreements|ground rules|commitments|promises)\b/i.test(normalized) ||
    /\bi will\s+(?:speak from|stay curious|assume good faith)\b/i.test(normalized);
  return sharedFrame && !personalFrame && !openingHasAgreementInstructionCommentary(normalized);
}

/** The clean topic sentence must immediately follow Sam's first sentence. */
export function openingStatesTopicImmediately(
  text: string,
  safeTopic: string,
): boolean {
  const trimmed = text.trimStart();
  const firstBoundary = trimmed.search(/[.!?](?=\s|$)/);
  if (firstBoundary < 0) return false;

  const remainder = normalizeForTopicMatch(trimmed.slice(firstBoundary + 1));
  const normalizedTopic = normalizeForTopicMatch(safeTopic);
  return (
    normalizedTopic.length > 0 &&
    remainder.startsWith(`today s topic is ${normalizedTopic}`)
  );
}

/**
 * Do not prompt participants to invent a witnessed event, a particular person,
 * or a topical scene in public life. Openings may ask for an inward value,
 * stake, feeling, or uncertainty without implying direct observation.
 */
export function openingAvoidsUnsupportedWitnessInvitation(text: string): boolean {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const witnessInvitations = [
    /\b(?:share|tell|describe|recall|name)\b[^.!?\n]{0,180}\b(?:what|something)\s+you\s+(?:saw|noticed|witnessed|observed|encountered|heard)\b/i,
    /\b(?:where|when|what)\b[^?\n]{0,100}\b(?:have|did)\s+you\s+(?:see|notice|witness|observe|encounter|hear)\b/i,
    /\bwhere\b[^?\n]{0,180}\b(?:show(?:s|ed|ing)?\s+up|land(?:s|ed|ing)?|happen(?:s|ed|ing)?|occur(?:s|red|ring)?)\b/i,
    /\b(?:share|tell|describe|recall|name)\b[^.!?\n]{0,140}\b(?:a|one|your)\s+(?:specific|particular|concrete)\s+(?:moment|event|incident|interaction|conversation|scene|example|person)\b/i,
    /\bwhat\s+(?:specific|particular|concrete)\s+(?:moment|event|incident|interaction|conversation|scene|example|person)\b/i,
    /\b(?:share|tell|describe|recall|name)\b[^.!?\n]{0,200}\b(?:on|during|at|in|around)\s+(?:your|the)\s+(?:commute|block|subway|train(?:\s+carriage)?|shop\s+line|grocery\s+line|neighbou?rhood)\b/i,
    /\b(?:how|where|when)\b[^?\n]{0,180}\b(?:affect(?:s|ed|ing)?|chang(?:e|es|ed|ing)|touch(?:es|ed|ing)?|show(?:s|ed|ing)?\s+up|land(?:s|ed|ing)?)\b[^?\n]{0,100}\b(?:someone|a\s+(?:specific|particular)\s+person|person\s+in\s+your\s+life|your\s+(?:commute|block|subway|train|shop\s+line|grocery\s+line|neighbou?rhood))\b/i,
    /\b(?:share|tell|describe|name)\b[^.!?\n]{0,180}\bhow\b[^.!?\n]{0,100}\b(?:affect(?:s|ed|ing)?|enter(?:s|ed|ing)?|show(?:s|ed|ing)?\s+up|land(?:s|ed|ing)?)\b[^.!?\n]{0,100}\b(?:family\s+conversations?|family\s+(?:texts?|chats?)|community\s+life|relationships?|daily\s+(?:life|routine)|home\s+life)\b/i,
    /\b(?:share|tell|describe|name)\b[^.!?\n]{0,180}\b(?:your\s+)?(?:family\s+conversations?|family\s+(?:texts?|chats?)|community\s+life|daily\s+routine)\b/i,
  ] as const;
  return !witnessInvitations.some((pattern) => pattern.test(normalized));
}

/**
 * Opening language is role-aware: curiosity or an invitation can look
 * de-escalating to the general dialogue classifier even though no tension has
 * happened yet. Escalating, unsafe, non-compliant, or off-topic text is never
 * accepted.
 */
export function assessFacilitatorOpening(
  text: string,
  safeTopic: string,
  options: FacilitatorOpeningValidationOptions = {},
) {
  const generatedText = options.sessionOneOpening
    ? openingWithoutProjectIntroduction(
        text,
        options.sessionOneOpening.projectIntroduction,
        facilitatorCredentialSentence(options.sessionOneOpening),
      )
    : text;
  const classification = classifyConversation(generatedText);
  const validation = validateTurn(generatedText);
  const topicPresent = openingStatesTopic(generatedText, safeTopic);
  const topicInvitationPresent = openingInvitesResponseToTopic(generatedText, safeTopic, {
    allowAdditionalTopicMentions:
      options.allowAdditionalTopicMentions ?? Boolean(options.sessionOneOpening),
  });
  const facilitatorIdentityFirst = openingBeginsWithFacilitatorIdentity(generatedText);
  const topicImmediatelyAfterIdentity = openingStatesTopicImmediately(generatedText, safeTopic);
  const agreementInstructionCommentary = openingHasAgreementInstructionCommentary(generatedText);
  const sharedAgreements = openingStatesSharedAgreements(generatedText);
  const avoidsUnsupportedWitnessInvitation =
    openingAvoidsUnsupportedWitnessInvitation(generatedText);
  const projectIntroductionPresent = options.sessionOneOpening
    ? openingStatesProjectIntroduction(
        text,
        options.sessionOneOpening.projectIntroduction,
      )
    : true;
  const facilitatorCredentialsPresent = options.sessionOneOpening
    ? openingStatesFacilitatorCredentials(text, options.sessionOneOpening)
    : true;
  const forbiddenCredentialsAbsent = options.forbiddenCredentials
    ? openingOmitsFacilitatorCredentials(text, options.forbiddenCredentials)
    : true;
  return {
    acceptable:
      classification.tag !== "escalating" &&
      classification.hardUnsafe.length === 0 &&
      validation.compliant &&
      topicPresent &&
      topicInvitationPresent &&
      facilitatorIdentityFirst &&
      topicImmediatelyAfterIdentity &&
      sharedAgreements &&
      avoidsUnsupportedWitnessInvitation &&
      projectIntroductionPresent &&
      facilitatorCredentialsPresent &&
      forbiddenCredentialsAbsent,
    classification,
    validation,
    topicPresent,
    topicInvitationPresent,
    facilitatorIdentityFirst,
    topicImmediatelyAfterIdentity,
    agreementInstructionCommentary,
    sharedAgreements,
    avoidsUnsupportedWitnessInvitation,
    projectIntroductionPresent,
    facilitatorCredentialsPresent,
    forbiddenCredentialsAbsent,
  };
}

function ensureSentencePunctuation(value: string): string {
  const trimmed = value.trim();
  return /[.!?](?:["'\u2019\u201d])?$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Deterministic opening shell used by mocks and local assembly. */
export function buildFacilitatorOpening(
  safeTopic: string,
  introductionRound: boolean,
  welcome = "Welcome, everyone.",
  options: BuildFacilitatorOpeningOptions = {},
): string {
  const difficultTopic = isDifficultPublicTopic(safeTopic);
  const naturalTopic = spokenTopic(safeTopic);
  const discussionInvitation = difficultTopic
    ? "name one human outcome you would protect or one hard choice within the subject, and explain the value behind it"
    : "name one concrete aspect or value you want the circle to hold, and leave space for every voice";
  const opening = [
    "I'm Sam, your facilitator.",
    `Today's topic is: \u201c${naturalTopic}\u201d.`,
  ];
  if (options.sessionOneOpening) {
    opening.push(
      options.sessionOneOpening.projectIntroduction.trim(),
      facilitatorCredentialSentence(options.sessionOneOpening),
    );
  }
  return [
    ...opening,
    ensureSentencePunctuation(welcome),
    "Our three shared agreements are: speak only from our own lives, stay curious rather than persuasive, and assume good faith.",
    introductionRound
      ? `Our first go-round is mandatory introductions. Each person will share their name, where they were raised in New York City, their family background, their culture or faith, and one value they carry. After introductions, for our first discussion go-round on today’s topic, each person will ${discussionInvitation}.`
      : `For our first go-round on today’s topic, ${discussionInvitation}.`,
  ].join(" ");
}
