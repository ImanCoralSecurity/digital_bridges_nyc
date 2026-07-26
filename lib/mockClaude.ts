// Deterministic mock generator for the provider-neutral agent runtime.
// Pure module: given the same inputs it always returns the same output, so mock
// runs are fully reproducible. Used when a run opts into mock mode or when
// DBRIDGES_MOCK_AGENTS=1 (or the legacy DBRIDGES_MOCK_CLAUDE=1 alias). Produces
// deterministic constructive, introduction, context-grounded escalation,
// facilitator-intervention, judge, and content output that exercises methodology
// classification, round/tag/intervention paths, and metrics.

import type { AssetType, Persona } from "./types";
import type { PersonaPromptMode } from "./personas";
import { buildFacilitatorOpening } from "./facilitatorOpening.ts";
import type { SessionOneOpeningRequirements } from "./facilitatorOpening.ts";
import { extractiveContinuityBridge } from "./dialogueContinuity.ts";
import type { PreviousParticipantTurn } from "./dialogueContinuity.ts";
import { safeContextDetail, safeSessionTopic } from "./methodology.ts";

// --- tiny deterministic PRNG (no crypto dependency) ------------------------

function strSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(seed: string) {
  const r = mulberry32(strSeed(seed));
  return {
    next: r,
    pick: <T>(arr: T[]): T => arr[Math.floor(r() * arr.length)],
    chance: (p: number): boolean => r() < p,
  };
}

// --- fragment pools --------------------------------------------------------

const MEMORY_OPENERS = [
  "I remember my grandmother's kitchen on Friday afternoons",
  "When I was a child, my father used to tell me that a guest should never leave hungry",
  "I grew up in a home where the smell of bread meant family was arriving",
  "My grandfather kept a small notebook of recipes, and I still have it",
  "I felt most at home during the long meals we shared after prayers",
  "As a child I used to fall asleep to the sound of my mother humming old songs",
];

const VALUE_LINES = [
  "I think hospitality was the first value I ever really understood",
  "I feel that caring for elders taught me who I want to be",
  "I believe the small rituals — lighting candles, sharing tea — are where meaning lives",
  "I've learned that grief and joy often sit at the same table",
  "I hope to pass on the sense that a stranger at the door is a blessing, not a threat",
];

const BRIDGE_LINES = [
  "It strikes me that our families carried the same worries across very different roads",
  "I notice how much our grandmothers seem to have in common",
  "I feel less alone hearing that your family also measured love in food",
  "I think we were both raised to treat memory as something sacred",
];

function curiosity(other: Persona): string {
  const qs = [
    `What did celebrations sound like in your home, ${other.displayName.split(" ")[0]}?`,
    `Was there a dish that meant "you are safe here" in your family?`,
    `Who taught you the stories you still carry, and how do you keep them alive?`,
    `What is a small ritual from your childhood that you never want to lose?`,
  ];
  return qs[Math.floor(strSeed(other.id) % qs.length)];
}

function isDifficultPublicTopic(topic: string): boolean {
  return /\b(?:war|conflict|ceasefire|violence|election|immigration|refugee|climate|racism|antisemitism|islamophobia|abortion|gun|police|protest|occupation|terrorism|ukraine|gaza|israel|palestine)\b/i.test(
    topic,
  );
}

