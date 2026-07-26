/**
 * Deterministic lexical topic-relevance checks.
 *
 * This deliberately does not infer synonyms or claim semantic understanding.
 * A response is relevant only when it contains the normalized configured topic
 * or enough distinct content-word anchors taken directly from that topic.
 */

const FUNCTION_WORDS = new Set([
  "a",
  "about",
  "after",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "being",
  "between",
  "by",
  "can",
  "each",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "them",
  "this",
  "through",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "your",
]);

const GENERIC_SESSION_WORDS = new Set([
  "conversation",
  "dialogue",
  "discussion",
  "session",
  "topic",
]);

export type TopicRelevanceMatchKind =
  | "exact-topic"
  | "topic-anchors"
  | "insufficient-anchors"
  | "empty-text"
  | "empty-topic";

export type TopicRelevanceAssessment = {
  relevant: boolean;
  matchKind: TopicRelevanceMatchKind;
  exactTopicMention: boolean;
  normalizedTopic: string;
  topicAnchors: string[];
  requiredAnchorCount: number;
  matchedAnchors: string[];
  missingAnchors: string[];
};

/**
 * Normalize compatibility-equivalent Unicode, case, and punctuation while
 * retaining letters and numbers from every writing system.
 */
export function normalizeTopicRelevanceText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extract distinct lexical anchors from a configured topic. Only grammatical
 * function words and generic session labels are discarded; domain words such
 * as `family`, `war`, place names, faiths, and short initialisms are retained.
 */
export function extractTopicAnchors(configuredTopic: string): string[] {
  const normalizedTopic = normalizeTopicRelevanceText(configuredTopic);
  if (!normalizedTopic) return [];

  const anchors = normalizedTopic
    .split(" ")
    .filter(
      (token) =>
        token.length > 0 &&
        !FUNCTION_WORDS.has(token) &&
        !GENERIC_SESSION_WORDS.has(token),
    );

  // A short or function-word topic can still be intentionally configured.
  // Preserve its tokens rather than making relevance impossible to establish.
  const candidates = anchors.length > 0 ? anchors : normalizedTopic.split(" ");
  return [...new Set(candidates)];
}

function containsNormalizedPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedText || !normalizedPhrase) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function requiredAnchorCount(anchorCount: number): number {
  if (anchorCount <= 1) return anchorCount;
  // Requiring two distinct content words prevents one generic overlap (for
  // example, `war` without `Gaza`) from being treated as topic relevance.
  // Three anchors provide stronger evidence for longer configured topics while
  // keeping natural paraphrases possible.
  return anchorCount >= 5 ? 3 : 2;
}

/**
 * Assess lexical relevance to an already-sanitized configured topic.
 *
 * Exact normalized topic wording always passes. Otherwise, the response must
 * contain multiple distinct anchors for a multi-anchor topic. The returned
 * evidence is suitable for retry instructions and generation-attempt audits.
 */
export function assessTopicRelevance(
  text: string,
  configuredTopic: string,
): TopicRelevanceAssessment {
  const normalizedText = normalizeTopicRelevanceText(text);
  const normalizedTopic = normalizeTopicRelevanceText(configuredTopic);
  const topicAnchors = extractTopicAnchors(configuredTopic);
  const minimumMatches = requiredAnchorCount(topicAnchors.length);
  const responseTokens = new Set(normalizedText ? normalizedText.split(" ") : []);
  const matchedAnchors = topicAnchors.filter((anchor) => responseTokens.has(anchor));
  const missingAnchors = topicAnchors.filter((anchor) => !responseTokens.has(anchor));
  const exactTopicMention = containsNormalizedPhrase(normalizedText, normalizedTopic);

  let matchKind: TopicRelevanceMatchKind;
  let relevant = false;

  if (!normalizedTopic) {
    matchKind = "empty-topic";
  } else if (!normalizedText) {
    matchKind = "empty-text";
  } else if (exactTopicMention) {
    relevant = true;
    matchKind = "exact-topic";
  } else if (minimumMatches > 0 && matchedAnchors.length >= minimumMatches) {
    relevant = true;
    matchKind = "topic-anchors";
  } else {
    matchKind = "insufficient-anchors";
  }

  return {
    relevant,
    matchKind,
    exactTopicMention,
    normalizedTopic,
    topicAnchors,
    requiredAnchorCount: minimumMatches,
    matchedAnchors,
    missingAnchors,
  };
}
