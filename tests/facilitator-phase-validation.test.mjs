import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessFacilitatorIntervention,
} from "../lib/dialogueFlow.ts";
import {
  assessFacilitatorOpening,
  buildFacilitatorOpening,
  openingHasAgreementInstructionCommentary,
  openingStatesSharedAgreements,
} from "../lib/facilitatorOpening.ts";

const ari = { id: "jewish-ari", displayName: "Ari Feldman" };
const amina = { id: "muslim-amina", displayName: "Amina Rahman" };
const bilal = { id: "muslim-bilal", displayName: "Bilal Osman" };
const daniel = { id: "jewish-daniel", displayName: "Daniel Behar" };
const attendees = [amina, bilal, ari, daniel];

const run68115062Drafts = {
  twoQuestionReflection:
    "The line “the Gaza war is in the air on the subway, at the deli, and in tiny family texts” stays with me, and I can feel the specific tension between how this war feels present in public life and how Bilal’s grandmother’s poem keeps another place alive in private memory.  \n" +
    "Before I share more, I want to check I’m hearing this accurately: does the tension here feel like different forms of carrying what is hard to bear, rather than a contest over whose pain is bigger?  \n" +
    "Ari Feldman, in which of those moments in New York—subway, deli, or family text—did the Gaza war feel most sharply personal for you, and what kind of response from this room would have helped in that moment?",
  naturalTellPrompt:
    "When the **Gaza war** lands as those little freezes in the deli or on the train, I feel the specific tension between wanting to speak first because it feels urgent and needing to let the other person fully set the pace. I also hear in Bilal’s point a real fear that we might perform concern in the moment and miss the quieter, harder-to-see parts of what someone is living. Ari Feldman, can you tell us about one specific commute or home moment where the Gaza war made you feel that urge to speak quickly, and what you most wanted your neighbors in New York to understand in return?",
  appropriatedFirstPerson:
    "When Amina said the Gaza war is in my subway rides, family group chats, and those quiet kitchen moments, I could feel how that same subject is shaping everyday life here, not just headlines.  \n" +
    "I’m noticing a specific tension between Daniel’s image of a warm, open home and the way you’re carrying the Gaza war in ordinary routines, and I’m realizing we’re still missing your personal stake in how that feels when “being safe” or “being open” starts to compete in the same moment.  \n" +
    "Amina Rahman, can you share one concrete moment in your family’s New York routine where you wished the Gaza war could be held in conversation without feeling like it had to push out the feeling of home?",
  naturalUnresolvedFrame:
    "When you said the **Gaza war** is in your subway rides, family group chats, and those quiet kitchen moments in Astoria, I can feel how it keeps invading everyday life. What feels unresolved to me right now is the different personal stake each of you is carrying: Daniel shared the warmth of an open home with mate and asado, while your image points to a different burden on the same weekday rhythms, and I’m missing what it costs you to hold both that tension. Amina Rahman, can you share one specific moment this week when the Gaza war felt most personal in your daily life, and what kind of response from people around you helped—or didn’t help—you in that moment?",
};

test("facilitator intervention assessment accepts focused natural repair language without a sentiment tag", () => {
  const tellAssessment = assessFacilitatorIntervention(
    "On the Gaza war, I also hear the tension between urgency and letting another person set the pace. Ari Feldman, can you tell us which part of that concern should be reflected first?",
    attendees,
    ari.id,
  );
  const unresolvedAssessment = assessFacilitatorIntervention(
    "On the Gaza war, I'm noticing the unresolved burden in the different personal stakes already named. Amina Rahman, what part of that distinction should the circle understand first?",
    attendees,
    amina.id,
  );
  const couldFeelAssessment = assessFacilitatorIntervention(
    "On the Gaza war, I could feel the tension between quick answers and the burden underneath them. Amina Rahman, can you tell us what lived experience the circle needs to understand first?",
    attendees,
    amina.id,
  );

  for (const assessment of [tellAssessment, unresolvedAssessment, couldFeelAssessment]) {
    assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
    assert.equal(assessment.repairFramed, true);
    assert.equal(assessment.exactlyOneFinalQuestion, true);
    assert.equal(assessment.finalQuestionIsOpen, true);
    assert.equal(assessment.finalQuestionSingleFocus, true);
    assert.equal(assessment.correctInvitee, true);
  }
});