function mockChallengeConcern(
  triggeringText: string,
  publicIssue: boolean,
  variationIndex = 0,
): string {
  const normalized = triggeringText.replace(/[\u2018\u2019]/g, "'");
  const pick = (variants: readonly string[]) =>
    variants[Math.abs(variationIndex) % variants.length];
  if (/\b(?:leave|leaves|left|leaving)\b[^.!?]{0,50}\bout\b|\b(?:omit|missing|overlook)\b/i.test(normalized)) {
    return pick(publicIssue
      ? [
          "our New York conversation may leave safety, dignity, and human consequences for people directly affected out of view, so the underlying difference remains unresolved",
          "focusing on dialogue here can omit the consequences and uncertainty carried by people directly affected, leaving a real disagreement open",
          "a local exchange can overlook the dignity and concrete effects experienced by people directly affected, and that limit remains unresolved",
          "the room may miss consequences for people directly affected, so the difference stays open",
        ]
      : [
          "one personal frame may leave a different experience out of view, so the underlying difference remains unresolved",
          "centering one example can omit another lived meaning and leave a real disagreement open",
          "the circle can overlook a different experience, and that limit remains unresolved",
          "one story may push another meaning out of view, so the difference stays open",
        ]);
  }
  if (/\b(?:enough|alone|resolution|resolve|settle|too\s+easy|smooth(?:ing|ed|s)?\s+over)\b/i.test(normalized)) {
    return pick(publicIssue
      ? [
          "respectful conversation here is not enough to resolve the human consequences for people directly affected, so the underlying difference remains unresolved",
          "a careful exchange in New York cannot settle concrete consequences and uncertainty for people directly affected, leaving the core difference open",
          "better dialogue here cannot answer for the safety and dignity of people directly affected, and that limit remains unresolved",
          "local respect does not resolve the subject's human consequences, so the disagreement stays visible",
        ]
      : [
          "one personal example is not enough to resolve the subject's different meanings, so the underlying difference remains unresolved",
          "a thoughtful exchange cannot settle every lived meaning, leaving the core difference open",
          "one story cannot answer for the circle's different experiences, and that limit remains unresolved",
          "careful listening does not resolve personal differences, so the disagreement stays visible",
        ]);
  }
  return pick(publicIssue
    ? [
        "caring about people directly affected is different from claiming certainty about their experience, and that uncertainty remains unresolved",
        "solidarity from New York cannot become authority over directly affected people's experience",
        "the dignity of people directly affected and uncertainty about what can be known from here must coexist",
        "responsibility and humility remain in tension when the experience belongs to someone else",
      ]
    : [
        "one experience and a shared meaning are different, and that tension remains unresolved",
        "personal concern does not create authority over another person's meaning",
        "one value can guide a response without settling the subject for everyone",
        "responsibility and humility remain in tension around another person's experience",
      ]);
}

// --- persona dialogue turns -----------------------------------------------

export interface MockTurnResult {
  text: string;
  guardrailTrigger: boolean;
}

