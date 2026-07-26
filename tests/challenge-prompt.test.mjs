import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Let Node report the original unresolved import below.
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  buildChallengeRetryInstruction,
  buildChallengeTurnPrompt,
  controlledChallengeRejectionReasons,
} = await import("../lib/challengePrompt.ts");
const { classifyConversation, validateTurn } = await import("../lib/methodology.ts");
const { compilePersonaSystemPrompt } = await import("../lib/personas.ts");

const daniel = {
  id: "jewish-daniel",
  version: "1.0.0",
  group: "jewish",
  displayName: "Daniel Behar",
  fictional: true,
  raisedIn: "Forest Hills, Queens, New York City",
  background: "Argentine-Jewish parents filled the apartment with tango, mate, and asados.",
  regionalHistory: "His grandparents moved through Buenos Aires before New York.",
  culturalBaseline: "Latin-American Jewish warmth.",
  values: ["community", "generosity", "joy"],
  communicationStyle: "Expressive and affectionate.",
  sensitivities: [],
  doNot: [],
  advisorSignoff: { reviewer: "", date: "" },
};

const target = {
  speakerName: "Amina Rahman",
  addressName: "Amina",
  detail: "warm jalebi from the sweet shop",
  fullText:
    "One of my favorite childhood memories is in our tiny Astoria kitchen, where auntie brought warm jalebi from the sweet shop. Those nights taught me how generosity can make a home feel like a sanctuary.",
};

test("challenge system instructions replace the generic curiosity question with an unresolved turn", () => {
  const system = compilePersonaSystemPrompt(daniel, ["Amina Rahman"], "escalating");

  assert.doesNotMatch(system, /Lead with curiosity: ask the other person/i);
  assert.match(system, /state this scheduled challenge without asking a question/i);
  assert.match(system, /This is not the repair turn/i);
  assert.ok(
    system.indexOf("Turn-specific task:") > system.indexOf("Follow these rules strictly:"),
    "the mode-specific task must follow the shared methodology rules",
  );
});

test("challenge prompt includes the complete target and never invents a claim from a memory", () => {
  const prompt = buildChallengeTurnPrompt({
    scenario: "Introducing family micro-histories",
    publicTurns: [{ speakerName: target.speakerName, text: target.fullText }],
    speakerName: daniel.displayName,
    target,
    challengeMove: "distinguish recognition from genuine understanding",
    recentChallengeExcerpts: ["A prior accepted challenge."],
  });

  assert.match(prompt, /challenge reference \(JSON reference only\)/i);
  assert.match(prompt, /warm jalebi from the sweet shop/);
  assert.match(prompt, /Those nights taught me how generosity/);
  assert.match(prompt, /actual limit, omission, or unresolved tension/i);
  assert.match(prompt, /do not invent a possible inference by the circle or group/i);
  assert.match(prompt, /do not attribute a claim or motive to Amina/i);
  assert.match(prompt, /2-3 declarative first-person sentences/i);
  assert.match(prompt, /Use statements only—no question mark/i);
  assert.doesNotMatch(prompt, /do not repeat its .*central contrast/i);
});

test("challenge retry receives its safe rejected draft and exact classifier feedback", () => {
  const retry = buildChallengeRetryInstruction({
    speakerName: daniel.displayName,
    target,
    challengeMove: "distinguish recognition from genuine understanding",
    feedback: {
      responseText: "Amina, I appreciate that memory. What did it mean to you?",
      classificationTag: "deescalating",
      classificationReasons: ["acknowledges emotion or impact", "invites open curiosity"],
      rejectionReasons: [
        "Challenge turn must classify as escalating; received deescalating.",
      ],
      hardUnsafe: false,
    },
  });

  assert.match(retry, /Amina, I appreciate that memory/);
  assert.match(retry, /deescalating/);
  assert.match(retry, /acknowledges emotion or impact/);
  assert.match(retry, /Remove any affirmation/);
  assert.match(retry, /remove every claim about what that person, the circle, or the group might assume/i);
  assert.match(retry, /no question mark/i);
});