test("recorded one-mark questions with two requests are rejected as overloaded", () => {
  for (const [text, invitee] of [
    [run68115062Drafts.naturalTellPrompt, ari.id],
    [run68115062Drafts.naturalUnresolvedFrame, amina.id],
  ]) {
    const assessment = assessFacilitatorIntervention(text, attendees, invitee);
    assert.equal(assessment.questionCount, 1);
    assert.equal(assessment.finalQuestionSingleFocus, false);
    assert.equal(assessment.acceptable, false);
    assert.match(assessment.rejectionReasons.join(" "), /one focused thing/i);
  }
});

test("facilitator single-focus check rejects a coordinated second request without another wh-word", () => {
  const assessment = assessFacilitatorIntervention(
    "I hear Daniel Behar's challenge and want us to pause this unresolved tension. " +
      "Amina Rahman, what do you hear and state your position?",
    attendees,
    amina.id,
  );

  assert.equal(assessment.questionCount, 1);
  assert.equal(assessment.finalQuestionIsOpen, true);
  assert.equal(assessment.finalQuestionInvitesReflection, true);
  assert.equal(assessment.finalQuestionSingleFocus, false);
  assert.equal(assessment.acceptable, false);
  assert.match(assessment.rejectionReasons.join(" "), /one focused thing/i);
});

test("facilitator intervention assessment recognizes reflection but enforces one final question", () => {
  const assessment = assessFacilitatorIntervention(
    run68115062Drafts.twoQuestionReflection,
    attendees,
    ari.id,
  );

  assert.equal(assessment.reflectiveStancePresent, true);
  assert.equal(assessment.repairFramed, true);
  assert.equal(assessment.questionCount, 2);
  assert.equal(assessment.exactlyOneFinalQuestion, false);
  assert.equal(assessment.acceptable, false);
  assert.match(assessment.rejectionReasons.join(" "), /exactly one question/i);
});

test("facilitator repair asks for reflection before a policy decision", () => {
  const decisionDraft = assessFacilitatorIntervention(
    "I hear Bilal Osman challenging a priority in the Gaza war, and let's pause on that unresolved tension. Ari Feldman, how do you decide which obligation should come first?",
    attendees,
    ari.id,
  );

  assert.equal(decisionDraft.finalQuestionIsOpen, true);
  assert.equal(decisionDraft.finalQuestionSingleFocus, true);
  assert.equal(decisionDraft.finalQuestionInvitesReflection, false);
  assert.equal(decisionDraft.acceptable, false);
  assert.match(decisionDraft.rejectionReasons.join(" "), /accurate reflection/i);
});

test("facilitator repair rejects debate prompts and a bare use of 'point'", () => {
  for (const question of [
    "Amina Rahman, what point will you defend against Daniel’s demand?",
    "Amina Rahman, which point will you choose?",
    "Amina Rahman, what challenge will you rebut?",
  ]) {
    const assessment = assessFacilitatorIntervention(
      `I hear Daniel Behar's challenge and want us to pause this unresolved tension. ${question}`,
      attendees,
      amina.id,
    );

    assert.equal(assessment.finalQuestionIsOpen, true, question);
    assert.equal(assessment.finalQuestionInvitesReflection, false, question);
    assert.equal(assessment.acceptable, false, question);
    assert.match(assessment.rejectionReasons.join(" "), /accurate reflection/i);
  }
});

test("facilitator intervention assessment rejects participant first-person appropriation", () => {
  const assessment = assessFacilitatorIntervention(
    run68115062Drafts.appropriatedFirstPerson,
    attendees,
    amina.id,
  );

  assert.equal(assessment.repairFramed, true);
  assert.equal(assessment.exactlyOneFinalQuestion, true);
  assert.equal(assessment.correctInvitee, true);
  assert.equal(assessment.acceptable, false);
  assert.match(
    assessment.prohibitedSelfPositioning.join(" "),
    /participant's first-person language/i,
  );

  const explicitlyQuoted = run68115062Drafts.appropriatedFirstPerson.replace(
    "When Amina said the Gaza war is in my subway rides",
    "When Amina said, “The Gaza war is in my subway rides”",
  );
  assert.doesNotMatch(
    assessFacilitatorIntervention(explicitlyQuoted, attendees, amina.id)
      .prohibitedSelfPositioning.join(" "),
    /participant's first-person language/i,
  );
});

