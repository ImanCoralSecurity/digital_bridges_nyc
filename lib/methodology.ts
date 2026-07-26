// Reflective Structured Dialogue (RSD) methodology + conflict-sensitive guardrails.
// Pure module (no I/O) so it is deterministic and unit-testable.
//
// Enforcement is two-layered:
//   1. Prompt-level: methodologyPreamble() is appended to every agent prompt.
//   2. Turn-level: validateTurn() flags content that strays from the method,
//      for regeneration and/or human review.
//
// The keyword heuristics below are intentionally conservative and are meant to
// *flag for review*, not to be a final arbiter. A production deployment can
// additionally route turns through an LLM classifier (see lib/evaluation.ts,
// which uses the judge agent through the run's selected CLI provider).

import type { ConversationTag, TurnFlag, TurnSignals } from "./types";

export const METHODOLOGY_VERSION = "1.15.1";

/** The explicit, auditable rule set (US-4.1). */
export const RSD_RULES = [
  "Address the session topic directly through personal or family experience, feelings, values, or life in New York City. Political and geopolitical topics are allowed; never assign collective blame.",
  "Use 'I' statements. Own your feelings and memories rather than characterizing groups.",
  "Practice curiosity by reflecting another person's actual words accurately and, when useful, asking a focused question about lived experience.",
  "Stay with meaningful differences and keep returning to the session topic; never replace it with a safer generic theme or force common ground.",
  "No dehumanizing, mocking, or hateful language of any kind.",
  "Honor the ground-rule agreements set by the facilitator at the opening of the session.",
] as const;

/** Shared preamble appended to persona and facilitator prompts (US-4.2). */
export function methodologyPreamble(options: { challengeTurn?: boolean } = {}): string {
  const rules = options.challengeTurn
    ? RSD_RULES.map((rule, index) => {
        if (index === 2) {
          return "Remain open to later curiosity, but state this scheduled challenge without asking a question; the facilitator will invite reflection and repair next.";
        }
        if (index === 3) {
          return "Do not force common ground in this challenge turn; name one specific difference while respecting every person's memory and identity.";
        }
        return rule;
      })
    : RSD_RULES;
  return [
    "You are participating in a Reflective Structured Dialogue (RSD) — a facilitated,",
    "conflict-sensitive conversation. Follow these rules strictly:",
    ...rules.map((r, i) => `${i + 1}. ${r}`),
    "",
    "Do not avoid a selected topic because it is political or difficult. Discuss it directly",
    "through first-person priorities, difficult choices, real human outcomes, and values.",
    "Uncertainty and dialogue process may be secondary, but cannot replace a clear view about the issue itself.",
    "Keep the persona's stated communication style distinct. Never expose rubric or scaffold labels; express every idea in ordinary spoken language.",
    "Outside the facilitator's one opening topic sentence, paraphrase a question-shaped session title rather than copying it verbatim. Capitalize identities and places naturally.",
    "Treat the persona profile as the complete biography. Do not invent people, relationships, quotes, teachings, events, routines, locations, direct exposure, trauma, travel, or loss.",
    "Keep each reply to 2-4 sentences.",
  ].join("\n");
}

// --- Turn-level validation -------------------------------------------------

// Topic vocabulary is never a methodology violation by itself. Political and
// geopolitical subjects are permitted; these patterns target harmful ways of
// speaking about people rather than words such as "war" or "ceasefire".
const METHODOLOGY_PATTERNS: Array<{ code: string; re: RegExp; reason: string }> = [
  {
    code: "collective-blame",
    re: /\b(you people|your people|they always|they never|all of them|your side|our side|those people)\b/i,
    reason: "Assigns collective blame or speaks in group generalizations.",
  },
  {
    code: "dehumanizing-language",
    re: /\b(animals?|vermin|subhuman|savages?|cockroach|barbarians?)\b/i,
    reason: "Contains potentially dehumanizing language.",
  },
];