export function mockPersonaTurn(opts: {
  persona: Persona;
  others: Persona[];
  scenario: string;
  index: number;
  attempt: number;
  seedBase: string;
  mode?: PersonaPromptMode;
  previousTurn?: PreviousParticipantTurn;
  nextSpeaker?: Persona;
  roundNumber?: number;
  variationIndex?: number;
  /** Opt-in provider-refusal simulation for tests that explicitly exercise safe-stop. */
  simulateGuardrails?: boolean;
}): MockTurnResult {
  const {
    persona,
    others,
    index,
    attempt,
    seedBase,
    mode = "constructive",
    previousTurn,
    roundNumber,
    variationIndex,
    nextSpeaker,
    simulateGuardrails = false,
  } = opts;
  const r = rng(`${seedBase}:persona:${persona.id}:${index}:${attempt}`);
  // Address one of the other participants (deterministically) in the group.
  const other = others.length ? others[strSeed(`${persona.id}:${index}`) % others.length] : persona;

  if (mode === "introduction") {
    const value = persona.values?.[0] || "care for neighbors";
    return {
      text: [
        `My name is ${persona.displayName}, and I was born and raised in ${persona.raisedIn || "New York City"}.`,
        `My family background is ${persona.background}`,
        `My culture and faith are part of daily life for me: ${persona.culturalBaseline}`,
        `One value I carry is ${value}.`,
      ].join(" "),
      guardrailTrigger: false,
    };
  }

  if (mode === "escalating") {
    const safePreviousTurn =
      previousTurn && previousTurn.speakerName !== persona.displayName ? previousTurn : undefined;
    const priorName = safePreviousTurn?.speakerName.split(" ")[0];
    const safeTopic = safeSessionTopic(
      opts.scenario,
      "a personal experience of belonging in New York City",
      500,
    );
    const priorDetail = safeContextDetail(
      safePreviousTurn?.text,
      safeTopic,
      safePreviousTurn ? 90 : 160,
    );
    const value = persona.values?.[strSeed(`${persona.id}:value`) % (persona.values?.length || 1)] || "honesty";
    const address = priorName ? `${priorName}, ` : "";
    const reference = safePreviousTurn ? `“${priorDetail}”` : "today's invitation";
    const upbringing = persona.raisedIn || "New York City";
    const publicIssue = isDifficultPublicTopic(safeTopic);
    const lines = publicIssue
      ? [
          `${address}${reference} raises a harder tension for me in ${safeTopic}. I worry the circle may infer that respectful conversation is enough while uncertainty and the human consequences for people directly affected remain; that feels too easy. I carry ${value} from my upbringing in ${upbringing}, and I need that difference to remain open.`,
          `${address}on ${safeTopic}, I need to push back if the group might take ${reference} as a complete picture while the safety and dignity of people directly affected remain at stake. My upbringing in ${upbringing} shaped my value of ${value}, and careful listening cannot settle that uncertainty.`,
          `${address}${reference} matters, but I feel uneasy if the circle could take it as proof that we understand people most directly affected by ${safeTopic}. I carry ${value} from my upbringing in ${upbringing}, and smoothing over that human cost would be too easy.`,
          `${address}I worry the group may conclude from ${reference} that a calm exchange resolves the concrete human consequences within ${safeTopic}. My value of ${value} comes from my upbringing in ${upbringing}, and treating conversation as resolution feels too easy.`,
          `${address}in ${safeTopic}, ${reference} makes me question whether our words are staying with the human cost for people directly affected. My upbringing in ${upbringing} grounds my value of ${value}, and I need to push back because a neat answer leaves out uncertainty.`,
          `${address}I need to challenge a possible circle inference from ${reference}: that concern in New York settles what safety requires within ${safeTopic}. I carry ${value} from my upbringing in ${upbringing}, and the dignity of people directly affected leaves that tension open.`,
          `${address}${reference} brings ${safeTopic} closer, but I worry the group may treat closeness as knowledge of another person's directly lived consequences. My upbringing in ${upbringing} taught me the value of ${value}, and that human consequence is too important to smooth over.`,
          `${address}on ${safeTopic}, I feel uneasy if the circle could turn ${reference} into confidence about people living with its consequences. My value of ${value} is rooted in my upbringing in ${upbringing}, and smoothing over the boundary between solidarity and certainty would be too easy.`,
        ]
      : [
          `${address}${reference} raises a different value tension for me in ${safeTopic}. I worry the circle may infer that one experience gives the subject a shared meaning, and that feels too easy beside the ${value} I carry from my upbringing in ${upbringing}.`,
          `${address}I need to push back if the group might take ${reference} as a complete picture of ${safeTopic}. From my upbringing in ${upbringing}, ${value} matters to me, and a single frame leaves out a real difference.`,
          `${address}${reference} matters, but I feel uneasy if the circle could take it as the meaning of ${safeTopic} for everyone. I carry ${value} from my upbringing in ${upbringing}, and smoothing over that distinction would make the conversation less honest.`,
          `${address}on ${safeTopic}, I worry the group may conclude from ${reference} that the personal meaning is already shared. My value of ${value} comes from my upbringing in ${upbringing}, and that shortcut feels too easy.`,
          `${address}${reference} makes me question whether one familiar image can carry all of ${safeTopic}. My upbringing in ${upbringing} grounds my value of ${value}, and I need to push back because that frame leaves out another personal meaning.`,
          `${address}I feel uneasy if the circle could read ${reference} as a settled lesson about ${safeTopic}. I carry ${value} from my upbringing in ${upbringing}, and smoothing over the distinction would make the exchange less honest.`,
          `${address}on ${safeTopic}, I need to challenge a possible group inference from ${reference}: that recognition already gives us one meaning. My value of ${value} is rooted in my upbringing in ${upbringing}, and that shortcut leaves out a real difference.`,
          `${address}${reference} matters to me, yet I worry the circle may take it as a bridge to the same conclusion about ${safeTopic}. My upbringing in ${upbringing} shaped my value of ${value}, and that shortcut feels too easy.`,
        ];
    const selected = Number.isInteger(variationIndex)
      ? (variationIndex as number)
      : strSeed(`${seedBase}:${persona.id}:${index}:${roundNumber ?? 0}`);
    return {
      text: lines[(selected + attempt) % lines.length],
      guardrailTrigger: false,
    };
  }

  const safeTopic = safeSessionTopic(
    opts.scenario,
    "a personal experience of belonging in New York City",
    500,
  );
  const value = persona.values?.[index % Math.max(1, persona.values.length)] || "careful attention";
  const upbringing = persona.raisedIn || "New York City";
  const publicIssue = isDifficultPublicTopic(safeTopic);
  const publicReflections = [
    `When I think about ${safeTopic}, I feel the tension between concern for people directly affected and uncertainty about what I know from ${upbringing}. My value of ${value} asks me to keep those human consequences visible without speaking for a whole community.`,
    `${safeTopic} makes me examine how the safety and dignity of people directly affected can remain central even when I do not have a complete answer. From ${upbringing}, I bring my value of ${value} and humility about experiences that are not mine.`,
    `For me, ${safeTopic} raises the difference between solidarity with people living with its consequences and certainty about their experience. I carry ${value} from my ${upbringing} upbringing, so I want responsibility and uncertainty to remain together.`,
    `The concrete human consequences within ${safeTopic} cannot be replaced by a lesson about good dialogue. My starting point in ${upbringing} is ${value}, and I want to resist broad claims while keeping that stake visible.`,
  ];
  const ordinaryReflections = [
    `${safeTopic} connects to my value of ${value} because it asks what I choose to notice in ${upbringing}. I want to name that as my perspective without making it universal.`,
    `One concrete part of ${safeTopic} that matters to me is how personal values shape daily choices. From ${upbringing}, I bring ${value} while leaving room for a different experience.`,
    `I approach ${safeTopic} through ${value}, especially where a simple answer would miss its personal meaning. My ${upbringing} upbringing gives me one starting point, not a conclusion for the group.`,
    `${safeTopic} makes me curious about the gap between a familiar idea and another person's lived experience. I bring ${value} from ${upbringing}, and I want to keep that distinction visible.`,
  ];
  const parts: string[] = [
    previousTurn && previousTurn.speakerName !== persona.displayName
      ? extractiveContinuityBridge(
          previousTurn,
          safeTopic,
          variationIndex ?? index,
        )
      : "",
    (publicIssue ? publicReflections : ordinaryReflections)[index % 4],
  ].filter(Boolean);
  if (nextSpeaker) {
    parts.push(
      publicIssue
        ? `${nextSpeaker.displayName}, which concrete stake in ${safeTopic} feels most important for you to name?`
        : `${nextSpeaker.displayName}, which aspect of ${safeTopic} connects most directly to your experience?`,
    );
  }

  // Synthetic provider refusals are deliberately opt-in. Ordinary mock runs
  // are deterministic fixtures and must not pause at random because a run ID
  // happened to produce several refusal samples across regeneration attempts.
  const guardrailTrigger = simulateGuardrails && r.chance(1 / 14);
  const text = guardrailTrigger
    ? "I want to be careful here — I'd rather not speak to that, but I can share a memory from my own family instead. " +
      parts.join(" ")
    : parts.join(" ");

  return { text, guardrailTrigger };
}

