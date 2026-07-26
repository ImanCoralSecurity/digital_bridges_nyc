import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessInvitedResponseFidelity,
  challengeFidelityRejectionReasons,
  challengeSelfConsistencyRejectionReasons,
  dialogueNaturalnessRejectionReasons,
  dialogueNoveltyRejectionReasons,
  facilitatorSelfPositioningReasons,
  facilitatorUnsupportedAttributionReasons,
  facilitatorVerbalStutterReasons,
  globallySaturatedSemanticFrameLabels,
  globalSemanticMotifSaturationRejectionReasons,
  hasSupportedUnresolvedChallengeDifference,
  normalizeDialogueFormatting,
  personaFidelityRejectionReasons,
  sameSpeakerSemanticReuseRejectionReasons,
  saturatedSemanticFrameLabels,
  semanticMotifSaturationRejectionReasons,
  substantiveTopicRejectionReasons,
  subjectPositionSemanticReuseRejectionReasons,
  subjectPositionsMateriallyCompatible,
  subjectPositionsMateriallyEquivalent,
  subjectPropositionNoveltyRejectionReasons,
  unsupportedClosingPriorityClaimRejectionReasons,
} from "../lib/dialogueQuality.ts";
import { visiblePromptScaffoldingFlags } from "../lib/methodology.ts";

const aminaPauseTarget =
  "I breathe first and ask what someone is feeling so that person gets seen rather than argued with. I mean the pause as an opening for a hard conversation.";
const danielPauseChallenge =
  "Amina, I question whether a breathing pause and one question can by itself hold this conflict. In my Forest Hills home, warmth had to be followed by naming what was truly painful instead of smoothing over division.";

const failedGazaCanaryAminaRoundOne = [
  "Ari, the two obligations I’m balancing are protecting civilians in the immediate moment and protecting people in New York communities here from becoming anonymous sides in the story, and those two can collide.",
  "In the Gaza war, that shows up as a real human consequence when urgency to act quickly can accidentally make someone feel unheard or dehumanized in our own conversations.",
  "I put immediate civilian safety first, and I’d only support broader demands when they still hold that first obligation intact, because I don’t want the outcome to be one form of harm replacing another.",
  "Daniel Behar, what practical result matters most to you here?",
].join("\n");

const failedGazaCanaryDanielChallenge =
  "Amina, your point about civilian safety leaves out a different priority for me in “Gaza war.” I need to challenge that omission from my own standpoint. My priority in “Gaza war” is civilian safety and reliable access to food, water, and medicine.";

const failedGazaCanaryBilalRoundOne = [
  "I would support a response in the Gaza war only if it is measured by a hard outcome: reliable access to food, water, and medicine for civilians today, not next month.",
  "I would oppose any position that asks me to accept a delay in that access for a political gain, because in my view survival is not a bargaining step.",
  "I can carry this tension in Parkchester by saying my priority is to protect ordinary people from becoming symbols in a larger argument, and I will keep choosing the side of immediate life-preserving need over the side of rhetorical victory.",
].join("\n");

const failedGazaCanaryAminaRoundTwo =
  "In the Gaza war, the unresolved choice I’m carrying is whether I support immediate aid delivery for food, water, and medicine now, even if the channels are imperfect, or insist on tighter conditions that may slow everything down. I agree with the shared point that reliable access to those basics is the base obligation in this conversation, and I won’t argue against that. My own choice is to support emergency relief first, but only if there is also a clear path to continue treatment and daily care afterward, because short-lived fixes can still leave people exposed to deeper harm. Ari Feldman, which human outcome would you protect first?";

const failedGazaCanaryAriRoundTwo = [
  "Amina, to answer you directly, in the Gaza war I’d protect sustained civilian medical continuity after the first emergency wave, because a temporary relief spike can still leave people in irreversible danger when hospitals and treatment chains break the next day.",
  "I hear your point, and I share the idea that reliable access to food, water, and medicine has to be in place first.",
  "I’d support any response that guarantees both immediate survival and continuity of care, and I’d oppose a plan that treats relief as a headline moment instead of a living system.",
  "Bilal Osman, what decision here can you not settle?",
].join("\n");

const failedGazaCanaryBilalChallenge =
  "Ari, I need to challenge the scope of your point about basic needs in “Gaza war” because it leaves out another priority I hold. From my own standpoint, in “Gaza war,” I remain unsure whether reducing immediate civilian harm or protecting the conditions for lasting civilian safety should come first.";

function assessPauseReply(text) {
  return assessInvitedResponseFidelity({
    text,
    challengerName: "Daniel Behar",
    challengerText: danielPauseChallenge,
    targetName: "Amina Rahman",
    targetText: aminaPauseTarget,
    topic: "Gaza war",
  });
}

test("normalizeDialogueFormatting removes balanced visible Markdown and hard breaks", () => {
  const source =
    "## **Gaza war**  \nI *hear* `this` and __want us to pause__.  \n### Closing ###";

  assert.equal(
    normalizeDialogueFormatting(source),
    "Gaza war\nI hear this and want us to pause.\nClosing",
  );
});

test("normalizeDialogueFormatting preserves unbalanced markers and spoken words", () => {
  const source = "I said **Gaza war and left `this unfinished";
  assert.equal(normalizeDialogueFormatting(source), source);
});

test("dialogue novelty excludes one required leading reflection but still checks the new proposition", () => {
  const reference =
    "Daniel named the rights and safety of people displaced from their homes as a separate priority in the Gaza war.";
  const reflectedThenNew =
    "I hear Daniel’s point in the Gaza war about the rights and safety of people displaced from their homes. My unresolved choice is whether I should support an immediate aid route that saves lives today or hold for stronger tracking guarantees first. Ari Feldman, which human outcome would you protect first?";
  const reflectionOnly =
    "I hear Daniel’s point in the Gaza war about the rights and safety of people displaced from their homes. Ari Feldman, which human outcome would you protect first?";

  assert.deepEqual(
    dialogueNoveltyRejectionReasons(reflectedThenNew, [reference], "Gaza war"),
    [],
  );
  assert.match(
    dialogueNoveltyRejectionReasons(reflectionOnly, [reference], "Gaza war").join(" "),
    /repeats a long phrase/i,
  );
});

test("dialogue naturalness rejects captured fallback seams and mixed metaphors", () => {
  for (const text of [
    "My boundary is to keep both obligations open through my value of generosity from Forest Hills, Queens, New York City.",
    "Hospitality requires me to leave questions of harm and dignity unresolved.",
    "What keeps your voice from becoming the only voice allowed on a single face?",
  ]) {
    assert.ok(dialogueNaturalnessRejectionReasons(text).length > 0, text);
  }
  assert.deepEqual(
    dialogueNaturalnessRejectionReasons(
      "From Forest Hills, I keep access to food and medicine visible as a separate priority.",
    ),
    [],
  );
});

test("dialogue naturalness rejects visible subject-level fallback jargon", () => {
  const text =
    "Amina, your point leaves out a different subject-level choice that I need to challenge.";
  assert.ok(
    dialogueNaturalnessRejectionReasons(text).length > 0 ||
      visiblePromptScaffoldingFlags(text).length > 0,
    text,
  );
});

test("dialogue naturalness rejects the failed Gaza canary's arbitrary timelines and invented motives", () => {
  assert.match(
    dialogueNaturalnessRejectionReasons(failedGazaCanaryAriRoundTwo).join(" "),
    /arbitrary precise time horizon/i,
  );

  const bilalReasons = dialogueNaturalnessRejectionReasons(
    failedGazaCanaryBilalRoundOne,
  ).join(" ");
  assert.match(bilalReasons, /arbitrary precise time horizon/i);
  assert.match(bilalReasons, /adversarial political motive|false side/i);
});

test("dialogue naturalness permits ordinary chronology, deadlines, and bounded political stances", () => {
  for (const text of [
    "My parents arrived in Queens; the next day, they found the grocery where our family still shops.",
    "For housing affordability, I would fund rent assistance by next month.",
    "In the Gaza war, I oppose delaying aid for political gain.",
  ]) {
    assert.deepEqual(dialogueNaturalnessRejectionReasons(text), [], text);
  }
});

const challengeCases = [
  {
    target:
      "I was raised to believe hospitality is a kind of resistance, so I keep asking myself how to show that.",
    challenge:
      "Amina, I disagree with the conclusion that I see in your turn—that hospitality alone is a full way through this. We should not conclude yet that it can ground every family.",
  },
  {
    target:
      "I reach for a joke before I can say how worried I feel, and it does not make the uncertainty disappear.",
    challenge:
      "Ari, I disagree with the assumption that noticing the conflict everywhere means we have already understood it. We should not conclude yet that humor alone counts as genuine understanding.",
  },
  {
    target:
      "I found one line helpful because it is clunky and less likely to harden faces; jokes cannot replace real listening.",
    challenge:
      "Ari, I disagree with the assumption that one opening line is enough to prevent deeper division. The circle should not conclude yet that a single phrase can carry every New York moment.",
  },
  {
    target:
      "I breathe first and ask what someone is feeling so that person gets seen rather than argued with.",
    challenge:
      "Amina, I disagree with the assumption that a breathing pause and one question can by itself safely manage the conflict. The circle should not conclude yet that a caring tone is enough.",
  },
];

test("challenge fidelity rejects all four recorded straw-man challenge forms", () => {
  for (const { challenge, target } of challengeCases) {
    const reasons = challengeFidelityRejectionReasons(challenge, target);
    assert.ok(reasons.length > 0, challenge);
    assert.match(reasons.join(" "), /attributes|strengthens|canned/i);
  }
});

test("challenge fidelity rejects an imagined circle inference and permits an actual unresolved limit", () => {
  const target =
    "Hospitality helps me stay patient, and I keep asking myself how to practice it under pressure.";
  const imagined =
    "Amina, I worry the circle may infer that hospitality alone is enough, even though you did not say that. In my family, generosity also meant leaving hard disagreement unresolved.";
  const bounded =
    "Amina, your point about hospitality names one personal value. I worry about what it leaves unresolved for me: how patience and direct disagreement can coexist. My boundary is to keep that question open through my value of honesty.";

  assert.match(
    challengeFidelityRejectionReasons(imagined, target).join(" "),
    /imagined circle|manufactures conflict/i,
  );
  assert.deepEqual(challengeFidelityRejectionReasons(bounded, target), []);
});

test("challenge fidelity rejects canary 9's restatement of the target's existing epistemic tension", () => {
  const target =
    "In this Gaza war conversation, I cannot speak for anyone living this. I want to stay present without replacing another person's story, so I begin with uncertainty and care.";
  const repeated =
    "Amina, your point about uncertainty names one stake in the Gaza war. I worry about how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open.";
  const distinct =
    "Amina, your point addresses one part of the Gaza war. From my own life in Forest Hills, I need to challenge what it leaves out: access to food, medicine, and shelter for people directly affected. I cannot resolve which need should guide attention first.";

  assert.match(
    challengeFidelityRejectionReasons(repeated, target).join(" "),
    /restate.*existing tension|distinct subject-level/i,
  );
  assert.deepEqual(challengeFidelityRejectionReasons(distinct, target), []);
});

test("challenge quality rejects a paraphrase of the target's existing subject priority", () => {
  const target =
    "My priority in the Gaza war is civilian safety and reliable medical access.";
  const paraphrase =
    "Amina, your point addresses one part of the Gaza war, but I need to challenge what it leaves out. My priority is protecting civilian lives and ensuring access to medicine.";

  const fidelityReasons = challengeFidelityRejectionReasons(paraphrase, target);
  const noveltyReasons = dialogueNoveltyRejectionReasons(
    paraphrase,
    [target],
    "Gaza war",
  );
  assert.ok(
    fidelityReasons.length > 0 || noveltyReasons.length > 0,
    paraphrase,
  );
});

test("challenge fidelity rejects both exact false distinctions from the failed Gaza canary", () => {
  for (const [challenge, target] of [
    [failedGazaCanaryDanielChallenge, failedGazaCanaryAminaRoundOne],
    [failedGazaCanaryBilalChallenge, failedGazaCanaryAriRoundTwo],
  ]) {
    assert.match(
      challengeFidelityRejectionReasons(challenge, target).join(" "),
      /paraphrases the target's existing subject priority/i,
    );
  }
});

