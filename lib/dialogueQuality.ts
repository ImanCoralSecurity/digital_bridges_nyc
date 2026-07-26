// Pure, conservative quality checks for visible dialogue. These helpers do not
// decide whether a turn is safe; they identify common simulation-quality
// failures that deterministic safety and topic checks intentionally miss.

import {
  detectPublicEngagementLanes,
  detectPrimaryPublicEngagementLane,
  isDifficultPublicTopic,
  subjectLevelEngagementRejectionReasons,
} from "./topicDepth.ts";

export interface PersonaQualityProfile {
  id?: string;
  displayName?: string;
  raisedIn?: string;
  background?: string;
  regionalHistory?: string;
  culturalBaseline?: string;
  values?: readonly string[];
  communicationStyle?: string;
  sensitivities?: readonly string[];
  doNot?: readonly string[];
}

export interface InvitedResponseFidelityInput {
  text: string;
  challengerName: string;
  challengerText: string;
  targetName: string;
  targetText: string;
  topic?: string;
}

export interface InvitedResponseFidelityAssessment {
  acceptable: boolean;
  challengerAddressed: boolean;
  challengerConcernFramed: boolean;
  engagesChallengerConcern: boolean;
  misattributesTargetDetailToChallenger: boolean;
  challengerConcernFeatures: string[];
  reflectedConcernFeatures: string[];
  reflectedChallengerConcepts: string[];
  rejectionReasons: string[];
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

/** Remove visible Markdown decoration without changing the spoken words. */
export function normalizeDialogueFormatting(text: string): string {
  let normalized = text.replace(/\r\n?/g, "\n");
  normalized = normalized
    .split("\n")
    .map((line) => {
      const heading = /^(\s{0,3})#{1,6}[\t ]+/.test(line);
      let clean = heading
        ? line.replace(/^(\s{0,3})#{1,6}[\t ]+/, "$1")
        : line;
      if (heading) clean = clean.replace(/[\t ]+#{1,6}[\t ]*$/, "");
      return clean.replace(/[\t ]+$/, "");
    })
    .join("\n");

  // Apply the paired replacements more than once so nested emphasis such as
  // ***words*** is normalized from the outside in. Unbalanced markers remain.
  for (let pass = 0; pass < 3; pass++) {
    const before = normalized;
    normalized = normalized
      .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, "$2")
      .replace(/(?<![\p{L}\p{N}_])_([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, "$1")
      .replace(/(?<!\*)\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1")
      .replace(/(`{1,3})(?=\S)([^`\n]*?\S)\1/g, "$2");
    if (normalized === before) break;
  }
  return normalized;
}

/** Catch conspicuous template seams and malformed mixed metaphors. */
export function dialogueNaturalnessRejectionReasons(text: string): string[] {
  const normalized = normalizeDialogueFormatting(text);
  const reasons: string[] = [];
  if (/\bthrough\s+my\s+value\s+of\b[^.!?]{0,90}\bfrom\s+[A-Z]/u.test(normalized)) {
    reasons.push(
      "Response exposes an unnatural value-plus-location fallback template.",
    );
  }
  if (
    /\b(?:hospitality|patience|curiosity|community|generosity|joy|memory|endurance|eloquence|humou?r|honesty|resilience)\s+requires\s+me\s+to\s+leave\s+(?:questions?|issues?)\b/i.test(
      normalized,
    )
  ) {
    reasons.push(
      "Response makes a persona value mechanically require leaving an unrelated issue unresolved.",
    );
  }
  if (/\bvoice\b[^.!?]{0,100}\b(?:allowed\s+on|onto|on)\s+(?:a\s+single\s+|one\s+)?face\b/i.test(normalized)) {
    reasons.push("Response contains an incoherent voice-on-a-face mixed metaphor.");
  }
  if (/\bsubject-level\s+(?:choice|position|priority|proposition|response|tension)\b/i.test(normalized)) {
    reasons.push(
      "Response exposes internal subject-depth terminology instead of natural dialogue.",
    );
  }
  if (/\bmy\s+(?:memory|value|profile|identity)[- ]bound\s+commitment\b/i.test(normalized)) {
    reasons.push(
      "Response turns a persona-profile attribute into visible rubric language.",
    );
  }
  if (/\b(?:the|one)\s+concrete\s+new\s+york\s+impact\b/i.test(normalized)) {
    reasons.push(
      "Response exposes a repeated generation scaffold instead of speaking naturally.",
    );
  }
  if (
    /\b(?:hospitals?|medical\s+(?:care|systems?)|treatment\s+chains?)\b[^.!?]{0,90}\b(?:break|collapse|fail|stop|end)(?:s|ing|ed)?\s+(?:by\s+)?the\s+next\s+day\b|\bfor\s+civilians?\s+today,?\s+not\s+next\s+month\b/i.test(
      normalized,
    )
  ) {
    reasons.push(
      "Response invents an arbitrary precise time horizon for judging a public-topic outcome.",
    );
  }
  if (/\bthe\s+side\s+of\s+rhetorical\s+victory\b/i.test(normalized)) {
    reasons.push(
      "Response invents an adversarial political motive or false side instead of stating its own bounded position.",
    );
  }
  return uniqueReasons(reasons);
}

function lexicalText(text: string): string {
  return normalizeDialogueFormatting(text)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
}

function wordTokens(text: string): string[] {
  return lexicalText(text).match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}

function ngrams(tokens: readonly string[], size: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index + size <= tokens.length; index++) {
    result.add(tokens.slice(index, index + size).join(" "));
  }
  return result;
}

function intersectionSize<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): number {
  let count = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const item of small) if (large.has(item)) count++;
  return count;
}

function longestCommonSubsequenceRatio(left: readonly string[], right: readonly string[]): number {
  if (!left.length || !right.length) return 0;
  const a = left.slice(0, 180);
  const b = right.slice(0, 180);
  let previous = new Uint16Array(b.length + 1);
  for (let row = 1; row <= a.length; row++) {
    const current = new Uint16Array(b.length + 1);
    for (let column = 1; column <= b.length; column++) {
      current[column] = a[row - 1] === b[column - 1]
        ? previous[column - 1] + 1
        : Math.max(previous[column], current[column - 1]);
    }
    previous = current;
  }
  return previous[b.length] / Math.min(a.length, b.length);
}

function hasHighStructuralReuse(text: string, reference: string): boolean {
  const left = wordTokens(text);
  const right = wordTokens(reference);
  if (Math.min(left.length, right.length) < 12) return false;

  const leftFour = ngrams(left, 4);
  const rightFour = ngrams(right, 4);
  const sharedFour = intersectionSize(leftFour, rightFour);
  const fourGramCoverage = sharedFour / Math.max(1, Math.min(leftFour.size, rightFour.size));
  return fourGramCoverage >= 0.42 || longestCommonSubsequenceRatio(left, right) >= 0.78;
}

const POSSIBLE_CIRCLE_INFERENCE =
  /\b(?:i\s+(?:worry|wonder|fear|question)\s+(?:that\s+)?the\s+(?:circle|group)\s+may\s+(?:infer|conclude|assume|read|take)|the\s+(?:circle|group)\s+(?:may|might|could)\s+(?:infer|conclude|assume|read|take)|a\s+possible\s+inference\s+the\s+(?:circle|group)\s+may\s+draw)\b/i;

const DIRECT_TARGET_ATTRIBUTION = [
  /\bi\s+disagree\s+with\s+the\s+(?:assumption|conclusion|claim)(?:\s+that)?\b/i,
  /\b(?:your|in\s+your)\s+(?:turn|words?|story|response|claim|conclusion|assumption)\b[^.!?]{0,100}\b(?:means?|implies?|concludes?|assumes?|proves?)\b/i,
  /\byou\s+(?:said|suggested|implied|claimed|concluded|assumed)\b/i,
  /\b(?:conclusion|assumption|claim)\s+(?:that\s+)?i\s+see\s+in\s+your\s+turn\b/i,
] as const;

function hasFaithfulDirectSaidAttribution(text: string, targetText: string): boolean {
  const targetTokens = wordTokens(targetText);
  for (const match of text.matchAll(/\byou\s+said\s+(?:that\s+)?([^.!?\n]+)/gi)) {
    const detail = (match[1] ?? "")
      .split(/\b(?:but|however|yet)\b/i)[0]
      ?.trim() ?? "";
    const detailTokens = wordTokens(detail);
    if (
      detailTokens.length >= 4 &&
      longestCommonSubsequenceRatio(detailTokens, targetTokens) >= 0.85
    ) {
      return true;
    }
  }
  return false;
}

function unsupportedTargetAttitudeClaims(text: string, targetText: string): boolean {
  const claimSentences = normalizeDialogueFormatting(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) =>
      /\byou\s+(?:treat(?:ed|s)?|regard(?:ed|s)?)\b[^.!?]{0,120}\bas\s+(?:optional|unimportant|irrelevant|dispensable)\b|\byour\s+(?:position|priority|response|view)\s+(?:dismiss(?:es|ed)?|rejects?|rejected|minimiz(?:es|ed))\b/i.test(
        sentence,
      ));
  if (claimSentences.length === 0) return false;

  const targetSentences = normalizeDialogueFormatting(targetText)
    .split(/(?<=[.!?])\s+|\n+/);
  return claimSentences.some((claim) => {
    const devalues = /\bas\s+(?:optional|unimportant|irrelevant|dispensable)\b/i.test(
      claim,
    );
    const claimStakes = materialPublicStakeIds(claim);
    return !targetSentences.some((source) => {
      const sameAttitude = devalues
        ? /\b(?:optional|unimportant|irrelevant|dispensable)\b/i.test(source)
        : /\b(?:dismiss(?:es|ed)?|rejects?|rejected|minimiz(?:es|ed)|i\s+(?:do\s+not|don't|cannot|can't)\s+support)\b/i.test(
          source,
        );
      if (!sameAttitude) return false;
      const sourceStakes = materialPublicStakeIds(source);
      return claimStakes.size === 0 ||
        Array.from(claimStakes).every((stake) => sourceStakes.has(stake));
    });
  });
}

const STRENGTHENING_FEATURES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: "sufficiency",
    pattern: /\b(?:alone|by\s+itself|on\s+its\s+own|enough|sufficient|(?:a\s+full|the\s+(?:whole|full))\s+(?:way|answer|response|solution)|all\s+(?:we|the\s+circle|the\s+group)\s+need|safely\s+managed|settles?|solves?)\b/i,
  },
  {
    label: "universal",
    pattern: /\b(?:everyone|everybody|every\s+(?:family|person|community|new\s+york\s+moment)|all\s+(?:families|people|of\s+us)|always|never)\b/i,
  },
  {
    label: "automatic conclusion",
    pattern: /\b(?:already|automatically)\s+(?:aligned|understood|understand|resolved|agreed|safe)\b/i,
  },
];

const TRUNCATED_QUOTED_EXCERPT =
  /(?:“[^”\n]{1,300}(?:…|\.{3})\s*”|"[^"\n]{1,300}(?:…|\.{3})\s*")/;

/** Identify semantic and structural failures in a controlled challenge. */
export function challengeFidelityRejectionReasons(
  text: string,
  targetText: string,
  recentChallenges: readonly string[] = [],
): string[] {
  const reasons: string[] = [];
  const normalized = normalizeDialogueFormatting(text);
  const target = normalizeDialogueFormatting(targetText);
  const possibleInference = POSSIBLE_CIRCLE_INFERENCE.test(normalized);
  const challengeStrengthening = STRENGTHENING_FEATURES
    .filter(({ pattern }) => pattern.test(normalized));
  const unsupportedStrengthening = challengeStrengthening
    .filter(({ pattern }) => !pattern.test(target))
    .map(({ label }) => label);
  const targetUncertaintyQualifiers = [
    /\bwithout\s+overreaching\b/i,
    /\bonly\s+what\s+i\s+can\s+(?:verify|confirm)\b/i,
    /\bhold\s+the\s+rest\s+as\s+uncertain\b/i,
    /\b(?:uncertain|uncertainty|cannot\s+know|can't\s+know|do\s+not\s+know|don't\s+know)\b/i,
  ].filter((pattern) => pattern.test(target)).length;
  const invertsUncertaintyIntoCertainty =
    /\b(?:temptation\s+raised\s+by\s+)?(?:your|that)\s+(?:point|framing|response)\b[^.!?]{0,180}\b(?:harden|turn|become|slip)(?:s|ed|ing)?\s+into\s+certainty\b/i.test(
      normalized,
    );
  const unsupportedNormativeAbsolute =
    /\b(?:is|are|was|were|as)\s+always\s+(?:the\s+)?(?:right|best|only|correct|ethical)\b/i.test(
      normalized,
    ) &&
    !/\b(?:is|are|was|were|as)\s+always\s+(?:the\s+)?(?:right|best|only|correct|ethical)\b/i.test(
      target,
    );
  const prescriptiveLeap =
    /\b(?:care|compassion|concern)\b[^.!?]{0,90}\b(?:become|becomes|became|turn|turns|turned|slide|slides|slid)\b[^.!?]{0,70}\b(?:the\s+)?(?:right|correct|definitive)\s+(?:response|answer|prescription)\b/i.test(
      normalized,
    ) &&
    !/\b(?:care|compassion|concern)\b[^.!?]{0,90}\b(?:the\s+)?(?:right|correct|definitive)\s+(?:response|answer|prescription)\b/i.test(
      target,
    );
  const unsupportedPerspectiveScale =
    /\b(?:leap\s+from\s+)?(?:your|that)\s+point\b[^.!?]{0,140}\b(?:one\s+(?:new\s+york\s+)?perspective\s+set\s+the\s+scale|(?:the\s+)?whole\s+frame)\b/i.test(
      normalized,
    ) &&
    !/\b(?:my|one|this)\s+(?:new\s+york\s+)?perspective\b[^.!?]{0,100}\b(?:set|sets|should\s+set|defines?|should\s+define)\b/i.test(
      target,
    );
  const unsupportedTargetAttitude = unsupportedTargetAttitudeClaims(
    normalized,
    target,
  );
  const targetUsesQualifiedScope =
    /\b(?:usually|sometimes|often|at\s+times|may|might|can|depending\s+on|in\s+some\s+(?:cases|situations))\b/i.test(
      target,
    );
  const challengePreservesQualifiedScope =
    /\b(?:usually|sometimes|often|at\s+times|may|might|can|depending\s+on|in\s+some\s+(?:cases|situations))\b/i.test(
      normalized,
    );
  const challengeAttributesAbsoluteScope =
    /\b(?:you\s+(?:said|argued|claimed|concluded)|your\s+(?:conclusion|position|view|rule))\b[^.!?]{0,180}\b(?:always|never|only|must|should|first\s+move|as\s+a\s+rule)\b/i.test(
      normalized,
    );
  const faithfulDirectSaidAttribution = hasFaithfulDirectSaidAttribution(
    normalized,
    target,
  );

  if (possibleInference) {
    reasons.push(
      "Challenge manufactures conflict through an imagined circle or group inference instead of naming an actual limit or unresolved tension.",
    );
  }
  // Direct attribution is acceptable only in the narrow, auditable case where
  // the target actually used the same conclusion-strengthening language.
  if (
    DIRECT_TARGET_ATTRIBUTION.some((pattern) => pattern.test(normalized)) &&
    !faithfulDirectSaidAttribution &&
    (challengeStrengthening.length === 0 || unsupportedStrengthening.length > 0)
  ) {
    reasons.push(
      "Challenge directly attributes an assumption or conclusion to the target instead of naming an actual limit or unresolved tension.",
    );
  }
  if (unsupportedStrengthening.length && !possibleInference) {
    reasons.push(
      `Challenge strengthens the target into an unsupported ${unsupportedStrengthening.join("/")} claim.`,
    );
  }
  if (targetUncertaintyQualifiers >= 2 && invertsUncertaintyIntoCertainty) {
    reasons.push(
      "Challenge contradicts the target by turning explicit uncertainty qualifiers into a claim of certainty.",
    );
  }
  if (unsupportedNormativeAbsolute) {
    reasons.push(
      "Challenge turns the target's qualified statement into an unsupported always-right normative claim.",
    );
  }
  if (prescriptiveLeap) {
    reasons.push(
      "Challenge turns the target's care into an unsupported claim about the right response.",
    );
  }
  if (unsupportedPerspectiveScale) {
    reasons.push(
      "Challenge invents a leap from the target's bounded point to setting the scale for the whole subject.",
    );
  }
  if (unsupportedTargetAttitude) {
    reasons.push(
      "Challenge attributes a dismissive or devaluing attitude to the target that the target did not state.",
    );
  }
  if (
    targetUsesQualifiedScope &&
    challengeAttributesAbsoluteScope &&
    !challengePreservesQualifiedScope
  ) {
    reasons.push(
      "Challenge drops the target's qualifying language and strengthens a conditional position into an absolute claim.",
    );
  }
  if (
    isPublicIssueLanguage(`${normalized} ${target}`) &&
    (
      (
        hasEpistemicVoiceRestraintFrame(normalized) &&
        hasEpistemicVoiceRestraintFrame(target)
      ) ||
      (
        hasRepresentationBurdenFrame(normalized) &&
        hasRepresentationBurdenFrame(target)
      )
    ) &&
    !hasDistinctMaterialPublicStake(normalized, target)
  ) {
    reasons.push(
      "Challenge restates the target's existing tension instead of adding a distinct subject-level omission, priority, or disagreement.",
    );
  }
  const comparisonTopic = inferredPublicTopicForSemanticComparison(
    `${target} ${normalized}`,
  );
  const statesSubjectPosition = Boolean(
    comparisonTopic &&
      detectPublicEngagementLanes(normalized, comparisonTopic).length > 0,
  );
  if (
    statesSubjectPosition &&
    comparisonTopic &&
    materialPositionRecastsExistingPosition(
      normalized,
      target,
      comparisonTopic,
    )
  ) {
    reasons.push(
      "Challenge paraphrases the target's existing subject priority instead of adding a distinct material stake or disagreement.",
    );
  }

  if (/\b(?:the\s+circle|we)\s+should\s+not\s+conclude\s+yet\b/i.test(normalized)) {
    reasons.push("Challenge uses the canned 'circle/we should not conclude yet' ending.");
  }

  if (TRUNCATED_QUOTED_EXCERPT.test(normalized)) {
    reasons.push(
      "Challenge includes a mechanically truncated quoted excerpt instead of a complete quotation or paraphrase.",
    );
  }

  if (recentChallenges.some((reference) => hasHighStructuralReuse(normalized, reference))) {
    reasons.push("Challenge reuses too much of a recent challenge's sentence structure.");
  }
  return uniqueReasons(reasons);
}