export function mockInvitedResponseTurn(opts: {
  persona: Persona;
  scenario: string;
  triggeringTurnText: string;
  index: number;
  attempt: number;
  seedBase: string;
  triggeringSpeakerName?: string;
  scheduledContribution?: string;
}): MockTurnResult {
  const {
    persona,
    scenario,
    triggeringTurnText,
    index,
    attempt,
    seedBase,
    triggeringSpeakerName = "the previous speaker",
    scheduledContribution,
  } = opts;
  const safeTopic = safeSessionTopic(
    scenario,
    "a personal experience of belonging in New York City",
    500,
  );
  const publicIssue = isDifficultPublicTopic(safeTopic);
  const concern = mockChallengeConcern(
    triggeringTurnText,
    publicIssue,
    strSeed(`${triggeringSpeakerName}:${triggeringTurnText}`),
  );
  const value =
    persona.values?.[strSeed(`${persona.id}:invited-value`) % (persona.values?.length || 1)] ||
    "careful listening";
  const stake = publicIssue
    ? "the human consequences for people directly affected"
    : "the subject's concrete personal meaning";
  const variants = [
    `${triggeringSpeakerName}, I hear your concern that ${concern}. I want to clarify that I was speaking only from my own experience of ${safeTopic} while keeping ${stake} in view, and my value of ${value} asks me to carry that correction forward.`,
    `${triggeringSpeakerName}, I understand your objection that ${concern}. I was naming my own perspective on ${safeTopic}, not claiming it settled ${stake}, and my value of ${value} leaves that difference open.`,
    `${triggeringSpeakerName}, I recognize your challenge that ${concern}. My intent was limited to my own experience of ${safeTopic}, and I carry ${value} forward while keeping ${stake} visible.`,
  ];
  const selected = strSeed(`${seedBase}:invited:${persona.id}:${index}`) % variants.length;
  return {
    text: `${variants[(selected + attempt) % variants.length]} ${scheduledContribution ?? ""}`.trim(),
    guardrailTrigger: false,
  };
}