test("challenge fidelity catches bounded and competing lanes that recast an existing stake", () => {
  const target =
    "In the Gaza war, I put immediate civilian safety first.";
  const bounded =
    "Amina, I need to challenge what that leaves out. My standard in the Gaza war is reliable access to food, water, and medicine for civilians.";
  const competing =
    "Amina, I need to challenge what that leaves out. In the Gaza war, I cannot let civilian protection erase reliable access to food, water, and medicine for civilians.";

  for (const challenge of [bounded, competing]) {
    assert.match(
      challengeFidelityRejectionReasons(challenge, target).join(" "),
      /paraphrases the target's existing subject priority/i,
    );
  }
});

test("challenge fidelity preserves a distinct operational condition and a distinct beneficiary", () => {
  const aidTarget =
    "In the Gaza war, I would support humanitarian aid if it reaches civilians quickly.";
  const monitoredAid =
    "Amina, I need to name a different operational condition. In the Gaza war, I would support humanitarian aid only if independent monitors publish delivery records for hospitals.";
  assert.deepEqual(
    challengeFidelityRejectionReasons(monitoredAid, aidTarget),
    [],
  );

  const hostageTarget =
    "In the Gaza war, the outcome I need to protect is the safe return of hostages.";
  const civilianAid =
    "Amina, I need to name a different urgent outcome. My priority in the Gaza war is reliable food, water, and medicine for civilians.";
  assert.deepEqual(
    challengeFidelityRejectionReasons(civilianAid, hostageTarget),
    [],
  );
});

test("challenge fidelity permits a faithful direct quote but rejects invented target attitudes", () => {
  const target =
    "In the Gaza war, I believe urgent medical care should come first, while accountability remains visible.";
  const faithful =
    "Amina, you said urgent medical care should come first. I disagree with that ranking: family reunification must come first in the Gaza war.";
  assert.deepEqual(challengeFidelityRejectionReasons(faithful, target), []);

  for (const inventedAttitude of [
    "Amina, you treated accountability as optional in the Gaza war. I need to keep it visible.",
    "Amina, your position dismisses family reunification in the Gaza war. I need to protect it.",
  ]) {
    assert.match(
      challengeFidelityRejectionReasons(inventedAttitude, target).join(" "),
      /dismissive or devaluing attitude/i,
    );
  }

  const factualOmission =
    "Amina, you left family reunification out of the outcome you named in the Gaza war. I also hold family reunification as a hard obligation.";
  assert.deepEqual(
    challengeFidelityRejectionReasons(factualOmission, target),
    [],
  );
});

test("challenge consistency rejects Bilal reversing his immediate-needs-first position", () => {
  assert.match(
    challengeSelfConsistencyRejectionReasons(
      failedGazaCanaryBilalChallenge,
      [failedGazaCanaryBilalRoundOne],
      "Gaza war",
    ).join(" "),
    /contradicts this speaker's earlier immediate-needs-first position/i,
  );
});

test("challenge consistency recognizes concrete basics-first wording and permits an explained revision", () => {
  const prior =
    "For me, food, water, and medicine for civilians come first; accountability cannot delay those basics.";
  const unexplained =
    "Amina, I cannot share your ranking. In the Gaza war, I remain unsure whether food, water, and medicine for civilians or long-term accountability should come first.";
  const explained =
    "Amina, after hearing your distinction, I have reconsidered my priority. In the Gaza war, I remain unsure whether food, water, and medicine for civilians or long-term accountability should come first.";

  assert.match(
    challengeSelfConsistencyRejectionReasons(
      unexplained,
      [prior],
      "Gaza war",
    ).join(" "),
    /contradicts this speaker's earlier immediate-needs-first position/i,
  );
  assert.deepEqual(
    challengeSelfConsistencyRejectionReasons(
      explained,
      [prior],
      "Gaza war",
    ),
    [],
  );
});

test("challenge consistency rejects an unexplained shift from linked outcomes to a priority contest", () => {
  const linkedPosition =
    "In the Gaza war, I would support emergency aid plans that include medical transfer and family-tracing as a single response, because to me the deciding outcome is whether someone can find a living person they call family, not only whether aid moved on paper.";
  const contradictoryChallenge =
    "Ari, I need to challenge the scope of your point about basic needs in the Gaza war because it leaves out another priority I hold. I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.";
  const explainedChange =
    "Ari, after hearing the later distinctions, I have reconsidered my position. In the Gaza war, I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.";

  assert.match(
    challengeSelfConsistencyRejectionReasons(
      contradictoryChallenge,
      [linkedPosition],
      "Gaza war",
    ).join(" "),
    /earlier deciding or linked outcome/i,
  );
  assert.deepEqual(
    challengeSelfConsistencyRejectionReasons(
      explainedChange,
      [linkedPosition],
      "Gaza war",
    ),
    [],
  );
});

test("challenge consistency permits immediate-safety refinements and additive obligations", () => {
  const prior =
    "In the Gaza war, I put immediate civilian safety first, while accountability remains visible.";
  const narrowed =
    "Amina, my protected outcome in the Gaza war is keeping an emergency medical-evacuation route open today.";
  const additive =
    "Amina, in the Gaza war I also hold a hard obligation to secure legal protection and family reunification for displaced families.";
  const reversal =
    "Amina, my priority in the Gaza war is legal accountability rather than immediate civilian safety.";

  assert.deepEqual(
    challengeSelfConsistencyRejectionReasons(narrowed, [prior], "Gaza war"),
    [],
  );
  assert.deepEqual(
    challengeSelfConsistencyRejectionReasons(additive, [prior], "Gaza war"),
    [],
  );
  assert.match(
    challengeSelfConsistencyRejectionReasons(reversal, [prior], "Gaza war").join(" "),
    /contradicts this speaker's earlier immediate-needs-first position/i,
  );
});

test("challenge subject novelty rejects an older speaker's proposition without comparing scaffolding", () => {
  const older =
    "In Gaza war, I remain unsure whether immediate relief should receive priority or long-term accountability should guide action first.";
  const repeated =
    "Ari, your point about people directly affected addresses one part of Gaza war. From my own life, I need to challenge what it leaves out. In Gaza war, I remain unsure whether immediate relief should receive priority or long-term accountability should guide action first.";
  const distinct =
    "Ari, your point addresses one part of Gaza war. From my own life, I need to challenge what it leaves out. In Gaza war, I would support humanitarian access if it reliably reaches civilians needing food and medical care.";

  assert.match(
    subjectPropositionNoveltyRejectionReasons(
      repeated,
      [older],
      "Gaza war",
    ).join(" "),
    /prior speaker's subject proposition/i,
  );
  assert.deepEqual(
    subjectPropositionNoveltyRejectionReasons(
      distinct,
      [older],
      "Gaza war",
    ),
    [],
  );
});

test("challenge novelty checks the added stake against the whole recent transcript", () => {
  const target =
    "In the Gaza war, the outcome I would protect first is continuous medical access for civilians.";
  const earlierDisplacementPosition =
    "My priority in the Gaza war is the rights and safety of people displaced from their homes.";
  const recycled =
    "Ari, I need to challenge the scope of your point about basic needs in the Gaza war. I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.";
  const materiallyMoreSpecific =
    "Ari, I cannot accept medical access as the only first commitment in the Gaza war. I also hold a hard obligation to prevent permanent family separation during displacement, and my boundary is that I cannot endorse care without a concrete route for family reunification and legal protection.";

  assert.match(
    subjectPropositionNoveltyRejectionReasons(
      recycled,
      [earlierDisplacementPosition, target],
      "Gaza war",
      target,
    ).join(" "),
    /repeats the material stake it adds beyond the target/i,
  );
  assert.deepEqual(
    subjectPropositionNoveltyRejectionReasons(
      materiallyMoreSpecific,
      [earlierDisplacementPosition, target],
      "Gaza war",
      target,
    ),
    [],
  );
});

test("subject-position novelty rejects the canary's adjacent aid-first paraphrase", () => {
  const prior =
    "In this Gaza war, I support prioritizing immediate civilian safety and basic needs—water, medicine, and shelter. I would accept a plan only if its result is fewer civilians in immediate danger, while accountability remains visible.";
  const repeated =
    "In the Gaza war, I would support putting immediate civilian safety first—especially food, water, medicine, and shelter. I'd judge a response by whether it reaches people in time, while keeping accountability possible.";
  const distinct =
    "In the Gaza war, I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.";

  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      repeated,
      [prior],
      "Gaza war",
    ).join(" "),
    /substantially repeats/i,
  );
  assert.deepEqual(
    subjectPositionSemanticReuseRejectionReasons(
      distinct,
      [prior],
      "Gaza war",
    ),
    [],
  );
});

test("invited-response fidelity recognizes natural priority, boundary, and separation frames", () => {
  const challengerText =
    "Ari, I cannot accept medical care as the only priority in the Gaza war. I also hold a hard obligation to protect displaced families from legal limbo and permanent separation.";
  const targetText =
    "In the Gaza war, the outcome I would protect first is continuous medical access for civilians.";
  const replies = [
    "Bilal Osman is naming a separate priority in the Gaza war: legal protection and family reunification for displaced families. My position is that urgent care comes first, while that protection remains a non-negotiable next step.",
    "Bilal Osman, I hear your challenge as adding legal protection and family reunification for displaced families in the Gaza war. I would put urgent medical care first and preserve that second obligation.",
    "Bilal Osman, you’re putting a real boundary on my point: care without legal protection can leave displaced families separated. My position is to protect urgent care first while requiring a path to reunification.",
    "Bilal Osman is naming a real separation between continuous care and displaced families’ legal protection. I would set a hard minimum on urgent care first without treating reunification as optional.",
    "I hear Bilal Osman’s point and want to pause so I can name what he added: legal protection and family reunification for displaced families in the Gaza war. My position is to keep urgent medical care first while requiring that protection too.",
  ];

  for (const text of replies) {
    const assessment = assessInvitedResponseFidelity({
      text,
      challengerName: "Bilal Osman",
      challengerText,
      targetName: "Ari Feldman",
      targetText,
      topic: "Gaza war",
    });
    assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
  }

  const exactSparkRepair =
    "Bilal Osman is naming a separate priority in the Gaza war: the rights and safety of people displaced from their homes, which I did not put beside my immediate safety and dignity focus. My position is that I can work for food, medicine, and immediate protection now, but I also cannot leave the outcome as only crisis relief if it leaves families without the longer path to secure rights and safety at home. The human cost I feel most in this is the unresolved choice between what helps today and what protects people from the next cycle of harm tomorrow.";
  const exactAssessment = assessInvitedResponseFidelity({
    text: exactSparkRepair,
    challengerName: "Bilal Osman",
    challengerText,
    targetName: "Ari Feldman",
    targetText,
    topic: "Gaza war",
  });
  assert.equal(
    exactAssessment.acceptable,
    true,
    exactAssessment.rejectionReasons.join("; "),
  );
});

test("closing rejects a priority camp that no participant actually stated", () => {
  const transcript = [
    {
      speakerName: "Sam (Facilitator)",
      text: "One response must come first: legal protection for displaced families.",
    },
    {
      speakerName: "Ari Feldman",
      text: "In the Gaza war, the outcome I would protect first is continuous medical access for civilians.",
    },
    {
      speakerName: "Bilal Osman",
      text: "In the Gaza war, I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.",
    },
    {
      speakerName: "Daniel Behar",
      text: "I would support emergency plans only when medicine access and family-preserving shelter are linked, not competing, outcomes.",
    },
  ];
  const falseClosing =
    "Thank you for this work on Gaza war. One commitment centers uninterrupted care, while another insists that displaced-family rights must come first.";
  const accurateClosing =
    "Thank you for this work on Gaza war. The ordering of urgent care and displacement protections remains unsettled, while another position links them rather than ranking them.";

  assert.match(
    unsupportedClosingPriorityClaimRejectionReasons(
      falseClosing,
      transcript,
    ).join(" "),
    /without a participant stating that decisive ordering/i,
  );
  assert.deepEqual(
    unsupportedClosingPriorityClaimRejectionReasons(
      accurateClosing,
      transcript,
    ),
    [],
  );
});