/** Reject a challenge that silently reverses the challenger's own clear ranking. */
export function challengeSelfConsistencyRejectionReasons(
  text: string,
  references: readonly string[],
  topic: string,
): string[] {
  if (!isDifficultPublicTopic(topic) || references.length === 0) return [];
  const normalized = normalizeDialogueFormatting(text);
  const explainsChangedPosition =
    /\b(?:i(?:'|’)?ve|i\s+have|i)\s+(?:changed|reconsidered|revised|shifted)\s+(?:my\s+)?(?:mind|view|position|priority|weighting)\b|\bmy\s+(?:mind|view|position|priority|weighting)\s+(?:has\s+)?(?:changed|shifted)\b|\bafter\s+(?:hearing|listening\s+to|reflecting\s+on)\b[^.!?]{0,120}\b(?:i\s+now|my\s+(?:view|position|priority)\s+(?:has\s+)?(?:changed|shifted))\b/i.test(
      normalized,
    );
  if (explainsChangedPosition) return [];

  const currentLanes = detectPublicEngagementLanes(normalized, topic);
  const currentFamilies = materialPublicStakeFamilyIds(normalized);
  const currentPresentsPriorityCompetition =
    currentLanes.some(
      (lane) =>
        lane === "unresolved-subject-choice" ||
        lane === "competing-obligations",
    ) &&
    /\b(?:which|whether|between|versus|vs\.?|against|competing|torn|unsure|uncertain|unresolved|first\s+priority|come\s+first|carry\s+more\s+weight)\b/i.test(
      normalized,
    );

  if (currentPresentsPriorityCompetition && currentFamilies.size > 0) {
    for (const reference of references) {
      const prior = normalizeDialogueFormatting(reference);
      const priorFamilies = materialPublicStakeFamilyIds(prior);
      const sharedFamilyCount = intersectionSize(
        currentFamilies,
        priorFamilies,
      );
      const relatedFamilyBridge =
        (currentFamilies.has("displacement-and-housing") &&
          priorFamilies.has("family-unity-and-reconnection")) ||
        (currentFamilies.has("family-unity-and-reconnection") &&
          priorFamilies.has("displacement-and-housing"));
      if (sharedFamilyCount === 0 && !relatedFamilyBridge) continue;

      const priorStatesDecidingOutcome =
        /\b(?:the\s+)?deciding\s+(?:outcome|factor|test|priority)\b|\bwhat\s+(?:matters|counts)\s+most\b/i.test(
          prior,
        );
      const priorLinksOutcomesRatherThanRankingThem =
        /\b(?:cannot|can't|do\s+not|don't|would\s+not|wouldn't)\s+separate\b[^.!?]{0,180}\b(?:from|and)\b|\b(?:single|one|joined|integrated)\s+(?:response|approach|plan)\b|\b(?:linked|paired|inseparable|held\s+together),?\s+(?:and\s+)?not\s+competing\b|\b(?:linked|paired|inseparable|held\s+together)\s+(?:outcomes?|obligations?|priorities?)\b/i.test(
          prior,
        );
      if (
        priorStatesDecidingOutcome ||
        (priorLinksOutcomesRatherThanRankingThem &&
          (sharedFamilyCount >= 2 || relatedFamilyBridge))
      ) {
        return [
          "Challenge turns this speaker's earlier deciding or linked outcome into an unresolved priority contest without explaining the change; keep the challenge consistent or explicitly account for the shift.",
        ];
      }
    }
  }

  const priorExplicitImmediateFirst = references.some((reference) => {
    const prior = normalizeDialogueFormatting(reference);
    return (
      /\b(?:priority|prioritize|choose|choosing|put|placing|keep\s+choosing)\b[^.!?]{0,100}\b(?:immediate|urgent|emergency|life-preserving)\b/i.test(prior) ||
      /\b(?:immediate|urgent|emergency|life-preserving)\b[^.!?]{0,100}\b(?:first|over|before|priority|non-negotiable)\b/i.test(prior) ||
      /\b(?:food|water|medicine|medical\s+care|basic\s+needs?|basics|humanitarian\s+aid|emergency\s+relief)\b[^.!?]{0,90}\b(?:come|comes|must\s+come|goes?|is|are|put|placed)?\s*(?:first|non-negotiable)\b/i.test(
        prior,
      )
    );
  });
  if (!priorExplicitImmediateFirst) return [];

  const hasImmediateStake = currentFamilies.has(
    "immediate-civilian-protection",
  );
  const hasDeferredOrAccountabilityStake =
    currentFamilies.has("recovery-and-continuity") ||
    currentFamilies.has("rights-and-accountability") ||
    /\b(?:lasting|long[- ]term|after(?:ward)?|later|accountability|recovery)\b/i.test(
      normalized,
    );
  const presentsImmediateVersusLaterAsUnsettled =
    currentLanes.some((lane) =>
      lane === "unresolved-subject-choice" || lane === "competing-obligations") &&
    hasImmediateStake &&
    hasDeferredOrAccountabilityStake;
  const additivePosition =
    /\bi\s+(?:also|still)\s+(?:hold|carry|name|recognize|see|have|support|protect)\b|\b(?:another|an\s+additional|a\s+second)\s+(?:priority|outcome|obligation|commitment)\s+i\s+(?:hold|carry|name|recognize|have)\b/i.test(
      normalized,
    );
  const explicitCurrentFirstFamilies = explicitFirstPriorityFamilyIds(normalized);
  const preservesImmediatePriority =
    explicitCurrentFirstFamilies.has("immediate-civilian-protection") ||
    (
      explicitCurrentFirstFamilies.size === 0 &&
      (
        hasImmediateStake ||
        /\b(?:immediate|urgent|emergency|today|right\s+now|life[- ](?:saving|preserving)|survival|medical\s+(?:evacuation|transfer)|hospital\s+access|evacuation\s+route|safe\s+passage)\b/i.test(
          normalized,
        )
      )
    );
  const statesReplacementOutcome =
    /\b(?:my\s+)?(?:priority|protected\s+outcome|deciding\s+outcome)\s+(?:is|remains)\b|\bthe\s+outcome\s+i\s+(?:need|would|will)\s+to\s+protect\b/i.test(
      normalized,
    ) || explicitCurrentFirstFamilies.size > 0;
  const replacesImmediatePriority =
    !additivePosition &&
    statesReplacementOutcome &&
    currentFamilies.size > 0 &&
    !preservesImmediatePriority &&
    (
      detectPrimaryPublicEngagementLane(normalized, topic) ===
        "protected-human-outcome" ||
      explicitCurrentFirstFamilies.size > 0
    );
  if (presentsImmediateVersusLaterAsUnsettled || replacesImmediatePriority) {
    return [
      "Challenge contradicts this speaker's earlier immediate-needs-first position without explaining a change; keep the challenge consistent or explicitly account for the shift.",
    ];
  }
  return [];
}

const CONCEPT_STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "another", "because",
  "before", "being", "between", "both", "but", "can", "could", "did", "does",
  "doing", "each", "even", "every", "feel", "feels", "felt", "for", "from",
  "gaza", "have", "here", "into", "just", "like", "more", "most", "much",
  "new", "not", "now", "one", "only", "other", "our", "people", "person",
  "right", "said", "same", "should", "some", "still", "subject", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "today", "topic", "turn", "very", "want", "war", "was", "way",
  "were", "what", "when", "where", "which", "while", "with", "would", "york",
  "you", "your", "family", "families", "moment", "moments", "conversation",
  "conversations", "thing", "things", "trying", "really", "city", "circle",
]);

const CONCEPT_ALIASES: Record<string, string> = {
  subway: "transit",
  train: "transit",
  trains: "transit",
  commute: "transit",
  commutes: "transit",
  ride: "transit",
  rides: "transit",
  text: "messages",
  texts: "messages",
  chat: "messages",
  chats: "messages",
  message: "messages",
  messages: "messages",
  kitchen: "kitchen",
  cooking: "kitchen",
  cooked: "kitchen",
  lentil: "kitchen",
  lentils: "kitchen",
  apartment: "home",
  household: "home",
  house: "home",
  grandfather: "grandfather",
  granddad: "grandfather",
  grandpa: "grandfather",
  grandmother: "grandmother",
  grandma: "grandmother",
  poem: "poetry",
  poems: "poetry",
  poetry: "poetry",
  verse: "poetry",
  verses: "poetry",
  joke: "humor",
  jokes: "humor",
  humor: "humor",
  laugh: "humor",
  laughter: "humor",
  pun: "humor",
  punchline: "humor",
  listening: "listen",
  listened: "listen",
  listens: "listen",
  memories: "memory",
  worried: "worry",
  worrying: "worry",
  anxiety: "worry",
  anxious: "worry",
  honest: "honesty",
  generous: "hospitality",
  generosity: "hospitality",
  hospitable: "hospitality",
  warmth: "hospitality",
  breathing: "pause",
  breathe: "pause",
  paused: "pause",
  pausing: "pause",
  headlines: "headline",
  arguments: "argument",
  disagreements: "disagreement",
  understood: "understand",
  understanding: "understand",
  grounded: "grounding",
};

function topicWordSet(topic: string): Set<string> {
  return new Set(wordTokens(topic));
}

function conceptSet(text: string, topic: string): Set<string> {
  const topicWords = topicWordSet(topic);
  const concepts = new Set<string>();
  for (const token of wordTokens(text)) {
    const plain = token.replace(/'s$/i, "");
    if (topicWords.has(plain) || CONCEPT_STOP_WORDS.has(plain) || plain.length < 4) continue;
    concepts.add(CONCEPT_ALIASES[plain] ?? plain);
  }
  return concepts;
}

function tokensWithoutTopic(text: string, topic: string): string[] {
  const topicWords = topicWordSet(topic);
  return wordTokens(text).filter((token) => !topicWords.has(token));
}

function sharedLongPhrase(text: string, reference: string, topic: string): string | null {
  const candidateTokens = tokensWithoutTopic(text, topic);
  const referenceEight = ngrams(tokensWithoutTopic(reference, topic), 8);
  for (let index = 0; index + 8 <= candidateTokens.length; index++) {
    const phrase = candidateTokens.slice(index, index + 8).join(" ");
    if (referenceEight.has(phrase)) return phrase;
  }
  return null;
}

function noveltyBody(text: string): string {
  const sentences = normalizeDialogueFormatting(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.at(-1)?.includes("?")) sentences.pop();
  return sentences.join(" ");
}

// Novelty is intentionally narrower than persona-fidelity concept matching.
// Words such as safety, uncertainty, civilians, grief, dignity, aid, and
// accountability belong naturally to more than one response about the same
// public topic. Repetition becomes suspicious when a speaker reuses a concrete
// scene or persona motif bundle (for example subway + texts + kitchen), not
// merely when two turns share stakeholder vocabulary.
const DISTINCTIVE_IMAGERY_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "transit", pattern: /\b(?:subway|train|trains|commute|commutes|platform)\b/i },
  { id: "messages", pattern: /\b(?:text|texts|chat|chats|message|messages|group chat|group chats)\b/i },
  { id: "kitchen", pattern: /\b(?:kitchen|cooking|cooked|cook|lentil|lentils|rice)\b/i },
  { id: "shop", pattern: /\b(?:deli|bodega|grocery|sweet shop|shop counter)\b/i },
  { id: "humor", pattern: /\b(?:joke|jokes|humou?r|laugh|laughter|pun|punchline|punchlines)\b/i },
  { id: "grandfather", pattern: /\b(?:grandfather|granddad|grandpa)\b/i },
  { id: "grandmother", pattern: /\b(?:grandmother|grandma)\b/i },
  { id: "parents", pattern: /\b(?:parent|parents|mother|father|mom|dad)\b/i },
  { id: "poetry", pattern: /\b(?:poem|poems|poetry|verse|verses|spoken word)\b/i },
  { id: "home", pattern: /\b(?:home|apartment|household|open house)\b/i },
  { id: "memory", pattern: /\b(?:memory|memories|inherited|endurance)\b/i },
  { id: "hospitality", pattern: /\b(?:hospitality|generosity|generous|open-door|warmth)\b/i },
  { id: "food-tradition", pattern: /\b(?:asado|asados|mate|jalebi|recipe|recipes)\b/i },
  { id: "smoothing", pattern: /\b(?:smooth|smooths|smoothed|smoothing)\b/i },
  { id: "headline", pattern: /\b(?:headline|headlines|news alert|news alerts)\b/i },
  { id: "prayer", pattern: /\b(?:pray|prayer|prayers)\b/i },
];

const DISTINCTIVE_SCENE_BUNDLES: ReadonlyArray<readonly string[]> = [
  ["transit", "messages", "kitchen"],
  ["transit", "shop", "humor"],
  ["grandmother", "poetry", "memory"],
  ["home", "hospitality", "food-tradition"],
];

function distinctiveImagerySet(text: string): Set<string> {
  const normalized = normalizeDialogueFormatting(text);
  return new Set(
    DISTINCTIVE_IMAGERY_PATTERNS
      .filter(({ pattern }) => pattern.test(normalized))
      .map(({ id }) => id),
  );
}

function containsDistinctiveSceneBundle(shared: ReadonlySet<string>): boolean {
  return DISTINCTIVE_SCENE_BUNDLES.some((bundle) =>
    bundle.every((concept) => shared.has(concept)));
}