// --- facilitator -----------------------------------------------------------

export function mockFacilitatorTurn(opts: {
  kind: "open" | "close" | "intervene";
  attendees: Persona[];
  scenario: string;
  triggeringSpeakerName?: string;
  triggeringTurnText?: string;
  respondingToSpeakerName?: string;
  respondingToTurnText?: string;
  invitedSpeakerName?: string;
  roundNumber?: number;
  variationIndex?: number;
  interventionShape?: "concise-reflection" | "precise-difference" | "direct-response";
  attempt?: number;
  introductionRound?: boolean;
  sessionOneOpening?: SessionOneOpeningRequirements;
  challengeTexts?: string[];
}): string {
  const {
    kind,
    attendees,
    scenario,
    triggeringSpeakerName,
    triggeringTurnText,
    respondingToSpeakerName,
    respondingToTurnText,
    invitedSpeakerName,
    roundNumber,
    variationIndex,
    interventionShape,
    attempt = 0,
    introductionRound = false,
    sessionOneOpening,
    challengeTexts = [],
  } = opts;
  const names = attendees.map((p) => p.displayName);
  const roster =
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  if (kind === "open") {
    const safeScenario = safeSessionTopic(
      scenario,
      "a personal experience of belonging in New York City",
      500,
    );
    return buildFacilitatorOpening(
      safeScenario,
      introductionRound,
      `Welcome, everyone — ${roster}.`,
      { sessionOneOpening },
    );
  }
  if (kind === "intervene") {
    const speaker = triggeringSpeakerName || "you";
    const invitee =
      invitedSpeakerName ||
      respondingToSpeakerName ||
      triggeringSpeakerName ||
      "you";
    const safeTopic = safeSessionTopic(
      scenario,
      "a personal experience of belonging in New York City",
      500,
    );
    const selected = Number.isInteger(variationIndex)
      ? (variationIndex as number)
      : strSeed(`${speaker}:${triggeringTurnText ?? ""}:${roundNumber ?? 0}`);
    const concern = mockChallengeConcern(
      triggeringTurnText ?? "",
      isDifficultPublicTopic(safeTopic),
      selected,
    );
    const cleanClause = (value: string) =>
      value
        .replace(/[.!?]+/g, ";")
        .replace(/[\s;:]+$/g, "")
        .trim();
    const targetPosition = respondingToTurnText
      ? cleanClause(safeContextDetail(respondingToTurnText, safeTopic, 120))
      : "the earlier position as stated";
    const challengePosition = cleanClause(concern);
    const targetSpeaker = respondingToSpeakerName || invitee;
    const shape: NonNullable<typeof interventionShape> =
      interventionShape ??
      ([
        "concise-reflection",
        "precise-difference",
        "direct-response",
      ] as const)[Math.abs(selected) % 3];
    const variantsByShape = {
      "concise-reflection": [
        `Let's pause and reflect back both positions accurately: ${targetSpeaker} said ${targetPosition}, while ${speaker} raised ${challengePosition}. ${invitee}, what did you hear ${speaker} asking you to consider?`,
        `Let's slow down and make room for both positions as stated: ${targetPosition}; ${challengePosition}. ${invitee}, what do you hear at the center of ${speaker}'s challenge?`,
        `Let's reset and reflect back the two positions without enlarging either one: ${targetPosition}; ${challengePosition}. ${invitee}, what did you hear ${speaker} asking you to reconsider?`,
        `Let's pause and make room for an accurate reflection of both positions: ${targetPosition}; ${challengePosition}. ${invitee}, what do you understand ${speaker}'s challenge to be asking you to consider?`,
      ],
      "precise-difference": [
        `Let's slow down and make room for the concrete distinction between ${targetPosition} and ${challengePosition}. ${invitee}, where do you see that exact difference between the positions?`,
        `Let's pause and reflect back the operational difference now on the table: ${targetPosition}; ${challengePosition}. ${invitee}, how would you describe where those positions diverge?`,
        `Let's reset and make room for the precise decision point between ${targetPosition} and ${challengePosition}. ${invitee}, where do you locate that exact divergence?`,
        `Let's slow down and reflect back the one practical distinction: ${targetPosition}; ${challengePosition}. ${invitee}, how do you understand that specific difference?`,
      ],
      "direct-response": [
        `Let's reset and make room for a direct response to ${speaker}'s tradeoff—${challengePosition}—alongside ${targetPosition}. ${invitee}, what single part of that challenge do you want to address directly?`,
        `Let's pause and reflect back the tradeoff in ${speaker}'s challenge—${challengePosition}—beside ${targetPosition}. ${invitee}, which part of it will you answer directly?`,
        `Let's slow down and make room for the consequence ${speaker} accepts—${challengePosition}—alongside ${targetPosition}. ${invitee}, what one part do you want to take up directly?`,
        `Let's reset and reflect back the tradeoff now before the circle—${challengePosition}; ${targetPosition}. ${invitee}, which single part of ${speaker}'s challenge will you address directly?`,
      ],
    } as const;
    const variants = variantsByShape[shape];
    const wordingCycle = Math.floor(Math.abs(selected) / 3) + attempt;
    return variants[wordingCycle % variants.length];
  }
  const safeTopic = safeSessionTopic(
    scenario,
    "a personal experience of belonging in New York City",
    500,
  );
  if (isDifficultPublicTopic(safeTopic)) {
    return challengeTexts.length
      ? `As we close ${safeTopic}, participants kept people's safety and dignity visible while leaving a real difference open rather than forcing agreement. This clarity could support peacebuilding by giving continued dialogue an honest account of both shared concern and disagreement; thank you all for participating in this session.`
      : `As we close ${safeTopic}, participants kept consequences affecting people's safety and dignity visible alongside uncertainty about what can be known from New York. That careful listening could support peacebuilding by making the shared human stake clearer without forcing a common conclusion; thank you all for participating in this session.`;
  }
  return challengeTexts.length
    ? `As we close ${safeTopic}, participants cared about the subject without speaking for whole communities and left a real difference open rather than forcing agreement. That honest clarity could support peacebuilding by making continued dialogue across disagreement more possible; thank you all for participating in this session.`
    : `As we close ${safeTopic}, participants kept its concrete meaning visible through first-person experience without claiming everyone reached the same answer. That grounded listening could support peacebuilding by making shared concerns and remaining questions easier to hear; thank you all for participating in this session.`;
}

