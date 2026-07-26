/**
 * Pure, topic-agnostic depth checks for difficult public-issue dialogue.
 *
 * Topic relevance and topic depth are intentionally separate. Repeating a
 * configured topic, or adding words such as "uncertainty" and "dignity", can
 * be relevant without taking a position on the subject itself. This module
 * recognizes four fact-free forms of subject-level engagement while allowing
 * epistemic humility and dialogue process as secondary material.
 */

export const PUBLIC_ENGAGEMENT_LANES = [
  {
    id: "protected-human-outcome",
    label: "a protected human outcome",
    instruction:
      "Name one human outcome you would protect or prioritize, and explain the value behind that priority.",
  },
  {
    id: "competing-obligations",
    label: "competing obligations or outcomes",
    instruction:
      "Name two legitimate obligations or outcomes in tension and state how you weigh them without pretending the tension disappears.",
  },
  {
    id: "bounded-response",
    label: "a bounded response and its criterion",
    instruction:
      "Name one response you would support, oppose, accept, or reject and the condition or outcome by which you would judge it.",
  },
  {
    id: "unresolved-subject-choice",
    label: "an unresolved subject-level choice",
    instruction:
      "Name one unresolved choice within the subject, including the alternatives that make the choice difficult.",
  },
] as const;

export type PublicEngagementLane =
  (typeof PUBLIC_ENGAGEMENT_LANES)[number]["id"];

export interface PublicEngagementLaneSelectionInput {
  /** Stable position in the configured attendee roster, not the current order. */
  speakerOrdinal: number;
  /** Zero-based discussion round. */
  roundIndex: number;
  /** Optional deterministic rotation for a project or session. */
  rotation?: number;
  /** Lanes already used by this speaker; an unused lane is preferred. */
  usedBySpeaker?: readonly PublicEngagementLane[];
  /** A lane to avoid for adjacent routing, even if every lane was used. */
  avoid?: PublicEngagementLane;
}

export interface SubjectLevelEngagementOptions {
  /** When supplied, a valid turn must also realize this assigned lane. */
  requiredLane?: PublicEngagementLane;
}

const DIRECT_DIFFICULT_PUBLIC_TOPIC =
  /\b(?:war|armed conflict|ceasefire|occupation|genocide|terrorism|political violence|gun violence|police violence|election|voting rights?|immigration|refugees?|abortion|climate change|racism|antisemitism|islamophobia|discrimination|segregation|protests?|public health|healthcare|housing crisis|homelessness|foreign policy|public policy|civil rights?|human rights?)\b/i;

const PUBLIC_SYSTEM =
  /\b(?:artificial intelligence|a\.?i\.?|algorithm(?:ic)?|schools?|education|housing|rent|healthcare|public health|policing|criminal justice|immigration|environment|climate|workplace|employment|wages?|voting|elections?|government)\b/i;

const CONTESTED_PUBLIC_DIMENSION =
  /\b(?:public|policy|law|legal|rights?|access|inequal(?:ity|ities)|privacy|bias|discrimination|ban|regulat(?:e|ion)|reform|crisis|affordab(?:le|ility)|increas(?:e|es|ing)|rising|safety|surveillance|mandatory|funding|justice|accountability|protest)\b/i;

const INTERFAITH_OR_RELIGIOUS_COMMUNITIES =
  /\b(?:interfaith|interreligious|religions?|religious|faiths?|faith\s+communities?|religious\s+communities?|jewish|jews?|judaism|muslim|muslims?|islam(?:ic)?|christian|christians?|christianity|hindu|hindus?|hinduism|buddhist|buddhists?|buddhism|sikh|sikhs?|sikhism)\b/i;

const RELIGIOUS_RELATIONSHIP_OR_CONFLICT =
  /\b(?:peace|peacebuilding|reconciliation|reconcil(?:e|ing)|relations?|relationships?|coexistence|understanding|trust|solidarity|cooperation|tensions?|conflicts?|division|hostility|hate)\b/i;

function isInterfaithRelationshipTopic(topic: string): boolean {
  return INTERFAITH_OR_RELIGIOUS_COMMUNITIES.test(topic) &&
    RELIGIOUS_RELATIONSHIP_OR_CONFLICT.test(topic);
}