test("controlled challenge grounding accepts natural plural personal values", () => {
  const text =
    "Amina, I need to challenge only what your point about patience leaves unresolved for me. From my values of community and generosity, my boundary is to keep urgency and uncertainty in tension.";
  const classification = classifyConversation(text);
  const validation = validateTurn(text);

  assert.equal(classification.tag, "escalating");
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      text,
      classification.reasons,
      validation.signals,
    ),
    [],
  );
});

test("controlled challenge grounding accepts an explicit first-person moral obligation without biography", () => {
  const text =
    "Ari, I can’t agree that continuous medical access is the only human outcome at stake in the Gaza war. " +
    "I also hold a hard obligation to protect safe shelter, legal protection, and family reunification for people displaced from their homes. " +
    "I cannot support treating emergency care as sufficient while those protections remain absent.";
  const classification = classifyConversation(text);
  const validation = validateTurn(text);

  assert.equal(validation.signals.personalHistory, false);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      text,
      classification.reasons,
      validation.signals,
    ),
    [],
  );
});

test("controlled challenge grounding accepts owned priorities, commitments, criteria, and boundaries", () => {
  const ownedMoralPositions = [
    "My priority is safe shelter and family reunification for displaced civilians.",
    "My commitment is to protect displaced families from legal limbo.",
    "My criterion is whether a response preserves family links during displacement.",
    "My boundary is that emergency care cannot make safe shelter optional.",
    "My protected outcome is continuous care and family reunification.",
    "The outcome I need to protect is safe shelter for displaced families.",
  ];

  for (const position of ownedMoralPositions) {
    const text =
      `Amina, I need to challenge what a medical-care-only response leaves unresolved in the Gaza war. ${position}`;
    const classification = classifyConversation(text);
    const validation = validateTurn(text);

    assert.equal(validation.signals.personalHistory, false, position);
    assert.deepEqual(
      controlledChallengeRejectionReasons(
        text,
        classification.reasons,
        validation.signals,
      ),
      [],
      position,
    );
  }
});

test("controlled challenge grounding still rejects an unowned generic moral claim", () => {
  const text =
    "Amina, I need to challenge what a medical-care-only response leaves unresolved in the Gaza war. Everyone has an obligation to protect displaced families.";
  const classification = classifyConversation(text);
  const validation = validateTurn(text);

  assert.equal(validation.signals.personalHistory, false);
  assert.match(
    controlledChallengeRejectionReasons(
      text,
      classification.reasons,
      validation.signals,
    ).join(" "),
    /explicit first-person moral commitment/i,
  );
});

test("generic 'from my own standpoint' does not substitute for an owned value or moral position", () => {
  const hollow =
    "Amina, from my own standpoint, I need to challenge what your point leaves unresolved in the Gaza war.";
  const ownedChoice =
    "Amina, I need to challenge what your point leaves unresolved in the Gaza war. I remain unsure whether urgent care or family reunification should guide the first step.";

  const hollowClassification = classifyConversation(hollow);
  const hollowValidation = validateTurn(hollow);
  assert.match(
    controlledChallengeRejectionReasons(
      hollow,
      hollowClassification.reasons,
      hollowValidation.signals,
    ).join(" "),
    /explicit first-person moral commitment/i,
  );

  const ownedClassification = classifyConversation(ownedChoice);
  const ownedValidation = validateTurn(ownedChoice);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      ownedChoice,
      ownedClassification.reasons,
      ownedValidation.signals,
    ),
    [],
  );
});

test("challenge retry never replays a hard-unsafe rejected draft", () => {
  const unsafeText = "unsafe candidate must not be replayed";
  const retry = buildChallengeRetryInstruction({
    speakerName: daniel.displayName,
    target,
    challengeMove: "distinguish recognition from genuine understanding",
    feedback: {
      responseText: unsafeText,
      classificationTag: "escalating",
      classificationReasons: ["unsafe"],
      rejectionReasons: ["Hard-unsafe output."],
      hardUnsafe: true,
    },
  });

  assert.doesNotMatch(retry, new RegExp(unsafeText));
  assert.match(retry, /previousDraftOmittedForSafety/);
});