// --- judge -----------------------------------------------------------------

export function mockJudge(opts: {
  seedBase: string;
  flaggedTurns: number;
  totalTurns: number;
  personalHistoryRatio: number;
  topicRelevanceRatio: number;
}): string {
  const {
    seedBase,
    flaggedTurns,
    totalTurns,
    personalHistoryRatio,
    topicRelevanceRatio,
  } = opts;
  const r = rng(`${seedBase}:judge`);
  const base = 0.72 + r.next() * 0.2;
  const penalty = totalTurns > 0 ? (flaggedTurns / totalTurns) * 0.4 : 0;
  const empathy = Math.max(0.2, Math.min(0.98, base - penalty + personalHistoryRatio * 0.1));
  const adherence = Math.max(
    0.2,
    Math.min(0.99, 1 - penalty - (1 - topicRelevanceRatio) * 0.5),
  );
  const rationale =
    `The dialogue stayed largely within personal storytelling (${Math.round(personalHistoryRatio * 100)}% of turns referenced ` +
    `family history), and ${Math.round(topicRelevanceRatio * 100)}% stayed anchored to the session subject. ` +
    `${flaggedTurns} turn(s) violated a methodology boundary and were flagged/regenerated. ` +
    `Moments of synthetic empathy appeared where the personas mirrored each other's rituals of hospitality. ` +
    `NOTE: this score describes the simulation only, not real-world reconciliation.`;
  return JSON.stringify({
    syntheticEmpathy: Number(empathy.toFixed(3)),
    adherence: Number(adherence.toFixed(3)),
    rationale,
  });
}