/** High-precision detection; it does not depend on any one named conflict. */
export function isDifficultPublicTopic(topic: string): boolean {
  const normalized = normalizeText(topic);
  if (!normalized) return false;
  return DIRECT_DIFFICULT_PUBLIC_TOPIC.test(normalized) ||
    isInterfaithRelationshipTopic(normalized) ||
    (PUBLIC_SYSTEM.test(normalized) && CONTESTED_PUBLIC_DIMENSION.test(normalized));
}

/** Return the stable prompt instruction for a lane. */
export function publicEngagementLaneInstruction(
  lane: PublicEngagementLane,
): string {
  return PUBLIC_ENGAGEMENT_LANES.find((entry) => entry.id === lane)!.instruction;
}

/**
 * Latin-square assignment gives four speakers four different lanes per round
 * and advances every speaker to a different lane in the next round.
 */
export function publicEngagementLaneForTurn(
  speakerOrdinal: number,
  roundIndex: number,
  rotation = 0,
): PublicEngagementLane {
  const length = PUBLIC_ENGAGEMENT_LANES.length;
  const index = positiveModulo(speakerOrdinal + roundIndex + rotation, length);
  return PUBLIC_ENGAGEMENT_LANES[index].id;
}

/** Select the scheduled lane, skipping a speaker's already-used lanes. */
export function selectPublicEngagementLane(
  input: PublicEngagementLaneSelectionInput,
): PublicEngagementLane {
  const scheduled = publicEngagementLaneForTurn(
    input.speakerOrdinal,
    input.roundIndex,
    input.rotation,
  );
  const used = new Set(input.usedBySpeaker ?? []);
  const start = PUBLIC_ENGAGEMENT_LANES.findIndex((entry) => entry.id === scheduled);
  for (let offset = 0; offset < PUBLIC_ENGAGEMENT_LANES.length; offset += 1) {
    const candidate = PUBLIC_ENGAGEMENT_LANES[(start + offset) % PUBLIC_ENGAGEMENT_LANES.length].id;
    if (candidate !== input.avoid && !used.has(candidate)) return candidate;
  }
  for (let offset = 0; offset < PUBLIC_ENGAGEMENT_LANES.length; offset += 1) {
    const candidate = PUBLIC_ENGAGEMENT_LANES[(start + offset) % PUBLIC_ENGAGEMENT_LANES.length].id;
    if (candidate !== input.avoid) return candidate;
  }
  return scheduled;
}

const META_PROCESS_WORDS = new Set([
  "answer",
  "authority",
  "certainty",
  "certain",
  "claim",
  "claims",
  "claimed",
  "conversation",
  "dialogue",
  "discuss",
  "discussion",
  "exchange",
  "frame",
  "framing",
  "headline",
  "headlines",
  "information",
  "interpret",
  "interpretation",
  "language",
  "know",
  "knowing",
  "knowledge",
  "label",
  "labels",
  "listen",
  "listening",
  "perspective",
  "perspectives",
  "represent",
  "representing",
  "representation",
  "room",
  "say",
  "saying",
  "silence",
  "silent",
  "speak",
  "speaker",
  "speaking",
  "speech",
  "story",
  "stories",
  "uncertain",
  "uncertainty",
  "verify",
  "verified",
  "voice",
  "voices",
  "word",
  "words",
  "conclusion",
  "conclusions",
  "wording",
]);

const ABSTRACT_VALUE_WORDS = new Set([
  "care",
  "caring",
  "compassion",
  "curiosity",
  "dignity",
  "eloquence",
  "generosity",
  "honesty",
  "hospitality",
  "humility",
  "joy",
  "memory",
  "patience",
  "resilience",
  "responsibility",
  "solidarity",
  "value",
  "values",
]);

const OBJECT_STOP_WORDS = new Set([
  "a", "about", "all", "an", "and", "another", "any", "as", "at", "be",
  "because", "been", "being", "both", "but", "by", "can", "cannot", "could",
  "do", "does", "every", "for", "from", "had", "has", "have", "here", "how",
  "i", "if", "in", "into", "is", "it", "its", "me", "my", "no", "not", "of",
  "on", "one", "only", "or", "our", "should", "so", "some", "than", "that",
  "the", "their", "them", "there", "these", "they", "this", "those", "through",
  "to", "together", "too", "us", "was", "we", "what", "when", "where", "whether",
  "which", "while", "who", "whose", "will", "with", "without", "would", "yet", "you",
  "your",
]);