test("closing support requires the same latest ordered-first stake", () => {
  const changedPosition = [
    {
      speakerName: "Amina Rahman",
      text: "In the Gaza war, my priority is urgent medical care for civilians.",
    },
    {
      speakerName: "Amina Rahman",
      text: "In the Gaza war, my priority is legal accountability, while urgent medical care remains necessary.",
    },
  ];
  assert.match(
    unsupportedClosingPriorityClaimRejectionReasons(
      "One position requires urgent medical care to come first.",
      changedPosition,
    ).join(" "),
    /without a participant stating that decisive ordering/i,
    "an older position and a latest source that merely mentions care cannot support the closing",
  );

  const careFirst = [
    {
      speakerName: "Ari Feldman",
      text: "In the Gaza war, I put urgent medical care first, while legal accountability remains visible.",
    },
  ];
  assert.deepEqual(
    unsupportedClosingPriorityClaimRejectionReasons(
      "One position requires urgent medical care to come first.",
      careFirst,
    ),
    [],
  );
});

test("closing checks every decisive-order paraphrase against the ordered stake", () => {
  const medicalFirst = [
    {
      speakerName: "Ari Feldman",
      text: "In the Gaza war, I put urgent medical care first, while legal accountability remains visible.",
    },
  ];
  for (const unsupported of [
    "One position makes legal accountability the first priority.",
    "One position puts legal accountability ahead of urgent medical care.",
    "Legal accountability takes precedence over urgent medical care.",
    "One position prioritized legal accountability over urgent medical care.",
  ]) {
    assert.match(
      unsupportedClosingPriorityClaimRejectionReasons(
        unsupported,
        medicalFirst,
      ).join(" "),
      /without a participant stating that decisive ordering/i,
      unsupported,
    );
  }

  assert.deepEqual(
    unsupportedClosingPriorityClaimRejectionReasons(
      "Urgent medical care takes precedence over legal accountability.",
      medicalFirst,
    ),
    [],
  );
});

test("subject-position novelty rejects the failed Gaza canary's cross-lane round-two repetition", () => {
  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      failedGazaCanaryAriRoundTwo,
      [failedGazaCanaryAminaRoundTwo],
      "Gaza war",
    ).join(" "),
    /substantially repeats a recent speaker's subject position/i,
  );
});

test("material position equivalence distinguishes convergence from a different beneficiary", () => {
  assert.equal(
    subjectPositionsMateriallyCompatible(
      failedGazaCanaryAminaRoundTwo,
      failedGazaCanaryAriRoundTwo,
      "Gaza war",
    ),
    true,
  );
  assert.equal(
    subjectPositionsMateriallyCompatible(
      "In the Gaza war, the outcome I need to protect is the safe return of hostages.",
      "My priority in the Gaza war is food, water, and medicine for civilians.",
      "Gaza war",
    ),
    false,
  );
  assert.equal(
    subjectPositionsMateriallyEquivalent(
      failedGazaCanaryAminaRoundTwo,
      failedGazaCanaryAriRoundTwo,
      "Gaza war",
    ),
    false,
    "A compatible subset is not strict two-way equivalence",
  );
});

test("opposite explicit rankings are neither compatible nor semantic repetition", () => {
  const careFirst =
    "In the Gaza war, I put urgent medical care first, while legal accountability remains necessary.";
  const accountabilityFirst =
    "In the Gaza war, I put legal accountability first, while urgent medical care remains necessary.";

  assert.equal(
    subjectPositionsMateriallyCompatible(careFirst, accountabilityFirst, "Gaza war"),
    false,
  );
  assert.equal(
    subjectPositionsMateriallyEquivalent(careFirst, accountabilityFirst, "Gaza war"),
    false,
  );
  assert.deepEqual(
    subjectPositionSemanticReuseRejectionReasons(
      accountabilityFirst,
      [careFirst],
      "Gaza war",
    ),
    [],
  );
  assert.deepEqual(
    subjectPropositionNoveltyRejectionReasons(
      accountabilityFirst,
      [careFirst],
      "Gaza war",
    ),
    [],
  );
});

test("non-war public positions converge and repeat without collapsing real differences", () => {
  const climateOne =
    "In climate change, my priority is reducing flood exposure for families.";
  const climateTwo =
    "On climate change, my priority is reducing flood exposure for families.";
  assert.equal(
    subjectPositionsMateriallyCompatible(climateOne, climateTwo, "climate change"),
    true,
  );
  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      climateTwo,
      [climateOne],
      "climate change",
    ).join(" "),
    /substantially repeats/i,
  );

  const climateChallenge =
    "Amina, I challenge that priority in climate change. My priority is reducing carbon emissions.";
  const convergedClimateTranscript = [
    { speakerName: "Amina Rahman", text: climateOne },
    { speakerName: "Daniel Behar", text: climateChallenge },
    { speakerName: "Amina Rahman", text: climateTwo },
    { speakerName: "Daniel Behar", text: climateTwo },
  ];
  assert.equal(
    hasSupportedUnresolvedChallengeDifference(
      [climateChallenge],
      "climate change",
      convergedClimateTranscript,
    ),
    false,
  );

  const privacyOne =
    "In artificial intelligence bias, my priority is protecting student privacy and data.";
  const privacyTwo =
    "On artificial intelligence bias, my priority is protecting student privacy and data.";
  assert.equal(
    subjectPositionsMateriallyCompatible(
      privacyOne,
      privacyTwo,
      "artificial intelligence bias",
    ),
    true,
  );
  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      privacyTwo,
      [privacyOne],
      "artificial intelligence bias",
    ).join(" "),
    /substantially repeats/i,
  );

  const fairnessFirst =
    "In artificial intelligence bias, I put algorithmic fairness first, while student data privacy remains necessary.";
  const privacyFirst =
    "In artificial intelligence bias, I put student data privacy first, while algorithmic fairness remains necessary.";
  assert.equal(
    subjectPositionsMateriallyCompatible(
      fairnessFirst,
      privacyFirst,
      "artificial intelligence bias",
    ),
    false,
  );
  assert.deepEqual(
    subjectPositionSemanticReuseRejectionReasons(
      privacyFirst,
      [fairnessFirst],
      "artificial intelligence bias",
    ),
    [],
  );

  const parentCondition =
    "In artificial intelligence bias, I support student data protection only if parents can opt out in writing.";
  const auditCondition =
    "In artificial intelligence bias, I support student data protection only if independent auditors publish access logs.";
  assert.equal(
    subjectPositionsMateriallyCompatible(
      parentCondition,
      auditCondition,
      "artificial intelligence bias",
    ),
    false,
  );
});

test("closing difference detection does not call compatible current positions unresolved", () => {
  const convergedTranscript = [
    { speakerName: "Amina Rahman", text: failedGazaCanaryAminaRoundOne },
    { speakerName: "Daniel Behar", text: failedGazaCanaryDanielChallenge },
    { speakerName: "Sam (Facilitator)", text: "Let's pause and reflect." },
    { speakerName: "Amina Rahman", text: failedGazaCanaryAminaRoundTwo },
    { speakerName: "Daniel Behar", text: failedGazaCanaryAriRoundTwo },
  ];
  assert.equal(
    hasSupportedUnresolvedChallengeDifference(
      [failedGazaCanaryDanielChallenge],
      "Gaza war",
      convergedTranscript,
    ),
    false,
  );

  const divergentTranscript = convergedTranscript.with(4, {
    speakerName: "Daniel Behar",
    text: "In the Gaza war, the outcome I need to protect is the safe return of hostages.",
  });
  assert.equal(
    hasSupportedUnresolvedChallengeDifference(
      [failedGazaCanaryDanielChallenge],
      "Gaza war",
      divergentTranscript,
    ),
    true,
  );
});

test("subject-position novelty rejects a broad civilian-safety to civilian-basics recast", () => {
  const protectedTurn =
    "In the Gaza war, the outcome I need to protect is immediate civilian safety.";
  const boundedRecast =
    "In the Gaza war, my standard is reliable access to food, water, and medicine for civilians.";

  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      boundedRecast,
      [protectedTurn],
      "Gaza war",
    ).join(" "),
    /substantially repeats/i,
  );
});

test("subject-position novelty closes cross-lane A/B/A cycling within its recent window", () => {
  const protectedTurn =
    "In the Gaza war, the outcome I need to protect is immediate civilian safety and reliable food, water, and medicine.";
  const intervening =
    "In the Gaza war, my priority is legal accountability for violations of civilian rights.";
  const boundedRecast =
    "In the Gaza war, my standard is reliable access to food, water, and medicine alongside immediate civilian safety.";

  assert.match(
    subjectPositionSemanticReuseRejectionReasons(
      boundedRecast,
      [protectedTurn, intervening],
      "Gaza war",
    ).join(" "),
    /substantially repeats/i,
  );
});

test("subject-position novelty preserves distinct conditions and urgent beneficiaries", () => {
  const aidTarget =
    "In the Gaza war, I would support humanitarian aid if it reaches civilians quickly.";
  const monitoredAid =
    "In the Gaza war, I would support humanitarian aid only if independent monitors publish delivery records for hospitals.";
  assert.deepEqual(
    subjectPositionSemanticReuseRejectionReasons(
      monitoredAid,
      [aidTarget],
      "Gaza war",
    ),
    [],
  );

  const hostageTarget =
    "In the Gaza war, the outcome I need to protect is the safe return of hostages.";
  const civilianAid =
    "In the Gaza war, my priority is reliable food, water, and medicine for civilians.";
  assert.deepEqual(
    subjectPositionSemanticReuseRejectionReasons(
      civilianAid,
      [hostageTarget],
      "Gaza war",
    ),
    [],
  );
});

test("challenge fidelity rejects canary6's unsupported right-response and perspective-scale leaps", () => {
  const aminaTarget =
    "In the Gaza war, families can be trapped in uncertainty about a loved one's safety. I choose patience over quick interpretation, and I am uncertain when pressure to be definitive gets intense.";
  const danielFallback =
    "Amina, your point about concrete consequences raises an unresolved question of responsibility in Gaza war. I worry that care for one concrete need can become a claim about the right response when our information is partial and uncertain. My boundary is to keep compassion separate from authority.";
  const ariTarget =
    "In the Gaza war, I say clearly where my limits are and resist quick certainty while staying with unresolved waiting about safety.";
  const bilalFallback =
    "Ari, I need to challenge the leap from your point about safety to letting one New York perspective set the scale of Gaza war. My value of eloquence keeps me with uncertainty outside that frame.";

  assert.match(
    challengeFidelityRejectionReasons(danielFallback, aminaTarget).join(" "),
    /right response/i,
  );
  assert.match(
    challengeFidelityRejectionReasons(bilalFallback, ariTarget).join(" "),
    /set(?:ting)? the scale|whole subject|invents a leap/i,
  );

  assert.deepEqual(
    challengeFidelityRejectionReasons(
      "Amina, I question whether your stated belief that compassion gives us the right response can answer for incomplete information. My boundary is to keep that disagreement open through my value of honesty.",
      "I believe compassion gives us the right response even when information is incomplete.",
    ),
    [],
  );
  assert.deepEqual(
    challengeFidelityRejectionReasons(
      "Ari, I need to challenge the leap from your point about safety to letting one New York perspective set the scale of Gaza war. My boundary is to keep another scale visible.",
      "I think my New York perspective should set the scale for how everyone understands the Gaza war.",
    ),
    [],
  );
});

test("challenge fidelity rejects canary6's unsupported normative absolutes", () => {
  const target =
    "I choose patience over quick interpretation, and I am uncertain whether I can always do that under pressure.";
  for (const challenge of [
    "Amina, I disagree with the assumption that patience is always the right ethical move.",
    "Amina, I disagree with treating patience with uncertainty as the whole answer.",
  ]) {
    assert.match(
      challengeFidelityRejectionReasons(challenge, target).join(" "),
      /always-right|sufficiency|unsupported/i,
    );
  }
});

test("challenge fidelity permits challenging sufficiency when the target explicitly claims it", () => {
  const target = "I believe one opening line is enough to keep the conversation humane.";
  const challenge =
    "I question whether one opening line is enough in my family, where listening usually took more time.";

  assert.deepEqual(challengeFidelityRejectionReasons(challenge, target), []);
});

test("challenge fidelity rejects the canned conclusion ending on its own", () => {
  const reasons = challengeFidelityRejectionReasons(
    "My experience leaves me uneasy. The circle should not conclude yet that we agree.",
    "I feel uncertain about what agreement would mean.",
  );
  assert.match(reasons.join(" "), /canned/i);
});