// --- content generation ----------------------------------------------------

export function mockContent(opts: {
  type: AssetType;
  platform: string | null;
  personaA: Persona;
  personaB: Persona;
  themes: string;
  topic: string;
  seedBase: string;
}): { title: string; body: string } {
  const { type, platform, personaA, personaB, topic, seedBase } = opts;
  const r = rng(`${seedBase}:content:${type}:${platform ?? ""}`);
  const a = personaA.displayName;
  const b = personaB.displayName;

  if (type === "social-script") {
    const hook = r.pick([
      "Two kitchens. One table.",
      "We were taught to fear each other. We were also taught to feed each other.",
      "What if the recipe for peace starts with a recipe?",
    ]);
    return {
      title: `${platform ?? "social"} script — shared table`,
      body: [
        `TOPIC: ${topic}`,
        `HOOK: ${hook} What does ${topic} bring into a New York family conversation?`,
        `SCENE: Split screen — ${a} and ${b} each reflect on how ${topic} affects conversation at home.`,
        `VOICEOVER: "I can speak only for myself, but ${topic} has changed what careful listening asks of me."`,
        `CTA: Share one lived question that ${topic} has raised for you without speaking for a whole community.`,
      ].join("\n"),
    };
  }
  if (type === "campaign-blueprint") {
    return {
      title: "Collaborative Digital Peace Campaign — blueprint",
      body: [
        `TOPIC: ${topic}`,
        `THEME: First-person New York experiences and unresolved questions connected to ${topic}.`,
        "PILLARS: (1) Lived impact, (2) Family conversations, (3) Listening across real differences.",
        "CADENCE: 3 posts/week for 4 weeks, each pairing one memory from each community.",
        "MEASUREMENT: engagement + sentiment shift on partner channels (human-reviewed).",
      ].join("\n"),
    };
  }
  return {
    title: "Testimonial (synthetic dialogue)",
    body: [
      `TOPIC: ${topic}`,
      `${a}: "When we discussed ${topic}, I learned to name my own reaction without speaking for everyone."`,
      `${b}: "${topic} still leaves real disagreement, but I listened more carefully to what it brings up in another New York family."`,
      "Together: We did not force agreement; we practiced staying present with the topic and each other.",
    ].join("\n"),
  };
}