const GENERIC_DEPTH_WORDS = new Set([
  "aspect", "concrete", "consequence", "consequences", "effect", "effects",
  "ethical", "experience", "experiences", "human", "impact", "impacts", "issue",
  "need", "needs", "outcome", "outcomes", "people", "person", "question", "response",
  "stake", "subject", "tension", "thing", "topic",
]);

const META_PROCESS_PATTERN =
  /\b(?:speak(?:ing)?|speech|language|wording|say(?:ing)?|listen(?:ing)?|conversation|dialogue|room|circle|voice|words?|represent(?:ing|ation)?|stand in for|speak for|whole story|headlines?|labels?|conclusions?|what (?:i|we|this room) (?:can|cannot|can't) know|partial (?:facts?|information|knowledge)|uncertain(?:ty)?|certaint(?:y|ies)|claim(?:ing|s|ed)?|authorit(?:y|ies)|perspectives?|verify|verified)\b/i;

interface TopicStakeFamily {
  topic: RegExp;
  stake: RegExp;
  /** A concrete stake required when the same object is framed as dialogue process. */
  metaSafeStake?: RegExp;
  /** A high-signal stake that can stand alone as a concise position. */
  conciseStake?: RegExp;
}

// A lane is only subject-level when its actual object belongs to the selected
// public issue. This prevents a topic label from laundering an unrelated
// priority (pizza, transit, parks) or a meta priority (careful speech) into a
// passing answer. The patterns are deliberately broad, fact-free stakeholder
// domains rather than current-event claims.
const TOPIC_STAKE_FAMILIES: readonly TopicStakeFamily[] = [
  {
    topic: /(?=[\s\S]*\b(?:interfaith|interreligious|religions?|religious|faiths?|faith\s+communities?|religious\s+communities?|jewish|jews?|judaism|muslim|muslims?|islam(?:ic)?|christian|christians?|christianity|hindu|hindus?|hinduism|buddhist|buddhists?|buddhism|sikh|sikhs?|sikhism)\b)(?=[\s\S]*\b(?:peace|peacebuilding|reconciliation|reconcil(?:e|ing)|relations?|relationships?|coexistence|understanding|trust|solidarity|cooperation|tensions?|conflicts?|division|hostility|hate)\b)/i,
    stake: /\b(?:interfaith\s+peace|religious\s+peace|peacebuilding|reconciliation|mutual\s+trust|cross[-\s]community\s+(?:relationships?|friendships?)|religious\s+freedom|safe\s+worship|equal\s+(?:treatment|belonging)|community\s+safety|hate\s+prevention|preventing\s+hate|antisemitism|islamophobia|joint\s+projects?|shared\s+institutions?|coexistence|solidarity|repair|civic\s+participation|cooperation|hostility|division|violence|harm)\b/i,
    metaSafeStake: /\b(?:interfaith\s+peace|religious\s+peace|peacebuilding|reconciliation|mutual\s+trust|cross[-\s]community\s+(?:relationships?|friendships?)|religious\s+freedom|safe\s+worship|equal\s+(?:treatment|belonging)|community\s+safety|hate\s+prevention|preventing\s+hate|antisemitism|islamophobia|joint\s+projects?|shared\s+institutions?|coexistence|civic\s+participation|hostility|division|violence|harm)\b/i,
    conciseStake: /\b(?:interfaith\s+peace|religious\s+peace|peacebuilding|reconciliation|religious\s+freedom|safe\s+worship|coexistence)\b/i,
  },
  {
    topic: /\b(?:war|armed conflict|ceasefire|occupation|genocide|terrorism|political violence|gaza|israel|palestine|ukraine)\b/i,
    stake: /\b(?:civilians?|famil(?:y|ies)|physical safety|loss of life|protection of life|food|water|medicine|medical care|health care|urgent care|life[- ]saving care|humanitarian|aid|shelter|hunger|deprivation|hostages?|displaced|displacement|refugees?|death|deaths|killed|injured|violence|harm|survival|basics|basic needs|urgent needs|relief|treatment|continuity|continuity of care|daily care|recovery|lasting safety|trauma|mourning|grief|mental health|education|schooling|livelihoods?|jobs?|rights?|accountability|ceasefire|famil(?:y|ies)[- ](?:tracing|reconnection|reunification|reunion|linkage|separation)|reconnect(?:ed|ing|s)? families|reunit(?:e|ed|ing|es) families|kinship ties?|legal standing|legal limbo)\b/i,
    metaSafeStake: /\b(?:physical safety|civilian safety|famil(?:y|ies)'? safety|civilian protection|protection of civilians?|loss of life|protection of life|food|water|medicine|medical care|health care|urgent care|life[- ]saving care|humanitarian|aid|shelter|hunger|deprivation|hostages?|displaced|displacement|refugees?|death|deaths|killed|injured|violence|harm|survival|basics|basic needs|urgent needs|relief|treatment|continuity|continuity of care|daily care|recovery|lasting safety|trauma|mourning|grief|mental health|education|schooling|livelihoods?|jobs?|(?:civilian|human|legal) rights?|accountability for (?:harm|violence|deaths?|displacement)|ceasefire|famil(?:y|ies)[- ](?:tracing|reconnection|reunification|reunion|linkage|separation)|reconnect(?:ed|ing|s)? families|reunit(?:e|ed|ing|es) families|kinship ties?|legal standing|legal limbo)\b/i,
    conciseStake: /\b(?:ceasefire|urgent care|life[- ]saving care)\b/i,
  },
  {
    topic: /\b(?:climate|environment)\b/i,
    stake: /\b(?:flood|heat|emissions?|pollution|energy|infrastructure|exposure|public health|housing|homes?|affordab(?:le|ility)|costs?|burden|safety|protection|environmental harm)\b/i,
  },
  {
    topic: /\b(?:artificial intelligence|a\.?i\.?|algorithm|surveillance)\b/i,
    stake: /\b(?:students?|teachers?|learning|grading|privacy|data|bias|discrimination|human review|accountability|access|jobs?|workers?|surveillance|safety)\b/i,
  },
  {
    topic: /\b(?:housing|rent|homelessness)\b/i,
    stake: /\b(?:famil(?:y|ies)|housed|housing|homes?|rent|shelter|eviction|evicted|displaced|affordability|costs?|stability|essential services|safety)\b/i,
  },
  {
    topic: /\b(?:election|voting|government|public policy|voting rights)\b/i,
    stake: /\b(?:participation|voters?|ballots?|access|administration|intimidation|rights?|accurate|trustworthy|transparent|review|rules?|representation|accountability|fairness)\b/i,
  },
  {
    topic: /\b(?:immigration|refugees?|asylum)\b/i,
    stake: /\b(?:famil(?:y|ies)|family unity|separation|separated|safety|shelter|due process|legal review|status|asylum|rights?|protection|detention|deportation|access)\b/i,
  },
  {
    topic: /\b(?:abortion|reproductive)\b/i,
    stake: /\b(?:pregnan(?:cy|t)|health|medical care|bodily autonomy|life|safety|rights?|access|family|families)\b/i,
  },
  {
    topic: /\b(?:racism|antisemitism|islamophobia|discrimination|segregation|civil rights|human rights)\b/i,
    stake: /\b(?:equal treatment|rights?|safety|violence|hate|discrimination|segregation|access|belonging|protection|accountability|participation)\b/i,
  },
  {
    topic: /\b(?:gun violence|police violence|policing|criminal justice|protest)\b/i,
    stake: /\b(?:physical safety|violence|death|deaths|injured|harm|accountability|rights?|due process|public trust|protection|communities|families)\b/i,
  },
  {
    topic: /\b(?:public health|healthcare|health care)\b/i,
    stake: /\b(?:health|care|patients?|illness|medical|access|affordability|costs?|safety|life|services|families)\b/i,
  },
  {
    topic: /\b(?:schools?|education)\b/i,
    stake: /\b(?:students?|teachers?|learning|education|school safety|funding|access|privacy|grading|families|equal treatment)\b/i,
  },
];

const GENERAL_PUBLIC_STAKE =
  /\b(?:physical safety|loss of life|basic needs|essential services|equal rights|due process|accountability|discrimination|public health|family unity|medical care|housing|shelter|participation|access|protection|harm|interfaith peace|peacebuilding|reconciliation|mutual trust|religious freedom|safe worship|coexistence|antisemitism|islamophobia)\b/i;

function withoutConfiguredTopic(text: string, topic: string): string {
  const normalized = normalizeText(text);
  const configured = normalizeText(topic);
  return configured ? normalized.replaceAll(configured, " ") : normalized;
}

function hasTopicFamilyStake(fragment: string, topic: string): boolean {
  const body = withoutConfiguredTopic(fragment, topic);
  const family = TOPIC_STAKE_FAMILIES.find(({ topic: pattern }) => pattern.test(topic));
  if (!(family?.stake ?? GENERAL_PUBLIC_STAKE).test(body)) return false;
  // Stakeholder nouns such as "families" and "civilians" identify who is
  // discussed, but do not turn careful-speech advice into a war position.
  if (
    family?.metaSafeStake &&
    META_PROCESS_PATTERN.test(body) &&
    !family.metaSafeStake.test(body)
  ) {
    return false;
  }
  return true;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function positiveModulo(value: number, modulus: number): number {
  return ((Math.trunc(value) % modulus) + modulus) % modulus;
}

function bodyWithoutRoutingQuestion(text: string): string {
  const sentences = text
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.at(-1)?.includes("?")) sentences.pop();
  return sentences.join(" ");
}

function topicWords(topic: string): Set<string> {
  return new Set(normalizeText(topic).split(" ").filter(Boolean));
}

function substantiveObjectTokens(fragment: string, topic: string): string[] {
  const configuredTopicWords = topicWords(topic);
  return normalizeText(fragment)
    .split(" ")
    .map((word) => word.replace(/(?:'s|s')$/, ""))
    .filter((word) =>
      word.length > 2 &&
      !configuredTopicWords.has(word) &&
      !OBJECT_STOP_WORDS.has(word) &&
      !META_PROCESS_WORDS.has(word) &&
      !ABSTRACT_VALUE_WORDS.has(word) &&
      !GENERIC_DEPTH_WORDS.has(word)
    );
}

function hasSubstantiveObject(fragment: string, topic: string): boolean {
  return new Set(substantiveObjectTokens(fragment, topic)).size >= 2;
}

function isConciseTopicPosition(fragment: string, topic: string): boolean {
  const family = TOPIC_STAKE_FAMILIES.find(({ topic: pattern }) => pattern.test(topic));
  if (!family?.conciseStake) return false;
  const tokens = Array.from(new Set(substantiveObjectTokens(fragment, topic)));
  return tokens.length === 1 && family.conciseStake.test(fragment);
}

function hasSubjectStake(fragment: string, topic: string): boolean {
  return (
    (hasSubstantiveObject(fragment, topic) ||
      isConciseTopicPosition(fragment, topic)) &&
    hasTopicFamilyStake(fragment, topic)
  );
}

interface LaneMatch {
  lane: PublicEngagementLane;
  index: number;
}

function findPatternMatches(
  text: string,
  topic: string,
  lane: PublicEngagementLane,
  patterns: readonly RegExp[],
): LaneMatch[] {
  const matches: LaneMatch[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const object = match[1] ?? match[0];
    if (
      hasSubjectStake(object, topic) &&
      (lane !== "competing-obligations" ||
        competingObjectHasTwoSubjectStakes(object, topic)) &&
      (lane !== "unresolved-subject-choice" ||
        unresolvedObjectHasTwoSubjectStakes(object, topic))
    ) {
      matches.push({ lane, index: match.index });
    }
  }
  return matches;
}

function competingObjectHasTwoSubjectStakes(
  fragment: string,
  topic: string,
): boolean {
  const cleaned = fragment
    .replace(/\s+and\s+(?:those|these|both)\b[^.!?]*$/i, "")
    .replace(/,?\s+and\s+i\b[^.!?]*$/i, "")
    .trim();
  const strongSeparator = /\s+(?:against|erase|override|displace|eclipse|cancel out)\s+/i.exec(
    cleaned,
  );
  if (strongSeparator?.index !== undefined) {
    return splitHasTwoSubjectStakes(
      cleaned,
      strongSeparator.index,
      strongSeparator[0].length,
      topic,
    );
  }

  // Prefer the conjunction that introduces the second obligation, rather
  // than an earlier "and" inside lists such as "food, water, and medicine".
  const actionDivider = lastPatternMatch(
    cleaned,
    /\s+(?:and|with)\s+(?=(?:to\s+)?(?:protect|preserve|prioritize|provide|secure|maintain|sustain|ensure|keep|reduce|prevent|restore|fund|support|oppose|accept|reject|allow|deliver|meet|address|avoid|limit|save|hold|respect|defend)(?:s|ed|ing)?\b)/gi,
  );
  if (actionDivider) {
    return splitHasTwoSubjectStakes(
      cleaned,
      actionDivider.index,
      actionDivider.length,
      topic,
    );
  }

  const withIndex = cleaned.toLocaleLowerCase().lastIndexOf(" with ");
  const andIndex = cleaned.toLocaleLowerCase().lastIndexOf(" and ");
  const dividerIndex = Math.max(withIndex, andIndex);
  if (dividerIndex < 0) return false;
  return splitHasTwoSubjectStakes(
    cleaned,
    dividerIndex,
    dividerIndex === withIndex ? 6 : 5,
    topic,
  );
}

interface IndexedDivider {
  index: number;
  length: number;
}

function lastPatternMatch(text: string, pattern: RegExp): IndexedDivider | null {
  let result: IndexedDivider | null = null;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    result = { index: match.index, length: match[0].length };
  }
  return result;
}

function splitHasTwoSubjectStakes(
  text: string,
  dividerIndex: number,
  dividerLength: number,
  topic: string,
): boolean {
  const left = text.slice(0, dividerIndex).replace(/^\s*(?:whether|between)\s+/i, "");
  const right = text.slice(dividerIndex + dividerLength);
  return hasSubjectStake(left, topic) && hasSubjectStake(right, topic);
}

function unresolvedObjectHasTwoSubjectStakes(
  fragment: string,
  topic: string,
): boolean {
  const cleaned = fragment.trim().replace(/^\s*(?:whether|between)\s+/i, "");
  const actionOrDivider = lastPatternMatch(
    cleaned,
    /\s+or\s+(?=(?:to\s+)?(?:protect|preserve|prioritize|provide|secure|maintain|sustain|ensure|keep|reduce|prevent|restore|fund|support|oppose|accept|reject|allow|deliver|meet|address|avoid|limit|save|hold|respect|defend|move)(?:s|ed|ing)?\b)/gi,
  );
  if (actionOrDivider) {
    return splitHasTwoSubjectStakes(
      cleaned,
      actionOrDivider.index,
      actionOrDivider.length,
      topic,
    );
  }

  const orIndex = cleaned.toLocaleLowerCase().lastIndexOf(" or ");
  if (orIndex >= 0) {
    return splitHasTwoSubjectStakes(cleaned, orIndex, 4, topic);
  }

  const actionAndDivider = lastPatternMatch(
    cleaned,
    /\s+and\s+(?=(?:to\s+)?(?:protect|preserve|prioritize|provide|secure|maintain|sustain|ensure|keep|reduce|prevent|restore|fund|support|oppose|accept|reject|allow|deliver|meet|address|avoid|limit|save|hold|respect|defend|move)(?:s|ed|ing)?\b)/gi,
  );
  if (actionAndDivider) {
    return splitHasTwoSubjectStakes(
      cleaned,
      actionAndDivider.index,
      actionAndDivider.length,
      topic,
    );
  }

  const andIndex = cleaned.toLocaleLowerCase().lastIndexOf(" and ");
  return andIndex >= 0 && splitHasTwoSubjectStakes(cleaned, andIndex, 5, topic);
}

const PROTECTED_OUTCOME_PATTERNS = [
  /\bmy\s+(?:(?:first|main|highest|central)\s+)?priority\b[^.!?]{0,90}?\bis\s+([^.!?]+)/i,
  /\bmy\s+protected\s+outcome\s+is\s+([^.!?]+)/i,
  /\bi(?:['’]d|\s+(?:would|will|do))?\s+(?:first\s+)?(?:prioritize|protect|preserve|prevent|reduce|ensure|safeguard)\s+([^.!?]+)/i,
  /\bi\s+need\s+to\s+protect\s+(?:one\s+)?(?:different\s+)?human\s+outcome\s*(?:[-–—:]\s*)+([^.!?]+)/i,
  /\bwhat\s+i\s+(?:would\s+)?(?:protect|prioritize|preserve)\s+(?:first|most)?\s*(?:is\s+)?([^.!?]+)/i,
  /\b(?:the\s+)?(?:(?:immediate|central|main|first)\s+)?human\s+outcome\s+i\s+(?:would|have\s+to|need\s+to|want\s+to)\s+(?:protect|keep|put)\s+first\s+is\s+([^.!?]+)/i,
  /\b(?:that|this)\s+is\s+(?:the\s+)?(?:(?:immediate|central|main|first)\s+)?human\s+outcome\s+i\s+(?:would|have\s+to|need\s+to|want\s+to)\s+(?:protect|keep|put)\s+first\s*[:,]?\s*([^.!?]+)/i,
  /\bmy\s+position\s+is\s+to\s+(?:prioritize|protect|preserve|keep|treat)\s+([^.!?]+)/i,
  /\b(?:the\s+)?outcome\s+i\s+(?:need|want|have)\s+to\s+(?:protect|preserve|prioritize)\s+is\s+([^.!?]+)/i,
  /\bi\s+(?:also\s+)?hold\s+(?:a\s+)?(?:hard\s+)?obligation\s+to\s+([^.!?]+)/i,
  /\bthe\s+competing\s+obligation\s+i\s+hold\s+is\s+(?:to\s+)?([^.!?]+)/i,
  /\bi\s+(?:would\s+)?name\s+my\s+(?:first|second|next|other)\s+priority\s+as\s+([^.!?]+)/i,
  /\bi\s+(?:would\s+)?put\s+([^.!?]+?)\s+first\b/i,
  /\bi(?:['’]d|\s+would)\s+set\s+(?:a\s+)?(?:hard\s+)?minimum\s+(?:on|for)\s+([^.!?]+)/i,
  /\bi\s+(?:decide|start)\s+by\s+(?:putting|protecting|prioritizing)\s+([^.!?]+?)(?:\s+first)?[.!?]/i,
  /\bi\s+start\s+with\s+([^.!?]+?)(?:\s+first)?[.!?]/i,
] as const;

const COMPETING_OBLIGATION_PATTERNS = [
  /\bi\s+(?:am|feel|remain)\s+(?:torn|caught|divided)\s+between\s+([^.!?]+\band\b[^.!?]+)/i,
  /\bi\s+(?:would\s+)?(?:weigh|balance)\s+([^.!?]+\b(?:against|with)\b[^.!?]+)/i,
  /\bi\s+(?:cannot|can't|will not|won't|would not|wouldn't)\s+(?:let|allow)\s+([^.!?]+\b(?:erase|override|displace|eclipse|cancel out)\b[^.!?]+)/i,
  /\b(?:two|both)\s+(?:legitimate\s+)?(?:obligations|outcomes|priorities|duties)\b[^.!?]{0,40}?\b(?:for me|i)\b([^.!?]+)/i,
  /\bi\s+(?:also\s+)?(?:carry|hold|see|feel)\s+(?:two|both)\s+(?:legitimate\s+)?(?:obligations|outcomes|priorities|duties)\s+(?:at\s+once|together)?\s*:\s*([^.!?]+\band\b[^.!?]+)/i,
  /\bfor\s+me,?\s+(?:two|both)\s+(?:legitimate\s+)?(?:obligations|outcomes|priorities|duties)\s+(?:sit|remain|are)\s+(?:in\s+tension|live|open)\s*:\s*([^.!?]+\band\b[^.!?]+)/i,
] as const;

const BOUNDED_RESPONSE_PATTERNS = [
  /\bi(?:['’]d|\s+(?:would|will|do))?\s+(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose)\s+([^.!?]+)/i,
  /\bmy\s+position\s+is\s+that\s+i\s+(?:(?:can|would|will)\s+)?(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose|work\s+for)\s+([^.!?]+)/i,
  /\bmy\s+condition\s+for\s+support\s+is\s+(?:[^.!?:]{1,30}:\s*)?([^.!?]+)/i,
  /\bmy\s+boundary\s+is\s+(?:that\s+)?i\s+(?:cannot|can['’]t|will\s+not|won['’]t|would\s+not|wouldn['’]t)\s+(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose)\s+([^.!?]+)/i,
  /\bi(?:['’]d|\s+would)?\s+judge\s+([^.!?]+)/i,
  /\bmy\s+(?:test|criterion|standard)\b[^.!?]{0,60}?\bis\s+([^.!?]+)/i,
] as const;

const UNRESOLVED_CHOICE_PATTERNS = [
  /\b(?:the\s+)?(?:question|choice|dilemma)\s+i\s+(?:cannot|can't|have not|haven't|do not|don't)\s+(?:resolve|settle|answer)\s+(?:is\s+)?([^.!?]+\b(?:whether|or)\b[^.!?]+)/i,
  /\bi\s+(?:am|remain)\s+(?:unsure|uncertain|unresolved)\s+(?:about\s+)?(?:whether|between)\s+([^.!?]+\b(?:or|and)\b[^.!?]+)/i,
  /\b(?:the\s+)?(?:hard\s+)?choice\s+(?:for\s+me\s+)?is\s+(?:deciding\s+)?whether\s+([^.!?]+\bor\b[^.!?]+)/i,
  /\bmy\s+unresolved\s+(?:question|choice|dilemma)\s+is\s+whether\s+([^.!?]+\bor\b[^.!?]+)/i,
  /\bthe\s+unresolved\s+(?:question|choice|dilemma)\s+(?:in\s+[^.!?]{1,80}?\s+)?for\s+me\s+is\s+whether\s+([^.!?]+\bor\b[^.!?]+)/i,
] as const;

function engagementLaneMatches(text: string, topic: string): LaneMatch[] {
  const body = bodyWithoutRoutingQuestion(text);
  return [
    ...findPatternMatches(
      body,
      topic,
      "protected-human-outcome",
      PROTECTED_OUTCOME_PATTERNS,
    ),
    ...findPatternMatches(
      body,
      topic,
      "competing-obligations",
      COMPETING_OBLIGATION_PATTERNS,
    ),
    ...findPatternMatches(
      body,
      topic,
      "bounded-response",
      BOUNDED_RESPONSE_PATTERNS,
    ),
    ...findPatternMatches(
      body,
      topic,
      "unresolved-subject-choice",
      UNRESOLVED_CHOICE_PATTERNS,
    ),
  ];
}

/** Detect every fact-free engagement form realized by a turn. */
export function detectPublicEngagementLanes(
  text: string,
  topic: string,
): PublicEngagementLane[] {
  const matches = engagementLaneMatches(text, topic)
    .sort((left, right) => left.index - right.index);
  return Array.from(new Set(matches.map((match) => match.lane)));
}

/** Detect the first subject-level engagement form in the visible dialogue. */
export function detectPrimaryPublicEngagementLane(
  text: string,
  topic: string,
): PublicEngagementLane | null {
  return detectPublicEngagementLanes(text, topic)[0] ?? null;
}

/** A diagnostic signal; meta language is allowed when a subject lane exists. */
export function isMetaDominantPublicEngagement(
  text: string,
  topic: string,
): boolean {
  if (!isDifficultPublicTopic(topic)) return false;
  const body = bodyWithoutRoutingQuestion(text);
  const lanes = detectPublicEngagementLanes(body, topic);
  if (META_PROCESS_PATTERN.test(body) && lanes.length === 0) return true;

  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const metaSentenceCount = sentences.filter((sentence) =>
    META_PROCESS_PATTERN.test(sentence)).length;
  const subjectSentenceCount = sentences.filter((sentence) =>
    detectPublicEngagementLanes(sentence, topic).length > 0).length;
  return metaSentenceCount >= 2 && metaSentenceCount > subjectSentenceCount;
}

/**
 * Require a first-person, subject-level proposition for difficult public
 * topics. This does not require current facts, eyewitness experience, or a
 * partisan conclusion; a value judgment, conditional, or dilemma is enough.
 */
export function subjectLevelEngagementRejectionReasons(
  text: string,
  topic: string,
  options: SubjectLevelEngagementOptions = {},
): string[] {
  if (!isDifficultPublicTopic(topic)) return [];
  const body = bodyWithoutRoutingQuestion(text).trim();
  if (!body) {
    return [
      "Response must state a first-person subject-level outcome, competing obligation, bounded response, or unresolved choice.",
    ];
  }

  const lanes = detectPublicEngagementLanes(body, topic);
  const reasons: string[] = [];
  const metaDominant = isMetaDominantPublicEngagement(body, topic);
  if (lanes.length === 0) {
    reasons.push(
      metaDominant
        ? "Response remains at the level of dialogue, representation, or limits on knowledge instead of stating a subject-level position."
        : "Response must state a first-person subject-level outcome, competing obligation, bounded response, or unresolved choice.",
    );
  } else if (metaDominant) {
    reasons.push(
      "Response is dominated by dialogue process or limits on knowledge; make the subject-level position the main idea.",
    );
  }
  if (options.requiredLane && !lanes.includes(options.requiredLane)) {
    const label = PUBLIC_ENGAGEMENT_LANES.find(
      (entry) => entry.id === options.requiredLane,
    )!.label;
    reasons.push(`Response does not realize its assigned engagement lane: ${label}.`);
  }
  return reasons;
}