const HARD_UNSAFE_PATTERNS: Array<{ code: string; re: RegExp; reason: string }> = [
  {
    code: "dehumanizing-language",
    re: /\b(animals?|vermin|subhuman|savages?|cockroach(?:es)?|barbarians?)\b/i,
    reason: "Contains potentially dehumanizing language.",
  },
  {
    code: "threat-or-incitement",
    // Do not classify ordinary reporting about war ("an attack killed
    // civilians", "people were hurt") as a threat.  This guardrail is for a
    // speaker's threat, an exhortation, or explicit advocacy of violence.
    re: /\b(?:(?:i|we)\s+(?:will|would|should|must|need\s+to|want\s+to|plan\s+to|(?:am|are)\s+going\s+to)\s+(?:kill|hurt|attack|destroy)|(?:you|they|he|she)\s+(?:should|must|need\s+to|ought\s+to|have\s+to)\s+(?:kill|hurt|attack|destroy)|(?:kill|hurt|attack|destroy)\s+(?:you|him|her|them)|wipe\s+(?:them|you)\s+out|make\s+(?:them|you)\s+pay|(?<!cannot\s)(?<!can't\s)(?<!not\s)(?<!never\s)(?<!refuse\sto\s)(?:encourage|support|incite|call\s+for|commit|use)\s+(?:acts?\s+of\s+)?violence\s+against)\b/i,
    reason: "Contains a threat or language encouraging violence.",
  },
  {
    code: "identity-slur",
    re: /\b(kike|raghead|towelhead)\b/i,
    reason: "Contains an identity-based slur.",
  },
];

const ESCALATION_MARKERS: Array<{ reason: string; re: RegExp }> = [
  {
    reason: "expresses first-person tension or disagreement",
    re: /\b(i (?:feel (?:frustrated|angry|unheard|uneasy)|am (?:angry|furious|fed up|uneasy)|worry|disagree|can(?:not|'t) agree|do not agree|don't agree|need to push back))\b/i,
  },
  {
    reason: "uses a first-person refusal or firm challenge",
    re: /\b(i (?:can(?:not|'t) (?:accept|endorse|share)|can(?:not|'t)\s+(?:make|treat)\b[^.!?]{0,80}\b(?:as\s+)?(?:(?:the|my|our|your|its)\s+)?(?:only|sole)\s+(?:(?:first|central|primary|protected)\s+)?(?:duty|obligation|priority|outcome|answer|response|condition|requirement|commitment|concern|stake|goal|standard|criterion|focus|result)\b|do not (?:accept|endorse)|don't (?:accept|endorse)|refuse to|will not|won't|need to challenge|want to challenge|question whether))\b/i,
  },
  {
    reason: "states an unresolved conflict between subject priorities",
    re: /\b(?:(?:hard\s+)?unresolved\s+choice\s+between|(?:two|both)\s+(?:legitimate\s+)?(?:obligations|priorities|outcomes)\b[^.!?]{0,110}\b(?:tension|cannot\s+set|can't\s+set|no\s+clean\s+cut)|no\s+clean\s+cut\b[^.!?]{0,100}\b(?:set|put)\b[^.!?]{0,50}\baside|my\s+(?:full\s+)?priority\s+(?:differs|is\s+not))\b/i,
  },
  {
    reason: "states a firm first-person boundary",
    re: /\b(?:my (?:hard )?boundary is|i (?:set|hold|keep) (?:a|the|this) (?:hard )?boundary|i hold myself to (?:a|the|this) (?:hard )?boundary)\b/i,
  },
  {
    reason: "challenges a specific framing or assumption",
    re: /\b(that (?:assumption|framing|claim|response) (?:is|feels|seems)|the (?:leap|jump) from|should not conclude|moving too quickly|too easy|smooth(?:s|ing)? over|leaves? out|reduced to|brushed aside|not being heard)\b/i,
  },
  {
    reason: "uses adversarial or dismissive language",
    re: /\b(you (?:are|aren't|are not) listening|stop pretending|be honest|hard to trust|no point|naive)\b/i,
  },
];

// A controlled challenge should not have to stack two canned disagreement
// phrases merely to satisfy the dynamics classifier. One direct, interpersonal
// difference is enough when the same turn also states a substantive position
// in one of the public-topic engagement forms. These patterns deliberately do
// not count a subject position on its own as escalation, and they exclude
// dialogue-process-only objects such as "careful conversation".
const EXPLICIT_CONTROLLED_DIFFERENCE_OR_REFUSAL =
  /\b(?:i\s+(?:disagree\b|can(?:not|'t)\s+agree\b|do\s+not\s+agree\b|don't\s+agree\b|can(?:not|'t)\s+(?:accept|endorse|share)\s+(?:that|this|your)\b|do\s+not\s+(?:accept|endorse|share)\s+(?:that|this|your)\b|don't\s+(?:accept|endorse|share)\s+(?:that|this|your)\b|can(?:not|'t)\s+(?:make|treat)\b[^.!?]{0,80}\b(?:as\s+)?(?:(?:the|my|our|your|its)\s+)?(?:only|sole)\s+(?:(?:first|central|primary|protected)\s+)?(?:duty|obligation|priority|outcome|answer|response|condition|requirement|commitment|concern|stake|goal|standard|criterion|focus|result)\b|need\s+to\s+(?:push\s+back|challenge)\b|want\s+to\s+challenge\b)|my\s+(?:hard\s+)?boundary\s+is\b|my\s+(?:full\s+)?priority\s+differs\b|(?:your|that|this)\s+(?:point|priority|framing|claim|response|position)\b[^.!?]{0,60}\b(?:leaves?\s+out|overlooks?|omits?)\b)/i;

const CONTROLLED_CHALLENGE_REFERENCE =
  /^(?!(?:from|in|for|on|when|today|the|my|this|that)\b)\s*[\p{Lu}][\p{L}'-]*(?:\s+[\p{Lu}][\p{L}'-]*)?\s*,(?=[^.!?]{0,100}\bi\b)|\b(?:you\s+(?:framed|said|argued|claimed|prioritized|put|treated|described|named)|your\s+(?:point|priority|position|framing|claim|response|conclusion|ranking))\b/iu;

// Two emotional or boundary markers can coexist in an ordinary first-person
// position without constituting an interpersonal escalation. The generic
// multi-marker path therefore also needs language that directs the difference
// at a prior contribution or at the circle. Hard-unsafe language is handled
// before this check and remains escalating regardless of a reference.
const INTERPERSONAL_ESCALATION_REFERENCE =
  /\b(?:(?:that|this|your)\s+(?:assumption|frame|framing|claim|response|reply|point|priority|position|conclusion|ranking|image|memory|story|detail|experience)\b|(?:the|this)\s+(?:circle|group)\b[^.!?]{0,100}\b(?:infer|assume|conclude|decide|treat|take|read|listen|hear|dismiss|erase|overlook)|(?:possible\s+)?group\s+inference\b|you\s+(?:are|aren't|are\s+not)\s+listening|not\s+being\s+heard|stop\s+pretending|be\s+honest)\b/i;

const NATURAL_SUBJECT_POSITION_PATTERNS = [
  /\bmy\s+(?:(?:first|main|highest|central)\s+)?priority\b[^.!?]{0,90}?\bis\s+([^.!?]+)/i,
  /\bmy\s+protected\s+outcome\s+is\s+([^.!?]+)/i,
  /\bi\s+need\s+to\s+protect\s+(?:one\s+)?(?:different\s+)?human\s+outcome\s*(?:[-–—:]\s*)+([^.!?]+)/i,
  /\bi\s+(?:also\s+)?hold\s+(?:a\s+)?(?:hard\s+)?obligation\s+to\s+([^.!?]+)/i,
  /\bthe\s+competing\s+obligation\s+i\s+hold\s+is\s+(?:to\s+)?([^.!?]+)/i,
  /\bi\s+(?:would\s+)?name\s+my\s+(?:first|second|next|other)\s+priority\s+as\s+([^.!?]+)/i,
  /\bi(?:['’]d|\s+would)\s+set\s+(?:a\s+)?(?:hard\s+)?minimum\s+(?:on|for)\s+([^.!?]+)/i,
  /\b(?:the\s+)?outcome\s+i\s+(?:need|want|have)\s+to\s+(?:protect|preserve|prioritize)\s+is\s+([^.!?]+)/i,
  /\bi\s+(?:would\s+)?put\s+([^.!?]+?)\s+first\b/i,
  /\bfor\s+me,?\s+(?:two|both)\s+(?:legitimate\s+)?(?:obligations|outcomes|priorities|duties)\s+(?:sit|remain|are)\s+(?:in\s+tension|live|open)\s*:\s*([^.!?]+\band\b[^.!?]+)/i,
  /\bmy\s+unresolved\s+(?:question|choice|dilemma)\b[^.!?]{0,60}?\bis\s+whether\s+([^.!?]+\bor\b[^.!?]+)/i,
  /\bthe\s+(?:question|choice|dilemma)\s+i\s+(?:cannot|can't)\s+(?:resolve|settle)\b[^.!?]{0,60}?\bis\s+whether\s+([^.!?]+\bor\b[^.!?]+)/i,
  /\bi\s+(?:am|remain)\s+(?:unsure|uncertain)\s+whether\s+([^.!?]+\bor\b[^.!?]+)/i,
  /\b(?:hard\s*,?\s+)?unresolved\s+choice\s+between\s+([^.!?]+\band\b[^.!?]+)/i,
  /\bmy\s+(?:test|criterion|standard)\b[^.!?]{0,60}?\bis\s+([^.!?]+)/i,
  /\bmy\s+position\s+is\s+that\s+i\s+(?:(?:can|would|will)\s+)?(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose|work\s+for)\s+([^.!?]+)/i,
  /\bmy\s+condition\s+for\s+support\s+is\s+(?:[^.!?:]{1,30}:\s*)?([^.!?]+)/i,
  /\bmy\s+boundary\s+is\s+(?:that\s+)?i\s+(?:cannot|can['’]t|will\s+not|won['’]t|would\s+not|wouldn['’]t)\s+(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose)\s+([^.!?]+)/i,
  /\bi\s+(?:would\s+)?(?:support|oppose|reject|accept|back|endorse|favor|favour|permit|allow|choose)\s+([^.!?]+)/i,
] as const;

const DIALOGUE_PROCESS_POSITION_OBJECT =
  /\b(?:conversation|dialogue|listening|speaking|wording|framing|represent(?:ing|ation)?|what\s+(?:i|we|people)\s+(?:can|cannot|can't)\s+(?:know|claim)|uncertainty\s+about\s+(?:what|how)\s+(?:i|we|people))\b/i;

const CONCRETE_PUBLIC_POSITION_OBJECT =
  /\b(?:cease[-\s]?fire|truce|civilians?|famil(?:y|ies)|life|lives|physical\s+safety|civilian\s+safety|food|water|medicine|medical|health|care|treatment|shelter|housing|rent|hunger|aid|recovery|displaced|displacement|refugees?|rights?|accountability|students?|teachers?|learning|privacy|data|jobs?|workers?|wages?|flood|heat|emissions?|pollution|energy|infrastructure|voters?|ballots?|legal\s+review|due\s+process|access|protection|violence|harm|interfaith\s+peace|peacebuilding|reconciliation|mutual\s+trust|cross[-\s]community\s+relationships?|religious\s+freedom|safe\s+worship|equal\s+(?:treatment|belonging)|hate\s+prevention|antisemitism|islamophobia|joint\s+projects?|shared\s+institutions?|coexistence|civic\s+participation)\b/i;

const SUBJECT_POSITION_STOP_WORDS = new Set([
  "about", "after", "against", "and", "because", "before", "between",
  "both", "during", "from", "have", "into", "only", "that", "their",
  "them", "these", "this", "those", "through", "with", "without", "would",
]);

function hasSubstantiveSubjectPositionObject(object: string): boolean {
  const tokens = object
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SUBJECT_POSITION_STOP_WORDS.has(token));
  const concretePublicPosition = CONCRETE_PUBLIC_POSITION_OBJECT.test(object);
  if (new Set(tokens).size < 2) return concretePublicPosition;
  return (
    !DIALOGUE_PROCESS_POSITION_OBJECT.test(object) ||
    concretePublicPosition
  );
}

function hasNaturalSubjectPosition(text: string): boolean {
  return NATURAL_SUBJECT_POSITION_PATTERNS.some((pattern) => {
    const match = pattern.exec(text);
    return Boolean(match?.[1] && hasSubstantiveSubjectPositionObject(match[1]));
  });
}

const DEESCALATION_MARKERS: Array<{ reason: string; re: RegExp }> = [
  { reason: "acknowledges emotion or impact", re: /\b(i hear|i can hear|i understand|i appreciate|that sounds|the frustration)\b/i },
  { reason: "slows or repairs the exchange", re: /\b(let(?:'s| us) pause|slow down|take a breath|lower the temperature|reset|repair)\b/i },
  { reason: "returns to first-person experience", re: /\b(own experience|speak from|personal experience|what happened in your life)\b/i },
  { reason: "invites open curiosity", re: /\b(help us understand|tell us more|what would(?=[^.!?]*\?)|what do you need|can you share)\b|\?\s*$/i },
  { reason: "offers apology or reflective listening", re: /\b(i(?:'m| am) sorry|i want to understand|i(?:'m| am) listening|reflect back|make room for)\b/i },
];

export interface ConversationClassification {
  tag: ConversationTag;
  reasons: string[];
  hardUnsafe: TurnFlag[];
}

/** Classify dialogue dynamics separately from methodology adherence. */
export function classifyConversation(text: string): ConversationClassification {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const hardUnsafe = HARD_UNSAFE_PATTERNS
    .filter((pattern) => pattern.re.test(normalized))
    .map(({ code, reason }) => ({ code, reason }));
  if (hardUnsafe.length) {
    return {
      tag: "escalating",
      reasons: hardUnsafe.map((flag) => flag.reason),
      hardUnsafe,
    };
  }

  const escalating = ESCALATION_MARKERS.filter((pattern) => pattern.re.test(normalized));
  const deescalating = DEESCALATION_MARKERS.filter((pattern) => pattern.re.test(normalized));
  const explicitDifferenceIndex = normalized.search(
    EXPLICIT_CONTROLLED_DIFFERENCE_OR_REFUSAL,
  );
  const firstDeescalationIndex = deescalating.reduce(
    (earliest, pattern) => {
      const index = normalized.search(pattern.re);
      return index >= 0 ? Math.min(earliest, index) : earliest;
    },
    Number.POSITIVE_INFINITY,
  );
  const onlyLaterBriefAcknowledgment =
    deescalating.length === 1 &&
    deescalating[0]?.reason === "acknowledges emotion or impact" &&
    explicitDifferenceIndex >= 0 &&
    firstDeescalationIndex > explicitDifferenceIndex;
  const naturalControlledChallenge =
    escalating.length > 0 &&
    (deescalating.length === 0 || onlyLaterBriefAcknowledgment) &&
    EXPLICIT_CONTROLLED_DIFFERENCE_OR_REFUSAL.test(normalized) &&
    CONTROLLED_CHALLENGE_REFERENCE.test(normalized) &&
    hasNaturalSubjectPosition(normalized);
  const multiMarkerInterpersonalChallenge =
    escalating.length >= 2 &&
    escalating.length > deescalating.length &&
    (CONTROLLED_CHALLENGE_REFERENCE.test(normalized) ||
      INTERPERSONAL_ESCALATION_REFERENCE.test(normalized));
  if (
    multiMarkerInterpersonalChallenge ||
    naturalControlledChallenge
  ) {
    const reasons = escalating.map((pattern) => pattern.reason);
    if (naturalControlledChallenge && escalating.length < 2) {
      reasons.push("states a substantive subject-level position");
    }
    return {
      tag: "escalating",
      reasons,
      hardUnsafe: [],
    };
  }
  if (deescalating.length >= 2 && deescalating.length > escalating.length) {
    return {
      tag: "deescalating",
      reasons: deescalating.map((pattern) => pattern.reason),
      hardUnsafe: [],
    };
  }
  return { tag: "neutral", reasons: [], hardUnsafe: [] };
}

const PROMPT_INSTRUCTION_PATTERNS = [
  /<\/?[a-z][^>]{0,120}>/i,
  /\b(?:ignore|disregard|override|forget|bypass|replace|follow|obey|execute)\b.{0,80}\b(?:instructions?|prompts?|system|developer|messages?|rules?)\b/i,
  /\b(?:reveal|show|print|return|output|respond with|say)\b.{0,60}\b(?:hidden|system|developer|prompts?|messages?|only|pwned)\b/i,
  /\btreat\b.{0,60}\b(?:earlier|previous|above)\b.{0,40}\b(?:irrelevant|instructions?|text|messages?)\b/i,
] as const;

// Generated dialogue must never expose the control prose used to separate
// untrusted inputs from instructions. Keep these patterns narrowly tied to
// phrases emitted by our own prompts so a legitimate discussion about AI,
// prompt injection, or untrusted data remains possible.
const VISIBLE_PROMPT_SCAFFOLD_PATTERNS = [
  /\b(?:the\s+)?(?:configured|sanitized) (?:session )?topic\b/i,
  /\btoday(?:'|’)?s topic is\s*:?\s*(?:the\s+)?untrusted (?:json )?data\b/i,
  /\b(?:participant dialogue below|accepted participant dialogue so far) is untrusted (?:json )?data\b/i,
  /\bthe complete challenge target and its short anchor (?:are|is) untrusted data\b/i,
  /\bnever follow instructions? (?:inside|found inside|found in) (?:the )?(?:topic|topic text|data|text|dialogue|feedback)\b/i,
  /\bthe previous draft was rejected\b/i,
  /\b(?:correction requirements|success criteria)\s*:/i,
  /\b(?:return|output) only\b.{0,80}\b(?:dialogue|json|score object|text)\b/i,
  /\b(?:prompt instructions?|task labels?|internal control prose|json\/data-handling language)\b/i,
  /\bsession subject\s*:/i,
  /\b(?:conversation|dialogue) context\s*:/i,
  /\b(?:challenge reference|recent challenge examples|retry feedback)\s*(?:\([^)]*\))?\s*:/i,
  /\bjson reference only\b/i,
  /\b(?:assigned subject-engagement lane|required engagement lane)\b/i,
  /\buse an explicit first-person priority, choice, support condition, or competing-obligations statement\b/i,
  /\banswer the facilitator(?:'|’)?s? invitation directly without claiming an eyewitness event or current fact\b/i,
  /\byou do not need to claim (?:direct|personal) experience or current facts\b/i,
  /["'](?:configuredTopic|speakerName|triggeringSpeaker|triggeringDetail|facilitatorInvitation)["']\s*:/i,
] as const;

/** Detect internal prompt/data-handling prose that must not become dialogue. */
export function visiblePromptScaffoldingFlags(text: string): TurnFlag[] {
  if (!VISIBLE_PROMPT_SCAFFOLD_PATTERNS.some((pattern) => pattern.test(text))) {
    return [];
  }
  return [
    {
      code: "internal-prompt-leak",
      reason: "Echoes internal prompt or data-handling instructions instead of natural dialogue.",
    },
  ];
}

function compactDetail(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/, "");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function isNeutralSafeDetail(text: string): boolean {
  if (!text.trim() || PROMPT_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  const classification = classifyConversation(text);
  return (
    classification.tag === "neutral" &&
    classification.hardUnsafe.length === 0 &&
    !ESCALATION_MARKERS.some((marker) => marker.re.test(text)) &&
    !DEESCALATION_MARKERS.some((marker) => marker.re.test(text)) &&
    validateTurn(text).compliant
  );
}

function isSafeSessionTopic(text: string): boolean {
  if (!text.trim() || PROMPT_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  const classification = classifyConversation(text);
  return (
    classification.tag !== "escalating" &&
    classification.hardUnsafe.length === 0 &&
    !METHODOLOGY_PATTERNS.some((pattern) => pattern.re.test(text))
  );
}

/**
 * Preserve a complete configured session topic when it is safe to show.
 * Unlike a copied participant detail, a topic may naturally be a question or
 * contain several sentences, so de-escalation markers do not make it unsafe.
 */
export function safeSessionTopic(
  source: string | undefined,
  fallback = "a personal experience of belonging in New York City",
  max = 500,
): string {
  const normalized = (source ?? "").replace(/\s+/g, " ").trim();
  if (isSafeSessionTopic(normalized)) return compactDetail(normalized, max);

  const safeFallback = fallback.replace(/\s+/g, " ").trim();
  if (isSafeSessionTopic(safeFallback)) return compactDetail(safeFallback, max);
  return "today's discussion";
}

/**
 * Extract one short, neutral detail that generated dialogue can safely refer to.
 *
 * Dynamics markers in copied participant language can otherwise change the
 * classification of the new speaker's response. Unsafe, polarizing, or
 * instruction-like source text is therefore never echoed by local generators.
 */
export function safeContextDetail(
  source: string | undefined,
  fallback = "today's discussion",
  max = 110,
  preferQuoted = false,
): string {
  const normalized = (source ?? "").replace(/\s+/g, " ").trim();
  const quoted = Array.from(normalized.matchAll(/["“]([^"”]{3,180})["”]/g)).map(
    (match) => match[1],
  );
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const storyFirst = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score:
        (adherenceSignals(sentence).personalHistory ? 2 : 0) +
        (adherenceSignals(sentence).iStatement ? 1 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ sentence }) => sentence);
  const candidates = preferQuoted
    ? [...quoted, ...storyFirst]
    : [...storyFirst, ...quoted];
  for (const candidate of candidates) {
    if (isNeutralSafeDetail(candidate)) return compactDetail(candidate, max);
  }

  const safeFallback = fallback.replace(/\s+/g, " ").trim();
  if (isNeutralSafeDetail(safeFallback)) return compactDetail(safeFallback, max);
  return "today's discussion";
}

/** Detect the positive methodology signals we want to encourage (US-4.4). */
export function adherenceSignals(text: string): TurnSignals {
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const t = normalized.toLowerCase();
  const iStatement =
    /\bi\s+(feel|felt|think|thought|remember|believe|grew\s+up|learned|worry|hope|wish|miss|love|used\s+to|disagree|need|want|question|refuse|can(?:not|'t)|do\s+not|don't)\b/i.test(
      normalized,
    ) ||
    /(?:^|[.!?]\s+)i(?:\s+|['’](?:m|ve|d|ll|re)\b)/i.test(normalized) ||
    /\bi['’](?:m|ve|d|ll|re)\b/i.test(normalized);
  const personalHistory =
    /\b(?:my|our)\s+(?:aunt|uncle|sister|brother|siblings?|mother|father|mom|dad|parents?|family|grand(?:mother|father|ma|pa|dad)|grandparents?|childhood|upbringing|hometown|village|kitchen|home|household)\b/i.test(
      t,
    ) ||
    /\b(?:when i was|as a child|i grew up|i was raised|born and raised|in my(?: [\p{L}'-]+){0,4} (?:family|home|childhood|upbringing|household))\b/iu.test(
      normalized,
    );
  const curiosityQuestion = normalized.includes("?") && /\byou(r)?\b/i.test(normalized);
  return { iStatement, personalHistory, curiosityQuestion };
}

export interface TurnValidation {
  compliant: boolean;
  flags: TurnFlag[];
  signals: TurnSignals;
}

/** Validate a single turn against the methodology (US-4.3). */
export function validateTurn(text: string): TurnValidation {
  const flags: TurnFlag[] = visiblePromptScaffoldingFlags(text);
  for (const p of METHODOLOGY_PATTERNS) {
    if (p.re.test(text)) flags.push({ code: p.code, reason: p.reason });
  }
  return {
    compliant: flags.length === 0,
    flags,
    signals: adherenceSignals(text),
  };
}

/** Corrective instruction used when asking an agent to regenerate a flagged turn. */
export function regenerationNudge(
  flags: TurnFlag[],
  questionMode: "ask-next" | "no-question" = "ask-next",
): string {
  return [
    "Your previous reply drifted from the methodology:",
    ...flags.map((f) => `- ${f.reason}`),
    "Rewrite it using first-person language and only facts, values, or memories explicitly present in the supplied persona profile.",
    "Do not invent a family event, witnessed scene, routine, relationship, or topical experience.",
    questionMode === "ask-next"
      ? "End with the one focused question to the assigned next speaker required by the original task."
      : "End with a reflective statement and do not ask a question.",
  ].join("\n");
}