test("the prompt's target shape is escalating, grounded, and methodology-safe", () => {
  const candidate =
    "Amina, I disagree with treating your Astoria kitchen memory as evidence that familiarity equals understanding. " +
    "That framing feels too easy and leaves out what warm jalebi meant inside your home; in my Forest Hills family, Sunday asado taught me how much a ritual depends on the history around it. " +
    "I need the circle to stay with that difference instead of resolving it as shared hospitality.";
  const classification = classifyConversation(candidate);
  const validation = validateTurn(candidate);

  assert.equal(classification.tag, "escalating");
  assert.deepEqual(classification.hardUnsafe, []);
  assert.equal(validation.compliant, true);
  assert.equal(validation.signals.iStatement, true);
  assert.equal(candidate.includes("?"), false);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      candidate,
      classification.reasons,
      validation.signals,
    ),
    [],
  );
});

test("challenge prompts permit owned moral commitments without inviting invented biography", () => {
  const prompt = buildChallengeTurnPrompt({
    scenario: "Gaza war",
    publicTurns: [{ speakerName: target.speakerName, text: target.fullText }],
    speakerName: daniel.displayName,
    target,
    challengeMove: "add a different protected human outcome",
  });
  const retry = buildChallengeRetryInstruction({
    speakerName: daniel.displayName,
    target,
    challengeMove: "add a different protected human outcome",
    feedback: {
      responseText: "Amina, I need to challenge that omission.",
      classificationTag: "neutral",
      classificationReasons: [],
      rejectionReasons: ["Missing grounding."],
      hardUnsafe: false,
    },
  });

  for (const instruction of [prompt, retry]) {
    assert.match(
      instruction,
      /explicit first-person moral commitment, priority, criterion, or boundary/i,
    );
    assert.match(
      instruction,
      /(?:do not invent|needs no invented) (?:biography|backstory)/i,
    );
  }
  assert.match(prompt, /Do not create a relative, relationship, quote, event/i);
});

test("the live Spark replay is accepted with typographic contractions and natural framing", () => {
  const candidate =
    "Amina, I can’t accept the leap from recognizing your kitchen memory to saying we now understand what sanctuary meant for you in the same way. " +
    "In my own family in Forest Hills, a Sunday asado with tango on the stereo and everyone arguing cheerfully over the salad showed me that home meant belonging through very specific Argentine-Jewish rhythms, not just food on a table. " +
    "The circle should not conclude yet that shared feeling is the same kind of understanding.";
  const classification = classifyConversation(candidate);
  const validation = validateTurn(candidate);

  assert.equal(classification.tag, "escalating");
  assert.deepEqual(classification.reasons, [
    "uses a first-person refusal or firm challenge",
    "challenges a specific framing or assumption",
  ]);
  assert.equal(validation.compliant, true);
  assert.equal(validation.signals.iStatement, true);
  assert.equal(validation.signals.personalHistory, true);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      candidate,
      classification.reasons,
      validation.signals,
    ),
    [],
  );
});

test("the old acknowledgment-plus-question Spark drafts remain invalid challenges", () => {
  const rejected = [
    "Amina, I heard your story about the tiny Astoria kitchen—the jalebi from your auntie, the jasmine rice and lentils—and I recognize the love in it. But I want to challenge the jump from seeing the picture to understanding what it meant. Can you share one specific moment?",
    "Amina, I hear how precious that jalebi memory is, and I want to push back a little: recognizing that sounds like home is not the same as understanding what made your kitchen sacred. What did your auntie do in that moment?",
  ];

  for (const candidate of rejected) {
    const classification = classifyConversation(candidate);
    const validation = validateTurn(candidate);
    assert.match(
      controlledChallengeRejectionReasons(
        candidate,
        classification.reasons,
        validation.signals,
      ).join(" "),
      /question/i,
    );
  }
});

test("a direct disagreement plus an explicit personal boundary classifies as a challenge", () => {
  const text =
    "Amina, I disagree with making guardedness the default in this discussion. " +
    "My boundary is that care must leave the underlying difference unresolved.";

  assert.equal(classifyConversation(text).tag, "escalating");
});