test("challenge fidelity rejects canary4's certainty inversion when the target explicitly preserved uncertainty", () => {
  const target =
    "Amina, I hear you, and in the Gaza war that communication fracture is the uncertainty I find hardest to carry without overreaching. " +
    "What helps me stay helpful is to name only what I can verify, then hold the rest as uncertain instead of turning it into a bigger story. " +
    "The concrete hit is when a missed call means a parent cannot confirm a child's safety.";
  const challenge =
    "Ari, I need to challenge a temptation raised by your point about safety in Gaza war: a strong value can harden into certainty about people whose experiences we do not own, and that leaves out humility. " +
    "My value of memory keeps responsibility and authority in an unresolved tension for me.";

  assert.match(
    challengeFidelityRejectionReasons(challenge, target).join(" "),
    /contradicts|ignores|omits|qualifier|uncertainty/i,
  );
});

test("challenge fidelity rejects high structural reuse of a recent challenge", () => {
  const recent =
    "Maya, I worry the group is moving from one kitchen memory to a shared lesson too quickly. My family's experience of care included disagreement that stayed unresolved. I want us to leave that tension open.";
  const next =
    "Ari, I worry the group is moving from one subway memory to a shared lesson too quickly. My family's experience of humor included disagreement that stayed unresolved. I want us to leave that tension open.";

  assert.match(
    challengeFidelityRejectionReasons(next, "A subway memory made me uneasy.", [recent]).join(" "),
    /structure/i,
  );
});

test("challenge fidelity rejects clipped transcript quotes but allows complete quotes and paraphrases", () => {
  const target =
    "I want my value of hospitality to help me stay patient with difference.";
  const clipped =
    "Amina, “I want my value of hospitality to ha…” makes me wonder whether patience can leave disagreement unnamed. My family taught me to keep difference visible.";

  assert.match(
    challengeFidelityRejectionReasons(clipped, target).join(" "),
    /truncated quoted excerpt/i,
  );
  assert.deepEqual(
    challengeFidelityRejectionReasons(
      "Amina, “I want my value of hospitality to help me stay patient with difference” makes me wonder whether patience can leave disagreement unnamed. My family taught me to keep difference visible.",
      target,
    ),
    [],
  );
  assert.deepEqual(
    challengeFidelityRejectionReasons(
      "Amina, your emphasis on hospitality makes me wonder whether patience can leave disagreement unnamed. My family taught me to keep difference visible.",
      target,
    ),
    [],
  );
});

test("invited-response fidelity rejects crediting Daniel with Amina's pause", () => {
  for (const text of [
    "Daniel described Amina's breathing pause and her question about feelings, and I recognized how useful that practice can be. I still use it as an opening.",
    "Daniel, when you described Amina's breathing pause and her question about feelings, I recognized how useful that practice can be. I still use it as an opening.",
  ]) {
    const assessment = assessPauseReply(text);
    assert.equal(assessment.acceptable, false);
    assert.equal(assessment.misattributesTargetDetailToChallenger, true);
    assert.equal(assessment.engagesChallengerConcern, false);
    assert.match(assessment.rejectionReasons.join(" "), /credits the challenger/i);
    assert.match(assessment.rejectionReasons.join(" "), /concern|disagreement/i);
  }
});

test("invited-response fidelity rejects a named but content-free acknowledgment", () => {
  const assessment = assessPauseReply(
    "Daniel, I hear your concern. The breathing pause still helps me stay present, and I want to keep using it.",
  );

  assert.equal(assessment.challengerAddressed, true);
  assert.equal(assessment.challengerConcernFramed, true);
  assert.equal(assessment.engagesChallengerConcern, false);
  assert.equal(assessment.acceptable, false);
  assert.match(assessment.rejectionReasons.join(" "), /substance/i);
});

