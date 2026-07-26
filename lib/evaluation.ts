// Safety, QA & evaluation — "the matrices" (server-only).
// computeMetrics() is pure and unit-testable; runJudge() calls the judge agent
// (real CLI or mock). Metrics describe the SIMULATION, not real reconciliation.

import { callAgentCLI } from "./agent";
import {
  challengeFidelityRejectionReasons,
  challengeSelfConsistencyRejectionReasons,
  globalSemanticMotifSaturationRejectionReasons,
  hasSupportedUnresolvedChallengeDifference,
  sameSpeakerSemanticReuseRejectionReasons,
  semanticMotifSaturationRejectionReasons,
  subjectPositionSemanticReuseRejectionReasons,
  subjectPropositionNoveltyRejectionReasons,
  unsupportedClosingPriorityClaimRejectionReasons,
} from "./dialogueQuality";
import { assessFacilitatorIntervention } from "./dialogueFlow";
import {
  contributionAfterFirstSentence,
  firstSpokenSentence,
} from "./dialogueContinuity";
import { assessFacilitatorOpening } from "./facilitatorOpening";
import { mockJudge } from "./mockClaude";
import { visiblePromptScaffoldingFlags } from "./methodology";
import { compileJudgeSystemPrompt } from "./personas";
import { assessTopicRelevance } from "./topicRelevance";
import {
  isDifficultPublicTopic,
  isMetaDominantPublicEngagement,
  subjectLevelEngagementRejectionReasons,
} from "./topicDepth";
import type {
  AgentProvider,
  Persona,
  ReasoningEffort,
  RunMetrics,
  Turn,
  TurnSignals,
} from "./types";