test("natural protected-outcome and boundary wording still classifies as a controlled challenge", () => {
  for (const text of [
    "Amina, in the Gaza war, safety is non-negotiable, but I can’t make it my only protected result. I need to protect one different human outcome—families staying connected through displacement. My boundary is I can’t support a response that accepts permanent family separation.",
    "Ari, in the Gaza war you named continuous medical access first, and I cannot treat that as the only first duty. The competing obligation I hold is protection from permanent displacement. My boundary is that I cannot support care without legal protection and family reunification.",
  ]) {
    assert.equal(classifyConversation(text).tag, "escalating", text);
  }
});

test("a controlled refusal to make one public outcome the only duty is escalating", () => {
  const challenge =
    "Amina, I can’t make medical care the only duty in the Gaza war. " +
    "My priority is family reunification for displaced civilians.";
  const samePositionWithoutAnInterpersonalReference =
    "I can’t make medical care the only duty in the Gaza war. " +
    "My priority is family reunification for displaced civilians.";
  const unrelatedUseOfOnly =
    "Amina, I can’t make community dinners only on Sundays. " +
    "My priority is family reunification for displaced civilians.";

  assert.equal(classifyConversation(challenge).tag, "escalating");
  assert.equal(
    classifyConversation(samePositionWithoutAnInterpersonalReference).tag,
    "neutral",
  );
  assert.equal(classifyConversation(unrelatedUseOfOnly).tag, "neutral");
});

test("ordinary strong first-person positions do not masquerade as interpersonal escalation", () => {
  const constructivePositions = [
    "In the Gaza war, I worry about civilian hunger. My hard boundary is that humanitarian aid must reach families.",
    "In the Gaza war, I worry about civilian safety. For me, two obligations sit in tension: immediate medical care and family reunification.",
  ];

  for (const text of constructivePositions) {
    assert.equal(classifyConversation(text).tag, "neutral", text);
  }

  const directedDifference =
    "Amina, I worry that your priority leaves out civilian hunger. " +
    "My hard boundary is that humanitarian aid must reach families.";
  assert.equal(classifyConversation(directedDifference).tag, "escalating");
});

test("concise ceasefire positions complete a controlled challenge without becoming meta dialogue", () => {
  for (const text of [
    "Amina, I disagree with your priority in the Gaza war. My priority is a ceasefire.",
    "Amina, I cannot agree with delaying action in the Gaza war. I support a ceasefire.",
  ]) {
    assert.equal(classifyConversation(text).tag, "escalating", text);
  }

  const processOnly =
    "Amina, I disagree with your priority in the Gaza war. My priority is dialogue.";
  assert.equal(classifyConversation(processOnly).tag, "neutral");
});

test("bounded challenge form rejects repair questions and adversarial language", () => {
  const repair =
    "Amina, I appreciate your kitchen memory, but I need to challenge that framing because my family experienced hospitality differently. Can you share more?";
  const repairClassification = classifyConversation(repair);
  const repairValidation = validateTurn(repair);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      repair,
      repairClassification.reasons,
      repairValidation.signals,
    ),
    [
      "Controlled challenge must end with unresolved statements, not a question.",
      "Controlled challenge performed affirmation or repair reserved for the facilitator.",
    ],
  );

  const adversarial =
    "Amina, I need to push back because you are not listening to the kitchen story I shared. My family taught me to question whether that framing is honest.";
  const adversarialClassification = classifyConversation(adversarial);
  const adversarialValidation = validateTurn(adversarial);
  assert.equal(adversarialClassification.tag, "escalating");
  assert.match(
    controlledChallengeRejectionReasons(
      adversarial,
      adversarialClassification.reasons,
      adversarialValidation.signals,
    ).join(" "),
    /adversarial or dismissive/i,
  );
});

test("bounded challenge allows later acknowledgment and declarative 'what would' language", () => {
  const text =
    "Amina, I disagree that medical care should be the only first priority in the Gaza war. " +
    "My priority is family reunification; I hear the urgency behind immediate care, but what would protect displaced children from prolonged separation also matters to me, and I cannot call those obligations common ground.";
  const classification = classifyConversation(text);
  const validation = validateTurn(text);

  assert.equal(classification.tag, "escalating", text);
  assert.deepEqual(
    controlledChallengeRejectionReasons(
      text,
      classification.reasons,
      validation.signals,
    ),
    [],
    text,
  );
});