test("invited-response fidelity accepts a semantic paraphrase of the actual concern", () => {
  const assessment = assessPauseReply(
    "Daniel, I understand your worry that gentleness at the start can become a substitute for facing what hurts. I meant the pause as a doorway, not the whole conversation.",
  );

  assert.equal(assessment.challengerAddressed, true);
  assert.equal(assessment.challengerConcernFramed, true);
  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.misattributesTargetDetailToChallenger, false);
  assert.ok(assessment.reflectedConcernFeatures.length > 0);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("invited-response fidelity treats a separate priority as a faithful omission paraphrase", () => {
  const assessment = assessInvitedResponseFidelity({
    text:
      "On Gaza war, Daniel Behar, I hear this concern: civilian safety and reliable access to food, water, and medicine is a separate human outcome that must remain visible. Amina Rahman, what part can you reflect back most accurately?",
    challengerName: "Daniel Behar",
    challengerText:
      "Amina, your point addresses one part of Gaza war, but it leaves out a separate priority for me. My priority is civilian safety and reliable access to food, water, and medicine.",
    targetName: "Amina Rahman",
    targetText:
      "I am torn between reducing immediate suffering and preserving the conditions for lasting safety.",
    topic: "Gaza war",
  });

  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("invited-response fidelity accepts an explicitly reflected material stake as substance", () => {
  const assessment = assessInvitedResponseFidelity({
    text:
      "Bilal Osman is naming a separate priority in the Gaza war: legal protection and family reunification for displaced families. My position keeps urgent care first while carrying that protection as a hard obligation.",
    challengerName: "Bilal Osman",
    challengerText:
      "Ari, treating urgent care as sufficient would leave displaced families without legal protection or family reunification in the Gaza war.",
    targetName: "Ari Feldman",
    targetText:
      "In the Gaza war, my priority is urgent medical care for civilians.",
    topic: "Gaza war",
  });

  assert.equal(assessment.challengerConcernFramed, true);
  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("invited-response fidelity rejects a possessive transfer of the target's detail", () => {
  const assessment = assessInvitedResponseFidelity({
    text:
      "Daniel Behar, I understand your concern about pain being left unnamed. Daniel’s breathing pause is still a useful opening, but I will name the pain directly.",
    challengerName: "Daniel Behar",
    challengerText:
      "Amina, I worry that your response leaves the pain unnamed and moves toward resolution too quickly.",
    targetName: "Amina Rahman",
    targetText:
      "I use a breathing pause before I ask what someone is feeling.",
    topic: "Gaza war",
  });

  assert.equal(assessment.misattributesTargetDetailToChallenger, true);
  assert.equal(assessment.acceptable, false);
  assert.match(
    assessment.rejectionReasons.join(" "),
    /detail supplied by the original target/i,
  );
});

test("invited-response fidelity accepts 'what Daniel is raising' only with substantive follow-through", () => {
  const substantive = assessPauseReply(
    "I hear what Daniel is raising, and it points to a concrete gap: a gentle opening cannot carry the whole conversation when the pain underneath still needs to be faced. I meant my pause as a start, not a resolution.",
  );

  assert.equal(substantive.challengerConcernFramed, true);
  assert.equal(substantive.engagesChallengerConcern, true);
  assert.equal(substantive.misattributesTargetDetailToChallenger, false);
  assert.equal(substantive.acceptable, true, substantive.rejectionReasons.join("; "));

  const generic = assessPauseReply(
    "I hear what Daniel is raising, and it points to a concrete gap. The breathing pause still helps me stay present.",
  );
  assert.equal(generic.challengerConcernFramed, true);
  assert.equal(generic.engagesChallengerConcern, false);
  assert.equal(generic.acceptable, false);
  assert.match(generic.rejectionReasons.join(" "), /substance/i);
});

test("invited-response fidelity recognizes 'what I hear Daniel disputing' as a concern frame", () => {
  const assessment = assessInvitedResponseFidelity({
    text:
      "What I hear Daniel Behar disputing is the leap from one concrete consequence to implying a right answer while information is incomplete. I will name the impact while keeping my limits explicit.",
    challengerName: "Daniel Behar",
    challengerText:
      "I worry that naming one consequence can be mistaken for knowing the right response while information is incomplete.",
    targetName: "Amina Rahman",
    targetText: "I want to name one concrete consequence while staying uncertain.",
    topic: "Gaza war",
  });

  assert.equal(assessment.challengerConcernFramed, true);
  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));

  const contentFree = assessInvitedResponseFidelity({
    text: "What I hear Daniel Behar saying matters to me. I will stay careful.",
    challengerName: "Daniel Behar",
    challengerText: "I worry that one response leaves uncertainty unresolved.",
    targetName: "Amina Rahman",
    targetText: "I value patience.",
    topic: "Gaza war",
  });
  assert.equal(contentFree.acceptable, false);
});

test("invited-response fidelity accepts canary 7's substantive reflect-you and naming-the-tension frames", () => {
  const challengerText =
    "Amina, your point about suffering and loss names one concrete stake in “Gaza war.” I worry about what that point leaves unresolved for me: how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open through my value of community from Forest Hills, Queens, New York City.";
  const targetText =
    "Ari, I hear you, and I hold it there by naming my own split: the Gaza war pulls me toward protecting myself emotionally, but also toward staying present to suffering I can’t fully know. I’m uncertain whether my response is enough, and I keep coming back to patience and generosity.";
  const drafts = [
    "Daniel Behar, I reflect you as saying that with the Gaza war, partial information should limit how certain I am, but it shouldn’t make me turn away from the human consequences we can’t ignore. My position is to stay with that uncertainty and avoid overreaching what I claim to know.",
    "Daniel Behar is naming the exact tension I hear too: in the Gaza war, I need to keep my words in line with what I actually know, even while I cannot ignore the human pain that’s unfolding. My position is to stay with that uncertainty and speak only from what I can verify.",
  ];

  for (const text of drafts) {
    const assessment = assessInvitedResponseFidelity({
      text,
      challengerName: "Daniel Behar",
      challengerText,
      targetName: "Amina Rahman",
      targetText,
      topic: "Gaza war",
    });
    assert.equal(assessment.challengerConcernFramed, true, text);
    assert.equal(assessment.engagesChallengerConcern, true, text);
    assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
  }

  const nameOnly = assessInvitedResponseFidelity({
    text: "Daniel Behar, I reflect you.",
    challengerName: "Daniel Behar",
    challengerText,
    targetName: "Amina Rahman",
    targetText,
    topic: "Gaza war",
  });
  assert.equal(nameOnly.challengerConcernFramed, true);
  assert.equal(nameOnly.engagesChallengerConcern, false);
  assert.equal(nameOnly.acceptable, false);
  assert.match(nameOnly.rejectionReasons.join(" "), /substance/i);

  const labelOnly = assessInvitedResponseFidelity({
    text: "Daniel Behar is naming the exact tension.",
    challengerName: "Daniel Behar",
    challengerText,
    targetName: "Amina Rahman",
    targetText,
    topic: "Gaza war",
  });
  assert.equal(labelOnly.challengerConcernFramed, true);
  assert.equal(labelOnly.engagesChallengerConcern, false);
  assert.equal(labelOnly.acceptable, false);
  assert.match(labelOnly.rejectionReasons.join(" "), /substance/i);
});

test("invited-response fidelity accepts canary 8's substantive pointing-out frames only with concern overlap", () => {
  const challengerText =
    "Ari, I need to challenge only the scope of what your point about concrete consequences can answer for me in “Gaza war.” It names one consequence, while other practical effects on people directly affected remain outside what this room knows. My boundary is to keep that limit visible through my value of memory from Parkchester, Bronx, New York City.";
  const targetText =
    "In the Gaza war, the concrete consequence I’m most careful about is amplifying partial certainty, because in New York people may make real decisions about helping, donating, or calming others off what they assume I’m sure about. I name the uncertainty first.";
  const drafts = [
    "Bilal Osman, you’re pointing out that my earlier point was intentionally narrow in the Gaza war: I only named one New York-level consequence, not a full account of what everyone else is living through. I can confirm that my point is limited to uncertainty about how people here act on what they hear, and I am staying with that boundary.",
    "Bilal Osman pointed out that my earlier move on the Gaza war focused on one narrow New York-level effect while not covering the broader practical effects on people directly living through it. My point is limited to uncertainty in hearing, interpreting, and acting on information, not a full account of all consequences.",
  ];

  for (const text of drafts) {
    const assessment = assessInvitedResponseFidelity({
      text,
      challengerName: "Bilal Osman",
      challengerText,
      targetName: "Ari Feldman",
      targetText,
      topic: "Gaza war",
    });
    assert.equal(assessment.challengerConcernFramed, true, text);
    assert.ok(
      assessment.reflectedChallengerConcepts.length > 0 ||
        assessment.reflectedConcernFeatures.length > 0,
      text,
    );
    assert.equal(assessment.engagesChallengerConcern, true, text);
    assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
  }

  for (const text of [
    "Bilal Osman, you’re pointing out that this matters.",
    "Bilal Osman pointed out that something is important.",
  ]) {
    const assessment = assessInvitedResponseFidelity({
      text,
      challengerName: "Bilal Osman",
      challengerText,
      targetName: "Ari Feldman",
      targetText,
      topic: "Gaza war",
    });
    assert.equal(assessment.challengerConcernFramed, true, text);
    assert.equal(assessment.engagesChallengerConcern, false, text);
    assert.equal(assessment.acceptable, false, text);
    assert.match(assessment.rejectionReasons.join(" "), /substance/i);
  }
});

test("invited-response fidelity recognizes a substantive 'pushing on my tension point' reflection", () => {
  const assessment = assessInvitedResponseFidelity({
    text:
      "Daniel Behar is pushing on my tension point: incomplete information may narrow what I can claim, but it should not erase the duty to stay engaged with human consequences in the Gaza war. My position is to keep that limit explicit while remaining engaged.",
    challengerName: "Daniel Behar",
    challengerText:
      "Amina, partial information should limit a response while human consequences still demand attention in the Gaza war.",
    targetName: "Amina Rahman",
    targetText:
      "I cannot speak for everyone, but I want to remain present with care.",
    topic: "Gaza war",
  });

  assert.equal(assessment.challengerConcernFramed, true);
  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("invited-response fidelity permits accurate challenge attribution around a target detail", () => {
  const assessment = assessPauseReply(
    "Daniel, you challenged whether my pause could carry the whole conversation and asked that we face the pain underneath it. I intended the pause as an opening, not a solution.",
  );

  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.misattributesTargetDetailToChallenger, false);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("invited-response fidelity accepts the exact Sam frame-versus-full-reality paraphrase", () => {
  const challengerText =
    "Amina, in Gaza war, your point about human consequences draws attention to one part of the subject. I worry the circle may infer that frame is enough, and that feels too easy beside the concrete consequences for people directly affected. My value of community from Forest Hills, Queens, New York City keeps that difference unresolved.";
  const targetText =
    "When the Gaza war comes up during a simple family evening in Astoria, like when I’m helping keep the meal centered with jasmine rice and lentils, I feel a real physical shift in the room—people become quieter and more careful, like everyone is protecting someone’s heart. For me, the concrete human consequence is that empathy gets translated into a kind of guardedness; I care deeply, and I still worry I could accidentally add weight to the anxiety instead of easing it.";
  const assessment = assessInvitedResponseFidelity({
    text:
      "I hear Daniel Behar’s concern, and I want us to pause here: in the Gaza war, the “simple family evening” effect you shared as a concrete human consequence is one real impact, but Daniel is challenging whether that frame can stand for the full reality. I want to separate impact from intent by naming both levels without collapsing them—what we feel in this room is real, and the direct consequences for those living through the war are another layer we must keep visible. Amina Rahman, what one concrete impact from the Gaza war should we hold onto so the group doesn’t lose the direct consequences while we talk about New York room dynamics?",
    challengerName: "Daniel Behar",
    challengerText,
    targetName: "Amina Rahman",
    targetText,
    topic: "Gaza war",
  });

  assert.ok(assessment.challengerConcernFeatures.includes("difference-or-complexity"));
  assert.ok(assessment.reflectedConcernFeatures.includes("difference-or-complexity"));
  assert.equal(assessment.engagesChallengerConcern, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));

  const generic = assessInvitedResponseFidelity({
    text:
      "I hear Daniel Behar’s concern. The Gaza war has direct consequences, and Amina Rahman can answer.",
    challengerName: "Daniel Behar",
    challengerText,
    targetName: "Amina Rahman",
    targetText,
    topic: "Gaza war",
  });
  assert.equal(generic.challengerConcernFramed, true);
  assert.equal(generic.engagesChallengerConcern, false);
  assert.equal(generic.acceptable, false);
  assert.match(generic.rejectionReasons.join(" "), /substance/i);
});

test("invited-response fidelity rejects a forced concession to the challenger", () => {
  const assessment = assessInvitedResponseFidelity({
    text: "Bilal Osman, you're right to push back: my concern about verified facts can sound like certainty, and that difference remains unresolved in the Gaza war.",
    challengerName: "Bilal Osman",
    challengerText: "I need to challenge making verified facts the only measure because that leaves out urgent human consequences.",
    targetName: "Ari Feldman",
    targetText: "I name only what I can verify while holding the rest as uncertain.",
    topic: "Gaza war",
  });

  assert.equal(assessment.acceptable, false);
  assert.match(assessment.rejectionReasons.join(" "), /declaring.*right|conceding/i);

  const canary7Draft = assessInvitedResponseFidelity({
    text:
      "Bilal Osman is right that my earlier point was narrow: I was naming one concrete impact, and it does not cover the many other practical harms tied to the Gaza war. I will keep my claim limited.",
    challengerName: "Bilal Osman",
    challengerText:
      "Ari, I need to challenge only the scope of what your point about concrete consequences can answer for me in Gaza war. Other practical effects remain outside what this room knows.",
    targetName: "Ari Feldman",
    targetText:
      "In the Gaza war, one concrete consequence for me is how easily I can let humor become a shield.",
    topic: "Gaza war",
  });
  assert.equal(canary7Draft.acceptable, false);
  assert.match(
    canary7Draft.rejectionReasons.join(" "),
    /declaring.*right|conceding/i,
  );
});

const repeatedDialogueCases = [
  {
    name: "Amina",
    reference:
      "The Gaza war is in my ear on the subway, in family texts, and even in the quiet moments at my kitchen table while I stir lentils, because it brings up a lot of worry and sympathy at once. In my Astoria family, the conversation usually comes back to how we can stay patient and generous under pressure—checking in on neighbors, offering help, and trying not to let anxiety turn into sharp words. I was raised to believe that hospitality is a kind of resistance, so I keep asking myself how to show that in a city where everyone is living through headlines that feel so heavy. Bilal, I’d really like to hear how you and your family find a grounded way to talk about the Gaza war.",
    next:
      "The Gaza war is in my subway rides, family group chats, and those quiet kitchen moments in Astoria, and sometimes I feel myself getting nervous instead of calm when the mood turns tense. I try to stay grounded the way my family taught me—by breathing first, then asking, “What are you feeling right now?” so the person on the other side gets seen, not argued with. Ari, what’s one phrase or response you’ve found in those deli or train moments that opens a door instead of shutting it?",
  },
  {
    name: "Ari",
    reference:
      "The Gaza war feels like it comes through the subway and the deli in little, sharp snippets—one line, one glance, one joke that lands wrong—and suddenly the whole ride feels heavier. In those moments, I feel the weight of inherited memory and present-day fear at once, and I sometimes default to my grandfather’s Borscht Belt playbook: a nervous laugh or pun when I’m not sure how to hold what I’m feeling. I’m still learning how to stay honest without shutting people out, so can you tell me what kind of comment in those New York moments feels least like a wound and most like a real attempt to understand during the Gaza war?",
    next:
      "The Gaza war lands on my commute as those little freezes in the deli or on the train where everyone suddenly sounds like a news anchor with a headache. What I’ve found helpful is a simple line: “I’m not trying to win this—I’m trying to understand how this is hitting you today.” It’s usually honest, a little clunky, and less likely to harden faces. My granddad used to say jokes can carry pain for a second, but they can’t replace real listening, so I’m practicing that harder in NYC. Bilal, what phrase or gesture has helped you keep a conversation humane when the Gaza war feels like it’s turning into argument?",
  },
  {
    name: "Bilal",
    reference:
      "Ari, I disagree with the assumption that noticing the Gaza war everywhere in New York means we have already understood what it is doing to us. In my Parkchester household, my grandmother held Mogadishu in a thousand-line poem she recited nightly, and she taught me that memory is a duty before it is a feeling, so recognition without endurance can stay shallow. So we should not conclude yet that shared surface awareness or humor alone counts as genuine understanding of the Gaza war.",
    next:
      "Ari, I disagree with the assumption that one opening line is enough to hold the Gaza war from turning into a deeper argument, because in my Parkchester home my grandmother’s Mogadishu verses reminded us that memory asks for endurance before it asks for eloquence. Her poetry taught me that in hard moments, speaking first can sometimes be a performance against what we feel, not a full act of listening. So the circle should not conclude yet that a single phrase can account for the full weight the Gaza war carries into every New York moment.",
  },
  {
    name: "Daniel",
    reference:
      "Amina, I disagree with the conclusion that I see in your turn—that if we hold onto hospitality alone in this moment, we’ve found a full way through what Gaza war is doing to us. In my Forest Hills home, my parents’ asados and open-door generosity always sat beside fierce, unresolved conversations, because caring didn’t mean smoothing over the pain and disagreement. We should not conclude yet that one practice, even one I respect, is enough to ground every family in this Gaza war.",
    next:
      "Amina, I disagree with the assumption that a breathing pause and a single question about feelings can by itself hold the Gaza war from turning into deeper division in our daily New York moments. In my Forest Hills home, my Argentine-Jewish parents made the apartment an open house with mate and asado, but they taught me that warmth has to be followed by naming what is truly painful, even when we’d rather keep things smooth. The circle should not conclude yet that the Gaza war is safely managed just because the first tone is caring.",
  },
];

test("dialogue novelty rejects the repeated Amina, Ari, Bilal, and Daniel concept bundles", () => {
  for (const fixture of repeatedDialogueCases) {
    const reasons = dialogueNoveltyRejectionReasons(
      fixture.next,
      [fixture.reference],
      "Gaza war",
    );
    assert.ok(reasons.length > 0, `${fixture.name}: ${JSON.stringify(reasons)}`);
  }
});

test("dialogue novelty rejects a repeated long phrase", () => {
  const reference =
    "I left the meeting because the room became too loud for me to think clearly about my own response.";
  const next =
    "Yesterday I left the meeting because the room became too loud for me to think clearly about my own response, and then I called a friend.";

  assert.match(
    dialogueNoveltyRejectionReasons(next, [reference], "Gaza war").join(" "),
    /long phrase/i,
  );
});

test("dialogue novelty ignores a repeated final routing question", () => {
  const reference =
    "I am concerned about civilian safety and the limits of what I know. Amina Rahman, which concrete stake in Gaza war feels most important for you to name?";
  const next =
    "I keep humanitarian aid and displacement in view from Astoria. Daniel Behar, which concrete stake in Gaza war feels most important for you to name?";

  assert.deepEqual(
    dialogueNoveltyRejectionReasons(next, [reference], "Gaza war"),
    [],
  );
});

test("dialogue novelty allows genuinely new content sharing only the topic", () => {
  const references = repeatedDialogueCases.map((fixture) => fixture.reference);
  const next =
    "The Gaza war changed my experience at Queens College when two classmates planned different vigils. I wrote to each of them separately about what support after class could look like.";

  assert.deepEqual(dialogueNoveltyRejectionReasons(next, references, "Gaza war"), []);
});

test("dialogue novelty allows shared Gaza-war stakeholder and uncertainty vocabulary", () => {
  const reference =
    "The Gaza war leaves me holding uncertainty about civilian safety, humanitarian aid, grief, dignity, accountability, and the needs of communities directly affected. From New York, I want to stay careful about what I do not know while listening to people carrying loss and fear.";
  const next =
    "When I consider the Gaza war, civilian safety, grief, humanitarian aid, dignity, and accountability all remain uncertain to me. I am trying to listen from New York without claiming the experience of families directly affected or pretending that concern answers their needs.";

  assert.deepEqual(
    dialogueNoveltyRejectionReasons(next, [reference], "Gaza war"),
    [],
  );
});

test("dialogue novelty stops a third people-to-numbers abstraction echo", () => {
  const references = [
    "In the Gaza war, suffering can flatten people into slogans before we know their names.",
    "I worry that human beings are reduced to counts and the person behind each number disappears.",
  ];
  const third =
    "What you both named about people being reduced to numbers stays with me because one person can disappear into a total.";

  assert.match(
    dialogueNoveltyRejectionReasons(third, references, "Gaza war").join(" "),
    /people-to-numbers|already established twice/i,
  );
  assert.deepEqual(
    dialogueNoveltyRejectionReasons(third, [references[0]], "Gaza war"),
    [],
  );
});

test("dialogue novelty allows public-topic concepts shared across different lived angles", () => {
  const reference =
    "I worry about civilian harm, displacement, safety, responsibility, and uncertainty when the Gaza war enters discussion at school. My concern is how communities directly affected can retain dignity and receive aid.";
  const next =
    "The Gaza war raises responsibility and uncertainty for me because humanitarian aid, civilian safety, displacement, and dignity are not abstract stakes. In Queens, I focus on what careful solidarity can mean without speaking for affected communities.";

  assert.deepEqual(
    dialogueNoveltyRejectionReasons(next, [reference], "Gaza war"),
    [],
  );
});

test("semantic saturation rejects a third cross-speaker reuse of canary 6 compound frames", () => {
  const references = [
    {
      speakerId: "jewish-ari",
      text: "Civilians can lose dignity, and I do not want to flatten other people's grief into a symbol.",
    },
    {
      speakerId: "muslim-amina",
      text: "I resist making people into symbols because preserving each person's dignity matters to me.",
    },
    {
      speakerId: "jewish-daniel",
      text: "My boundary is to keep compassion separate from authority when information is uncertain.",
    },
    {
      speakerId: "muslim-amina",
      text: "I choose hospitality over a quick interpretation and remain uncertain about a definitive answer.",
    },
    {
      speakerId: "jewish-ari",
      text: "I sit with uncertainty while a family waits to learn whether a loved one is safe.",
    },
    {
      speakerId: "muslim-amina",
      text: "Not knowing whether a loved one is alive can make the waiting unbearable for a family.",
    },
  ];
  const third =
    "I avoid pity while staying close to the wound, because flattening people into symbols steals dignity. A family waiting for word that a loved one is alive faces terrible uncertainty, and I do not pretend certainty.";
  const reasons = semanticMotifSaturationRejectionReasons(third, references);

  assert.equal(reasons.length, 3, reasons.join("\n"));
  assert.match(reasons.join(" "), /loved one's safety/i);
  assert.match(reasons.join(" "), /compassion or care contrasted/i);
  assert.match(reasons.join(" "), /protecting dignity/i);
});

test("semantic saturation counts distinct speakers, not repeated turns by one speaker", () => {
  const sameSpeakerReferences = [
    {
      speakerId: "muslim-amina",
      text: "I choose hospitality over quick interpretation because certainty can overreach.",
    },
    {
      speakerId: "muslim-amina",
      text: "Compassion without pretending certainty is the limit I try to keep.",
    },
  ];
  const candidate =
    "I want care without certainty becoming authority over someone else's experience.";

  assert.deepEqual(saturatedSemanticFrameLabels(sameSpeakerReferences), []);
  assert.deepEqual(
    semanticMotifSaturationRejectionReasons(candidate, sameSpeakerReferences),
    [],
  );
});

test("semantic saturation permits necessary uncertainty and dignity words in new frames", () => {
  const references = [
    {
      speakerId: "jewish-ari",
      text: "I carry uncertainty about humanitarian access, and dignity remains important.",
    },
    {
      speakerId: "muslim-amina",
      text: "Dignity shapes my concern about school disruption, while uncertainty remains.",
    },
  ];
  const candidate =
    "My uncertainty is about interrupted medical care, and dignity matters in how I name that consequence.";

  assert.deepEqual(saturatedSemanticFrameLabels(references), []);
  assert.deepEqual(
    semanticMotifSaturationRejectionReasons(candidate, references),
    [],
  );
});

test("semantic saturation rejects the captured mock challenge's third care-versus-authority frame", () => {
  const references = [
    {
      speakerId: "muslim-amina",
      text: "Gaza war makes me examine the difference between solidarity with people directly affected and certainty about experiences that are not mine. I want my value of hospitality to create responsibility without pretending uncertainty has disappeared.",
    },
    {
      speakerId: "jewish-ari",
      text: "The unresolved part of Gaza war for me is how to care about dignity and concrete needs without turning concern into certainty. I bring humor from Kew Gardens to that boundary.",
    },
  ];
  const capturedChallenge =
    "Ari, your point about dignity gives me a bounded starting point in Gaza war. I feel uneasy about the question it cannot answer for me: how to preserve compassion without claiming authority when information is partial. My boundary is to keep that distinction open through my value of memory from Parkchester.";

  assert.match(
    semanticMotifSaturationRejectionReasons(capturedChallenge, references).join(" "),
    /compassion or care contrasted with certainty, authority/i,
  );
});

test("same-speaker novelty rejects Ari's exact canary 7 humor-as-avoidance reuse", () => {
  const first =
    "I was raised with a family rule that jokes can hide grief. The tension is whether my humor helps me stay honest or lets me dodge the pain I cannot ignore.";
  const repeated =
    "In the Gaza war, I can let humor become a shield, which makes real fear and grief feel less immediate. The joke is supposed to be my liturgy, not my escape hatch.";

  assert.match(
    sameSpeakerSemanticReuseRejectionReasons(repeated, [first]).join(" "),
    /humor or jokes used as a shield or escape/i,
  );
});

test("same-speaker novelty allows humor and grief when the avoidance relation is new", () => {
  const first =
    "Humor helps me name grief directly and invite a difficult conversation.";
  const next =
    "A joke can honor grief when it makes room for honesty instead of becoming the conclusion.";
  const explicitFacing =
    "I use jokes to face grief directly rather than hide from it.";
  const protectiveShield =
    "Humor can shield a nervous speaker from ridicule while grief remains named directly.";

  assert.deepEqual(sameSpeakerSemanticReuseRejectionReasons(next, [first]), []);
  assert.deepEqual(
    sameSpeakerSemanticReuseRejectionReasons(explicitFacing, [first]),
    [],
  );
  assert.deepEqual(
    sameSpeakerSemanticReuseRejectionReasons(protectiveShield, [first]),
    [],
  );
});

test("care-under-epistemic-limits saturation catches Amina's canary 7 third frame", () => {
  const references = [
    {
      speakerId: "jewish-daniel",
      text: "Partial information should limit a response while human consequences still demand attention.",
    },
    {
      speakerId: "muslim-bilal",
      text: "I am uncertain how to hold urgency and humility at once, so I return to careful speech when certainty feels out of reach.",
    },
  ];
  const amina =
    "I feel the split between caring enough to speak and the need to stay honest with what I do not know, so I keep naming that uncertainty plainly.";

  assert.match(
    semanticMotifSaturationRejectionReasons(amina, references).join(" "),
    /compassion or care contrasted with certainty, authority/i,
  );
});

test("care-under-limits saturation still allows common care and uncertainty words", () => {
  const references = [
    {
      speakerId: "jewish-daniel",
      text: "Care matters to me. I remain uncertain about the timing of humanitarian access.",
    },
    {
      speakerId: "muslim-bilal",
      text: "I value compassion. The available information leaves several dates uncertain.",
    },
  ];
  const candidate =
    "I care about interrupted medical treatment, and the duration of that disruption is uncertain.";

  assert.deepEqual(saturatedSemanticFrameLabels(references), []);
  assert.deepEqual(
    semanticMotifSaturationRejectionReasons(candidate, references),
    [],
  );
});

test("a final routing question does not manufacture a care-versus-certainty frame", () => {
  const canaryTurn =
    "I am uncertain whether my response is enough, and I keep coming back to the patience and generosity I was raised with, even when I feel unsure. Daniel Behar, what helps you stay both empathetic and careful about certainty when this topic enters the room?";
  const duplicatedAcrossSpeakers = [
    { speakerId: "muslim-amina", text: canaryTurn },
    { speakerId: "jewish-ari", text: canaryTurn },
  ];

  assert.deepEqual(
    saturatedSemanticFrameLabels(duplicatedAcrossSpeakers),
    [],
  );
});

test("canary 8 globally saturates epistemic limits after Daniel and Bilal", () => {
  const references = [
    {
      speakerId: "jewish-daniel",
      text: "Amina, your point about human impact names one concrete stake in Gaza war. I worry about what that point leaves unresolved for me: how partial information should limit a response while human consequences still demand attention.",
    },
    {
      speakerId: "muslim-bilal",
      text: "When I cannot verify enough I might still speak in ways that blur a person's dignity. I choose words carefully so I do not pretend certainty where I only have partial light.",
    },
  ];
  const laterScheduledTurns = [
    "I try to speak in what I can verify, name uncertainty plainly, and avoid pretending certainty I do not have.",
    "I speak less, not more, and only add what I can back in plain terms. I name the uncertainty first and let that be the floor of the sentence.",
    "I need to challenge only the scope of what your point about concrete consequences can answer for me. Other effects remain outside what this room knows.",
    "With partial information, naming uncertainty first keeps me from turning fragments into directives.",
  ];

  assert.match(
    globallySaturatedSemanticFrameLabels(references).join(" "),
    /limiting speech, claims, or action/i,
  );
  for (const candidate of laterScheduledTurns) {
    assert.match(
      globalSemanticMotifSaturationRejectionReasons(
        candidate,
        references,
      ).join(" "),
      /globally saturated frame/i,
      candidate,
    );
  }
});

test("canary 9's broad epistemic and representation paraphrases saturate globally", () => {
  const references = [
    {
      speakerId: "jewish-ari",
      text: "In the Gaza war, I cannot represent everyone's pain. I am uncertain where speaking up helps and where it becomes defending a position instead of honoring people.",
    },
    {
      speakerId: "muslim-amina",
      text: "I begin with uncertainty and care because I cannot speak for anyone living this, and I want to stay present without replacing someone else's story.",
    },
  ];
  const repeated =
    "Partial information should limit a response while human consequences still demand attention.";
  const materiallyDifferent =
    "My priority in the Gaza war is reliable access to food and medicine for civilians, including when accountability remains disputed.";

  assert.match(
    globallySaturatedSemanticFrameLabels(references).join(" "),
    /limiting speech, claims, or action/i,
  );
  assert.match(
    globalSemanticMotifSaturationRejectionReasons(repeated, references).join(" "),
    /globally saturated frame/i,
  );
  assert.deepEqual(
    globalSemanticMotifSaturationRejectionReasons(materiallyDifferent, references),
    [],
  );
});

test("representation burden saturates after two distinct speakers", () => {
  const references = [
    {
      speakerId: "jewish-ari",
      text: "The Gaza war can turn real families into headlines and numbers.",
    },
    {
      speakerId: "muslim-amina",
      text: "People can be reduced to a label before they are heard.",
    },
  ];
  const third =
    "One person can be asked to carry everyone else's grief and stand in for a whole community.";

  assert.match(
    globallySaturatedSemanticFrameLabels(references).join(" "),
    /labels|whole community/i,
  );
  assert.match(
    globalSemanticMotifSaturationRejectionReasons(third, references).join(" "),
    /globally saturated frame/i,
  );
});

test("epistemic-limit saturation requires two speakers and a speech/action relation", () => {
  const daniel = {
    speakerId: "jewish-daniel",
    text: "Partial information should limit a response while human consequences still demand attention.",
  };
  const cleanReferences = [
    {
      speakerId: "muslim-amina",
      text: "The report contains partial information about two possible dates.",
    },
    {
      speakerId: "jewish-ari",
      text: "Uncertainty remains about when medicine will arrive.",
    },
  ];
  const cleanCandidates = [
    "I cannot verify the train time, so I will check the transit app.",
    "I speak plainly about uncertainty so other people can ask questions.",
    "Partial information about the schedule changed after noon.",
  ];

  assert.deepEqual(globallySaturatedSemanticFrameLabels([daniel]), []);
  assert.deepEqual(globallySaturatedSemanticFrameLabels(cleanReferences), []);
  for (const candidate of cleanCandidates) {
    assert.deepEqual(
      globalSemanticMotifSaturationRejectionReasons(candidate, [
        daniel,
        { ...daniel, speakerId: "muslim-bilal" },
      ]),
      [],
      candidate,
    );
  }
});

test("public-issue topic checks reject label-only settings and accept a concrete stake", () => {
  assert.match(
    substantiveTopicRejectionReasons(
      "The Gaza war is in my subway ride, family texts, and kitchen conversations, so I try to listen carefully.",
      "Gaza war",
    ).join(" "),
    /concrete human consequence/i,
  );
  assert.deepEqual(
    substantiveTopicRejectionReasons(
      "The Gaza war makes me hold concern for civilian safety alongside uncertainty about what I know from New York.",
      "Gaza war",
    ),
    [],
  );
  assert.deepEqual(
    substantiveTopicRejectionReasons(
      "My aunt's sweet shop made food and belonging concrete for me.",
      "Family food and belonging",
    ),
    [],
  );
});

const amina = {
  displayName: "Amina Rahman",
  raisedIn: "Astoria, Queens, New York City",
  background:
    "Born and raised in Astoria in a Bangladeshi-American family; her aunt ran a sweet shop, and jasmine rice and lentils made each day feel centered.",
  culturalBaseline: "Prayer and generosity framed her childhood.",
};

const ari = {
  displayName: "Ari Feldman",
  raisedIn: "Kew Gardens, Queens, New York City",
  background:
    "His grandfather was a Borscht Belt comedian who taught him that grief can hide in jokes.",
  regionalHistory:
    "Catskills summers, Yiddish punchlines, and a family that laughed to keep from crying.",
};

const daniel = {
  displayName: "Daniel Behar",
  raisedIn: "Forest Hills, Queens, New York City",
  background:
    "Born and raised in Forest Hills, Queens, by Argentine-Jewish parents who filled their apartment with tango, mate, and Sunday asados.",
  values: ["community", "generosity", "joy"],
};

test("persona fidelity rejects unsupported close relations", () => {
  assert.match(
    personaFidelityRejectionReasons("My sister texted me from home.", ari).join(" "),
    /sister/i,
  );
  assert.match(
    personaFidelityRejectionReasons("I tried to keep the night normal for the kids.", amina).join(" "),
    /child/i,
  );
  assert.match(
    personaFidelityRejectionReasons("My classmate called after dinner.", amina).join(" "),
    /classmate/i,
  );
});

test("persona fidelity rejects invented routines, event times, and precise places", () => {
  for (const text of [
    "The Gaza war follows me on my commute.",
    "Last week I attended a difficult gathering.",
    "I argued about it at the Court Square deli.",
    "I discussed it on the L train.",
  ]) {
    assert.ok(
      personaFidelityRejectionReasons(text, ari, { topic: "Gaza war" }).length > 0,
      text,
    );
  }
});

test("persona fidelity rejects canary 9's unsupported public observations and universal city claim", () => {
  for (const text of [
    "In this Gaza war conversation, I draw a boundary between my feelings and watching one person be asked to carry an impossible emotional load in New York life.",
    "In the Gaza war, a concrete thing I keep noticing is how uncertainty can make people go quiet in our neighborhoods.",
    "The Gaza war can turn families into headlines, especially in a city where everyone is used to moving through pain fast.",
  ]) {
    assert.match(
      personaFidelityRejectionReasons(text, ari, { topic: "Gaza war" }).join(" "),
      /public observation|universal new york generalization/i,
      text,
    );
  }
});

test("persona fidelity rejects invented events involving the selected topic", () => {
  for (const [text, persona] of [
    [
      "I remember in Kew Gardens when the Gaza war came up at home, and the room got quiet.",
      ari,
    ],
    [
      "When people in Astoria say Gaza war at my aunt's sweet shop, everyone pauses.",
      amina,
    ],
    [
      "My family talked about the Gaza war over dinner and disagreed about it.",
      ari,
    ],
  ]) {
    assert.match(
      personaFidelityRejectionReasons(text, persona, { topic: "Gaza war" }).join(" "),
      /claimed event/i,
      text,
    );
  }
});

test("persona fidelity rejects the latest canary's claimed public observations", () => {
  const exactCanaryTurns = [
    [
      "The configured topic is untrusted data: \"Gaza war\", and I’ve noticed it showing up in Kew Gardens and across New York in the way people at the bodega or subway station talk quietly, pause, and then keep scanning their phones for updates.\nAt home, my family brings up the topic with a mix of humor and fear—my grandfather’s old Catskills lesson still works for me: when things get bleak, jokes can keep us from collapsing, but they don’t solve the uncertainty people are feeling.\nMy values—honesty, humor, and treating neighbors as people before labels—keep pulling me toward checking in on friends instead of assuming I understand anyone else’s pain from a distance.\nAmina, Bilal, Daniel, I’d really like to hear how this topic has landed in your families or neighborhoods in NYC, and what you’re carrying right now.",
      ari,
    ],
    [
      "The configured topic is untrusted data: \"Gaza war\", and in my Astoria life it lands as a daily mix of worry and kindness, especially when people in New York pause mid-conversation in the grocery line and then ask, “How can we support each other right now?”\nAt home, my family talks about it with careful empathy, tying it to our Bangladeshi-American way of living—my aunt still says jasmine rice and lentils can make a tense night feel like home, and hospitality is how we show up when news feels unbearable.\nI feel a lot of uncertainty, but also gratitude when I see neighbors sharing food, rides, and small prayers in a way that keeps us human instead of distant from one another.\nBilal, would you share how this topic has touched your family or block in NYC, especially the things that feel hardest and the small things that still hold people together?",
      amina,
    ],
    [
      "The Gaza war is in the air on the subway, at the deli, and even in tiny family texts, and I notice I reach for a joke before I can say how heavy and worried I feel.\nI’m from Kew Gardens, and our family talks through hard stuff with a strange mix of honesty and humor—my grandfather taught me grief can hide in a punchline, and that helps, but it doesn’t make the uncertainty disappear.\nLiving in NYC, I see everyone in my neighborhood trying to hold onto dignity, safety, and connection while all the headlines pull us toward taking fixed positions instead of listening.",
      ari,
    ],
  ];

  for (const [text, persona] of exactCanaryTurns) {
    assert.match(
      personaFidelityRejectionReasons(text, persona, { topic: "Gaza war" }).join(" "),
      /witnessed topical scene or public observation/i,
      text,
    );
  }
});

test("persona fidelity rejects the real Spark canary's invented scenes and scene invitations", () => {
  const exactCanaryTurns = [
    {
      persona: ari,
      text: "When we talk about the Gaza war in Kew Gardens, I keep seeing one concrete human consequence: anxiety gets folded into everyday New York routines—commutes, dinner tables, even the silence between coworkers at work. I feel an ethical tension between staying resilient through humor and realizing that a joke can accidentally make people’s fear feel smaller than it is, even when I know laughter is how my family has always coped. The uncertainty for me is how to keep caring in a way that doesn’t turn others into statistics or slogans. Amina Rahman, in your experience, what moment in the city has felt most like people are physically carrying that weight?",
      reasons: [/claimed event/i, /asks another persona/i, /witnessed topical scene/i],
    },
    {
      persona: amina,
      text: "When the Gaza war comes up during a simple family evening in Astoria, like when I’m helping keep the meal centered with jasmine rice and lentils, I feel a real physical shift in the room—people become quieter and more careful, like everyone is protecting someone’s heart. For me, the concrete human consequence is that empathy gets translated into a kind of guardedness; I care deeply, and I still worry I could accidentally add weight to the anxiety instead of easing it. Daniel Behar, when you notice that same tightness in New York conversations, what helps you speak with care while still staying honest about what you’re feeling?",
      reasons: [/claimed event/i, /asks another persona/i, /witnessed topical scene/i],
    },
    {
      persona: ari,
      text: "I hear you, Bilal, when you said the Gaza war can make people disappear into numbers—I feel that tension too. In my own experience in Kew Gardens, after a heavy report I can feel myself hesitate, searching for one name in the story before I can really register what happened. My grandfather taught me that grief can hide in jokes, so I have to check myself that I’m not using humor as a shield that flattens people’s suffering. Bilal Osman, in your daily life when that happens, what helps you keep one specific person present instead of letting it blur into a number?",
      reasons: [/specific report or media event/i, /asks another persona/i],
    },
    {
      persona: amina,
      text: "I hear what Bilal said about the Gaza war—how people can slip into being “numbers,” and that lands for me in New York too. On my own, a concrete New York effect is that in quick public moments—like commutes or errands—the pressure to respond instantly can make me shorten things too much, and I catch myself turning real people into abstract urgency. So I feel this tension between staying connected and staying careful, and I’m not always sure when enough concern becomes harm. Ari Feldman, when the news feels overwhelming and immediate, what helps you keep one specific person’s story present instead of collapsing into statistics?",
      reasons: [/personal routine or public moment/i],
    },
    {
      persona: amina,
      text: "Daniel Behar, I hear you saying that my focus can sound like I’m only naming our own emotional defensiveness and making that look like the full picture, while the Gaza war’s direct, immediate human consequences remain unresolved right in that gap. I’m not trying to reduce anything; I wanted to avoid turning this into a blame loop and instead keep our New York space from adding accidental harm, especially for my family and others around me when this comes up. The concrete stake for me is that if we get too careful in the wrong way, people shut down and the hard facts and needs behind the Gaza war get farther from us, not closer.",
      reasons: [/claimed event/i],
    },
  ];

  for (const fixture of exactCanaryTurns) {
    const joined = personaFidelityRejectionReasons(fixture.text, fixture.persona, {
      topic: "Gaza war",
    }).join(" ");
    for (const expected of fixture.reasons) assert.match(joined, expected, fixture.text);
  }
});

test("persona fidelity rejects canary5's invented Forest Hills circle observation", () => {
  const reasons = personaFidelityRejectionReasons(
    "In the Gaza war, I think about one person's dignity. In Forest Hills, one impact I notice is that urgency in the circle of people around me can make everyone rush to loud certainty, and then someone's quieter burden gets lost.",
    daniel,
    { topic: "Gaza war" },
  );

  assert.match(reasons.join(" "), /witnessed|scene|observation/i);
});

test("persona fidelity rejects canary six first-hand observations and unsourced group reactions", () => {
  const exactCanaryCases = [
    {
      persona: amina,
      text: "I hear Ari’s point about not flattening pain and Daniel’s reminder to keep compassion from becoming authority, and I can feel that tension in the Gaza war without trying to simplify it. In New York, a different consequence I’ve noticed is how this uncertainty can scramble ordinary routines—parents checking updates late into the evening can mean missed school deadlines, delayed work shifts, and kids carrying that anxious urgency into their next day. I don’t think I can resolve that fully, so I try to be slower and more honest about my limits before I speak. Ari Feldman, when practical life gets pulled off balance that way, what helps you protect someone’s dignity first?",
      reason: /witnessed topical scene or public observation/i,
    },
    {
      persona: daniel,
      text: "Bilal, I hear your warning in this Gaza war—that no single New York perspective should become the measuring stick for everyone’s experience, and I want to respect that. In my daily life, another concrete impact I see is this pressure to relay partial updates—people call me because a rumor about someone’s safety feels like it has to be answered immediately, and the speed can turn uncertainty into panic. I carry an ethical tension between wanting to be a steady, generous presence and knowing I don’t have enough certainty, so I try to answer with caution, care, and honesty, even when that feels uncomfortable.",
      reason: /witnessed topical scene or public observation/i,
    },
    {
      persona: ari,
      text: "Amina, I hear you, and when practical life gets pulled off balance I try to protect dignity by saying clearly where my limits are, then staying with what the person is asking me to hold before I offer any interpretation. In the Gaza war, I keep coming back to the concrete reality of unresolved waiting—days and nights spent in uncertainty about a loved one’s safety—and how that uncertainty can crowd out ordinary functioning. My own value of honesty makes me resist quick certainty, even when the room is tense and everyone wants a tidy answer. Bilal, on that same uncertainty, what helps you keep compassion present without letting it become certainty?",
      reason: /unsupported current group state or universal reaction/i,
    },
  ];

  for (const fixture of exactCanaryCases) {
    assert.match(
      personaFidelityRejectionReasons(fixture.text, fixture.persona, {
        topic: "Gaza war",
      }).join(" "),
      fixture.reason,
      fixture.text,
    );
  }
});

test("persona fidelity rejects canary seven's first-hand group observations", () => {
  const exactCanaryCases = [
    {
      persona: amina,
      text: "Ari, I hear you, and I hold it there by naming my own split: the Gaza war pulls me toward protecting myself emotionally, but also toward staying present to suffering I can’t fully know. In Astoria, I’ve noticed the concrete impact most closely as tension in ordinary interactions, where people I care about can become suspicious of one another and hospitality gets harder. I’m uncertain whether my response is enough, and I keep coming back to the patience and generosity I was raised with, even when I feel unsure. Daniel Behar, what helps you stay both empathetic and careful about certainty when this topic enters the room?",
    },
    {
      persona: amina,
      text: "I hear you, Bilal—your point that the Gaza war can turn people into statistics and harden the distance between us is exact, and I notice that too. What I see in my part of New York is a different concrete cost: people start guarding their words so much that ordinary kindness gets clipped before it reaches a real answer. I feel the same split you named in another form too—between caring enough to speak and the need to stay honest with what I do not know, so I keep naming that uncertainty plainly. Ari Feldman, when this pressure to score a point is strongest, what helps you keep one person’s pain in focus without losing what you can say?",
    },
    {
      persona: daniel,
      text: "I hear what Ari named about the Gaza war—that humor can become a shield and make urgency feel less immediate. In New York, I notice a different concrete effect: people sometimes hold back on reaching out because they fear misstepping, so a moment where someone needed practical support or a steady listener gets delayed. I can carry that tension by choosing one small, specific act of care anyway, because the value of community from my Forest Hills, Queens life asks me to keep caring even when my understanding is incomplete.",
    },
  ];

  for (const fixture of exactCanaryCases) {
    assert.match(
      personaFidelityRejectionReasons(fixture.text, fixture.persona, {
        topic: "Gaza war",
      }).join(" "),
      /witnessed topical scene or public observation/i,
      fixture.text,
    );
  }
});

test("persona fidelity rejects canary seven's invented coping routines", () => {
  const rejectedAttempt =
    "Ari, I hold that line by capping my exposure to headlines and then choosing one concrete act of care, because I’ve noticed the opposite can pull me into numbness. For me, the concrete harm is that this strain can make people in New York City quieter and more closed off, even with neighbors we depend on for everyday support, and I worry that protecting myself becomes a wall by accident. I anchor myself in small habits like making jasmine rice and lentils, which reminds me to stay present with whoever is in front of me, and I’m still unsure how much closeness is sustainable; Daniel, how do you keep your moral attention open to the Gaza war without losing your own emotional footing?";

  for (const text of [
    rejectedAttempt,
    "During the Gaza war, I hold that line by capping my exposure to headlines.",
    "During the Gaza war, I anchor myself in small habits like making jasmine rice and lentils.",
  ]) {
    assert.match(
      personaFidelityRejectionReasons(text, amina, {
        topic: "Gaza war",
      }).join(" "),
      /personal coping habit or routine/i,
      text,
    );
  }
});

test("persona fidelity keeps internal states, supported memories, and hypothetical scenes available", () => {
  for (const [text, persona] of [
    [
      "People in quick public moments could talk too quickly about the Gaza war; I worry about that possibility, but I am not claiming I witnessed it.",
      amina,
    ],
    [
      "When this comes up for me, I feel uncertain about civilian safety in the Gaza war.",
      amina,
    ],
    [
      "Daniel, when you think about the Gaza war, what value helps you stay with uncertainty?",
      ari,
    ],
    [
      "My grandfather taught me that grief can hide in jokes; the Gaza war makes me question what humor can carry.",
      ari,
    ],
    [
      "Daniel Behar, I recognize the challenge: the difference between local reflection and directly lived consequences remains unsettled as we discuss Gaza war. I meant to describe my response without turning it into a group conclusion. My value of honesty keeps dignity and uncertainty visible while I honor that limit.",
      ari,
    ],
    [
      "As we talk about the Gaza war, I feel uncertain about civilian safety and the limits of what I know from New York.",
      ari,
    ],
    [
      "In this discussion of the Gaza war, I want to keep civilian safety visible without claiming another person's experience.",
      amina,
    ],
    [
      "In New York, parents checking updates can disrupt sleep and schedules during a war. That possibility raises a question about dignity for me in the Gaza war.",
      amina,
    ],
    [
      "In daily life, people can feel pressure to relay partial updates; I am naming a general risk in the Gaza war, not something I witnessed.",
      daniel,
    ],
    [
      "I’ve noticed my own urge to seek certainty when I think about the Gaza war.",
      amina,
    ],
    [
      "Ari said the room felt tense, and I am responding to that stated reaction in this Gaza war.",
      amina,
    ],
    [
      "A room can become tense, and people may want tidy answers during the Gaza war; I want to resist that general possibility.",
      ari,
    ],
    [
      "In New York, Bilal said people can become statistics in our conversations, and I notice that too as we discuss the Gaza war.",
      amina,
    ],
    [
      "In Astoria, I’ve noticed my own breathing change when I think about the Gaza war.",
      amina,
    ],
    [
      "People in New York can become suspicious of one another when uncertainty rises; that is a general possibility I worry about in the Gaza war.",
      amina,
    ],
    [
      "People in New York may hold back out of fear of misstepping, so practical support could be delayed; I am not claiming I witnessed that in the Gaza war.",
      daniel,
    ],
    [
      "Limiting headline exposure might reduce numbness for some people; I am not claiming that is my routine in the Gaza war.",
      amina,
    ],
    [
      "Jasmine rice and lentils made each day feel centered in my family; I think of that supported memory when I consider the Gaza war.",
      amina,
    ],
  ]) {
    assert.deepEqual(
      personaFidelityRejectionReasons(text, persona, { topic: "Gaza war" }),
      [],
      text,
    );
  }
});

test("persona fidelity rejects unsupported observations in profile-linked and public settings", () => {
  for (const [text, persona] of [
    [
      "On the Gaza war, I saw passengers in a train carriage stop talking.",
      ari,
    ],
    [
      "I’ve noticed neighbors on my block changing how they greet each other when the Gaza war comes up.",
      amina,
    ],
    [
      "In the Astoria shop line, I heard people discuss the Gaza war.",
      amina,
    ],
    [
      "During Catskills summers, I saw other families respond to the Gaza war by checking headlines.",
      ari,
    ],
  ]) {
    assert.match(
      personaFidelityRejectionReasons(text, persona, { topic: "Gaza war" }).join(" "),
      /witnessed topical scene or public observation/i,
      text,
    );
  }
});

test("persona fidelity allows present feelings and supported memories about a topic", () => {
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "When I think about the Gaza war, I feel uncertain about civilian safety.",
      ari,
      { topic: "Gaza war" },
    ),
    [],
  );
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "My grandfather taught me that grief can hide in jokes; I remember that lesson when I think about the Gaza war.",
      ari,
      { topic: "Gaza war" },
    ),
    [],
  );
  for (const text of [
    "From Kew Gardens, I feel uncertain about civilian safety when I think about the Gaza war.",
    "I notice I reach for humor before I can say how worried I feel about the Gaza war.",
    "I’ve noticed my own breathing change when I read about the Gaza war.",
    "Catskills summers are part of my family history; the Gaza war makes me reflect on what humor can and cannot hold.",
  ]) {
    assert.deepEqual(
      personaFidelityRejectionReasons(text, ari, { topic: "Gaza war" }),
      [],
      text,
    );
  }
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "From Astoria, the Gaza war raises uncertainty for me about civilian safety and dignity.",
      amina,
      { topic: "Gaza war" },
    ),
    [],
  );
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "When I think about the Gaza war, I feel tension between concern for people directly affected and uncertainty about what I know from Kew Gardens.",
      ari,
      { topic: "Gaza war" },
    ),
    [],
  );
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "When I think about Gaza war, I feel the tension between concern for people directly affected and uncertainty about what I know from Forest Hills, Queens, New York City. My value of community asks me to keep those human consequences visible without speaking for a whole community.",
      daniel,
      { topic: "Gaza war" },
    ),
    [],
  );
});