const INVITED_RESPONSE_CONCERN_FEATURES: ReadonlyArray<{
  id: string;
  pattern: RegExp;
}> = [
  {
    id: "insufficiency",
    pattern:
      /\b(?:alone|by\s+itself|on\s+its\s+own|not\s+(?:enough|sufficient|complete|the\s+whole)|insufficient|inadequate|incomplete|cannot|can't)\b[^.!?]{0,90}\b(?:carry|hold|answer|resolve|settle|solve|replace)|\b(?:substitute|replacement)\s+for\b|\b(?:only|merely)\s+(?:an?\s+)?(?:opening|start|first\s+step)\b|\bnot\s+the\s+(?:whole|full|complete)\s+(?:answer|conversation|response|solution)\b/i,
  },
  {
    id: "unaddressed-pain",
    pattern:
      /\b(?:pain|painful|hurt|hurts|hurting|harm|grief|loss|wound|wounds|suffering|harder\s+truth|hard\s+truth|what\s+hurts|underneath|deeper)\b|\b(?:name|naming|face|facing|confront)\b[^.!?]{0,45}\b(?:pain|hurt|harm|grief|loss|truth|difficult|hard)\b/i,
  },
  {
    id: "premature-resolution",
    pattern:
      /\b(?:smooth(?:ing|ed|s)?\s+over|rush(?:ing|ed)?|too\s+quickly|premature(?:ly)?|skip(?:ping|ped)?\s+(?:over|past)|move\s+past|tie\s+up|settle(?:d|s|ment)?|resolve(?:d|s)?|unresolved|resolution|conclude(?:d|s)?|conclusion)\b/i,
  },
  {
    id: "difference-or-complexity",
    pattern:
      /\b(?:difference|different|distinction|limit|boundary|disagreement|division|tension|complexity|competing|conflict|contradiction|unresolved|uncertainty)\b|\b(?:that|this|one|a)\s+frame\b[^.!?]{0,90}\b(?:the\s+)?(?:full|whole)\s+(?:reality|picture)\b|\b(?:another|a\s+different|a\s+second)\s+(?:layer|level)\b/i,
  },
  {
    id: "recognition-without-understanding",
    pattern:
      /\b(?:recognition|recognize|surface|shallow|seen|seeing|notice|noticing)\b[^.!?]{0,80}\b(?:understand|understanding|listen|listening|enough|depth|deeper)|\b(?:not|without)\s+(?:really\s+|fully\s+)?(?:understanding|listening)\b/i,
  },
  {
    id: "pace-or-pressure",
    pattern:
      /\b(?:set\s+the\s+pace|slow\s+down|stay\s+with|make\s+room|leave\s+space|pressure|pressured|pushing|pushed|speaking\s+first|move\s+too\s+fast|more\s+time)\b/i,
  },
  {
    id: "erasure-or-omission",
    pattern:
      /\b(?:erase|erases|erased|erasure|overlook|overlooks|overlooked|leave|leaves|left)\b[^.!?]{0,40}\b(?:out|behind|unheard|unseen)|\b(?:dismiss|dismisses|dismissed|minimize|minimizes|minimized|silence|silences|silenced|missing|omission|omitted|remain\s+visible)\b|\b(?:separate|distinct)\s+(?:priority|outcome|obligation|concern)\b/i,
  },
  {
    id: "impact-versus-intent",
    pattern:
      /\b(?:impact|effect|harm)\b[^.!?]{0,70}\b(?:intent|intention|motive|meant)|\b(?:intent|intention|motive|meant)\b[^.!?]{0,70}\b(?:impact|effect|harm)\b/i,
  },
  {
    id: "competing-obligations",
    pattern:
      /\b(?:torn|caught|divided)\s+between\b|\b(?:weigh|balance)\b[^.!?]{0,90}\b(?:against|with)\b|\bcannot\s+let\b[^.!?]{0,100}\berase\b|\bcompeting\s+(?:obligations|outcomes|priorities|duties)\b|\bremain\s+in\s+tension\b/i,
  },
  {
    id: "bounded-response",
    pattern:
      /\b(?:would|will)\s+(?:support|oppose|reject|accept|back|endorse|permit|allow)\b|\bmy\s+(?:condition|criterion|standard|test)\b|\bonly\s+when\b|\b(?:condition|criterion|standard|test)\b[^.!?]{0,90}\b(?:response|action|policy|acceptable|responsible|investment)\b|\bproposed\s+response\b/i,
  },
  {
    id: "unresolved-choice",
    pattern:
      /\bchoice\b[^.!?]{0,90}\b(?:cannot|can't|unresolved|unsettled|whether)\b|\bunresolved\s+(?:question|choice)\b|\bquestion\s+is\s+whether\b|\b(?:am|remain)\s+(?:unsure|uncertain|unresolved)\s+(?:about\s+)?whether\b|\bleaves?\s+unresolved\s+whether\b/i,
  },
] as const;

const INVITED_RESPONSE_RELATION =
  /\b(?:concern|worry|challenge|challenged|challenging|dispute|disputes|disputed|disputing|questioned|questioning|push(?:ed|ing)?\s+back|push(?:ed|ing)?\s+on|objection|caution|unease|disagreed|disagreement|resisted|resistance|point\s+(?:that|about)|asked\s+us\s+not\s+to)\b/i;

const CHALLENGER_CONCERN_CUE =
  /\b(?:challenge|disagree|worry|fear|question|object|resist|but|however|yet|cannot|can't|not|need|needs|must|should|enough|alone|by\s+itself|on\s+its\s+own|rather|instead)\b/i;

const GENERIC_INVITED_RESPONSE_CONCEPTS = new Set([
  "appreciate", "challenge", "challenged", "challenger", "concern", "disagree",
  "discussion", "hear", "heard", "point", "question", "respond", "response",
  "saying", "share", "shared", "speaker", "understand", "worry",
]);

const SOURCE_ATTRIBUTION_VERBS =
  "described|shared|recalled|remembered|introduced|offered|told\\s+us\\s+about|brought\\s+up|gave\\s+us|presented|named";

const TARGET_DETAIL_FEATURES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "pause-practice", pattern: /\b(?:breath|breathe|breathing|pause|paused|pausing)\b/i },
  {
    id: "feelings-inquiry",
    pattern: /\b(?:ask|asked|asking|question)\b[^.!?]{0,55}\b(?:feel|feeling|feelings|emotion|emotions)\b/i,
  },
  {
    id: "family-memory",
    pattern: /\b(?:family|parent|parents|mother|father|grandmother|grandfather|aunt|uncle)\b[^.!?]{0,70}\b(?:memory|story|stories|taught|tradition|ritual|used\s+to)\b/i,
  },
  {
    id: "food-ritual",
    pattern: /\b(?:recipe|meal|food|cooking|kitchen|asado|mate|jalebi|lentils|rice)\b/i,
  },
] as const;

function concernFeatureSet(text: string): Set<string> {
  const normalized = normalizeDialogueFormatting(text);
  return new Set(
    INVITED_RESPONSE_CONCERN_FEATURES
      .filter(({ pattern }) => pattern.test(normalized))
      .map(({ id }) => id),
  );
}

function speakerNameAlternation(displayName: string): string {
  const full = displayName.trim();
  const first = full.split(/\s+/)[0] ?? "";
  return Array.from(new Set([full, first].filter(Boolean)))
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join("|");
}

function concernBearingText(text: string): string {
  const sentences = normalizeDialogueFormatting(text).match(/[^.!?\n]+[.!?]?/g) ?? [];
  const concernSentences = sentences.filter((sentence) => CHALLENGER_CONCERN_CUE.test(sentence));
  return (concernSentences.length ? concernSentences : sentences).join(" ");
}

function substantiveConceptSet(text: string, excludedText: string): Set<string> {
  const concepts = conceptSet(text, excludedText);
  for (const generic of GENERIC_INVITED_RESPONSE_CONCEPTS) concepts.delete(generic);
  return concepts;
}

function challengerSourceAttributions(
  text: string,
  challengerName: string,
): Array<{ verb: string; detail: string }> {
  const names = speakerNameAlternation(challengerName);
  if (!names) return [];

  const attributions: Array<{ verb: string; detail: string }> = [];
  const namedSubject = new RegExp(
    `\\b(?:${names})\\b\\s+(?:has\\s+|had\\s+)?(${SOURCE_ATTRIBUTION_VERBS})\\b([^.!?\\n]{0,220})`,
    "gi",
  );
  const directSecondPerson = new RegExp(
    `(?:^|[.!?]\\s*)\\b(?:${names})\\b\\s*,[^.!?\\n]{0,45}?\\byou\\s+(?:have\\s+|had\\s+)?(${SOURCE_ATTRIBUTION_VERBS})\\b([^.!?\\n]{0,220})`,
    "gi",
  );
  for (const pattern of [namedSubject, directSecondPerson]) {
    for (const match of text.matchAll(pattern)) {
      attributions.push({ verb: match[1] ?? "", detail: (match[2] ?? "").trim() });
    }
  }
  return attributions;
}

function challengerPossessiveDetails(
  text: string,
  challengerName: string,
): string[] {
  const names = speakerNameAlternation(challengerName);
  if (!names) return [];
  const pattern = new RegExp(
    `\\b(?:${names})(?:['’]s)\\s+([^.!?;,\\n]{1,140})`,
    "gi",
  );
  return Array.from(text.matchAll(pattern))
    .map((match) => (match[1] ?? "").trim())
    .filter(
      (detail) =>
        !/^(?:point|concern|challenge|objection|priority|distinction|boundary|question)\b/i.test(
          detail,
        ),
    );
}

function attributionNamesConcern(
  detail: string,
  challengerConcernFeatures: ReadonlySet<string>,
): boolean {
  if (/^(?:his|their|a|the)\s+(?:concern|worry|challenge|objection|question|doubt|unease|point)\b/i.test(detail)) {
    return true;
  }
  if (!/^(?:that|why)\b/i.test(detail)) return false;
  return intersectionSize(concernFeatureSet(detail), challengerConcernFeatures) > 0;
}

function attributionContainsTargetDetail(
  detail: string,
  targetText: string,
  excludedText: string,
): boolean {
  const targetConcepts = substantiveConceptSet(targetText, excludedText);
  const detailConcepts = substantiveConceptSet(detail, excludedText);
  if (intersectionSize(targetConcepts, detailConcepts) >= 2) return true;
  if (sharedLongPhrase(detail, targetText, excludedText)) return true;

  const sharedImagery = intersectionSize(
    distinctiveImagerySet(detail),
    distinctiveImagerySet(targetText),
  );
  if (sharedImagery > 0) return true;

  return TARGET_DETAIL_FEATURES.some(
    ({ pattern }) => pattern.test(targetText) && pattern.test(detail),
  );
}

/**
 * Check that an invited reply answers the challenger rather than crediting the
 * challenger with the original target's story or practice. Semantic concern
 * families allow paraphrases; this deliberately does not require copied words.
 */
export function assessInvitedResponseFidelity(
  input: InvitedResponseFidelityInput,
): InvitedResponseFidelityAssessment {
  const normalized = normalizeDialogueFormatting(input.text);
  const names = speakerNameAlternation(input.challengerName);
  const challengerAddressed = Boolean(
    names && new RegExp(`\\b(?:${names})\\b`, "i").test(normalized),
  );
  const directAcknowledgment = Boolean(
    names && new RegExp(
      `\\b(?:${names})\\b\\s*,[^.!?\\n]{0,70}\\bi\\s+(?:hear|understand|recognize|reflect|take|accept)\\b`,
      "i",
    ).test(normalized),
  );
  const indirectNamedAcknowledgment = Boolean(
    names && new RegExp(
      `\\bi\\s+(?:hear|understand|recognize)\\s+what\\s+(?:${names})\\s+is\\s+(?:raising|questioning|challenging|pointing\\s+to)\\b`,
      "i",
    ).test(normalized),
  );
  const namedPossessiveAcknowledgment = Boolean(
    names && new RegExp(
      `\\bi\\s+(?:hear|understand|recognize|take\\s+seriously)\\s+(?:${names})(?:['’]s)\\s+(?:point|concern|challenge|objection|priority|distinction|boundary)\\b`,
      "i",
    ).test(normalized),
  );
  const namedConcernAttribution = Boolean(
    names && new RegExp(
      `\\b(?:${names})\\b\\s+(?:(?:is|has\\s+been)\\s+(?:naming|identifying|raising|pointing\\s+to)|(?:has\\s+)?(?:named|identified|raised|pointed\\s+to))\\s+(?:the\\s+|a\\s+)?(?:(?:real|exact|central|core|specific|separate|distinct)\\s+)?(?:concern|tension|limit|objection|question|difference|uncertainty|priority|outcome|obligation|omission|boundary|separation|distinction)\\b`,
      "i",
    ).test(normalized),
  );
  const directNamedConcernFraming = Boolean(
    names && new RegExp(
      `\\b(?:${names})\\b\\s*,[^.!?\\n]{0,85}?\\byou(?:['’]re|\\s+are)\\s+(?:putting|naming|identifying|raising|pointing\\s+to)\\s+(?:the\\s+|a\\s+)?(?:(?:real|exact|central|core|specific|separate|distinct)\\s+)?(?:concern|tension|limit|objection|question|difference|uncertainty|priority|outcome|obligation|omission|boundary|separation|distinction)\\b`,
      "i",
    ).test(normalized),
  );
  const pointingOutAttribution = Boolean(
    names && new RegExp(
      `(?:\\b(?:${names})\\b\\s*,[^.!?\\n]{0,45}?\\byou(?:['’]re|\\s+are)\\s+pointing\\s+out\\s+that\\b|\\b(?:${names})\\b\\s+(?:has\\s+)?pointed\\s+out\\s+that\\b)`,
      "i",
    ).test(normalized),
  );
  const challengerConcernFramed = challengerAddressed &&
    (
      INVITED_RESPONSE_RELATION.test(normalized) ||
      directAcknowledgment ||
      indirectNamedAcknowledgment ||
      namedPossessiveAcknowledgment ||
      namedConcernAttribution ||
      directNamedConcernFraming ||
      pointingOutAttribution
    );

  const challengerConcernFeatures = concernFeatureSet(input.challengerText);
  const responseConcernFeatures = concernFeatureSet(normalized);
  const reflectedConcernFeatures = Array.from(challengerConcernFeatures)
    .filter((feature) => responseConcernFeatures.has(feature));

  const excludedText = [
    input.topic ?? "",
    input.challengerName,
    input.targetName,
  ].join(" ");
  const challengerConcernConcepts = substantiveConceptSet(
    concernBearingText(input.challengerText),
    excludedText,
  );
  const targetConcepts = substantiveConceptSet(input.targetText, excludedText);
  const challengerOnlyConcepts = new Set(
    Array.from(challengerConcernConcepts).filter((concept) => !targetConcepts.has(concept)),
  );
  const conceptsToReflect = challengerOnlyConcepts.size
    ? challengerOnlyConcepts
    : challengerConcernConcepts;
  const responseConcepts = substantiveConceptSet(normalized, excludedText);
  const reflectedChallengerConcepts = Array.from(conceptsToReflect)
    .filter((concept) => responseConcepts.has(concept));
  const challengerMaterialStakes = materialPublicStakeIds(input.challengerText);
  const targetMaterialStakes = materialPublicStakeIds(input.targetText);
  const challengerOnlyMaterialStakes = new Set(
    Array.from(challengerMaterialStakes)
      .filter((stake) => !targetMaterialStakes.has(stake)),
  );
  const materialStakesToReflect = challengerOnlyMaterialStakes.size > 0
    ? challengerOnlyMaterialStakes
    : challengerMaterialStakes;
  const responseMaterialStakes = materialPublicStakeIds(normalized);
  const reflectedExplicitMaterialStake = materialStakesToReflect.size > 0 &&
    Array.from(materialStakesToReflect)
      .some((stake) => responseMaterialStakes.has(stake));
  const reflectsMaterialStake = materialStakesToReflect.size === 0 ||
    reflectedExplicitMaterialStake;

  const attributionHasSubstance =
    (
      !namedConcernAttribution ||
      reflectedChallengerConcepts.length > 0 ||
      reflectedExplicitMaterialStake
    ) &&
    (
      !pointingOutAttribution ||
      reflectedChallengerConcepts.length > 0 ||
      reflectedConcernFeatures.length > 0 ||
      reflectedExplicitMaterialStake
    );
  const engagesChallengerConcern = challengerConcernFramed &&
    attributionHasSubstance &&
    reflectsMaterialStake &&
    (
      reflectedExplicitMaterialStake ||
      (
        challengerConcernFeatures.size > 0
          ? reflectedConcernFeatures.length > 0
          : reflectedChallengerConcepts.length > 0
      )
    );

  const misattributesTargetDetailToChallenger = challengerSourceAttributions(
    normalized,
    input.challengerName,
  ).some(({ detail }) =>
    !attributionNamesConcern(detail, challengerConcernFeatures) &&
    attributionContainsTargetDetail(detail, input.targetText, excludedText)) ||
    challengerPossessiveDetails(normalized, input.challengerName).some(
      (detail) =>
        attributionContainsTargetDetail(detail, input.targetText, excludedText) &&
        !attributionContainsTargetDetail(
          detail,
          input.challengerText,
          excludedText,
        ),
    );

  const rejectionReasons: string[] = [];
  if (!challengerAddressed) {
    rejectionReasons.push("Invited response must address the triggering challenger by name.");
  }
  if (challengerAddressed && !challengerConcernFramed) {
    rejectionReasons.push(
      "Invited response must identify the challenger's concern, question, or disagreement rather than merely acknowledge the person.",
    );
  }
  if (challengerConcernFramed && !engagesChallengerConcern) {
    rejectionReasons.push(
      "Invited response does not engage the substance of the challenger's actual concern.",
    );
  }
  if (misattributesTargetDetailToChallenger) {
    rejectionReasons.push(
      "Invited response credits the challenger with a detail supplied by the original target instead of describing what the challenger disputed about it.",
    );
  }
  if (
    /\b(?:you(?:['’]re|\s+are)\s+right(?:\s+to\s+push\s+back)?|i\s+agree\s+with\s+(?:you|your\s+(?:challenge|objection)))\b/i.test(normalized) ||
    Boolean(
      names && new RegExp(`\\b(?:${names})\\b\\s+is\\s+right\\b`, "i").test(normalized),
    )
  ) {
    rejectionReasons.push(
      "Invited response must reflect the challenge without declaring the challenger right or conceding an unstated position.",
    );
  }

  return {
    acceptable: rejectionReasons.length === 0,
    challengerAddressed,
    challengerConcernFramed,
    engagesChallengerConcern,
    misattributesTargetDetailToChallenger,
    challengerConcernFeatures: Array.from(challengerConcernFeatures),
    reflectedConcernFeatures,
    reflectedChallengerConcepts,
    rejectionReasons: uniqueReasons(rejectionReasons),
  };
}

export interface DialogueSemanticReference {
  speakerId: string;
  text: string;
}

// These are concrete subject dimensions, not generic discussion-process
// vocabulary. A response can acknowledge uncertainty while still escaping a
// meta-dialogue loop by naming one of these practical stakes.
const MATERIAL_PUBLIC_STAKE_PATTERNS: ReadonlyArray<{
  id: string;
  pattern: RegExp;
}> = [
  {
    id: "physical-safety",
    pattern:
      /\b(?:civilian\s+(?:safety|lives?|harm|protection)|(?:immediate|lasting)\s+civilian\s+safety|(?:immediate|physical)\s+(?:civilian\s+)?(?:safety|harm|protection)|loss\s+of\s+life|protecting\s+civilian\s+lives?|(?:getting|providing|protecting)\s+(?:care\s+and\s+)?safety|people\s+who\s+are\s+hurting|killed|injured|injury|deaths?|violence)\b/i,
  },
  {
    id: "hostage-safety",
    pattern: /\b(?:hostages?|safe\s+return\s+of\s+hostages?)\b/i,
  },
  {
    id: "conflict-cessation",
    pattern:
      /\b(?:ceasefire|ending|halting|stopping|preventing)\s+(?:further\s+)?(?:armed\s+)?violence\b/i,
  },
  {
    id: "basic-needs",
    pattern:
      /\b(?:humanitarian\s+aid|immediate\s+relief|getting\s+care|food|water|medicine|medical\s+(?:care|access|continuity)|access\s+to\s+medicine|health\s+care|continuity\s+of\s+(?:care|treatment)|continuity\s+of\s+medical\s+care|treatment\s+(?:chains?|continuity)|ongoing\s+care|hunger|shelter|basics|basic\s+needs?|essential\s+services?)\b/i,
  },
  {
    id: "displacement-housing",
    pattern:
      /\b(?:displaced|displacement|refugees?|loss\s+of\s+(?:a\s+)?home|housing|keeping\s+families\s+housed)\b/i,
  },
  {
    id: "family-unity",
    pattern:
      /\b(?:family[- ]tracing|tracing\s+(?:a\s+)?famil(?:y|ies)|family\s+(?:reunification|reunion|reconnection|linkage|unity)|reconnect(?:ing|ed|s)?\s+(?:people|families|relatives?|loved\s+ones)|reunit(?:e|ed|es|ing)\s+(?:people|families|relatives?|loved\s+ones)|kinship\s+ties?|families\s+(?:staying|kept|remaining)\s+(?:connected|together)|families\s+(?:torn|split|separated)\s+apart|permanent\s+(?:family\s+)?separation|reduced\s+separation)\b/i,
  },
  {
    id: "rights-accountability",
    pattern: /\b(?:rights?|justice|accountability|equal\s+treatment|legal\s+protection)\b/i,
  },
  {
    id: "identity-based-harm",
    pattern: /\b(?:antisemitism|islamophobia|racism|identity[- ]based\s+harm|dehumaniz(?:e|ed|ing|ation)|anonymous\s+sides?|people\s+(?:becoming|turned\s+into|reduced\s+to)\s+symbols?|treats?\s+(?:civilians|people)\s+as\s+(?:collateral|symbols?))\b/i,
  },
  {
    id: "interfaith-trust-cooperation",
    pattern:
      /\b(?:interfaith|interreligious|jewish[- ]muslim|muslim[- ]jewish|cross[- ]community)\s+(?:trust|relationship|relationships|friendship|friendships|cooperation|solidarity|partnership|partnerships|project|projects|service|work)|\b(?:trust|relationships?|friendships?|cooperation|solidarity|partnerships?|shared\s+(?:service|projects?|civic\s+work))\b[^.!?]{0,100}\b(?:jewish|jews?|muslim|muslims?|interfaith|between\s+(?:the\s+)?communities)\b/i,
  },
  {
    id: "faith-safety-belonging",
    pattern:
      /\b(?:mosques?|synagogues?|houses?\s+of\s+worship|religious\s+practice|visible\s+faith|faith\s+identity)\b[^.!?]{0,100}\b(?:safe|safety|belong|belonging|welcome|participat(?:e|ion)|protection)|\b(?:safe|safety|belong|belonging|welcome|participat(?:e|ion)|protection)\b[^.!?]{0,100}\b(?:mosques?|synagogues?|houses?\s+of\s+worship|religious\s+practice|visible\s+faith|faith\s+identity)\b/i,
  },
  {
    id: "long-term-wellbeing",
    pattern:
      /\b(?:long[- ]term\s+(?:harm|effect|recovery|care|safety)|lasting\s+(?:civilian\s+)?safety|sustained\s+(?:civilian\s+)?(?:medical\s+)?(?:care|treatment|continuity)|continuity\s+of\s+(?:care|treatment)|continu(?:e|ed|ing)\s+(?:medical\s+)?(?:care|treatment)|care\s+after(?:ward)?|recovery|public\s+health)\b/i,
  },
  {
    id: "psychosocial-recovery",
    pattern: /\b(?:trauma|mourning|grief|psychosocial|mental\s+health)\b/i,
  },
  {
    id: "future-opportunity",
    pattern: /\b(?:education|schooling|livelihoods?|jobs?|future\s+opportunities)\b/i,
  },
  {
    id: "climate-exposure",
    pattern:
      /\b(?:flood(?:ing|s|ed)?|flood\s+(?:exposure|risk|protection)|heat\s+(?:exposure|risk|wave|waves)|extreme\s+(?:heat|weather)|climate[- ]related\s+(?:harm|danger|exposure))\b/i,
  },
  {
    id: "climate-mitigation",
    pattern:
      /\b(?:greenhouse[- ]gas\s+emissions?|carbon\s+emissions?|emissions?\s+reduction|decarboniz(?:e|ed|ing|ation)|renewable\s+energy)\b/i,
  },
  {
    id: "data-privacy",
    pattern:
      /\b(?:student\s+privacy|data\s+privacy|personal\s+data|private\s+data|privacy\s+and\s+data|data\s+protection|protecting\s+(?:student|personal)\s+(?:privacy|data)|surveillance)\b/i,
  },
  {
    id: "algorithmic-fairness",
    pattern:
      /\b(?:algorithmic\s+(?:fairness|bias|discrimination)|biased\s+algorithms?|fair\s+(?:automated|algorithmic)\s+decisions?|equal\s+algorithmic\s+treatment)\b/i,
  },
];

function materialPublicStakeIds(text: string): Set<string> {
  return new Set(
    MATERIAL_PUBLIC_STAKE_PATTERNS
      .filter(({ pattern }) => pattern.test(text))
      .map(({ id }) => id),
  );
}

function materialPublicStakeFamilyIds(text: string): Set<string> {
  const raw = materialPublicStakeIds(text);
  const families = new Set<string>();
  if (raw.has("physical-safety") || raw.has("basic-needs")) {
    families.add("immediate-civilian-protection");
  }
  if (raw.has("hostage-safety")) families.add("hostage-safety-and-return");
  if (raw.has("conflict-cessation")) families.add("cessation-of-violence");
  if (raw.has("displacement-housing")) families.add("displacement-and-housing");
  if (raw.has("family-unity")) families.add("family-unity-and-reconnection");
  if (raw.has("rights-accountability")) families.add("rights-and-accountability");
  if (raw.has("identity-based-harm")) families.add("human-dignity-and-identity");
  if (raw.has("interfaith-trust-cooperation")) {
    families.add("interfaith-trust-and-cooperation");
  }
  if (raw.has("faith-safety-belonging")) {
    families.add("faith-safety-and-belonging");
  }
  if (raw.has("long-term-wellbeing")) families.add("recovery-and-continuity");
  if (raw.has("psychosocial-recovery")) families.add("psychosocial-recovery");
  if (raw.has("future-opportunity")) families.add("future-opportunity");
  if (raw.has("climate-exposure")) families.add("climate-harm-and-resilience");
  if (raw.has("climate-mitigation")) families.add("climate-mitigation");
  if (raw.has("data-privacy")) families.add("privacy-and-data-protection");
  if (raw.has("algorithmic-fairness")) families.add("algorithmic-fairness");
  return families;
}

/**
 * Extract only the stake governed by an explicit first-priority assertion.
 * Looking at the whole sentence is unsafe: "care first, while accountability
 * remains visible" mentions both stakes but orders only care first.
 */
function explicitFirstPriorityFragments(text: string): string[] {
  const normalized = normalizeDialogueFormatting(text);
  const fragments: string[] = [];
  const patterns = [
    /\b(?:my\s+)?(?:first|top|deciding)\s+(?:priority|outcome|commitment)(?:\s+(?:in|on)\s+[^.!?;,\n]{1,80})?\s+(?:is|remains)\s+([^.!?;\n]{1,200})/gi,
    /\b(?:my\s+)?priority(?:\s+(?:in|on)\s+[^.!?;,\n]{1,80})?\s+(?:is|remains)\s+([^.!?;\n]{1,200})/gi,
    /\b(?:i\s+)?(?:(?:would|will|must|should|can)\s+)?(?:put|puts|place[sd]?|prioritiz(?:e|es|ed)|choose[sd]?|protects?)\s+([^.!?;\n]{1,180}?)\s+(?:first|ahead\s+of|over|before)\b/gi,
    /\b(?:requires?|demands?|insists?\s+on)\s+([^.!?;\n]{1,180}?)\s+to\s+come\s+first\b/gi,
    /\b(?:make|makes|made)\s+([^.!?;\n]{1,180}?)\s+(?:the\s+)?(?:first|top|deciding)\s+priority\b/gi,
    /([^.!?;\n]{1,180}?)\s+(?:takes?|took)\s+precedence\s+over\b/gi,
    /([^.!?;\n]{1,180}?)\s+(?:must|should|has\s+to|needs\s+to)\s+come\s+first\b/gi,
    /([^.!?;\n]{1,180}?)\s+(?:comes?|goes?)\s+first\b/gi,
    /([^.!?;\n]{1,180}?)\s+is\s+my\s+(?:first|top|deciding)\s+(?:priority|outcome|commitment)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      let fragment = (match[1] ?? "").trim();
      const concessive = fragment.match(
        /^(?:although|though|even\s+if|while)\b[^,]{0,140},\s*(.+)$/i,
      );
      if (concessive?.[1]) fragment = concessive[1].trim();
      const premise = fragment.match(
        /^.+?\b(?:matters?|remains?\s+(?:important|necessary|visible)|is\s+(?:important|necessary))\s*,\s*(.+)$/i,
      );
      if (premise?.[1]) fragment = premise[1].trim();
      fragment = fragment
        .split(/\b(?:while|whereas|rather\s+than|instead\s+of|ahead\s+of|over|before)\b/i)[0]
        ?.replace(/,\s*(?:but|and\s+yet)\b.*$/i, "")
        .trim() ?? "";
      if (materialPublicStakeIds(fragment).size > 0) fragments.push(fragment);
    }
  }
  return Array.from(new Set(fragments));
}

function explicitFirstPriorityStakeIds(text: string): Set<string> {
  const stakes = new Set<string>();
  for (const fragment of explicitFirstPriorityFragments(text)) {
    for (const stake of materialPublicStakeIds(fragment)) stakes.add(stake);
  }
  return stakes;
}

function explicitFirstPriorityFamilyIds(text: string): Set<string> {
  const families = new Set<string>();
  for (const fragment of explicitFirstPriorityFragments(text)) {
    for (const family of materialPublicStakeFamilyIds(fragment)) families.add(family);
  }
  return families;
}

function hasOppositeExplicitPriorityOrdering(
  left: string,
  right: string,
): boolean {
  const leftFirst = explicitFirstPriorityFamilyIds(left);
  const rightFirst = explicitFirstPriorityFamilyIds(right);
  if (
    leftFirst.size === 0 ||
    rightFirst.size === 0 ||
    intersectionSize(leftFirst, rightFirst) > 0
  ) {
    return false;
  }
  const leftAll = materialPublicStakeFamilyIds(left);
  const rightAll = materialPublicStakeFamilyIds(right);
  return (
    intersectionSize(leftFirst, rightAll) > 0 &&
    intersectionSize(rightFirst, leftAll) > 0
  );
}

const PUBLIC_TOPIC_SEMANTIC_HINTS: ReadonlyArray<{
  pattern: RegExp;
  topic: string;
}> = [
  {
    pattern:
      /\b(?:war|armed\s+conflict|ceasefire|occupation|genocide|terrorism|political\s+violence|gaza|israel|palestine|ukraine)\b/i,
    topic: "war",
  },
  { pattern: /\b(?:climate|environment)\b/i, topic: "climate change" },
  {
    pattern: /\b(?:artificial\s+intelligence|a\.?i\.?|algorithm|surveillance)\b/i,
    topic: "artificial intelligence bias",
  },
  { pattern: /\b(?:housing|rent|homelessness)\b/i, topic: "housing crisis" },
  { pattern: /\b(?:election|voting|ballot)\b/i, topic: "election" },
  { pattern: /\b(?:immigration|refugees?|asylum)\b/i, topic: "immigration" },
  { pattern: /\b(?:abortion|reproductive)\b/i, topic: "abortion" },
  {
    pattern:
      /\b(?:racism|antisemitism|islamophobia|discrimination|segregation|civil\s+rights|human\s+rights)\b/i,
    topic: "civil rights discrimination",
  },
  {
    pattern:
      /\b(?:interfaith|interreligious|jewish[- ]muslim|muslim[- ]jewish|peace\s+between\s+(?:jews?|jewish\s+people)\s+and\s+muslims?|peace\s+between\s+muslims?\s+and\s+(?:jews?|jewish\s+people))\b/i,
    topic: "interfaith peace and religious relations",
  },
  {
    pattern: /\b(?:gun\s+violence|police\s+violence|policing|criminal\s+justice|protest)\b/i,
    topic: "gun violence",
  },
  { pattern: /\b(?:public\s+health|healthcare|health\s+care)\b/i, topic: "public health" },
  { pattern: /\b(?:schools?|education)\b/i, topic: "education" },
];

function inferredPublicTopicForSemanticComparison(text: string): string | null {
  return PUBLIC_TOPIC_SEMANTIC_HINTS.find(({ pattern }) => pattern.test(text))
    ?.topic ?? null;
}

const MATERIAL_POSITION_CONDITION_SCAFFOLD = new Set([
  "access", "accountability", "aid", "basic", "basics", "care", "civilian",
  "civilians", "condition", "continuity", "daily", "displaced", "emergency",
  "essential", "food", "harm", "health", "humanitarian", "immediate", "lasting",
  "danger", "fewer", "keeping", "life", "lives", "medical", "medicine", "need",
  "needs", "ongoing", "outcome", "possible", "reach", "reaches", "remain", "remains",
  "priority", "protect", "protected", "protecting", "protection", "recovery",
  "refugee", "refugees", "reliable", "relief", "result", "rights", "safety",
  "shelter", "support", "survival", "sustained", "time", "treatment", "urgent",
  "visible", "water",
]);

function explicitMaterialConditionConcepts(
  text: string,
  topic: string,
): Set<string> {
  const fragments: string[] = [];
  const patterns = [
    /\b(?:only\s+if|if|provided\s+that|as\s+long\s+as|on\s+condition\s+that|unless)\s+([^.!?]+)/gi,
    /\b(?:criterion|standard|test)\b[^.!?]{0,50}?\b(?:is|would\s+be)\s+([^.!?]+)/gi,
    /\bjudge\b[^.!?]{0,50}?\b(?:by|on)\s+([^.!?]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) fragments.push(match[1]);
    }
  }
  const concepts = conceptSet(fragments.join(" "), topic);
  for (const word of MATERIAL_POSITION_CONDITION_SCAFFOLD) concepts.delete(word);
  return concepts;
}

function addsMeaningfullyDistinctMaterialCondition(
  text: string,
  referenceText: string,
  topic: string,
): boolean {
  const candidate = explicitMaterialConditionConcepts(text, topic);
  if (candidate.size < 2) return false;
  const reference = explicitMaterialConditionConcepts(referenceText, topic);
  const novel = Array.from(candidate).filter((concept) => !reference.has(concept));
  return novel.length >= 2 && novel.length / candidate.size >= 0.4;
}

function boundedPositionPolarity(text: string): "support" | "oppose" | null {
  const supports =
    /\bi(?:['’]d|\s+(?:would|will|do))?\s+(?:support|accept|back|endorse|favor|favour|permit|allow|choose)\b/i.test(
      text,
    );
  const opposes =
    /\bi(?:['’]d|\s+(?:would|will|do))?\s+(?:oppose|reject)\b/i.test(text);
  if (supports === opposes) return null;
  return supports ? "support" : "oppose";
}

function hasIncompatibleSpecificBeneficiaries(
  text: string,
  referenceText: string,
): boolean {
  const textHostageOnly = /\bhostages?\b/i.test(text) && !/\bcivilians?\b/i.test(text);
  const textCivilianOnly = /\bcivilians?\b/i.test(text) && !/\bhostages?\b/i.test(text);
  const referenceHostageOnly =
    /\bhostages?\b/i.test(referenceText) && !/\bcivilians?\b/i.test(referenceText);
  const referenceCivilianOnly =
    /\bcivilians?\b/i.test(referenceText) && !/\bhostages?\b/i.test(referenceText);
  return (
    (textHostageOnly && referenceCivilianOnly) ||
    (textCivilianOnly && referenceHostageOnly)
  );
}

function hasBroadCivilianProtection(text: string): boolean {
  return /\b(?:civilian\s+(?:safety|lives?|harm|protection)|(?:immediate|lasting|physical)\s+civilian\s+(?:safety|harm|protection)|protecting\s+civilian\s+lives?)\b/i.test(
    text,
  );
}

function conservativeParsedSubjectPositionRecast(
  text: string,
  referenceText: string,
  topic: string,
): boolean {
  if (
    detectPublicEngagementLanes(text, topic).length === 0 ||
    detectPublicEngagementLanes(referenceText, topic).length === 0 ||
    hasOppositeExplicitPriorityOrdering(text, referenceText)
  ) {
    return false;
  }
  const candidatePolarity = boundedPositionPolarity(text);
  const referencePolarity = boundedPositionPolarity(referenceText);
  if (
    candidatePolarity &&
    referencePolarity &&
    candidatePolarity !== referencePolarity
  ) {
    return false;
  }
  if (addsMeaningfullyDistinctMaterialCondition(text, referenceText, topic)) {
    return false;
  }
  const candidateConcepts = subjectPropositionConcepts(text, topic);
  const referenceConcepts = subjectPropositionConcepts(referenceText, topic);
  if (Math.min(candidateConcepts.size, referenceConcepts.size) < 2) return false;
  const shared = intersectionSize(candidateConcepts, referenceConcepts);
  return shared >= 2 && shared / candidateConcepts.size >= 0.8;
}

function materialPositionRecastsExistingPosition(
  text: string,
  referenceText: string,
  topic: string,
): boolean {
  const candidateStakes = materialPublicStakeIds(text);
  const referenceStakes = materialPublicStakeIds(referenceText);
  const candidateFamilies = materialPublicStakeFamilyIds(text);
  const referenceFamilies = materialPublicStakeFamilyIds(referenceText);
  if (
    candidateStakes.size === 0 ||
    referenceStakes.size === 0 ||
    candidateFamilies.size === 0 ||
    referenceFamilies.size === 0
  ) {
    return conservativeParsedSubjectPositionRecast(text, referenceText, topic);
  }
  if (hasOppositeExplicitPriorityOrdering(text, referenceText)) return false;
  if (
    Array.from(candidateFamilies).some((family) => !referenceFamilies.has(family))
  ) {
    return false;
  }
  if (hasIncompatibleSpecificBeneficiaries(text, referenceText)) return false;

  const candidatePolarity = boundedPositionPolarity(text);
  const referencePolarity = boundedPositionPolarity(referenceText);
  if (
    candidatePolarity &&
    referencePolarity &&
    candidatePolarity !== referencePolarity
  ) {
    return false;
  }
  if (addsMeaningfullyDistinctMaterialCondition(text, referenceText, topic)) {
    return false;
  }

  if (intersectionSize(candidateStakes, referenceStakes) > 0) return true;

  const crossesBroadSafetyAndBasicNeeds =
    candidateFamilies.has("immediate-civilian-protection") &&
    referenceFamilies.has("immediate-civilian-protection") &&
    (
      (candidateStakes.has("basic-needs") &&
        referenceStakes.has("physical-safety")) ||
      (candidateStakes.has("physical-safety") &&
        referenceStakes.has("basic-needs"))
    ) &&
    (hasBroadCivilianProtection(text) || hasBroadCivilianProtection(referenceText));
  return crossesBroadSafetyAndBasicNeeds;
}

/** Whether two parsed public-topic positions currently express the same stance. */
export function subjectPositionsMateriallyEquivalent(
  left: string,
  right: string,
  topic: string,
): boolean {
  if (!isDifficultPublicTopic(topic)) return false;
  if (
    detectPublicEngagementLanes(left, topic).length === 0 ||
    detectPublicEngagementLanes(right, topic).length === 0
  ) {
    return false;
  }
  // Recast detection is directional because adding a family or condition can
  // be meaningful. Equivalence requires both directions to collapse.
  return (
    materialPositionRecastsExistingPosition(left, right, topic) &&
    materialPositionRecastsExistingPosition(right, left, topic)
  );
}

/** Whether two positions are compatible because one materially contains the other. */
export function subjectPositionsMateriallyCompatible(
  left: string,
  right: string,
  topic: string,
): boolean {
  if (!isDifficultPublicTopic(topic)) return false;
  if (
    detectPublicEngagementLanes(left, topic).length === 0 ||
    detectPublicEngagementLanes(right, topic).length === 0
  ) {
    return false;
  }
  return (
    materialPositionRecastsExistingPosition(left, right, topic) ||
    materialPositionRecastsExistingPosition(right, left, topic)
  );
}

export interface PublicChallengeTranscriptTurn {
  speakerName: string;
  text: string;
}

/**
 * Decide whether an accepted challenge still represents a live difference at
 * closing. A challenge alone is not proof: later turns may have converged on
 * materially compatible positions.
 */
export function hasSupportedUnresolvedChallengeDifference(
  challengeTexts: readonly string[],
  topic: string,
  transcriptTurns: readonly PublicChallengeTranscriptTurn[],
): boolean {
  if (challengeTexts.length === 0) return false;
  // A challenge is evidence that tension occurred, not proof that the latest
  // accepted positions still differ. For topics without a supported semantic
  // comparison model, fail closed and let the full-transcript LLM reviewer
  // decide rather than manufacturing a difference in the local closing.
  if (!isDifficultPublicTopic(topic)) return false;

  let searchAfter = -1;
  for (const challengeText of challengeTexts) {
    const relativeIndex = transcriptTurns
      .slice(searchAfter + 1)
      .findIndex((turn) => turn.text === challengeText);
    const challengeIndex = relativeIndex < 0
      ? transcriptTurns.findIndex((turn) => turn.text === challengeText)
      : searchAfter + 1 + relativeIndex;
    if (challengeIndex < 0) return true;
    searchAfter = challengeIndex;

    const challengeTurn = transcriptTurns[challengeIndex];
    let targetIndex = challengeIndex - 1;
    while (
      targetIndex >= 0 &&
      (/\bfacilitator\b/i.test(
        transcriptTurns[targetIndex].speakerName,
      ) ||
        transcriptTurns[targetIndex].speakerName === challengeTurn.speakerName)
    ) {
      targetIndex -= 1;
    }
    if (targetIndex < 0) return true;
    const targetName = transcriptTurns[targetIndex].speakerName;

    const latestPositionFor = (speakerName: string) =>
      transcriptTurns
        .slice(targetIndex)
        .reverse()
        .find(
          (turn) =>
            turn.speakerName === speakerName &&
            detectPublicEngagementLanes(turn.text, topic).length > 0,
        )?.text;
    const challengerPosition = latestPositionFor(challengeTurn.speakerName);
    const targetPosition = latestPositionFor(targetName);
    if (
      !challengerPosition ||
      !targetPosition ||
      !subjectPositionsMateriallyCompatible(
        challengerPosition,
        targetPosition,
        topic,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Reject a recent public-topic turn that merely recasts the same stance. */
export function subjectPositionSemanticReuseRejectionReasons(
  text: string,
  references: readonly string[],
  topic: string,
): string[] {
  if (!isDifficultPublicTopic(topic)) return [];
  if (detectPublicEngagementLanes(text, topic).length === 0) return [];

  // Keep a short window so an A/B/A/B lane cycle cannot evade the check while
  // still leaving enough subject positions for a full classroom to speak.
  // Three prior speakers catches immediate cycling without exhausting the
  // finite set of safe, fact-free stake families.
  for (const reference of references.slice(-3)) {
    if (
      detectPublicEngagementLanes(reference, topic).length > 0 &&
      materialPositionRecastsExistingPosition(text, reference, topic)
    ) {
      return [
        "Response substantially repeats a recent speaker's subject position; add a materially different priority, condition, obligation, or choice.",
      ];
    }
  }
  return [];
}

function hasDistinctMaterialPublicStake(text: string, referenceText: string): boolean {
  const reference = materialPublicStakeFamilyIds(referenceText);
  return Array.from(materialPublicStakeFamilyIds(text)).some(
    (id) => !reference.has(id),
  );
}

function isPublicIssueLanguage(text: string): boolean {
  return /\b(?:war|armed\s+conflict|ceasefire|violence|election|immigration|refugee|climate|racism|antisemitism|islamophobia|abortion|gun\s+violence|police|protest|occupation|terrorism|ukraine|gaza|israel|palestine)\b/i.test(
    text,
  );
}

/**
 * Detect the recurring meta frame where the subject becomes how cautiously a
 * distant speaker may talk, claim, represent, or act. Concrete uncertainty
 * about aid, safety, rights, and other subject-level stakes remains available.
 */
function hasEpistemicVoiceRestraintFrame(text: string): boolean {
  const normalized = lexicalText(noveltyBody(text));
  if (materialPublicStakeIds(normalized).size > 0) return false;
  const epistemic =
    /\b(?:partial|incomplete|limited)\s+(?:facts?|information|knowledge|account|picture)\b|\b(?:uncertain|uncertainty|certainty|authority|verify|verified|confirm)\b|\b(?:cannot|can't|do not|don't)\s+(?:fully\s+)?know\b|\bwhat\s+(?:i|we|this\s+room)\s+(?:can|cannot|can't|do not|don't)\s+know\b|\b(?:cannot|can't|do not|don't)\s+(?:speak|claim|represent)\s+for\b/i.test(
      normalized,
    );
  const voiceOrDistance =
    /\b(?:speak|speaking|say|saying|words?|claim|claiming|response|respond|react|acting?|action|voice|silence|quiet|represent|representing|authority|perspective|account|story|from\s+here|from\s+new\s+york|this\s+room\s+knows)\b/i.test(
      normalized,
    );
  const restraintOrContrast =
    /\b(?:limit|limits|limited|boundary|bound|bounded|constrain|careful|carefully|restrain|restraint|refuse|avoid|cannot|can't|do not|don't|without|rather\s+than|instead\s+of|while|but|coexist|distinction|tension|unresolved|leaves?\s+outside|beyond)\b/i.test(
      normalized,
    );
  return epistemic && voiceOrDistance && restraintOrContrast;
}

function hasRepresentationBurdenFrame(text: string): boolean {
  const normalized = lexicalText(noveltyBody(text));
  return (
    /\b(?:people|person|someone|families|lives?|pain|grief|stories?)\b[^.!?]{0,100}\b(?:reduce|reduced|flatten|flattened|turn|turned)\b[^.!?]{0,55}\b(?:labels?|headlines?|numbers?|statistics?|symbols?|slogans?)\b/.test(
      normalized,
    ) ||
    /\b(?:reduce|reduced|flatten|flattened|turn|turned)\b[^.!?]{0,55}\b(?:people|person|someone|families|lives?|pain|grief|stories?)\b[^.!?]{0,70}\b(?:labels?|headlines?|numbers?|statistics?|symbols?|slogans?)\b/.test(
      normalized,
    ) ||
    /\b(?:one|single)\s+(?:person|voice|face|speaker|story)\b[^.!?]{0,100}\b(?:carry|carrying|stand\s+in|stand\s+for|represent|explain)\b[^.!?]{0,80}\b(?:everyone|everybody|a\s+whole|the\s+whole|many|all\s+of|other\s+people)\b/.test(
      normalized,
    ) ||
    /\b(?:stand[- ]?in|proxy)\s+for\s+(?:everyone|a\s+whole|the\s+whole|an?\s+entire)\b/.test(
      normalized,
    )
  );
}

const SATURATING_SEMANTIC_FRAMES: ReadonlyArray<{
  id: string;
  label: string;
  matches: (text: string) => boolean;
  globalAfterTwoSpeakers?: boolean;
}> = [
  {
    id: "loved-one-safety-waiting",
    label: "uncertain waiting for news of a loved one's safety",
    matches: (text) => {
      const normalized = lexicalText(text);
      const relationalSafety =
        /\b(?:loved one|family member|relative|parent|child|sibling)\b[^.!?]{0,100}\b(?:alive|safe|safety)\b|\b(?:alive|safe|safety)\b[^.!?]{0,100}\b(?:loved one|family member|relative|parent|child|sibling)\b/.test(
          normalized,
        );
      return relationalSafety &&
        /\b(?:not knowing|uncertain|uncertainty|unresolved waiting|wait|waiting|waited|no word|message that confirms)\b/.test(
          normalized,
        );
    },
  },
  {
    id: "care-versus-certainty",
    label: "compassion or care contrasted with certainty, authority, or a definitive answer",
    matches: (text) => {
      // A final routing question belongs to the next speaker; do not combine
      // its vocabulary with the current speaker's body into a false relation.
      const normalized = lexicalText(noveltyBody(text));
      const care =
        "(?:care|caring|compassion|hospitality|humility|patience|pity|responsibility|solidarity)";
      const epistemicLimit =
        "(?:certainty|authority|definitive|right response|quick interpretation|complete answer|conclusion|partial information|uncertain|uncertainty)";
      const contrast =
        "(?:without|rather than|instead of|separate from|over|while|but|even when|resist(?:ing|ed)?|do not pretend|don't pretend|cannot claim|can't claim)";
      const establishedRelation = new RegExp(
        `\\b${care}\\b[\\s\\S]{0,220}\\b${contrast}\\b[\\s\\S]{0,120}\\b${epistemicLimit}\\b|` +
          `\\b${epistemicLimit}\\b[\\s\\S]{0,160}\\b${contrast}\\b[\\s\\S]{0,120}\\b${care}\\b`,
      ).test(normalized);
      const canarySevenCareUnderLimits =
        /\bpartial information\b[^.!?]{0,80}\blimit a response\b[^.!?]{0,80}\bwhile human consequences\b[^.!?]{0,50}\bdemand attention\b/.test(
          normalized,
        ) ||
        /\bhold urgency and humility at once\b/.test(normalized) ||
        /\bbetween caring\b[^.!?]{0,60}\bspeak\b[^.!?]{0,40}\band the need to stay honest\b[^.!?]{0,80}\bwhat i do not know\b/.test(
          normalized,
        );
      return establishedRelation || canarySevenCareUnderLimits ||
        (
          new RegExp(`\\b${care}\\b`).test(normalized) &&
          /\b(?:do not|don't|cannot|can't|without)\b[^.!?]{0,55}\b(?:pretend|claim|offer|have|turn(?:ing)?)?\s*(?:to\s+)?(?:certainty|authority|a definitive answer)\b/.test(
            normalized,
          )
        );
    },
  },
  {
    id: "partial-information-limits-speech-action",
    label: "limiting speech, claims, or action because information is partial or unverifiable",
    globalAfterTwoSpeakers: true,
    matches: (text) => {
      const normalized = lexicalText(noveltyBody(text));
      return hasEpistemicVoiceRestraintFrame(text) || (
        /\bpartial information\b[^.!?]{0,90}\b(?:limit|limits|limited|bound|bounds|bounded|constrain|constrains|constrained)\b[^.!?]{0,45}\b(?:a\s+)?(?:response|answer|claim|statement|speech|action)\b/.test(
          normalized,
        ) ||
        /\b(?:cannot|can't|could not|couldn't|unable to)\s+verify\b[^.!?]{0,90}\b(?:speak|say|claim|respond|act|choose words)\b/.test(
          normalized,
        ) ||
        /\b(?:speak|say|claim|respond|name|choose words)\b[^.!?]{0,75}\b(?:what i can|only what i can)\s+(?:verify|confirm|back)\b/.test(
          normalized,
        ) ||
        /\bspeak less\b[^.!?]{0,80}\bonly\s+(?:add|say|claim)\b[^.!?]{0,45}\b(?:back|verify|confirm|known)\b/.test(
          normalized,
        ) ||
        /\b(?:name|naming)\s+(?:the\s+)?uncertainty first\b[^.!?]{0,90}\b(?:floor|sentence|statement|claim|directive|verdict|decision)\b/.test(
          normalized,
        ) ||
        /\b(?:amplify|amplifies|amplifying)\b[^.!?]{0,40}\bpartial certainty\b/.test(
          normalized,
        ) ||
        /\bscope of what\b[^.!?]{0,120}\bcan answer\b/.test(normalized) ||
        /\b(?:outside|beyond) what (?:this|the) room knows\b/.test(normalized) ||
        /\bpartial information\b[^.!?]{0,130}\bnaming uncertainty first\b[^.!?]{0,100}\b(?:fragments? into )?(?:directives?|claims?|verdicts?|decisions?|actions?)\b/.test(
          normalized,
        )
      );
    },
  },
  {
    id: "representation-burden",
    label: "reducing people to labels or making one voice carry a whole community",
    globalAfterTwoSpeakers: true,
    matches: hasRepresentationBurdenFrame,
  },
  {
    id: "dignity-versus-abstraction",
    label: "protecting dignity by resisting the flattening of people or grief into symbols",
    matches: (text) => {
      const normalized = lexicalText(text);
      if (!/\bdignity\b/.test(normalized)) return false;
      return (
        /\b(?:flatten|flattened|flattening|reduce|reduced|reducing|turn|turning|make|making)\b[^.!?]{0,100}\b(?:people|person|someone|grief|pain|lives?|stories?)\b/.test(
          normalized,
        ) ||
        /\b(?:people|person|someone|lives?|stories?)\b[^.!?]{0,80}\b(?:into|to)\b[^.!?]{0,30}\b(?:symbols?|numbers?|statistics?|abstractions?|slogans?)\b/.test(
          normalized,
        )
      );
    },
  },
] as const;

/** Frames already used by at least two distinct speakers. */
export function saturatedSemanticFrameLabels(
  references: readonly DialogueSemanticReference[],
): string[] {
  return SATURATING_SEMANTIC_FRAMES
    .filter((frame) => new Set(
      references
        .filter((reference) => frame.matches(reference.text))
        .map((reference) => reference.speakerId),
    ).size >= 2)
    .map((frame) => frame.label);
}

/**
 * Reject only a third cross-speaker use of a compound semantic frame. Common
 * subject words such as "uncertainty" or "dignity" never trigger by themselves.
 */
export function semanticMotifSaturationRejectionReasons(
  text: string,
  references: readonly DialogueSemanticReference[],
): string[] {
  const saturated = new Set(saturatedSemanticFrameLabels(references));
  return SATURATING_SEMANTIC_FRAMES
    .filter((frame) => saturated.has(frame.label) && frame.matches(text))
    .map(
      (frame) =>
        `Response repeats the already-saturated frame of ${frame.label}. Choose a different concrete consequence or ethical tension; individual topic words remain allowed.`,
    );
}

/**
 * Frames that become unavailable to every later scheduled speaker once two
 * distinct scheduled speakers establish them, including either establisher.
 */
export function globallySaturatedSemanticFrameLabels(
  references: readonly DialogueSemanticReference[],
): string[] {
  return SATURATING_SEMANTIC_FRAMES
    .filter((frame) => frame.globalAfterTwoSpeakers === true)
    .filter((frame) => new Set(
      references
        .filter((reference) => frame.matches(reference.text))
        .map((reference) => reference.speakerId),
    ).size >= 2)
    .map((frame) => frame.label);
}

export function globalSemanticMotifSaturationRejectionReasons(
  text: string,
  references: readonly DialogueSemanticReference[],
): string[] {
  const saturated = new Set(globallySaturatedSemanticFrameLabels(references));
  return SATURATING_SEMANTIC_FRAMES
    .filter((frame) => frame.globalAfterTwoSpeakers === true)
    .filter((frame) => saturated.has(frame.label) && frame.matches(text))
    .map(
      (frame) =>
        `Response repeats the globally saturated frame of ${frame.label}. Choose a different concrete consequence or ethical tension; bare uncertainty or partial-information words remain allowed.`,
    );
}

const SELF_REUSE_SEMANTIC_FRAMES: ReadonlyArray<{
  label: string;
  matches: (text: string) => boolean;
}> = [
  {
    label: "humor or jokes used as a shield or escape from pain, grief, or fear",
    matches: (text) => {
      const normalized = lexicalText(text);
      return (
        /\b(?:humor|jokes?|cleverness)\b[^.!?]{0,90}\b(?:a\s+)?(?:shield|escape hatch)\b[^.!?]{0,35}\b(?:against|from|out of|between me and)\b[^.!?]{0,35}\b(?:grief|pain|fear|suffering)\b/.test(
          normalized,
        ) ||
        /\bjokes?\b[^.!?]{0,60}\b(?:hide|mask|cover)\b[^.!?]{0,45}\b(?:grief|pain|fear|suffering)\b/.test(
          normalized,
        ) ||
        /\b(?:humor|jokes?)\b[^.!?]{0,80}\b(?:lets? me|allows? me to)\s+(?:dodge|escape)\b[^.!?]{0,45}\b(?:grief|pain|fear|suffering)\b/.test(
          normalized,
        ) ||
        /\b(?:humor|jokes?)\b[^.!?]{0,80}\b(?:make|makes|making)\b[^.!?]{0,45}\b(?:grief|pain|fear)\b[^.!?]{0,45}\b(?:less immediate|smaller|softer)\b/.test(
          normalized,
        )
      );
    },
  },
] as const;

export function usedSelfSemanticFrameLabels(
  references: readonly string[],
): string[] {
  return SELF_REUSE_SEMANTIC_FRAMES
    .filter((frame) => references.some((reference) => frame.matches(reference)))
    .map((frame) => frame.label);
}

/** Reject a second scheduled turn that repeats one speaker's compound frame. */
export function sameSpeakerSemanticReuseRejectionReasons(
  text: string,
  references: readonly string[],
): string[] {
  const used = new Set(usedSelfSemanticFrameLabels(references));
  return SELF_REUSE_SEMANTIC_FRAMES
    .filter((frame) => used.has(frame.label) && frame.matches(text))
    .map(
      (frame) =>
        `Response repeats this speaker's earlier frame of ${frame.label}. Choose a different concrete consequence or ethical tension; individual words such as humor or grief remain allowed.`,
    );
}

/** Reject dialogue that repeats a prior turn's language or concept bundle. */
export function dialogueNoveltyRejectionReasons(
  text: string,
  references: readonly string[],
  topic: string,
): string[] {
  const hasCountAbstractionMotif = (value: string) => {
    const normalized = lexicalText(value);
    return (
      /\b(?:people|persons?|someone|anyone|human beings?|human lives?|stories?|names?)\b/.test(
        normalized,
      ) &&
      /\b(?:numbers?|statistics?|counts?|data points?|symbols?|slogans?)\b/.test(
        normalized,
      ) &&
      /\b(?:become|becoming|blur|blurring|collapse|collapsing|disappear|disappearing|flatten|flattened|flattening|reduce|reduced|reducing|replace|replacing|slip|slipping|turn|turning)\b/.test(
        normalized,
      )
    );
  };
  if (
    hasCountAbstractionMotif(text) &&
    references.filter((reference) => hasCountAbstractionMotif(reference)).length >= 2
  ) {
    return [
      "Response repeats the dialogue's people-to-numbers abstraction after that framing was already established twice.",
    ];
  }
  const spokenSentences = normalizeDialogueFormatting(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (spokenSentences.at(-1)?.includes("?")) spokenSentences.pop();
  const leadingReflection = spokenSentences[0] ?? "";
  const remainderAfterReflection = spokenSentences.slice(1).join(" ");
  const candidateNoveltyText =
    spokenSentences.length >= 2 &&
      /^(?:i\s+(?:hear|accept|acknowledge|recognize|understand|take\s+seriously)|(?:[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\s*,\s+i\s+(?:hear|accept|acknowledge|recognize|understand)|i\s+(?:also\s+)?hear\s+(?:[A-Z][\p{L}'’-]+(?:['’]s)?|the)\b)/iu.test(
        leadingReflection,
      ) &&
      (detectPublicEngagementLanes(remainderAfterReflection, topic).length > 0 ||
        /\b(?:my\s+(?:unresolved\s+)?(?:choice|position|priority|condition|boundary)|i\s+(?:would|will|can|cannot|can't)\s+(?:support|oppose|protect|prioritize|require))\b/i.test(
          remainderAfterReflection,
        ))
      ? remainderAfterReflection
      : noveltyBody(text);

  const candidateImagery = distinctiveImagerySet(candidateNoveltyText);
  for (const reference of references) {
    // The orchestrator deliberately routes each scheduled contribution with a
    // final named question.  Reusing a concise routing question is not the
    // kind of recycled anecdote this check is meant to reject.
    const phrase = sharedLongPhrase(
      candidateNoveltyText,
      noveltyBody(reference),
      topic,
    );
    if (phrase) {
      return [`Response repeats a long phrase from prior dialogue: “${phrase}”.`];
    }

    const referenceImagery = distinctiveImagerySet(reference);
    const sharedImagery = new Set(
      Array.from(candidateImagery).filter((concept) => referenceImagery.has(concept)),
    );
    if (sharedImagery.size >= 4 || containsDistinctiveSceneBundle(sharedImagery)) {
      return [
        `Response repeats a prior dialogue's distinctive imagery bundle (${Array.from(sharedImagery).join(", ")}).`,
      ];
    }
  }
  return [];
}

function subjectPropositionBody(text: string, topic: string): string {
  return normalizeDialogueFormatting(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        !sentence.includes("?") &&
        detectPublicEngagementLanes(sentence, topic).length > 0,
    )
    .join(" ");
}

const SUBJECT_PROPOSITION_SCAFFOLD = new Set([
  "accept", "accepted", "against", "answer", "bounded", "cannot", "carry",
  "choice", "choices", "come", "condition", "criterion", "decide", "duty",
  "duties", "erase", "first", "guide", "hold", "obligation", "obligations",
  "position", "preserve", "prioritize", "priority", "protect", "protecting",
  "question", "remain", "resolve", "response", "settle", "standard", "support",
  "torn", "unsure", "weigh", "whether",
]);

function subjectPropositionConcepts(text: string, topic: string): Set<string> {
  const body = subjectPropositionBody(text, topic);
  const concepts = conceptSet(body, topic);
  for (const word of SUBJECT_PROPOSITION_SCAFFOLD) concepts.delete(word);
  return concepts;
}

/**
 * Reject a challenge that recycles an earlier speaker's substantive public-
 * issue proposition. Challenge scaffolding is intentionally excluded: only
 * sentences that realize a subject-engagement lane are compared.
 */
export function subjectPropositionNoveltyRejectionReasons(
  text: string,
  references: readonly string[],
  topic: string,
  targetText = "",
): string[] {
  if (!isDifficultPublicTopic(topic)) return [];
  const candidate = subjectPropositionBody(text, topic);
  if (!candidate) return [];
  const candidateLane = detectPrimaryPublicEngagementLane(candidate, topic);
  const candidateConcepts = subjectPropositionConcepts(candidate, topic);
  const candidateFamilies = materialPublicStakeFamilyIds(candidate);
  const targetFamilies = materialPublicStakeFamilyIds(targetText);
  const addedChallengeFamilies = new Set(
    Array.from(candidateFamilies).filter((family) => !targetFamilies.has(family)),
  );

  for (const reference of references.slice(-6)) {
    const prior = subjectPropositionBody(reference, topic);
    if (!prior) continue;
    const priorFamilies = materialPublicStakeFamilyIds(prior);
    const addsNewMaterialFamilyToPrior = Array.from(candidateFamilies).some(
      (family) => !priorFamilies.has(family),
    );
    const candidatePolarity = boundedPositionPolarity(candidate);
    const priorPolarity = boundedPositionPolarity(prior);
    const oppositeBoundedPosition = Boolean(
      candidatePolarity &&
        priorPolarity &&
        candidatePolarity !== priorPolarity,
    );
    const oppositePriorityOrdering = hasOppositeExplicitPriorityOrdering(
      candidate,
      prior,
    );
    if (
      targetText &&
      reference !== targetText &&
      addedChallengeFamilies.size > 0 &&
      Array.from(addedChallengeFamilies).every((family) =>
        priorFamilies.has(family),
      ) &&
      !oppositeBoundedPosition &&
      !oppositePriorityOrdering &&
      !addsMeaningfullyDistinctMaterialCondition(candidate, prior, topic)
    ) {
      return [
        "Challenge repeats the material stake it adds beyond the target from a recent speaker instead of introducing a new omission, priority, condition, or disagreement.",
      ];
    }
    if (
      !oppositeBoundedPosition &&
      !oppositePriorityOrdering &&
      materialPositionRecastsExistingPosition(candidate, prior, topic)
    ) {
      return [
        "Challenge repeats a prior speaker's subject proposition or material position in a different lane instead of introducing a new omission, priority, condition, or disagreement.",
      ];
    }
    if (
      candidateLane !== detectPrimaryPublicEngagementLane(prior, topic)
    ) continue;
    const priorConcepts = subjectPropositionConcepts(prior, topic);
    const sharedConcepts = Array.from(candidateConcepts).filter((concept) =>
      priorConcepts.has(concept)
    );
    const coverage = sharedConcepts.length /
      Math.max(1, Math.min(candidateConcepts.size, priorConcepts.size));
    if (
      sharedConcepts.length >= 3 &&
      coverage >= 0.75 &&
      !addsNewMaterialFamilyToPrior &&
      !oppositePriorityOrdering &&
      !addsMeaningfullyDistinctMaterialCondition(candidate, prior, topic)
    ) {
      return [
        `Challenge repeats a prior speaker's subject proposition (${sharedConcepts.slice(0, 6).join(", ")}). Introduce a materially different priority, condition, obligation, or unresolved choice.`,
      ];
    }
  }
  return [];
}

/** Reject a closing that invents a decisive priority no participant stated. */
export function unsupportedClosingPriorityClaimRejectionReasons(
  text: string,
  transcriptTurns: readonly PublicChallengeTranscriptTurn[],
): string[] {
  const normalized = normalizeDialogueFormatting(text);
  const clauses = normalized
    .split(/(?<=[.!?])\s+|\b(?:while|whereas)\b|[;\n]+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const strongClaims = clauses.filter(
    (clause) =>
      /\b(?:insists?|demands?|requires?)\b[^.!?]{0,180}\b(?:must|should|has\s+to|needs\s+to)\s+come\s+first\b/i.test(
        clause,
      ) ||
      /\b(?:must|has\s+to|needs\s+to)\s+come\s+first\b/i.test(clause) ||
      /\b(?:requires?|demands?|insists?\s+on)\b[^.!?]{1,180}\bto\s+come\s+first\b/i.test(
        clause,
      ) ||
      /\b(?:make|makes|made)\b[^.!?]{1,180}\b(?:the\s+)?(?:first|top|deciding)\s+priority\b/i.test(
        clause,
      ) ||
      /\b(?:put|puts|place[sd]?|prioritiz(?:e|es|ed)|choose[sd]?)\b[^.!?]{1,180}\b(?:first|ahead\s+of|over|before)\b/i.test(
        clause,
      ) ||
      /\b(?:takes?|took)\s+precedence\s+over\b/i.test(clause),
  );
  if (strongClaims.length === 0) return [];

  const decisiveSource = (source: string) => {
    if (
      /\b(?:remain|am|i(?:'m|’m))\s+(?:unsure|uncertain|unresolved)\b|\b(?:unresolved|unsettled)\s+(?:choice|question|priority|ordering)\b/i.test(
        source,
      )
    ) return false;
    return explicitFirstPriorityStakeIds(source).size > 0;
  };

  const comparisonTopic = inferredPublicTopicForSemanticComparison(
    [normalized, ...transcriptTurns.map((turn) => turn.text)].join(" "),
  );
  const latestParticipantTexts = new Map<string, string>();
  for (const turn of transcriptTurns) {
    if (/\bfacilitator\b/i.test(turn.speakerName)) continue;
    const source = normalizeDialogueFormatting(turn.text);
    const isSubjectPosition = comparisonTopic
      ? detectPublicEngagementLanes(source, comparisonTopic).length > 0
      : materialPublicStakeIds(source).size > 0;
    if (isSubjectPosition) latestParticipantTexts.set(turn.speakerName, source);
  }
  const participantTexts = Array.from(latestParticipantTexts.values());

  for (const claim of strongClaims) {
    const claimFirstStakes = explicitFirstPriorityStakeIds(claim);
    const supported = participantTexts.some((source) => {
      if (!decisiveSource(source)) return false;
      if (claimFirstStakes.size === 0) return false;
      const sourceFirstStakes = explicitFirstPriorityStakeIds(source);
      return Array.from(claimFirstStakes).every((stake) =>
        sourceFirstStakes.has(stake));
    });
    if (!supported) {
      return [
        "Closing strengthens an unsettled or linked position into a claim that one outcome must come first without a participant stating that decisive ordering.",
      ];
    }
  }
  return [];
}

const PUBLIC_ISSUE_TOPIC =
  /\b(?:war|armed conflict|ceasefire|violence|election|immigration|refugee|climate|racism|antisemitism|islamophobia|abortion|gun violence|police|protest|occupation|terrorism|ukraine|gaza|israel|palestine)\b/i;

const CONCRETE_PUBLIC_STAKE =
  /\b(?:people|families|communities|civilians?)\s+(?:most\s+)?directly affected\b|\bhuman (?:cost|consequences?|impact)\b|\b(?:civilian|hostages?|ceasefire|aid|humanitarian|food|water|medicine|medical\s+care|health\s+care|public\s+health|housing|shelter|essential\s+services?|family\s+unity|due\s+process|equal\s+access|hunger|suffering|death|deaths|killed|injured|displaced|displacement|safety|security|grief|mourning|fear|loss|harm|dignity|rights|justice|survival|solidarity|responsibility|uncertainty|antisemitism|islamophobia|protest|violence|trauma|accountability|flood|heat|emissions?|pollution|energy|infrastructure|exposure|affordab(?:le|ility)|costs?|environmental\s+harm|public\s+protection)\b/i;

/**
 * A public-conflict label appearing verbatim is not, by itself, substantive
 * topic engagement. Require one concrete human stake while leaving ordinary
 * personal/cultural topics unrestricted.
 */
export function substantiveTopicRejectionReasons(
  text: string,
  topic: string,
): string[] {
  if (!PUBLIC_ISSUE_TOPIC.test(topic) && !isDifficultPublicTopic(topic)) return [];
  if (
    isDifficultPublicTopic(topic) &&
    subjectLevelEngagementRejectionReasons(text, topic).length === 0
  ) {
    return [];
  }
  const withoutTopic = lexicalText(text).replace(lexicalText(topic), " ");
  if (CONCRETE_PUBLIC_STAKE.test(withoutTopic)) return [];
  return [
    "Response names a difficult public topic but does not engage a concrete human consequence, ethical stake, uncertainty, or New York impact within it.",
  ];
}

const RELATION_ALIASES: Record<string, readonly string[]> = {
  aunt: ["aunt", "aunts"],
  uncle: ["uncle", "uncles"],
  sister: ["sister", "sisters"],
  brother: ["brother", "brothers"],
  sibling: ["sibling", "siblings"],
  cousin: ["cousin", "cousins"],
  child: ["child", "children", "kid", "kids"],
  son: ["son", "sons"],
  daughter: ["daughter", "daughters"],
  mother: ["mother", "mom", "mama"],
  father: ["father", "dad", "papa"],
  parent: ["parent", "parents"],
  grandmother: ["grandmother", "grandma", "grandma's"],
  grandfather: ["grandfather", "granddad", "grandpa", "grandpa's"],
  spouse: ["spouse", "wife", "husband"],
  partner: ["partner", "partners"],
  friend: ["friend", "friends"],
  classmate: ["classmate", "classmates"],
  coworker: ["coworker", "coworkers", "colleague", "colleagues"],
  teacher: ["teacher", "teachers"],
  roommate: ["roommate", "roommates"],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function profileParts(persona: PersonaQualityProfile): string[] {
  return [
    persona.displayName,
    persona.raisedIn,
    persona.background,
    persona.regionalHistory,
    persona.culturalBaseline,
    ...(persona.values ?? []),
    persona.communicationStyle,
    ...(persona.sensitivities ?? []),
    ...(persona.doNot ?? []),
  ].filter((part): part is string => Boolean(part?.trim()));
}

function canonicalRelation(value: string): string | null {
  const lower = value.toLocaleLowerCase();
  for (const [canonical, aliases] of Object.entries(RELATION_ALIASES)) {
    if (aliases.includes(lower)) return canonical;
  }
  return null;
}

function relationPattern(): string {
  return Object.values(RELATION_ALIASES)
    .flat()
    .map(escapeRegex)
    .sort((left, right) => right.length - left.length)
    .join("|");
}

function profileSupportsRelation(parts: readonly string[], canonical: string): boolean {
  const aliases = RELATION_ALIASES[canonical] ?? [];
  const pattern = new RegExp(`\\b(?:${aliases.map(escapeRegex).join("|")})\\b`, "i");
  return parts.some((part) => pattern.test(part));
}

const ATTRIBUTION_VERB =
  /\b(?:taught|told|tell|said|says|would\s+say|used\s+to\s+(?:say|tell)|reminded|showed|insisted|believed)\b/i;

const FIRST_PERSON_OBSERVATION =
  /\bi(?:(?:['\u2019]ve)|\s+have)?\s+(?:notice(?:d)?|see|saw|seen|watch(?:ed)?|observe(?:d)?|encounter(?:ed)?)\b/i;

const PERSISTENT_FIRST_PERSON_OBSERVATION =
  /\bi\s+(?:keep|often|continue\s+to)\s+(?:see(?:ing)?|notice|noticing|hear|hearing|watch|watching|observe|observing)\b/i;

const PERSISTENT_INTERNAL_OBSERVATION =
  /\bi\s+(?:keep|often|continue\s+to)\s+(?:see(?:ing)?|notice|noticing|observe|observing)\s+(?:that\s+)?(?:i\b|my(?:\s+own)?\b|myself\b)/i;

const FIRST_PERSON_EXTERNAL_HEARING =
  /\bi(?:(?:['\u2019]ve)|\s+have)?\s+heard\s+(?:people|everyone|someone|famil(?:y|ies)|neighbors?|customers?|commuters?|passengers?|riders?|shoppers?|a\s+regular|the\s+crowd)\b/i;

const INTERNAL_OBSERVATION =
  /\bi(?:(?:['\u2019]ve)|\s+have)?\s+(?:notice(?:d)?|see|saw|seen|hear|heard|observe(?:d)?)\s+(?:that\s+)?(?:i\b|my(?:\s+own)?\b|myself\b)/i;

const EXTERNAL_SCENE_ACTOR =
  /\b(?:people|everyone|someone|famil(?:y|ies)|parents?|children|kids?|neighbors?|customers?|commuters?|passengers?|riders?|shoppers?|a\s+regular|the\s+crowd|a\s+(?:specific|particular)\s+person)\b/i;

const EXTERNAL_SCENE_ACTION =
  /\b(?:talk(?:s|ed|ing)?|speak(?:s|ing|spoke)?|pause(?:s|d|ing)?|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|scan(?:s|ned|ning)?|check(?:s|ed|ing)?|read(?:s|ing)?|argue(?:s|d|ing)?|discuss(?:es|ed|ing)?|whisper(?:s|ed|ing)?|freeze(?:s|froze|freezing)?|stare(?:s|d|ing)?|gather(?:s|ed|ing)?|react(?:s|ed|ing)?|rush(?:es|ed|ing)?|cancel(?:s|ed|ing)?|share(?:s|d|ing)?|offer(?:s|ed|ing)?|act(?:s|ed|ing)?|sound(?:s|ed|ing)?|become(?:s|ing)?|try|tries|tried|trying|hold(?:s|ing)?\s+onto)\b/i;

const PUBLIC_OR_PLACE_SCENE =
  /\b(?:daily\s+life|ordinary\s+routines?|commutes?|errands?|public\s+moments?|family\s+evenings?|dinner\s+tables?|coworkers?|at\s+work|workplace|subway(?:\s+(?:ride|car|station|platform))?|train(?:\s+(?:ride|car|carriage|station|platform))?|bus(?:\s+(?:ride|stop))?|bodega|deli|grocery(?:\s+(?:store|line))?|shop\s+line|sweet\s+shop|neighbou?rhood|on\s+(?:my|our|the)\s+block|street|catskills\s+summers?)\b/i;

const NAMED_PLACE_SCENE =
  /\b(?:(?:[Ii]n|[Aa]round|[Aa]cross|[Nn]ear|[Oo]utside|[Ff]rom)\s+(?:my\s+|our\s+|the\s+)?|(?:my|our)\s+part\s+of\s+)[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2}\b/u;

const TOPIC_MANIFESTATION_IN_SCENE =
  /\b(?:show(?:s|ed|ing)?\s+up|land(?:s|ed|ing)?\s+(?:on|in|as)|follow(?:s|ed|ing)?\s+me|in\s+the\s+air|in\s+my\s+ear)\b/i;

const MEDIATED_OBSERVATION =
  /\b(?:in|from|through)\s+(?:the\s+)?(?:news|headlines?|reports?|articles?|coverage)\b|\b(?:read|heard|saw|learned)\s+(?:about|from)\b/i;

const SPECIFIC_MEDIA_EVENT =
  /\bafter\s+(?:(?:reading|seeing|hearing|watching)\s+)?(?:a|the|that|one)\s+(?:(?:heavy|disturbing|difficult|painful|breaking)\s+)?(?:report|article|headline|news\s+update|broadcast|story)\b/i;

const SELF_CLAIMED_COPING_HABIT =
  /\b(?:capping|limiting|restricting|reducing)\s+my\s+(?:exposure|time)\s+(?:to|with|on)\s+(?:the\s+)?(?:headlines?|news|coverage)\b|\b(?:anchor|ground|steady)\s+myself\b[^.!?\n]{0,100}\bhabits?\b[^.!?\n]{0,70}\b(?:making|cooking|preparing)\b/i;

const SELF_CLAIMED_PUBLIC_ROUTINE =
  /\b(?:on\s+my\s+own|in\s+my\s+(?:daily|everyday)\s+life|in\s+my\s+experience|a\s+concrete\s+(?:new\s+york|city|public)\s+effect\s+is\s+that)\b[^.!?\n]{0,240}\b(?:commutes?|errands?|public\s+moments?|dinner\s+tables?|coworkers?|at\s+work|workplace|daily\s+routine)\b[^.!?\n]{0,240}\b(?:make(?:s)?\s+me|i\s+(?:catch|find)\s+myself|i\s+(?:often|usually|keep)\b)/i;

const DEICTIC_TOPIC_EVENT = /\bwhen\s+(?:this|it)\s+comes\s+up\b/i;
const FAMILY_OR_ROOM_CONTEXT =
  /\b(?:my|our)\s+famil(?:y|ies)\b|\b(?:at|in)\s+(?:my|our|the)\s+(?:home|room|house|apartment)\b|\b(?:my|our)\s+(?:home|room|house|apartment)\b|\bothers?\s+around\s+me\b/i;

const CURRENT_SESSION_DIALOGUE =
  /\bas\s+we\s+(?:discuss|talk(?:\s+about)?|consider|address)\b|\bin\s+(?:this|our|the\s+current)\s+(?:discussion|conversation|circle|session)\b/i;

const CURRENT_GROUP_STATE =
  /\b(?:the|this|our)\s+(?:room|circle|group)\s+(?:is|was|feel(?:s|ing)?|felt|seem(?:s|ed)?|became|becomes?|got|gets?|look(?:s|ed)?|sound(?:s|ed)?)\s+(?:tense|anxious|angry|afraid|upset|uneasy|hostile|dismissive|frustrated|overwhelmed|divided|quiet)\b|\beveryone\s+(?:wants?|wanted|feels?|felt|thinks?|thought|believes?|believed|needs?|needed|expects?|expected|prefers?|preferred|hopes?|hoped)\b/i;

const UNSUPPORTED_PUBLIC_OBSERVATION_CLAIM =
  /\b(?:watching|observing|i\s+(?:keep|often|continue\s+to)\s+(?:notice|noticing|see|seeing|watch|watching|observe|observing))\b[^.!?\n]{0,180}\b(?:one\s+person|a\s+person|people|everyone|neighbors?|new\s+yorkers?|communities?)\b/i;

const UNSUPPORTED_UNIVERSAL_PUBLIC_CLAIM =
  /\b(?:everyone|all\s+new\s+yorkers?|the\s+whole\s+city)\b[^.!?\n]{0,90}\b(?:is|are|was|were|has|have|feels?|thinks?|knows?|expects?|moves?|reacts?|gets?|becomes?|is\s+used\s+to)\b|\b(?:means|causes?)\s+(?:that\s+)?someone\s+in\s+(?:new\s+york(?:\s+city)?|nyc|queens|brooklyn|the\s+bronx|bronx|manhattan|staten\s+island)\b/i;

const EXPLICIT_GROUP_STATE_ATTRIBUTION =
  /\b(?:you|[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})\s+(?:said|shared|described|named|reported)\b/iu;

const SOURCED_NOTICE_TOO = /\bi\s+notice\s+that\s+too\b/i;
const TRANSCRIPT_SOURCE_CUE =
  /\b(?:i\s+hear\s+(?:you|[A-Z][\p{L}'-]+)|(?:you|[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})\s+(?:said|shared|described|named|reported)|your\s+point|[A-Z][\p{L}'-]+(?:['\u2019]s)\s+point)\b/iu;

function isSourcedNoticeTooReflection(sentence: string): boolean {
  const notice = SOURCED_NOTICE_TOO.exec(sentence);
  if (!notice || notice.index === undefined) return false;
  const beforeNotice = sentence.slice(0, notice.index);
  const afterNotice = sentence.slice(notice.index + notice[0].length);
  return TRANSCRIPT_SOURCE_CUE.test(beforeNotice) &&
    !PUBLIC_OR_PLACE_SCENE.test(afterNotice) &&
    !NAMED_PLACE_SCENE.test(afterNotice);
}

function claimsUnsupportedCurrentGroupState(sentence: string): boolean {
  const withoutQuotedText = sentence
    .replace(/[“"][^”"\n]*[”"]/g, "")
    .replace(/‘[^’\n]*’/g, "");
  const state = CURRENT_GROUP_STATE.exec(withoutQuotedText);
  if (!state || state.index === undefined) return false;
  return !EXPLICIT_GROUP_STATE_ATTRIBUTION.test(
    withoutQuotedText.slice(0, state.index),
  );
}

const UNSUPPORTED_SCENE_QUESTIONS = [
  /\bwhat\s+(?:specific\s+)?moment\b[^?\n]{0,180}\b(?:city|new\s+york|daily\s+life|routine|commute|errand|neighbou?rhood|street|room|people)\b[^?\n]*\?/i,
  /\bwhen\s+you\s+(?:notice|see|hear|watch|encounter|experience)\b[^?\n]{0,180}\b(?:new\s+york|conversation|people|room|commute|errand|neighbou?rhood|street|at\s+home)\b[^?\n]*\?/i,
  /\b(?:in|during)\s+your\s+(?:day|daily\s+life|routine)\b[^?\n]{0,100}\bwhen\s+(?:that|this|it)\s+happens?\b[^?\n]*\?/i,
] as const;

function isPurelyHypotheticalScene(sentence: string): boolean {
  if (!/\b(?:could|might|may|can)\b/i.test(sentence)) return false;
  return !/\b(?:on\s+my\s+own|in\s+my\s+experience|in\s+my\s+(?:(?:daily|everyday)\s+)?(?:[\p{L}'-]+\s+)?life|make(?:s)?\s+me|i\s+(?:catch|find)\s+myself|i(?:['\u2019]ve|\s+have)?\s+(?:see|saw|seen|notice|noticed|hear|heard|watch|watched)|i\s+(?:keep|often)\s+(?:see|notice|hear|watch)|when\s+we\s+(?:talk|discuss)|when\s+[^.!?]{0,80}\bcomes\s+up)\b/iu.test(
    sentence,
  );
}

function externalActorActsInScene(sentence: string): boolean {
  const actors = sentence.matchAll(
    new RegExp(EXTERNAL_SCENE_ACTOR.source, `${EXTERNAL_SCENE_ACTOR.flags}g`),
  );
  for (const actor of actors) {
    if (actor.index === undefined) continue;
    const afterActor = sentence.slice(actor.index + actor[0].length);
    const action = EXTERNAL_SCENE_ACTION.exec(afterActor);
    if (!action || action.index === undefined) continue;
    const between = afterActor.slice(0, action.index);
    if (!/\b(?:i|we|my|our)\b/i.test(between)) return true;
  }
  return false;
}

function teachingSupported(
  profile: readonly string[],
  canonical: string,
  attributedContent: string,
): boolean {
  const aliases = RELATION_ALIASES[canonical] ?? [];
  const relation = new RegExp(`\\b(?:${aliases.map(escapeRegex).join("|")})\\b`, "i");
  const attributedConcepts = conceptSet(attributedContent, "");
  return profile.some((part) => {
    if (!relation.test(part) || !ATTRIBUTION_VERB.test(part)) return false;
    const shared = intersectionSize(attributedConcepts, conceptSet(part, ""));
    return shared >= 2 || sharedLongPhrase(attributedContent, part, "") !== null;
  });
}

/** Check close relations and family teachings against the supplied persona data. */
export function personaFidelityRejectionReasons(
  text: string,
  persona: PersonaQualityProfile,
  context: { topic?: string } = {},
): string[] {
  const reasons: string[] = [];
  const profile = profileParts(persona);
  const relations = relationPattern();
  const possession = new RegExp(
    `\\b(?:my|our)\\s+(?:older\\s+|younger\\s+|little\\s+|big\\s+)?(${relations})\\b|\\bthe\\s+(kids|children)\\b`,
    "gi",
  );
  for (const match of text.matchAll(possession)) {
    const canonical = canonicalRelation(match[1] ?? match[2] ?? "");
    if (canonical && !profileSupportsRelation(profile, canonical)) {
      reasons.push(`Persona profile does not support the close relation “${canonical}”.`);
    }
  }

  const attribution = new RegExp(
    `\\b(?:my|our)\\s+(?:older\\s+|younger\\s+)?(${relations})\\b([^.!?\\n]{0,50}?)(taught|told|tell|said|says|would\\s+say|used\\s+to\\s+(?:say|tell)|reminded|showed|insisted|believed)\\b([^.!?\\n]{0,220})`,
    "gi",
  );
  for (const match of text.matchAll(attribution)) {
    const canonical = canonicalRelation(match[1] ?? "");
    if (!canonical || !profileSupportsRelation(profile, canonical)) continue;
    const attributedContent = `${match[3] ?? ""} ${match[4] ?? ""}`.trim();
    if (!teachingSupported(profile, canonical, attributedContent)) {
      reasons.push(
        `Persona profile does not support the teaching or quotation attributed to the ${canonical}.`,
      );
    }
  }

  const inheritedLesson = new RegExp(
    `\b(?:my|our)\s+(?:older\s+|younger\s+)?(${relations})\b([^.!?\n]{0,120}?)\b(?:her|his|their)\s+(?:lesson|teaching)\s+(?:of|that)\s+([^.!?\n]{0,180})`,
    "gi",
  );
  for (const match of text.matchAll(inheritedLesson)) {
    const canonical = canonicalRelation(match[1] ?? "");
    if (!canonical || !profileSupportsRelation(profile, canonical)) continue;
    const attributedContent = `taught ${match[3] ?? ""}`.trim();
    if (!teachingSupported(profile, canonical, attributedContent)) {
      reasons.push(
        `Persona profile does not support the teaching or quotation attributed to the ${canonical}.`,
      );
    }
  }

  const profileAndTopic = lexicalText(
    [...profile, context.topic ?? ""].join(" "),
  );
  const unsupportedRoutinePatterns = [
    /\b(?:my|our)\s+(?:commute|subway rides?|train rides?|group chats?|family chats?|kitchen table|daily routine|weekly routine)\b/i,
    /\b(?:on|during)\s+(?:the|my|our)\s+(?:subway|train|commute)\b/i,
    /\bat\s+(?:the|a)\s+(?:deli|bodega)\b/i,
  ];
  for (const pattern of unsupportedRoutinePatterns) {
    const match = pattern.exec(text);
    if (match && !profileAndTopic.includes(lexicalText(match[0]))) {
      reasons.push(`Persona profile does not support the routine or setting “${match[0]}”.`);
    }
  }

  const unsupportedTimeMarker =
    /\b(?:yesterday|last\s+(?:night|week|month)|this\s+(?:morning|week)|earlier\s+today)\b/i.exec(
      text,
    );
  if (
    unsupportedTimeMarker &&
    !profileAndTopic.includes(lexicalText(unsupportedTimeMarker[0]))
  ) {
    reasons.push(
      `Persona profile does not support the newly invented event time “${unsupportedTimeMarker[0]}”.`,
    );
  }

  // A profile can support a place or relative without supporting a newly
  // invented scene in which this particular session topic was discussed.
  // Keep present-tense values and uncertainty available, while rejecting
  // claims such as "when the Gaza war came up at home" or "when people at my
  // aunt's shop said Gaza war" unless that event is actually in the profile.
  const normalizedTopic = lexicalText(context.topic ?? "");
  const profileText = lexicalText(profile.join(" "));
  if (normalizedTopic) {
    const topicNamedInTurn = lexicalText(text).includes(normalizedTopic);
    if (
      topicNamedInTurn &&
      UNSUPPORTED_SCENE_QUESTIONS.some((pattern) => pattern.test(text))
    ) {
      reasons.push(
        "Response asks another persona to supply an unsupported topical moment, routine, or witnessed scene.",
      );
    }
    const claimedEventPatterns = [
      /\b(?:came up|was (?:mentioned|discussed)|entered (?:the|our|my) conversation)\b/i,
      /\bi (?:remember|recall)\b[^.!?\n]{0,120}\b(?:hearing|seeing|watching|discussing|talking|arguing)\b/i,
      /\b(?:when|whenever)\s+(?:people|someone|everyone|my family|our family)\b[^.!?\n]{0,120}\b(?:say|said|mention|mentioned|discuss|discussed|talk|talked|argue|argued)\b/i,
      /\bwe\b[^.!?\n]{0,80}\b(?:talk|talks|talked|discuss|discusses|discussed|argue|argues|argued|speak|speaks|spoke)\b/i,
      /\b(?:my family|our family)\b[^.!?\n]{0,80}\b(?:talk|talks|talked|discuss|discusses|discussed|argue|argues|argued|spoke)\b/i,
    ] as const;
    const sentences = normalizeDialogueFormatting(text)
      .split(/\n|(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      const normalizedSentence = lexicalText(sentence);
      const topicNamedHere = normalizedSentence.includes(normalizedTopic);
      const explicitlyNamedTopicComesUp = normalizedSentence.includes(
        `${normalizedTopic} comes up`,
      );
      const describesCurrentSessionDialogue = CURRENT_SESSION_DIALOGUE.test(sentence);
      if (
        topicNamedHere &&
        (
          explicitlyNamedTopicComesUp ||
          claimedEventPatterns.some((pattern) => pattern.test(sentence))
        ) &&
        !describesCurrentSessionDialogue &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed event in which the session topic was discussed or observed.",
        );
      }
      if (
        topicNamedInTurn &&
        DEICTIC_TOPIC_EVENT.test(sentence) &&
        FAMILY_OR_ROOM_CONTEXT.test(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed event in which the session topic was discussed or observed.",
        );
      }
      if (
        topicNamedInTurn &&
        SPECIFIC_MEDIA_EVENT.test(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed specific report or media event.",
        );
      }
      if (
        topicNamedInTurn &&
        SELF_CLAIMED_COPING_HABIT.test(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed personal coping habit or routine.",
        );
      }
      if (
        topicNamedInTurn &&
        SELF_CLAIMED_PUBLIC_ROUTINE.test(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed personal routine or public moment.",
        );
      }
      if (
        topicNamedInTurn &&
        claimsUnsupportedCurrentGroupState(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Response claims an unsupported current group state or universal reaction.",
        );
      }
      if (
        topicNamedInTurn &&
        (
          UNSUPPORTED_PUBLIC_OBSERVATION_CLAIM.test(sentence) ||
          UNSUPPORTED_UNIVERSAL_PUBLIC_CLAIM.test(sentence)
        ) &&
        (
          !isPurelyHypotheticalScene(sentence) ||
          PERSISTENT_FIRST_PERSON_OBSERVATION.test(sentence) ||
          UNSUPPORTED_UNIVERSAL_PUBLIC_CLAIM.test(sentence)
        ) &&
        !isSourcedNoticeTooReflection(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed public observation or universal New York generalization.",
        );
      }

      const hasExternalActor = EXTERNAL_SCENE_ACTOR.test(sentence);
      const externalActorActs = externalActorActsInScene(sentence);
      const hasPublicOrNamedPlace =
        PUBLIC_OR_PLACE_SCENE.test(sentence) || NAMED_PLACE_SCENE.test(sentence);
      const hasLiteralFirstPersonObservation =
        (
          FIRST_PERSON_OBSERVATION.test(sentence) ||
          FIRST_PERSON_EXTERNAL_HEARING.test(sentence)
        ) &&
        !INTERNAL_OBSERVATION.test(sentence) &&
        !MEDIATED_OBSERVATION.test(sentence);
      const hasPersistentExternalObservation =
        PERSISTENT_FIRST_PERSON_OBSERVATION.test(sentence) &&
        !PERSISTENT_INTERNAL_OBSERVATION.test(sentence);
      const sourcedNoticeTooReflection = isSourcedNoticeTooReflection(sentence);
      const claimsExternalScene =
        !sourcedNoticeTooReflection && (
          (externalActorActs && hasPublicOrNamedPlace) ||
          (
            hasLiteralFirstPersonObservation &&
            hasExternalActor &&
            (externalActorActs || hasPublicOrNamedPlace)
          ) ||
          (
            hasPersistentExternalObservation &&
            hasPublicOrNamedPlace &&
            topicNamedInTurn
          ) ||
          (
            hasPublicOrNamedPlace &&
            TOPIC_MANIFESTATION_IN_SCENE.test(sentence) &&
            (topicNamedHere || lexicalText(text).includes(normalizedTopic))
          )
        );
      if (
        claimsExternalScene &&
        !isPurelyHypotheticalScene(sentence) &&
        !profileText.includes(normalizedSentence)
      ) {
        reasons.push(
          "Persona profile does not support the claimed witnessed topical scene or public observation.",
        );
      }
    }
  }

  const namedVenue =
    /\b(?:at|in|near|outside|around)\s+(?:the\s+)?([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})\s+(deli|bodega|station|campus|college|university|school|park|square)\b/iu.exec(
      text,
    ) ?? /\bon\s+(?:the\s+)?([A-Z0-9]+)\s+(train)\b/u.exec(text);
  if (namedVenue && !profileAndTopic.includes(lexicalText(namedVenue[0]))) {
    reasons.push(
      `Persona profile does not support the specific place or route “${namedVenue[0]}”.`,
    );
  }
  return uniqueReasons(reasons);
}

/** Keep a neutral facilitator from adopting participant experience as their own. */
export function facilitatorSelfPositioningReasons(text: string): string[] {
  const reasons: string[] = [];
  const withoutQuotes = normalizeDialogueFormatting(text)
    .replace(/[“"][^”"\n]*[”"]/g, "")
    // Do not treat straight apostrophes as quote delimiters: doing so can span
    // unrelated contractions such as "don't" and "I'm".
    .replace(/‘[^’\n]*’/g, "");

  if (/\bi\s+(?:can\s+)?relate\b/i.test(withoutQuotes)) {
    reasons.push("Facilitator claims personal relatability instead of maintaining neutrality.");
  }
  if (/\bi\s+(?:can\s+)?feel\b/i.test(withoutQuotes)) {
    reasons.push("Facilitator claims a personal feeling about the participant experience.");
  }
  if (/\b(?:the\s+)?intent\s+i\s+see\b/i.test(withoutQuotes)) {
    reasons.push("Facilitator asserts an interpretation of another person's intent.");
  }
  if (/\bbefore\s+i\s+speak\b/i.test(withoutQuotes)) {
    reasons.push("Facilitator uses the self-referential phrase 'before I speak' while speaking.");
  }

  const targetPronounAdoption = new RegExp(
    "\\b(?:when|as)\\s+(?:you|[A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+)?)\\s+(?:said|shared|described|wrote)\\b[^.!?\\n]{0,180}\\b(?:my|our)\\b",
    "iu",
  );
  if (targetPronounAdoption.test(withoutQuotes)) {
    reasons.push("Facilitator adopts the target speaker's first-person pronoun as their own.");
  }
  return uniqueReasons(reasons);
}

/** Reject short accidental word echoes in facilitator speech. */
export function facilitatorVerbalStutterReasons(text: string): string[] {
  const normalized = normalizeDialogueFormatting(text)
    .replace(/[“"][^”"\n]*[”"]/g, "")
    .replace(/‘[^’\n]*’/g, "");
  if (
    /\b(already|currently|exactly|really|clearly|directly|specifically)\b(?:\s+[,;:—-]?\s*[\p{L}'’-]+)?\s+\1\b/iu.test(
      normalized,
    )
  ) {
    return ["Facilitator response contains an immediate verbal stutter or repeated modifier."];
  }
  if (/\bi\s+notice\s+the\s+same\s+thread\s+in\b[^.!?]{0,120}\bis\b/i.test(normalized)) {
    return ["Facilitator response contains an incomplete 'same thread ... is' construction."];
  }
  return [];
}

/** Reject facilitator claims about a participant's intent unless accepted source turns support them. */
export function facilitatorUnsupportedAttributionReasons(
  text: string,
  sourceTexts: readonly string[],
): string[] {
  const reasons: string[] = [];
  const attributedIntent =
    /\b(?:good|bad|best|harmful|generous)\s+intent(?:ion)?s?\b|\b(?:his|her|their)['’]s\s+intent(?:ion)?s?\b|\b(?:he|she|they)\s+(?:(?:was|were|is|are)\s+trying|meant|intended|wanted|tried)\b/i.test(
      text,
    ) ||
    /\b[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2}(?:['’]s\s+intent(?:ion)?s?|\s+(?:(?:was|were|is|are)\s+trying|meant|intended|wanted|tried))\b/u.test(
      text,
    );
  const source = sourceTexts.join("\n");
  if (
    attributedIntent &&
    !/\b(?:good|bad|best|harmful|generous)\s+intent(?:ion)?s?\b|\b(?:my|our|his|her|their)\s+intent(?:ion)?s?\b|\bi\s+(?:(?:was|am)\s+trying|meant|intended|wanted|tried)\b/i.test(source)
  ) {
    reasons.push(
      "Facilitator attributes an intention or motive that no accepted source turn stated.",
    );
  }
  const placeLinkedPremise =
    /\b(?:new\s+york(?:\s+city)?|nyc)(?:['’]s)?\b[^.!?]{0,100}\b(?:reality|fast[- ]moving\s+(?:fragments?|information|updates?))\b/i;
  const sourceSupportsPlacePremise = normalizeDialogueFormatting(source)
    .split(/(?<=[.!?])\s+/)
    .some(
      (sentence) =>
        /\b(?:new\s+york(?:\s+city)?|nyc|astoria|queens|brooklyn|bronx|manhattan|staten\s+island)\b/i.test(
          sentence,
        ) &&
        /\b(?:reality|fragments?|partial\s+(?:information|updates?)|fast[- ]moving|updates?\s+(?:move|spread|change))\b/i.test(
          sentence,
        ),
    );
  if (placeLinkedPremise.test(text) && !sourceSupportsPlacePremise) {
    reasons.push(
      "Facilitator adds a New York subject-level premise that no accepted source turn stated.",
    );
  }
  const silenceOrNonparticipationPremise =
    /\b(?:whether|if)\s+(?:we|they|you|someone|people)\s+(?:speak\s+at\s+all|stay\s+(?:quiet|silent))\b|\b(?:choose|choosing|decide|deciding|refuse|refusing)\s+(?:not\s+)?to\s+speak\b|\b(?:silence|staying\s+silent)\s+(?:is|becomes?|protects?|harms?)\b/i;
  const sourceSupportsSilenceOrNonparticipation =
    /\b(?:i|we|they|you|someone|people)\s+(?:stay|stayed|remain|remained|go|went)\s+(?:quiet|silent)\b|\b(?:i|we)\s+(?:will\s+not|won't|do\s+not|don't|cannot|can't|refuse\s+to)\s+speak\b(?!\s+for\b)|\b(?:silence|staying\s+silent|not\s+speaking)\b/i.test(
      source,
    );
  if (
    silenceOrNonparticipationPremise.test(text) &&
    !sourceSupportsSilenceOrNonparticipation
  ) {
    reasons.push(
      "Facilitator introduces silence or nonparticipation as an alternative that no accepted source turn stated.",
    );
  }
  return uniqueReasons(reasons);
}