test("facilitator intervention assessment rejects self-positioning and invented intent", () => {
  const selfPositioned = assessFacilitatorIntervention(
    "I hear the tension around the Gaza war, and I can relate to how heavy it feels. Before I speak, I want to make room for the burden underneath it. Ari Feldman, what lived experience should the circle understand first?",
    attendees,
    ari.id,
  );
  const inventedIntent = assessFacilitatorIntervention(
    "On the Gaza war, I hear the tension between impact and intent, while the intent I see is people searching for clarity and safety. Amina Rahman, what lived experience should the circle understand before responding?",
    attendees,
    amina.id,
  );

  assert.equal(selfPositioned.acceptable, false);
  assert.match(selfPositioned.prohibitedSelfPositioning.join(" "), /relatability/i);
  assert.match(selfPositioned.prohibitedSelfPositioning.join(" "), /own turn/i);
  assert.equal(inventedIntent.acceptable, false);
  assert.match(inventedIntent.prohibitedSelfPositioning.join(" "), /intent or motive/i);
});

test("facilitator intervention rejects an ungrounded motive assigned directly to a named participant", () => {
  const assessment = assessFacilitatorIntervention(
    "I hear the unresolved tension in the Gaza war and want us to pause. " +
      "Daniel Behar was trying to protect families, not reject medicine. " +
      "Amina Rahman, what part of Daniel's concern do you understand?",
    attendees,
    amina.id,
  );

  assert.equal(assessment.acceptable, false);
  assert.match(assessment.prohibitedSelfPositioning.join(" "), /intent or motive/i);
});

test("facilitator intervention assessment requires the expected name in its sole final question", () => {
  const wrongInvitee = assessFacilitatorIntervention(
    "On the Gaza war, I also hear the tension and the personal stake still missing. Daniel Behar, can you tell us what lived experience the circle should understand first?",
    attendees,
    amina.id,
  );
  const trailingStatement = assessFacilitatorIntervention(
    "On the Gaza war, I also hear the tension and the personal stake still missing. Amina Rahman, can you tell us what lived experience the circle should understand first? We will pause there.",
    attendees,
    amina.id,
  );

  assert.equal(wrongInvitee.correctInvitee, false);
  assert.equal(wrongInvitee.acceptable, false);
  assert.equal(trailingStatement.exactlyOneFinalQuestion, false);
  assert.equal(trailingStatement.acceptable, false);
});