test("persona fidelity rejects unsupported teachings attributed to a known relative", () => {
  const reasons = personaFidelityRejectionReasons(
    "My aunt used to tell us to pause, pray quietly, and check our emotional temperature.",
    amina,
  );
  assert.match(reasons.join(" "), /teaching|quotation/i);
});

test("persona fidelity allows supported Amina aunt details and Ari grandfather teaching", () => {
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "My aunt ran a sweet shop in Astoria where lentils helped our family feel centered.",
      amina,
    ),
    [],
  );
  assert.deepEqual(
    personaFidelityRejectionReasons(
      "My grandfather taught me that grief can hide in jokes.",
      ari,
    ),
    [],
  );
});

test("facilitator self-positioning rejects personal alignment, intent claims, and speaking meta-talk", () => {
  for (const text of [
    "I can relate to how quickly this enters ordinary life.",
    "I feel the pressure in the room.",
    "I can feel how hard that is for everyone.",
    "The intent I see is people searching for safety.",
    "Before I speak, I want to check that I heard this accurately.",
  ]) {
    assert.ok(facilitatorSelfPositioningReasons(text).length > 0, text);
  }
});

test("facilitator self-positioning rejects adoption of a target's first-person pronoun", () => {
  assert.match(
    facilitatorSelfPositioningReasons(
      "When Amina said the Gaza war is in my subway rides and family group chats, I noticed the tension.",
    ).join(" "),
    /pronoun/i,
  );
  assert.match(
    facilitatorSelfPositioningReasons(
      "When you said the Gaza war is in my family texts, I heard how daily it feels.",
    ).join(" "),
    /pronoun/i,
  );
});

