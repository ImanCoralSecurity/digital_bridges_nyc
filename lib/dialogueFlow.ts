// Pure helpers for dialogue turn routing. Kept free of I/O so invitation
// selection can be tested independently from the orchestration loop.

export interface DialogueAttendee {
  id: string;
  displayName: string;
}

export interface FacilitatorInterventionAssessment<T extends DialogueAttendee> {
  acceptable: boolean;
  repairFramed: boolean;
  reflectiveStancePresent: boolean;
  repairObjectPresent: boolean;
  finalQuestionIsOpen: boolean;
  finalQuestionSingleFocus: boolean;
  finalQuestionInvitesReflection: boolean;
  questionCount: number;
  exactlyOneFinalQuestion: boolean;
  resolvedInvitee?: T;
  correctInvitee: boolean;
  prohibitedSelfPositioning: string[];
  rejectionReasons: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function finalQuestion(text: string): string | undefined {
  const questionEnd = text.lastIndexOf("?");
  if (questionEnd < 0) return undefined;

  const beforeQuestion = text.slice(0, questionEnd);
  const sentenceStart = Math.max(
    beforeQuestion.lastIndexOf("."),
    beforeQuestion.lastIndexOf("!"),
    beforeQuestion.lastIndexOf("?"),
  ) + 1;
  return text.slice(sentenceStart, questionEnd + 1);
}

/**
 * Resolve the one attendee directly named in a facilitator's final question.
 *
 * Earlier sentences may describe the triggering speaker, so they are not an
 * invitation. Full names are always recognized; first names are recognized
 * only when unique in the roster. Zero or multiple matches are deliberately
 * treated as no invitation rather than choosing a person arbitrarily.
 */
export function selectFinalQuestionAttendee<T extends DialogueAttendee>(
  text: string,
  attendees: T[],
): T | undefined {
  const question = finalQuestion(text);
  if (!question) return undefined;

  const firstNameCounts = new Map<string, number>();
  for (const attendee of attendees) {
    const first = attendee.displayName.trim().split(/\s+/)[0]?.toLocaleLowerCase();
    if (first) firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }

  const termsByAttendee = new Map<string, string[]>();
  for (const attendee of attendees) {
    const fullName = attendee.displayName.trim();
    const firstName = fullName.split(/\s+/)[0] ?? "";
    const terms = [fullName];
    if (firstName && firstNameCounts.get(firstName.toLocaleLowerCase()) === 1) {
      terms.push(firstName);
    }
    termsByAttendee.set(attendee.id, Array.from(new Set(terms)));
  }

  // A leading vocative is the grammatical addressee. A later name may be the
  // person whose concern the invitee is being asked to reflect, not a second
  // invitee: “Amina, can you reflect back Daniel's concern?”
  const leadingMatches = new Map<string, { attendee: T; end: number }>();
  for (const attendee of attendees) {
    for (const term of termsByAttendee.get(attendee.id) ?? []) {
      const match = question.match(
        new RegExp(`^\\s*${escapeRegex(term)}\\b\\s*,`, "i"),
      );
      if (match) {
        leadingMatches.set(attendee.id, { attendee, end: match[0].length });
      }
    }
  }
  if (leadingMatches.size === 1) {
    const [{ attendee, end }] = Array.from(leadingMatches.values());
    const remainder = question.slice(end);
    const otherTerms = attendees
      .filter((candidate) => candidate.id !== attendee.id)
      .flatMap((candidate) => termsByAttendee.get(candidate.id) ?? [])
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex);
    if (otherTerms.length) {
      const others = `(?:${otherTerms.join("|")})`;
      const secondLeadingVocative = new RegExp(`^\\s*${others}\\b\\s*,`, "i");
      const coordinatedAddressee = new RegExp(
        `\\byou\\s+(?:and|with)\\s+${others}\\b`,
        "i",
      );
      if (secondLeadingVocative.test(remainder) || coordinatedAddressee.test(remainder)) {
        return undefined;
      }
    }
    return attendee;
  }

  const matches = new Map<string, T>();
  for (const attendee of attendees) {
    for (const term of termsByAttendee.get(attendee.id) ?? []) {
      const matcher = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
      if (matcher.test(question)) matches.set(attendee.id, attendee);
    }
  }

  return matches.size === 1 ? matches.values().next().value : undefined;
}