const POSITIVE = [
  "love", "hope", "warm", "family", "together", "share", "grateful", "safe",
  "welcome", "joy", "kind", "memory", "home", "blessing", "peace", "listen",
];
const NEGATIVE = [
  "fault", "blame", "war", "fear", "hate", "never", "always", "conflict",
  "angry", "alone", "afraid", "wrong", "enemy",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sentenceNamesSpeaker(text: string, speakerName: string): boolean {
  const full = speakerName.trim();
  const first = full.split(/\s+/)[0] ?? "";
  return [full, first]
    .filter(Boolean)
    .some((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(text));
}

/**
 * For methodology 1.13+ ordinary turns, the opening sentence reflects the
 * prior participant and is not the current speaker's own topic proposition or
 * biography. Older transcripts remain unchanged unless their first sentence
 * visibly names the actual preceding participant.
 */
function continuityContributionTexts(turns: readonly Turn[]): Map<string, string> {
  const result = new Map<string, string>();
  let previousParticipant: Turn | undefined;
  for (const turn of turns.slice().sort((left, right) => left.index - right.index)) {
    let evaluationText = turn.text;
    if (
      turn.role === "persona" &&
      turn.roundKind === "discussion" &&
      turn.controversialSpeaker !== true &&
      previousParticipant &&
      sentenceNamesSpeaker(
        firstSpokenSentence(turn.text),
        previousParticipant.speakerName,
      )
    ) {
      const contribution = contributionAfterFirstSentence(turn.text);
      if (contribution) evaluationText = contribution;
    }
    result.set(turn.id, evaluationText);
    if (turn.role === "persona") previousParticipant = turn;
  }
  return result;
}

function normalizeEvaluationText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textWithoutConfiguredTopic(text: string, topic: string): string {
  const normalizedText = normalizeEvaluationText(text);
  const normalizedTopic = normalizeEvaluationText(topic);
  if (!normalizedTopic) return normalizedText;
  return ` ${normalizedText} `
    .split(` ${normalizedTopic} `)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
}

function sentiment(text: string, topic: string): number {
  const t = textWithoutConfiguredTopic(text, topic);
  const words = new Set(t ? t.split(" ") : []);
  let score = 0;
  for (const w of POSITIVE) if (words.has(w)) score += 1;
  for (const w of NEGATIVE) if (words.has(w)) score -= 1;
  return Math.max(-1, Math.min(1, score / 4));
}

/**
 * Evaluation-time signals are recomputed from visible text. Stored signals are
 * retained for audit compatibility, but older runs predate several common
 * contractions and kinship terms and therefore undercount them.
 */
export function evaluationTurnSignals(text: string): TurnSignals {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const iStatement =
    /(?:^|[.!?]\s+)i(?:\b|['’](?:m|ve|d|ll|re)\b)/i.test(normalized) ||
    /\bi(?:['’](?:m|ve|d|ll|re)|\s+(?:feel|felt|think|thought|remember|believe|grew\s+up|learned|worry|hope|wish|miss|love|need|want|disagree|question|try|see|hear|notice|found))\b/i.test(
      normalized,
    );
  const personalHistory =
    /\b(?:my|our)\s+(?:aunt|uncle|sister|brother|siblings?|parents?|mother|father|mom|dad|family|grand(?:mother|father|ma|pa|dad)|grandparents?|childhood|upbringing)\b/i.test(
      normalized,
    ) ||
    /\b(?:when i was|as a child|i grew up|i was raised|my childhood|my upbringing|in my(?: [\p{L}'-]+){0,4} (?:home|household|family))\b/iu.test(
      normalized,
    );
  const curiosityQuestion =
    (normalized.includes("?") &&
      /\b(?:you|your|what|how|when|where|which|who)\b/i.test(normalized)) ||
    /\b(?:i(?:'d| would) like to hear|i(?:'m| am) curious|i wonder)\b/i.test(
      normalized,
    );
  return { iStatement, personalHistory, curiosityQuestion };
}

const IMAGERY_GROUPS: Array<{ id: string; re: RegExp }> = [
  { id: "transit", re: /\b(?:subway|train|commute|bus|platform)\b/i },
  { id: "messages", re: /\b(?:texts?|chats?|messages?|group chats?)\b/i },
  { id: "kitchen-food", re: /\b(?:kitchen|cook(?:ing|ed)?|lentils?|rice|meal|asado|mate|food)\b/i },
  { id: "shop", re: /\b(?:deli|bodega|shop|store|grocery)\b/i },
  { id: "humor", re: /\b(?:jokes?|humou?r|laugh(?:ter|ed|ing)?|punchlines?|puns?)\b/i },
  { id: "family", re: /\b(?:family|grand(?:mother|father|ma|pa|dad)|grandparents?|parents?|aunt|uncle|sister|brother)\b/i },
  { id: "home", re: /\b(?:home|apartment|household|open[- ]door)\b/i },
  { id: "memory", re: /\b(?:memory|memories|remember|inherited|history|endurance)\b/i },
  { id: "poetry", re: /\b(?:poem|poetry|verse|verses|spoken word)\b/i },
  { id: "hospitality", re: /\b(?:hospitality|generosity|warmth|welcome|welcoming)\b/i },
  { id: "faith", re: /\b(?:pray|prayer|faith|spiritual|religious)\b/i },
  { id: "news", re: /\b(?:news|headline|headlines|updates?)\b/i },
];

const CANNED_PHRASES: Array<{ id: string; re: RegExp }> = [
  { id: "disagree-assumption", re: /\bi disagree with (?:the )?(?:assumption|conclusion)\b/i },
  { id: "circle-not-conclude", re: /\b(?:the )?circle should not conclude(?: yet)?\b/i },
  { id: "shared-conclusion", re: /\b(?:shared|easy|neat) conclusion\b/i },
  { id: "in-my-home", re: /\bin my(?: [\p{L}'-]+){0,4} home\b/iu },
  { id: "when-i-ask", re: /\bwhen i ask(?: myself)?,?\s*(?:in plain terms,?)?/i },
  { id: "question-at-hand", re: /\bthe question at hand is\b/i },
  { id: "notice-omission", re: /\bi notice the (?:specific )?omission\b/i },
  { id: "hear-naming", re: /\bi hear [^.!?]{0,60}\bnaming\b/i },
  { id: "concrete-stake", re: /\b(?:one|the) concrete (?:thing|human stake|new york impact|consequence)\b/i },
];

function hasMechanicalFullTopicRecitation(text: string, topic: string): boolean {
  const normalizedTopic = normalizeEvaluationText(topic);
  const topicWords = normalizedTopic ? normalizedTopic.split(" ") : [];
  if (topicWords.length < 6) return false;
  return normalizeEvaluationText(text).includes(normalizedTopic);
}

function hasMechanicalTopicOrScaffoldLoop(
  text: string,
  previousTexts: readonly string[],
  topic: string,
): boolean {
  if (
    hasMechanicalFullTopicRecitation(text, topic) &&
    previousTexts.some((previous) =>
      hasMechanicalFullTopicRecitation(previous, topic))
  ) return true;
  const currentScaffolds = matchedPatternIds(text, CANNED_PHRASES);
  const distinctiveScaffolds = new Set(
    [...currentScaffolds].filter((id) =>
      ["when-i-ask", "question-at-hand", "notice-omission", "hear-naming", "concrete-stake"].includes(id)),
  );
  if (distinctiveScaffolds.size === 0) return false;
  return previousTexts.some((previous) =>
    overlapSize(
      distinctiveScaffolds,
      matchedPatternIds(previous, CANNED_PHRASES),
    ) > 0);
}

/**
 * A distinctive local-fallback scaffold seen in the reported Spark run. The
 * individual ideas are legitimate; repeating this whole frame across
 * challengers makes the dialogue sound generated rather than responsive.
 */
function hasPartialFrameDirectImpactScaffold(text: string): boolean {
  const normalized = normalizeEvaluationText(text);
  return (
    /\byour point about human consequences\b/.test(normalized) &&
    /\bone part\b/.test(normalized) &&
    /\b(?:people directly affected|directly affected people)\b/.test(normalized) &&
    /\b(?:frame|center|view)\b/.test(normalized) &&
    /\b(?:difference|gap|open|unresolved)\b/.test(normalized)
  );
}

function matchedPatternIds(text: string, patterns: Array<{ id: string; re: RegExp }>): Set<string> {
  return new Set(patterns.filter(({ re }) => re.test(text)).map(({ id }) => id));
}

function overlapSize(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

const REPETITION_STOP_WORDS = new Set([
  "about", "after", "again", "because", "before", "being", "could", "each",
  "family", "from", "have", "into", "just", "more", "that", "their", "there",
  "these", "they", "this", "through", "today", "what", "when", "where", "which",
  "while", "with", "would", "your",
]);

function contentTrigrams(text: string, topic: string): Set<string> {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.at(-1)?.includes("?")) sentences.pop();
  const tokens = textWithoutConfiguredTopic(sentences.join(" "), topic)
    .split(" ")
    .filter((token) => token.length > 3 && !REPETITION_STOP_WORDS.has(token));
  const result = new Set<string>();
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    result.add(tokens.slice(index, index + 3).join(" "));
  }
  return result;
}

const QUESTION_ECHO_STOP_WORDS = new Set([
  ...REPETITION_STOP_WORDS,
  "also", "aspect", "central", "concrete", "does", "feel", "feels", "felt",
  "important", "most", "name", "named", "naming", "same", "stake", "subject",
  "topic", "very", "were", "will", "you", "your",
]);

function normalizedQuestionToken(token: string): string {
  const withoutPossessive = token.replace(/'s$/, "");
  if (/^(?:statistics?|counts?)$/.test(withoutPossessive)) return "number";
  if (/^persons?$/.test(withoutPossessive)) return "person";
  if (/^stories$/.test(withoutPossessive)) return "story";
  if (/^helps?$/.test(withoutPossessive)) return "help";
  if (/^keeping$/.test(withoutPossessive)) return "keep";
  if (/^collaps(?:e|es|ed|ing)$/.test(withoutPossessive)) return "collapse";
  return withoutPossessive;
}

function questionContentTokens(text: string, topic: string): Set<string>[] {
  const questions = text.match(/[^.!?]*\?/g) ?? [];
  return questions.map((question) => new Set(
    textWithoutConfiguredTopic(question, topic)
      .split(" ")
      .map(normalizedQuestionToken)
      .filter(
        (token) => token.length > 3 && !QUESTION_ECHO_STOP_WORDS.has(token),
      ),
  )).filter((tokens) => tokens.size >= 6);
}

function hasDistinctiveQuestionEcho(
  text: string,
  previousTexts: readonly string[],
  topic: string,
): boolean {
  const currentQuestions = questionContentTokens(text, topic);
  if (!currentQuestions.length) return false;

  return previousTexts.some((previous) =>
    questionContentTokens(previous, topic).some((priorQuestion) =>
      currentQuestions.some((currentQuestion) => {
        const overlap = overlapSize(currentQuestion, priorQuestion);
        const smallerSet = Math.min(currentQuestion.size, priorQuestion.size);
        return overlap >= 6 && overlap / smallerSet >= 0.45;
      }),
    ),
  );
}

/**
 * Detect the specific abstraction loop in which speakers repeatedly contrast
 * a person or story with numbers/statistics. A single accurate reflection is
 * not enough to trigger the metric; it becomes a risk on the third distinct
 * speaker carrying the same frame.
 */
function hasPeopleReducedToCountsMotif(text: string): boolean {
  const normalized = normalizeEvaluationText(text);
  const clauses = normalized.split(/\b(?:but|while|and)\b|[.!?]/);
  return clauses.some((clause) =>
    /\b(?:people|persons?|others|someone|anyone|human lives?|stories?|names?)\b/.test(clause) &&
    /\b(?:numbers?|statistics?|counts?|data points?|abstract(?:ion| total| urgency)?|slogans?)\b/.test(clause) &&
    /\b(?:become|becoming|blur|blurring|collapse|collapsing|disappear|disappearing|flatten|flattened|flattening|reduce|reduced|reducing|replace|replacing|slip|slipping|turn|turning)\b/.test(clause)
  );
}

function hasCrossSpeakerEchoRisk(
  turn: Turn,
  previousTurns: readonly Turn[],
  topic: string,
): boolean {
  const crossSpeakerTurns = previousTurns.filter(
    (previous) => previous.speakerId !== turn.speakerId,
  );
  const crossSpeakerTexts = crossSpeakerTurns.map((previous) => previous.text);
  if (hasMechanicalTopicOrScaffoldLoop(turn.text, crossSpeakerTexts, topic)) return true;
  if (hasDistinctiveQuestionEcho(turn.text, crossSpeakerTexts, topic)) return true;

  if (
    turn.roundKind === "discussion" &&
    (
      semanticMotifSaturationRejectionReasons(
        turn.text,
        crossSpeakerTurns
          .filter((previous) => previous.roundKind === "discussion")
          .map((previous) => ({
            speakerId: previous.speakerId,
            text: previous.text,
          })),
      ).length > 0 ||
      globalSemanticMotifSaturationRejectionReasons(
        turn.text,
        previousTurns
          .filter((previous) => previous.roundKind === "discussion")
          .map((previous) => ({
            speakerId: previous.speakerId,
            text: previous.text,
          })),
      ).length > 0
    )
  ) return true;

  if (!hasPeopleReducedToCountsMotif(turn.text)) return false;
  const priorSpeakersWithMotif = new Set(
    crossSpeakerTurns
      .filter((previous) => hasPeopleReducedToCountsMotif(previous.text))
      .map((previous) => previous.speakerId),
  );
  return priorSpeakersWithMotif.size >= 2;
}

/** A conservative lexical signal; it is a QA risk, not a rejection verdict. */
export function hasExcessiveRepetitionRisk(
  text: string,
  previousTexts: string[],
  topic = "",
): boolean {
  if (hasMechanicalTopicOrScaffoldLoop(text, previousTexts, topic)) return true;
  const imagery = matchedPatternIds(text, IMAGERY_GROUPS);
  const canned = matchedPatternIds(text, CANNED_PHRASES);
  const trigrams = contentTrigrams(text, topic);
  const partialFrameScaffold = hasPartialFrameDirectImpactScaffold(text);

  return previousTexts.some((previous) => {
    const imageryOverlap = overlapSize(imagery, matchedPatternIds(previous, IMAGERY_GROUPS));
    const cannedOverlap = overlapSize(canned, matchedPatternIds(previous, CANNED_PHRASES));
    const priorTrigrams = contentTrigrams(previous, topic);
    const trigramOverlap = overlapSize(trigrams, priorTrigrams);
    const smallerTrigramSet = Math.min(trigrams.size, priorTrigrams.size);
    return (
      (partialFrameScaffold && hasPartialFrameDirectImpactScaffold(previous)) ||
      imageryOverlap >= 3 ||
      cannedOverlap >= 2 ||
      (trigramOverlap >= 3 && smallerTrigramSet > 0 && trigramOverlap / smallerTrigramSet >= 0.25)
    );
  });
}

const CHALLENGE_INTENSIFIERS: Array<{ label: string; re: RegExp }> = [
  { label: "alone", re: /\balone\b/i },
  { label: "enough", re: /\b(?:enough|sufficient)\b/i },
  { label: "by itself", re: /\bby (?:itself|themselves)\b/i },
  { label: "a complete answer", re: /\b(?:full|complete) (?:answer|way|solution)\b/i },
  { label: "universal scope", re: /\b(?:every(?:one|body| family)?|all (?:people|families|of us))\b/i },
  { label: "resolution", re: /\b(?:safely managed|fully resolved|solved)\b/i },
  { label: "already understood", re: /\balready (?:understood|understand|resolved|solved)\b/i },
];

/**
 * Flag a common straw-man shape: the challenge introduces sufficiency,
 * universality, or resolution language that the target never used.
 */
export function challengeFidelityRiskReasons(challengeText: string, targetText: string): string[] {
  const reasons = [...challengeFidelityRejectionReasons(challengeText, targetText)];
  for (const { label, re } of CHALLENGE_INTENSIFIERS) {
    if (re.test(challengeText) && !re.test(targetText)) {
      reasons.push(
        `Challenge introduces unsupported ${label} language that the target did not use.`,
      );
    }
  }
  if (/\balways\b/i.test(challengeText) && !/\balways\b/i.test(targetText)) {
    reasons.push("Challenge turns a contextual target position into an unsupported always-rule.");
  }
  if (/\bonly\b/i.test(challengeText) && !/\bonly\b/i.test(targetText)) {
    reasons.push("Challenge turns a qualified target position into an unsupported only-rule.");
  }
  return Array.from(new Set(reasons));
}

export interface JudgeResult {
  syntheticEmpathy: number;
  adherence: number;
  rationale: string;
  costUsd: number;
  costAvailable: boolean;
}

function closingClaimsUnresolvedDifference(text: string): boolean {
  return [
    /\b(?:unresolved|unsettled|disagree|did not settle|not settled|did not resolve|not resolved|remain open|remains open)\b/i,
    /\b(?:a\s+|the\s+)?(?:difference|tension)\s+(?:remain|remains|stays?|is)\b|\b(?:remain|remains)\s+(?:a\s+|the\s+)?(?:difference|tension)\b/i,
    /\b(?:positions?|priorities|commitments?|outcomes?|choices?)\s+(?:remain|remains|stay|stays|are)\s+(?:different|distinct|divided|opposed|at\s+odds|in\s+tension)\b/i,
    /\b(?:different|distinct|divided|opposed|competing|conflicting)\s+(?:current\s+)?(?:positions?|priorities|commitments?|outcomes?|choices?)\b/i,
    /\b(?:one|some)\s+(?:position|priority|commitment|outcome|choice)\b[^.!?]{0,180}\bwhile\s+another\b/i,
  ].some((pattern) => pattern.test(text));
}

function parseJudge(
  text: string,
): Omit<JudgeResult, "costUsd" | "costAvailable"> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : text);
    const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
    const rationale = String(obj.rationale ?? "").trim();
    return {
      syntheticEmpathy: clamp(obj.syntheticEmpathy),
      adherence: clamp(obj.adherence),
      rationale: visiblePromptScaffoldingFlags(rationale).length
        ? "Judge rationale was omitted because it contained internal prompt scaffolding."
        : rationale,
    };
  } catch {
    return null;
  }
}

function unavailableJudgeResult(): Omit<JudgeResult, "costUsd" | "costAvailable"> {
  return {
    syntheticEmpathy: 0,
    // A missing semantic judge must not turn an otherwise clean run into a
    // misleading zero. computeMetrics still applies every deterministic
    // adherence failure as a floor.
    adherence: 1,
    rationale:
      "Semantic judge output was unavailable; adherence uses deterministic validation only.",
  };
}

export async function runJudge(opts: {
  judge: Persona;
  /** Legacy input retained for existing callers and mock-score compatibility. */
  personaTurns: Turn[];
  /**
   * Optional complete visible transcript. When supplied, facilitator opening,
   * intervention, and closing quality are included in the judge's evidence.
   */
  turns?: Turn[];
  topic: string;
  provider: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  mock: boolean;
  seedBase: string;
}): Promise<JudgeResult> {
  const {
    judge,
    personaTurns,
    turns,
    topic,
    provider,
    model,
    reasoningEffort,
    mock,
    seedBase,
  } = opts;
  const evaluationTurns = turns ?? personaTurns;
  const contributionTexts = continuityContributionTexts(evaluationTurns);
  const evaluatedPersonaTurns = evaluationTurns.filter((turn) => turn.role === "persona");
  const flaggedTurns = evaluationTurns.filter((t) => !t.compliant).length;
  const withHistory = evaluatedPersonaTurns.filter(
    (turn) =>
      evaluationTurnSignals(contributionTexts.get(turn.id) ?? turn.text)
        .personalHistory,
  ).length;
  const personalHistoryRatio = evaluatedPersonaTurns.length
    ? withHistory / evaluatedPersonaTurns.length
    : 0;
  const topicTurns = evaluationTurns.filter((turn) => turn.roundKind !== "introduction");
  const topicRelevant = topicTurns.filter(
    (turn) =>
      assessTopicRelevance(contributionTexts.get(turn.id) ?? turn.text, topic).relevant,
  ).length;
  const topicRelevanceRatio = topicTurns.length ? topicRelevant / topicTurns.length : 1;

  if (mock) {
    const raw = mockJudge({
      seedBase,
      flaggedTurns,
      totalTurns: evaluationTurns.length,
      personalHistoryRatio,
      topicRelevanceRatio,
    });
    return {
      ...(parseJudge(raw) ?? unavailableJudgeResult()),
      costUsd: 0,
      costAvailable: true,
    };
  }

  const transcript = evaluationTurns
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((turn) => {
      const relationships = [
        turn.respondsToTurnId ? `respondsTo=${turn.respondsToTurnId}` : "",
        turn.triggeredByTurnId ? `triggeredBy=${turn.triggeredByTurnId}` : "",
        turn.invitedByTurnId ? `invitedBy=${turn.invitedByTurnId}` : "",
        turn.invitedSpeakerId ? `invites=${turn.invitedSpeakerId}` : "",
      ].filter(Boolean).join(", ");
      const metadata = [
        `turn=${turn.index}`,
        `role=${turn.role}`,
        `phase=${turn.roundKind ?? "discussion"}`,
        relationships,
      ].filter(Boolean).join("; ");
      return `${turn.speakerName} [${metadata}]: ${turn.text}`;
    })
    .join("\n");
  const system = compileJudgeSystemPrompt(judge);
  const message = [
    `Session subject: ${JSON.stringify(topic)}.`,
    "Evaluate whether every discussion, round-transition, invited-response, intervention, and closing turn remains directly connected to that subject. Mandatory introduction turns are exempt.",
    "When facilitator turns are present, assess whether the opening establishes the agreements, each round transition is one concise procedural sentence grounded in the next round rather than another introduction or participant summary, interventions neutrally reflect the linked challenge without leading, binary, or preferred-answer questions, and the closing accurately summarizes transcript-supported stakes from the latest participant positions before explaining how this specific exchange could support peacebuilding and explicitly thanking participants for their participation or contribution.",
    "Penalize a closing that omits the peacebuilding implication or explicit participation thanks, gives only generic peace language disconnected from the transcript, manufactures consensus or disagreement, or claims that the simulation itself created reconciliation, changed attitudes, or real-world impact. Generic warmth or thanks for listening does not replace thanking participants for taking part.",
    "Use the turn relationship metadata to check whether challenges faithfully address their targets and whether invited responses answer the facilitator's reflection question while preserving their latest position unless they explicitly explain a real change. Penalize straw-man absolutes, leading facilitator paraphrases, false binaries, forced concessions, and closing role reversals.",
    "Penalize new first-person claims of directly witnessing, seeing, or experiencing a topical event, or of having an affected relative, when that exposure or biography is not supported by the accepted introduction or earlier transcript context. Do not treat vivid first-person phrasing as evidence that the claim is grounded.",
    "Political and geopolitical topics are valid: do not reward avoiding them or replacing them with generic food, family, humor, or belonging themes. Lower methodology adherence when the dialogue drifts from the selected topic.",
    "For a difficult public topic, distinguish subject-level engagement from meta-dialogue: a response should state a concrete human outcome, competing obligation, bounded response, or unresolved choice. Repeating uncertainty about speaking, listening, representation, or what can be known is not substantive engagement by itself.",
    "Penalize mechanical repetition of the full session title, rubric-like phrases, routed-question relays, and a whole session looping on one frame even when each turn remains lexically on-topic. Penalize a session-wide repeated continuity-opener family, especially serial 'I hear you saying' bridges, while judging any individual bridge by whether it faithfully and directly connects to the preceding participant rather than by a forbidden-word rule. Reusing the same public/private, safety/belonging, or similar binary with new scenery is still repetition.",
    "Do not award adherence or empathy merely because a turn contains an I-statement, acknowledgment, participant name, or question. Formulaic first-person language and mandatory-looking curiosity questions receive credit only when they add a distinct, responsive idea in the speaker's own voice.",
    "Return only one JSON object matching the required schema. Put 2-3 sentences of natural evaluation prose inside the rationale string; never repeat prompt instructions, task labels, JSON/data-handling language, or transcript metadata there.",
    `Transcript to evaluate:\n\n${transcript}`,
    "Return the JSON score object now.",
  ].join("\n\n");
  const res = await callAgentCLI({ provider, system, message, model, reasoningEffort });
  let parsed = parseJudge(res.text);
  let totalCostUsd = res.costUsd;
  let totalCostAvailable = res.costAvailable;
  if (!parsed) {
    const retry = await callAgentCLI({
      provider,
      system,
      message: `${message}\n\nYour previous response could not be parsed. Return only the JSON object now, with numeric syntheticEmpathy and adherence fields and a string rationale field.`,
      model,
      reasoningEffort,
    });
    totalCostUsd += retry.costUsd;
    totalCostAvailable = totalCostAvailable && retry.costAvailable;
    parsed = parseJudge(retry.text);
  }
  return {
    ...(parsed ?? unavailableJudgeResult()),
    costUsd: totalCostUsd,
    costAvailable: totalCostAvailable,
  };
}

/** Compute the evaluation matrices from persisted turns + judge result (pure). */
export function computeMetrics(turns: Turn[], judge: JudgeResult, topic = ""): RunMetrics {
  const personaTurns = turns.filter((t) => t.role === "persona");
  const contributionTexts = continuityContributionTexts(turns);
  const evaluationText = (turn: Turn) => contributionTexts.get(turn.id) ?? turn.text;
  const n = personaTurns.length;
  const ratio = (count: number) => (n ? count / n : 0);

  const guardrail = personaTurns.filter((t) => t.guardrailTrigger).length;
  const evaluatedSignals = new Map(
    personaTurns.map((turn) => [turn.id, evaluationTurnSignals(evaluationText(turn))]),
  );
  const iStmt = personaTurns.filter(
    (turn) => evaluatedSignals.get(turn.id)?.iStatement,
  ).length;
  const history = personaTurns.filter(
    (turn) => evaluatedSignals.get(turn.id)?.personalHistory,
  ).length;
  const curiosityEligibleTurns = personaTurns.filter(
    (turn) =>
      turn.roundKind !== "introduction" &&
      turn.conversationTag !== "escalating" &&
      turn.controversialSpeaker !== true,
  );
  const curiosity = curiosityEligibleTurns.filter(
    (turn) => {
      if (!evaluatedSignals.get(turn.id)?.curiosityQuestion) return false;
      const earlierTexts = personaTurns
        .filter((earlier) => earlier.index < turn.index)
        .map((earlier) => evaluationText(earlier));
      return !hasMechanicalTopicOrScaffoldLoop(
        evaluationText(turn),
        earlierTexts,
        topic,
      ) && !hasDistinctiveQuestionEcho(evaluationText(turn), earlierTexts, topic);
    },
  ).length;
  const topicTurns = personaTurns.filter((turn) => turn.roundKind !== "introduction");
  const difficultPublicTopic = isDifficultPublicTopic(topic);
  const topicRelevant = topicTurns.filter(
    (turn) =>
      assessTopicRelevance(evaluationText(turn), topic).relevant,
  ).length;
  const depthEligibleTurns = difficultPublicTopic
    ? topicTurns.filter((turn) => turn.roundKind === "discussion")
    : [];
  const subjectLevelTurnIds = new Set(
    depthEligibleTurns
      .filter(
        (turn) =>
          subjectLevelEngagementRejectionReasons(
            evaluationText(turn),
            topic,
          ).length === 0,
      )
      .map((turn) => turn.id),
  );
  const metaDominantTurnIds = new Set(
    depthEligibleTurns
      .filter((turn) =>
        isMetaDominantPublicEngagement(evaluationText(turn), topic))
      .map((turn) => turn.id),
  );

  const priorBySpeaker = new Map<string, string[]>();
  const priorInvitedBySpeaker = new Map<string, string[]>();
  const priorScheduledBySpeaker = new Map<string, string[]>();
  const priorPersonaTurns: Turn[] = [];
  const priorChallenges: string[] = [];
  const repeatedTurnIds = new Set<string>();
  const turnsById = new Map(turns.map((turn) => [turn.id, turn]));
  const isScheduledContribution = (turn: Turn) =>
    turn.roundKind === "discussion" || Boolean(turn.consumedScheduledSlot);
  const sortedTurns = turns
    .slice()
    .sort((left, right) => left.index - right.index);
  const linkedChallengeTarget = (challenge: Turn): Turn | undefined => {
    if (
      challenge.role !== "persona" ||
      challenge.conversationTag !== "escalating" ||
      !challenge.respondsToTurnId
    ) return undefined;
    const target = turnsById.get(challenge.respondsToTurnId);
    if (
      !target ||
      target.runId !== challenge.runId ||
      target.role !== "persona" ||
      target.index >= challenge.index ||
      target.speakerId === challenge.speakerId ||
      target.conversationTag === "escalating" ||
      (target.roundKind !== undefined && target.roundKind !== "discussion")
    ) return undefined;
    return target;
  };
  for (const turn of personaTurns.slice().sort((left, right) => left.index - right.index)) {
    const qualityTurn: Turn = { ...turn, text: evaluationText(turn) };
    const previousOwnTurns = priorBySpeaker.get(turn.speakerId) ?? [];
    const previousOwnScheduledTurns =
      priorScheduledBySpeaker.get(turn.speakerId) ?? [];
    const mergedScheduledReply = Boolean(turn.consumedScheduledSlot);
    const comparisonTurns = turn.roundKind === "invited-response" && !mergedScheduledReply
      // A repair should preserve the challenged position. Compare it with
      // earlier repairs, not with the target turn it is faithfully restating.
      ? priorInvitedBySpeaker.get(turn.speakerId) ?? []
      : turn.conversationTag === "escalating"
        ? [...previousOwnTurns, ...priorChallenges]
        : previousOwnTurns;
    if (
      hasExcessiveRepetitionRisk(qualityTurn.text, comparisonTurns, topic) ||
      (isScheduledContribution(turn) &&
        sameSpeakerSemanticReuseRejectionReasons(
          qualityTurn.text,
          previousOwnScheduledTurns,
        ).length > 0) ||
      (isScheduledContribution(turn) &&
        turn.conversationTag !== "escalating" &&
        subjectPositionSemanticReuseRejectionReasons(
          qualityTurn.text,
          priorPersonaTurns
            .filter(
              (prior) =>
                isScheduledContribution(prior) &&
                prior.speakerId !== turn.speakerId,
            )
            .slice(-3)
            .map((prior) => prior.text),
          topic,
        ).length > 0) ||
      (turn.conversationTag === "escalating" &&
        subjectPropositionNoveltyRejectionReasons(
          qualityTurn.text,
          priorPersonaTurns
            .filter(
              (prior) =>
                isScheduledContribution(prior) &&
                prior.speakerId !== turn.speakerId,
            )
            .slice(-6)
            .map((prior) => prior.text),
          topic,
          turn.respondsToTurnId
            ? turnsById.get(turn.respondsToTurnId)?.text ?? ""
            : "",
        ).length > 0) ||
      hasCrossSpeakerEchoRisk(qualityTurn, priorPersonaTurns, topic)
    ) {
      repeatedTurnIds.add(turn.id);
    }
    priorBySpeaker.set(turn.speakerId, [...previousOwnTurns, qualityTurn.text]);
    if (turn.roundKind === "invited-response") {
      const earlierRepairs = priorInvitedBySpeaker.get(turn.speakerId) ?? [];
      priorInvitedBySpeaker.set(turn.speakerId, [...earlierRepairs, qualityTurn.text]);
    }
    if (isScheduledContribution(turn)) {
      priorScheduledBySpeaker.set(
        turn.speakerId,
        [...previousOwnScheduledTurns, qualityTurn.text],
      );
    }
    if (turn.conversationTag === "escalating") priorChallenges.push(qualityTurn.text);
    priorPersonaTurns.push(qualityTurn);
  }

  // Every visible challenge belongs in the denominator. A missing, dangling,
  // forward, self, or non-discussion target is itself a fidelity defect; older
  // metrics silently omitted precisely those malformed challenges.
  const assessableChallenges = personaTurns.filter(
    (turn) => turn.conversationTag === "escalating",
  );
  const riskyChallengeIds = new Set(assessableChallenges.filter((turn) => {
    const target = linkedChallengeTarget(turn);
    if (!target) return true;
    const priorOwnPositions = personaTurns
      .filter(
        (prior) =>
          prior.speakerId === turn.speakerId &&
          prior.index < turn.index &&
          isScheduledContribution(prior),
      )
      .sort((left, right) => left.index - right.index)
      .map((prior) => evaluationText(prior));
    return (
      challengeFidelityRiskReasons(turn.text, target.text).length > 0 ||
      challengeSelfConsistencyRejectionReasons(
        turn.text,
        priorOwnPositions,
        topic,
      ).length > 0
    );
  }).map((turn) => turn.id));
  const qualityFailureIds = new Set(
    turns.filter((turn) => !turn.compliant).map((turn) => turn.id),
  );
  for (const turnId of repeatedTurnIds) qualityFailureIds.add(turnId);
  for (const turnId of riskyChallengeIds) qualityFailureIds.add(turnId);
  for (const turn of depthEligibleTurns) {
    if (!subjectLevelTurnIds.has(turn.id)) qualityFailureIds.add(turn.id);
  }

  const attendees = Array.from(
    new Map(
      personaTurns.map((turn) => [
        turn.speakerId,
        { id: turn.speakerId, displayName: turn.speakerName },
      ]),
    ).values(),
  );
  for (const turn of sortedTurns) {
    if (turn.role !== "facilitator") continue;

    if (
      turn.roundKind === "opening" &&
      !assessFacilitatorOpening(turn.text, topic).acceptable
    ) {
      qualityFailureIds.add(turn.id);
      continue;
    }

    if (turn.roundKind === "intervention") {
      const trigger = turn.triggeredByTurnId
        ? turnsById.get(turn.triggeredByTurnId)
        : undefined;
      const target = trigger ? linkedChallengeTarget(trigger) : undefined;
      const validTrigger = Boolean(
        trigger &&
          trigger.index < turn.index &&
          trigger.runId === turn.runId &&
          trigger.role === "persona" &&
          trigger.conversationTag === "escalating" &&
          target,
      );
      if (!validTrigger || !trigger || !target) {
        qualityFailureIds.add(turn.id);
        continue;
      }

      const flow = assessFacilitatorIntervention(
        turn.text,
        attendees,
        target.speakerId,
      );
      if (
        !flow.acceptable ||
        turn.invitedSpeakerId !== target.speakerId
      ) {
        qualityFailureIds.add(turn.id);
      }
      continue;
    }

    if (turn.roundKind === "closing") {
      if (turn.semanticValidation) {
        if (
          turn.semanticValidation.phase !== "closing" ||
          turn.semanticValidation.verdict !== "accept"
        ) {
          qualityFailureIds.add(turn.id);
        }
        continue;
      }
      const transcriptBeforeClosing = sortedTurns
        .filter((prior) => prior.index < turn.index)
        .map((prior) => ({
          speakerName: prior.speakerName,
          text: prior.text,
        }));
      const acceptedChallengeTexts = sortedTurns
        .filter(
          (prior) =>
            prior.index < turn.index &&
            prior.compliant &&
            prior.conversationTag === "escalating" &&
            Boolean(linkedChallengeTarget(prior)),
        )
        .map((prior) => prior.text);
      const hasCurrentUnresolvedDifference =
        hasSupportedUnresolvedChallengeDifference(
          acceptedChallengeTexts,
          topic,
          transcriptBeforeClosing,
        );
      const claimsUnresolvedDifference = closingClaimsUnresolvedDifference(
        turn.text,
      );
      if (
        unsupportedClosingPriorityClaimRejectionReasons(
          turn.text,
          transcriptBeforeClosing,
        ).length > 0 ||
        hasCurrentUnresolvedDifference !== claimsUnresolvedDifference
      ) {
        qualityFailureIds.add(turn.id);
      }
    }
  }

  // Adherence now covers every visible participant and facilitator turn. The
  // public turnCount field keeps its historical persona-only meaning.
  const deterministicAdherence = turns.length
    ? (turns.length - qualityFailureIds.size) / turns.length
    : 0;

  return {
    // Keep the historical field's persona-only meaning for API compatibility.
    turnCount: n,
    visibleTurnCount: turns.length,
    personaResponseCount: n,
    // Deterministic checks cap known defects; the judge can lower the score
    // further for semantic failures that lexical checks cannot prove.
    adherenceRate: Math.min(deterministicAdherence, judge.adherence),
    guardrailTriggerRate: ratio(guardrail),
    iStatementRatio: ratio(iStmt),
    personalHistoryRatio: ratio(history),
    curiosityRatio: curiosityEligibleTurns.length
      ? curiosity / curiosityEligibleTurns.length
      : 1,
    curiosityEligibleTurnCount: curiosityEligibleTurns.length,
    syntheticEmpathyScore: judge.syntheticEmpathy,
    topicRelevanceRate: topicTurns.length ? topicRelevant / topicTurns.length : 1,
    subjectLevelEngagementRate: depthEligibleTurns.length
      ? subjectLevelTurnIds.size / depthEligibleTurns.length
      : undefined,
    metaDominanceRiskRate: depthEligibleTurns.length
      ? metaDominantTurnIds.size / depthEligibleTurns.length
      : undefined,
    repetitionRiskRate: ratio(repeatedTurnIds.size),
    challengeFidelityRiskRate: assessableChallenges.length
      ? riskyChallengeIds.size / assessableChallenges.length
      : 0,
    challengeFidelityAssessedCount: assessableChallenges.length,
    sentimentTrajectory: personaTurns.map((turn) =>
      Number(sentiment(evaluationText(turn), topic).toFixed(2))),
    judgeRationale: judge.rationale,
    computedAt: new Date().toISOString(),
  };
}