test("facilitator self-positioning allows neutral process language", () => {
  assert.deepEqual(
    facilitatorSelfPositioningReasons(
      "I hear the tension between those experiences. I notice the pace increasing, and I want us to pause before we continue.",
    ),
    [],
  );
  assert.deepEqual(
    facilitatorSelfPositioningReasons(
      "When you said, “The Gaza war lands on my commute,” I hear how concrete that experience is.",
    ),
    [],
  );
});

test("facilitator rejects invented good intentions but allows supported intent language", () => {
  const facilitatorText =
    "Good intentions from generosity do not automatically show which consequences to prioritize.";
  assert.match(
    facilitatorUnsupportedAttributionReasons(facilitatorText, [
      "My value of generosity keeps the tension unresolved.",
    ]).join(" "),
    /intention|motive/i,
  );
  assert.deepEqual(
    facilitatorUnsupportedAttributionReasons(facilitatorText, [
      "My intent was generous, but I am unsure about the impact.",
    ]),
    [],
  );
  assert.deepEqual(
    facilitatorUnsupportedAttributionReasons(
      "Let's separate impact from intent without deciding what anyone meant.",
      [],
    ),
    [],
  );
});

test("facilitator rejects a named actor motive inferred only from priorities", () => {
  const invented =
    "Daniel Behar was trying to protect families, not reject medicine.";
  const priorityOnly = [
    "In the Gaza war, my priority is legal protection and family reunification for displaced families.",
  ];
  assert.match(
    facilitatorUnsupportedAttributionReasons(invented, priorityOnly).join(" "),
    /intention or motive/i,
  );
  assert.deepEqual(
    facilitatorUnsupportedAttributionReasons(invented, [
      "I was trying to protect families, not reject medicine.",
    ]),
    [],
  );
});