const REFLECTIVE_STANCE_PATTERNS = [
  /\bi\s+(?:also\s+)?hear\b/i,
  /\bi\s+(?:(?:also\s+)?(?:can|could)\s+)(?:hear|feel|see|recognize)\b/i,
  /\bi\s+want to check\s+i(?:'m| am)\s+(?:hearing|understanding|reflecting)\b/i,
  /\bi\s+(?:want to understand|appreciate)\b/i,
  /\bi(?:'m| am)\s+(?:noticing|realizing|hearing|recognizing|missing)\b/i,
  /\bi(?:'m| am)\s+listening\b/i,
  /\bwhat feels\s+(?:unresolved|missing|unclear|present)\b/i,
  /\blet(?:'s| us)\s+(?:pause|slow down|reset|repair|return|stay with|clarify|locate|take a breath)\b/i,
  /\bbefore\s+we\s+continue\b/i,
  /\bcould we\s+(?:pause|slow down|reset|take a breath)\b/i,
] as const;

const REPAIR_OBJECT_PATTERNS = [
  /\b(?:specific\s+)?tension\b/i,
  /\b(?:impact|intent|personal stake|lived experience)\b/i,
  /\b(?:hearing|reflecting|heard|reflected)\b.{0,50}\baccurately\b/i,
  /\b(?:unresolved|missing|underneath|burden|pressure|harder-to-see|set the pace|make room|slow down|pause|repair|personal experience|quick resolution)\b/i,
  /\b(?:distinguish|separate)\b.{0,60}\b(?:impact|intent|story|conclusion|assumption)\b/i,
  /\b(?:difference|distinction)\b[^.!?]{0,80}\b(?:positions?|conditions?|thresholds?|priorities?|actions?|responses?)\b|\b(?:positions?|conditions?|thresholds?|priorities?|actions?|responses?)\b[^.!?]{0,80}\b(?:differ|difference|distinction)\b/i,
  /\bwhat (?:someone|you|they) (?:is|are) (?:living|carrying|feeling)\b/i,
] as const;

const LEADING_OPEN_QUESTION_PATTERN =
  /^(?:(?:in\s+your\s+own\s+(?:words?|wording)\s*,?\s*)?(?:what|how|when|where|which|why)\b|(?:(?:for|from|to)\s+)?(?:what|how|when|where|which|why)\b|(?:can|could|would)\s+you\s+(?:tell|share|describe|help|walk|reflect|clarify|explain|restate|paraphrase|identify|locate)\b)/i;

function questionWithoutLeadingVocative<T extends DialogueAttendee>(
  question: string,
  attendees: T[],
): string {
  const firstNameCounts = new Map<string, number>();
  for (const attendee of attendees) {
    const first = attendee.displayName.trim().split(/\s+/)[0]?.toLocaleLowerCase();
    if (first) firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }

  const matches = new Map<string, number>();
  for (const attendee of attendees) {
    const fullName = attendee.displayName.trim();
    const firstName = fullName.split(/\s+/)[0] ?? "";
    const terms = [fullName];
    if (firstName && firstNameCounts.get(firstName.toLocaleLowerCase()) === 1) {
      terms.push(firstName);
    }
    for (const term of new Set(terms)) {
      const match = question.match(
        new RegExp(`^\\s*${escapeRegex(term)}\\b\\s*,\\s*`, "i"),
      );
      if (match) matches.set(attendee.id, match[0].length);
    }
  }

  if (matches.size !== 1) return question.trimStart();
  return question.slice(matches.values().next().value).trimStart();
}

/**
 * Shared, wording-neutral structure check for Sam's final intervention
 * question. Runtime gating, flow assessment, and final evaluation all use
 * this one parser so natural wording cannot pass one layer and fail another.
 */
export function facilitatorQuestionStructureReasons<T extends DialogueAttendee>(
  text: string,
  attendees: T[],
): string[] {
  const normalized = text.replace(/[\u2018\u2019]/g, "'").trim();
  const questionCount = (normalized.match(/\?/g) ?? []).length;
  const question = finalQuestion(normalized);
  const questionEndsText = /\?(?:["'\u2019\u201d)\]]*)\s*$/.test(normalized);
  if (questionCount !== 1 || !question || !questionEndsText) return [];

  const body = questionWithoutLeadingVocative(question, attendees);
  const reasons: string[] = [];
  if (!LEADING_OPEN_QUESTION_PATTERN.test(body)) {
    reasons.push(
      "Facilitator's final question must be grammatically open-ended; natural wording is otherwise unrestricted.",
    );
  }
  if (
    /\b(?:and|or)\s+(?:what|how|where|when|why|which|can|could|would)\b|\b(?:and|or)\s+(?:then\s+)?(?:also\s+)?(?:state|share|tell|explain|describe|defend|decide|choose|give|name|clarify|respond|argue|justify|outline|say)\b/i.test(
      question,
    )
  ) {
    reasons.push(
      "Facilitator's final question must make one request, not a coordinated second request.",
    );
  }
  if (
    /\b(?:either\b[^?]{0,100}\bor|whether\b[^?]{0,100}\bor|or\s+not)\b|\b(?:choose|pick)\b[^?]{0,60}\bbetween\b|\b(?:which|what)\b[^?]{0,100}\b(?:comes?\s+first|more\s+important|higher\s+priority)\b/i.test(
      question,
    )
  ) {
    reasons.push(
      "Facilitator's final question must not force a supplied choice or priority ranking.",
    );
  }
  if (
    /\b(?:defend|justify|argue|rebut|refute|prove|concede|admit)\b|\b(?:should|must|have\s+to)\s+you\b|\b(?:do|don't|wouldn't|isn't|aren't)\s+you\s+agree\b|\b(?:obviously|clearly)\b/i.test(
      question,
    )
  ) {
    reasons.push(
      "Facilitator's final question must not demand defense or concession or embed a preferred answer.",
    );
  }
  return Array.from(new Set(reasons));
}

function stripCompleteQuotedPassages(text: string): string {
  return text
    .replace(/“[^”]*”/g, "")
    .replace(/"[^"]*"/g, "");
}

function appropriatesParticipantFirstPerson<T extends DialogueAttendee>(
  text: string,
  attendees: T[],
): boolean {
  for (const attendee of attendees) {
    const fullName = attendee.displayName.trim();
    const firstName = fullName.split(/\s+/)[0] ?? "";
    for (const term of new Set([fullName, firstName].filter(Boolean))) {
      const attribution = new RegExp(
        `\\b(?:when\\s+)?${escapeRegex(term)}\\s+(?:said|shared|described|explained)\\b([^.!?]*)`,
        "gi",
      );
      for (const match of text.matchAll(attribution)) {
        // The first comma normally ends the attributed clause. First-person
        // language after that comma belongs to Sam; before it, it belongs to
        // the participant and must either be shifted or explicitly quoted.
        const attributedClause = stripCompleteQuotedPassages(
          (match[1] ?? "").split(",", 1)[0] ?? "",
        );
        if (/\b(?:i(?:'m|'ve|'d|'ll)?|me|my|mine|we|us|our|ours)\b/i.test(attributedClause)) {
          return true;
        }
      }
    }
  }
  return false;
}

function inventsParticipantIntent<T extends DialogueAttendee>(
  text: string,
  attendees: T[],
): boolean {
  if ([
    /\b(?:the\s+)?intent\s+i\s+(?:see|sense|assume|believe|think)\b/i,
    /\bwhat\s+(?:others?|they|you)\s+(?:are|were)\s+(?:just\s+)?trying to do\b/i,
    /\b(?:your|their)\s+(?:intent|motive)\s+(?:is|was)\b/i,
    /\bi\s+(?:assume|believe|think)\s+(?:that\s+)?(?:you|they)\b[^.!?]{0,60}\b(?:intend|mean|want|are trying)\b/i,
  ].some((pattern) => pattern.test(text))) return true;

  return attendees.some((attendee) => {
    const names = [
      attendee.displayName.trim(),
      attendee.displayName.trim().split(/\s+/)[0] ?? "",
    ].filter(Boolean);
    return names.some((name) => {
      const escaped = escapeRegex(name);
      return new RegExp(
        `\\b${escaped}(?:'s|’s)\\s+(?:intent|motive)\\s+(?:is|was)\\b`,
        "i",
      ).test(text) || new RegExp(
        `\\bi\\s+(?:assume|believe|think)\\s+(?:that\\s+)?${escaped}\\b[^.!?]{0,60}\\b(?:intends|means|wants|is trying)\\b`,
        "i",
      ).test(text) || new RegExp(
        `\\b${escaped}\\s+(?:(?:is|was)\\s+(?:just\\s+)?trying\\s+to|(?:intends?|intended|means?|meant|wants?|wanted)\\s+to)\\b`,
        "i",
      ).test(text);
    });
  });
}

/**
 * Assess the structural contract for one mid-session facilitator repair.
 *
 * Safety, methodology, and topic relevance remain separate checks. This
 * phase-specific assessment deliberately does not require the generic
 * sentiment classifier to label natural repair language `deescalating`.
 */
export function assessFacilitatorIntervention<T extends DialogueAttendee>(
  text: string,
  attendees: T[],
  expectedInviteeId?: string,
): FacilitatorInterventionAssessment<T> {
  const normalized = text.replace(/[\u2018\u2019]/g, "'").trim();
  const reflectiveStancePresent = REFLECTIVE_STANCE_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  const repairObjectPresent = REPAIR_OBJECT_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  const repairFramed = reflectiveStancePresent && repairObjectPresent;
  const questionCount = (normalized.match(/\?/g) ?? []).length;
  const question = finalQuestion(normalized);
  const questionEndsText = /\?(?:["'\u2019\u201d)\]]*)\s*$/.test(normalized);
  const exactlyOneFinalQuestion =
    questionCount === 1 && Boolean(question) && questionEndsText;
  const questionBody = question
    ? questionWithoutLeadingVocative(question, attendees)
    : "";
  const closedReflectWhether =
    /^(?:can|could|would)\s+you\s+(?:reflect|clarify)\s+(?:whether|if)\b/i.test(
      questionBody,
    );
  const finalQuestionIsOpen = Boolean(
    question &&
      !closedReflectWhether &&
      LEADING_OPEN_QUESTION_PATTERN.test(questionBody),
  );
  const finalQuestionSingleFocus = Boolean(
    question &&
      !/\b(?:and|or)\s+(?:what|how|when|where|which|why|can|could|would)\b/i.test(
        question,
      ) &&
      !/\b(?:and|or)\s+(?:then\s+)?(?:also\s+)?(?:state|share|tell|explain|describe|defend|decide|choose|give|name|clarify|respond|argue|justify|outline|say)\b/i.test(
        question,
      ),
  );
  const finalQuestionAsksForArgument = Boolean(
    question &&
      /\b(?:defend(?:s|ed|ing)?|argu(?:e|es|ed|ing)|rebut(?:s|ted|ting)?|refut(?:e|es|ed|ing)|debate(?:s|d|ing)?|counter(?:s|ed|ing)?|prove(?:s|d|n|ing)?)\b/i.test(
        questionBody,
      ),
  );
  const finalQuestionInvitesReflection = Boolean(
    question &&
      !finalQuestionAsksForArgument &&
      /\b(?:reflect(?:ion|ed|ing)?|hear|heard|understand|understanding|state|restate|paraphrase|clarify|own\s+(?:words?|wording)|part|concern|challenge|objection|difference|differ|diverge|distinction|threshold|operating\s+line|limit|direct\s+response|respond\s+directly)\b/i.test(
        questionBody,
      ),
  );
  const resolvedInvitee = selectFinalQuestionAttendee(normalized, attendees);
  const correctInvitee = expectedInviteeId === undefined
    ? true
    : resolvedInvitee?.id === expectedInviteeId;

  const prohibitedSelfPositioning: string[] = [];
  if (/\bi can relate\b/i.test(normalized)) {
    prohibitedSelfPositioning.push(
      "Facilitator must reflect the participant's experience without claiming personal relatability.",
    );
  }
  if (/\bbefore i speak\b/i.test(normalized)) {
    prohibitedSelfPositioning.push(
      "Facilitator must not position their own turn as the response the circle is waiting for.",
    );
  }
  if (inventsParticipantIntent(normalized, attendees)) {
    prohibitedSelfPositioning.push(
      "Facilitator must not invent or resolve a participant's intent or motive.",
    );
  }
  if (appropriatesParticipantFirstPerson(normalized, attendees)) {
    prohibitedSelfPositioning.push(
      "Facilitator must not adopt a participant's first-person language as their own.",
    );
  }

  const rejectionReasons: string[] = [];
  if (!exactlyOneFinalQuestion) {
    rejectionReasons.push(
      "Facilitator intervention must contain exactly one question and place it at the end.",
    );
  }
  if (exactlyOneFinalQuestion) {
    rejectionReasons.push(
      ...facilitatorQuestionStructureReasons(normalized, attendees),
    );
  }
  if (!correctInvitee) {
    rejectionReasons.push(
      "Facilitator's final question did not unambiguously name the expected invitee.",
    );
  }
  rejectionReasons.push(...prohibitedSelfPositioning);

  return {
    acceptable: rejectionReasons.length === 0,
    repairFramed,
    reflectiveStancePresent,
    repairObjectPresent,
    finalQuestionIsOpen,
    finalQuestionSingleFocus,
    finalQuestionInvitesReflection,
    questionCount,
    exactlyOneFinalQuestion,
    resolvedInvitee,
    correctInvitee,
    prohibitedSelfPositioning,
    rejectionReasons,
  };
}