test("canary 7 routing treats a leading Amina vocative as the invitee while Daniel remains the concern source", () => {
  const exactDraft =
    "I hear Daniel Behar’s challenge in this Gaza war moment, and I want us to pause before moving on. The exact concern he raises is that partial information can limit what we say, while the human consequences of the war still demand attention in the room. Amina Rahman, can you reflect back Daniel’s concern about how partial information should limit a response while urgency about human consequences remains?";
  const assessment = assessFacilitatorIntervention(
    exactDraft,
    attendees,
    amina.id,
  );

  assert.equal(assessment.resolvedInvitee?.id, amina.id);
  assert.equal(assessment.finalQuestionIsOpen, true);
  assert.equal(assessment.correctInvitee, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("leading-vocative routing still rejects questions addressed to two attendees", () => {
  const coordinated = assessFacilitatorIntervention(
    "On the Gaza war, I hear the unresolved tension and want us to pause. Amina Rahman and Daniel Behar, can you reflect back the concern?",
    attendees,
    amina.id,
  );
  const doubleVocative = assessFacilitatorIntervention(
    "On the Gaza war, I hear the unresolved tension and want us to pause. Amina Rahman, Daniel Behar, can you reflect back the concern?",
    attendees,
    amina.id,
  );
  const coordinatedYou = assessFacilitatorIntervention(
    "On the Gaza war, I hear the unresolved tension and want us to pause. Amina Rahman, can you and Daniel Behar reflect back the concern?",
    attendees,
    amina.id,
  );

  for (const assessment of [coordinated, doubleVocative, coordinatedYou]) {
    assert.equal(assessment.resolvedInvitee, undefined);
    assert.equal(assessment.correctInvitee, false);
    assert.equal(assessment.acceptable, false);
    assert.match(assessment.rejectionReasons.join(" "), /unambiguously/i);
  }
});

test("canary 8 rejects an embedded what-clause in a yes-no question but accepts leading reflect and clarify forms", () => {
  const yesNoDraft = assessFacilitatorIntervention(
    "I hear your concern, Bilal, and I notice you’re challenging scope in the Gaza war. Let’s pause that tension so we honor the limit you named. Ari Feldman, is your point limited to uncertainty about how New Yorkers act on what they hear, rather than a full account of broader effects?",
    attendees,
    ari.id,
  );

  assert.equal(yesNoDraft.resolvedInvitee?.id, ari.id);
  assert.equal(yesNoDraft.finalQuestionIsOpen, false);
  assert.equal(yesNoDraft.acceptable, false);
  assert.match(yesNoDraft.rejectionReasons.join(" "), /open-ended/i);

  for (const closedQuestion of [
    "Ari Feldman, can you reflect whether you meant to limit your claim?",
    "Ari Feldman, could you clarify if you would still speak?",
  ]) {
    const assessment = assessFacilitatorIntervention(
      `On the Gaza war, I hear the unresolved tension and want us to pause. ${closedQuestion}`,
      attendees,
      ari.id,
    );
    assert.equal(assessment.finalQuestionIsOpen, false, closedQuestion);
    assert.equal(assessment.acceptable, false, closedQuestion);
  }

  for (const question of [
    "Ari Feldman, can you reflect back which scope limit Bilal Osman named?",
    "Ari Feldman, can you clarify which consequence your point actually covers?",
    "Ari Feldman, what scope limit do you hear in Bilal Osman's concern?",
  ]) {
    const assessment = assessFacilitatorIntervention(
      `On the Gaza war, I hear the unresolved tension and want us to pause. ${question}`,
      attendees,
      ari.id,
    );
    assert.equal(assessment.finalQuestionIsOpen, true, question);
    assert.equal(assessment.correctInvitee, true, question);
    assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
  }
});

test("facilitator accepts an open reflection question prefixed by 'in your own wording'", () => {
  const exactDraft =
    "I hear Bilal Osman’s point and want us to pause the unresolved priority in the Gaza war. Ari Feldman, in your own wording, how do you place the rights of displaced families relative to continuous medical access?";
  const assessment = assessFacilitatorIntervention(
    exactDraft,
    attendees,
    ari.id,
  );

  assert.equal(assessment.finalQuestionIsOpen, true);
  assert.equal(assessment.finalQuestionInvitesReflection, true);
  assert.equal(assessment.correctInvitee, true);
  assert.equal(assessment.acceptable, true, assessment.rejectionReasons.join("; "));
});

test("opening contract requires shared group agreements instead of Sam's promises", () => {
  const topic = "Gaza war";
  const sharedOpening = buildFacilitatorOpening(topic, false);
  const personalOpening =
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”. " +
    "My agreements for us are: I will speak from my own perspective, I will stay curious instead of persuasive, and I will assume good faith. " +
    "For our first go-round on Gaza war, share how the Gaza war affects your family conversations and New York City life.";

  assert.equal(openingStatesSharedAgreements(sharedOpening), true);
  assert.equal(assessFacilitatorOpening(sharedOpening, topic).sharedAgreements, true);
  assert.equal(assessFacilitatorOpening(sharedOpening, topic).acceptable, true);
  assert.equal(openingStatesSharedAgreements(personalOpening), false);
  assert.equal(assessFacilitatorOpening(personalOpening, topic).sharedAgreements, false);
  assert.equal(assessFacilitatorOpening(personalOpening, topic).acceptable, false);
});

test("opening contract rejects commentary that exposes agreement-writing instructions", () => {
  const topic = "Gaza war";
  const leakedInstruction =
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”. " +
    "Our shared agreements are: speak from personal experience, stay curious rather than persuasive, and assume good faith. " +
    "These are commitments for everyone, not ‘I will’ promises. " +
    "For our first go-round on Gaza war, share one concrete human consequence of the Gaza war.";
  const simplyStated =
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”. " +
    "Our shared agreements are: speak from personal experience, stay curious rather than persuasive, and assume good faith. " +
    "For our first go-round on Gaza war, share one concrete human consequence of the Gaza war.";

  assert.equal(openingHasAgreementInstructionCommentary(leakedInstruction), true);
  assert.equal(openingStatesSharedAgreements(leakedInstruction), false);
  const rejected = assessFacilitatorOpening(leakedInstruction, topic);
  assert.equal(rejected.agreementInstructionCommentary, true);
  assert.equal(rejected.acceptable, false);

  assert.equal(openingHasAgreementInstructionCommentary(simplyStated), false);
  assert.equal(openingStatesSharedAgreements(simplyStated), true);
  assert.equal(assessFacilitatorOpening(simplyStated, topic).acceptable, true);
});