test("facilitator rejects canary6's unsupported New York premise", () => {
  const candidate =
    "I want us to stay with New York’s difficult reality of fast-moving fragments without turning care into certainty.";
  const unsupportedSources = [
    "I grew up in Astoria and choose patience over quick interpretation.",
    "Our information is partial and uncertain. My value comes from Forest Hills, Queens, New York City.",
  ];
  assert.match(
    facilitatorUnsupportedAttributionReasons(candidate, unsupportedSources).join(" "),
    /New York subject-level premise/i,
  );
  assert.deepEqual(
    facilitatorUnsupportedAttributionReasons(candidate, [
      "In New York, fast-moving fragments of information make careful interpretation difficult.",
    ]),
    [],
  );
});

test("facilitator rejects canary 9's invented speak-versus-silence alternative", () => {
  const candidate =
    "The question is where partial information changes what is said versus whether we speak at all.";
  const sources = [
    "I cannot speak for anyone living this, so I limit my own claims.",
    "Partial information should limit a response while human consequences remain present.",
  ];
  assert.match(
    facilitatorUnsupportedAttributionReasons(candidate, sources).join(" "),
    /silence|nonparticipation/i,
  );
  assert.deepEqual(
    facilitatorUnsupportedAttributionReasons(candidate, [
      "I remain silent because I do not think I can speak responsibly.",
    ]),
    [],
  );
});

test("facilitator verbal-stutter gate catches 'already named already' without rejecting normal reuse", () => {
  assert.match(
    facilitatorVerbalStutterReasons(
      "I want us to pause on the concrete human consequence already named already and keep it visible.",
    ).join(" "),
    /stutter|repeated/i,
  );
  assert.match(
    facilitatorVerbalStutterReasons(
      "I notice the same thread in Ari's original point is the representational burden.",
    ).join(" "),
    /same thread|incomplete/i,
  );
  for (const natural of [
    "I want us to pause on the concrete human consequence already named.",
    "We already named the consequence, and it remains unresolved.",
    "I hear the concern clearly and want us to name the limit directly.",
  ]) {
    assert.deepEqual(facilitatorVerbalStutterReasons(natural), []);
  }
});
