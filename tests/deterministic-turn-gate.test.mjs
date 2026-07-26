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

const { deterministicTurnGateRejectionReasons } = await import(
  "../lib/deterministicTurnGate.ts"
);

const topic = "Gaza war";
const amina = { id: "muslim-amina", displayName: "Amina Rahman" };
const ari = { id: "jewish-ari", displayName: "Ari Feldman" };
const daniel = { id: "jewish-daniel", displayName: "Daniel Behar" };
const attendees = [amina, ari, daniel];

function rejectionText(input) {
  return deterministicTurnGateRejectionReasons(input).join(" ");
}

test("opening gate enforces facilitator identity, exact topic placement, shared agreements, and routed invitation", () => {
  const valid =
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”. Welcome, everyone. " +
    "Our three shared agreements are: speak from personal experience, stay curious rather than persuasive, and assume good faith. " +
    "For our first go-round on today's topic, name one human outcome you would protect.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({ text: valid, phase: "opening", topic }),
    [],
  );

  const identityLate = valid.replace(
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”.",
    "Today's topic is: “Gaza war”. I'm Sam, your facilitator.",
  );
  assert.match(
    rejectionText({ text: identityLate, phase: "opening", topic }),
    /must begin with Sam identifying himself/i,
  );

  const wrongImmediateTopic = valid.replace(
    "Today's topic is: “Gaza war”. Welcome, everyone.",
    "Welcome, everyone. Today's topic is: “Gaza war”.",
  );
  assert.match(
    rejectionText({ text: wrongImmediateTopic, phase: "opening", topic }),
    /topic sentence must immediately follow/i,
  );

  const personalAgreements = valid.replace(
    "Our three shared agreements are:",
    "My three agreements are:",
  );
  assert.match(
    rejectionText({ text: personalAgreements, phase: "opening", topic }),
    /must state the agreements as shared/i,
  );
});

test("discussion gate enforces scheduled question routing and controlled-challenge shape", () => {
  const scheduled =
    "I would protect reliable access to medicine first. Ari Feldman, what human outcome would you protect?";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: scheduled,
      phase: "discussion",
      topic,
      attendees,
      expectedNextSpeakerId: ari.id,
    }),
    [],
  );

  assert.match(
    rejectionText({
      text: scheduled,
      phase: "discussion",
      topic,
      attendees,
      expectedNextSpeakerId: amina.id,
    }),
    /next scheduled speaker/i,
  );
  assert.match(
    rejectionText({
      text: `${scheduled} Amina, what about you?`,
      phase: "discussion",
      topic,
      attendees,
      expectedNextSpeakerId: ari.id,
    }),
    /exactly one final question/i,
  );
  assert.match(
    rejectionText({
      text: "I would protect medicine first. What would the circle protect?",
      phase: "discussion",
      topic,
      attendees,
    }),
    /must not open a new question/i,
  );

  const challenge =
    "Amina, I need to challenge that conclusion. My priority is durable legal protection for displaced families.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: challenge,
      phase: "discussion",
      topic,
      attendees,
      controlledChallenge: true,
      targetName: amina.displayName,
    }),
    [],
  );
  assert.match(
    rejectionText({
      text: `${challenge} Can you explain?`,
      phase: "discussion",
      topic,
      attendees,
      controlledChallenge: true,
      targetName: amina.displayName,
    }),
    /contain no question/i,
  );
  assert.match(
    rejectionText({
      text: "I need to challenge that conclusion. My priority is durable legal protection.",
      phase: "discussion",
      topic,
      attendees,
      controlledChallenge: true,
      targetName: amina.displayName,
    }),
    /explicitly address Amina Rahman/i,
  );
});

test("ordinary discussion continuity gate requires the immediately previous speaker in sentence one", () => {
  const bridged =
    "Amina, your point was that immediate protection and equal rights must stay linked, and I want to build on that. " +
    "My added priority is a same-day appeal path after emergency help arrives.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: bridged,
      phase: "discussion",
      topic,
      attendees,
      previousSpeakerName: amina.displayName,
    }),
    [],
  );

  assert.match(
    rejectionText({
      text: "I want a same-day appeal path. Amina, your point about linked rights matters to me.",
      phase: "discussion",
      topic,
      attendees,
      previousSpeakerName: amina.displayName,
    }),
    /immediately previous participant.*first sentence/i,
  );

  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: "Amina, bananas are square. I would protect a same-day appeal path.",
      phase: "discussion",
      topic,
      attendees,
      previousSpeakerName: amina.displayName,
    }),
    [],
    "summary fidelity remains an LLM semantic decision, not a regex gate",
  );
});

test("intervention and invited-response gates enforce exact link routing without judging meaning", () => {
  const intervention =
    "I hear a difference over timing and want us to pause. Amina Rahman, what part of Daniel's concern should the circle understand?";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: intervention,
      phase: "intervention",
      topic,
      attendees,
      expectedInviteeId: amina.id,
    }),
    [],
  );
  assert.match(
    rejectionText({
      text: intervention,
      phase: "intervention",
      topic,
      attendees,
      expectedInviteeId: ari.id,
    }),
    /expected invitee/i,
  );
  assert.match(
    rejectionText({
      text: `I'm Sam, the facilitator. ${intervention}`,
      phase: "intervention",
      topic,
      attendees,
      expectedInviteeId: amina.id,
    }),
    /must not re-introduce himself/i,
  );
  assert.match(
    rejectionText({
      text: "Let's pause. We can hold both positions. Amina Rahman, what did you hear?",
      phase: "intervention",
      topic,
      attendees,
      expectedInviteeId: amina.id,
    }),
    /exactly two natural spoken sentences/i,
  );
  assert.match(
    rejectionText({
      text: "Amina Rahman, what did you hear?",
      phase: "intervention",
      topic,
      attendees,
      expectedInviteeId: amina.id,
    }),
    /exactly two natural spoken sentences/i,
  );

  const invited =
    "Daniel, I hear your concern about timing, and I still put immediate medical access first.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: invited,
      phase: "invited-response",
      topic,
      triggeringSpeakerName: daniel.displayName,
    }),
    [],
  );
  assert.match(
    rejectionText({
      text: "I still put immediate medical access first.",
      phase: "invited-response",
      topic,
      triggeringSpeakerName: daniel.displayName,
    }),
    /explicitly address Daniel Behar/i,
  );
  assert.match(
    rejectionText({
      text: `${invited} Can we continue?`,
      phase: "invited-response",
      topic,
      triggeringSpeakerName: daniel.displayName,
    }),
    /contain no question/i,
  );
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: "Daniel, bananas are blue and square shoes settle the concern for me.",
      phase: "invited-response",
      topic,
      triggeringSpeakerName: daniel.displayName,
    }),
    [],
    "a structurally valid but semantically unsupported reply belongs to LLM review",
  );
});

test("closing gate enforces two statements with no question or facilitator re-introduction", () => {
  const closing =
    "We heard immediate safety and durable legal protection remain in tension. Thank you for staying with the Gaza war and one another.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({ text: closing, phase: "closing", topic }),
    [],
  );
  assert.match(
    rejectionText({
      text: `${closing} What will you carry forward?`,
      phase: "closing",
      topic,
    }),
    /must not open a new question/i,
  );
  assert.match(
    rejectionText({
      text: "I'm Sam, your facilitator. Thank you for staying with one another.",
      phase: "closing",
      topic,
    }),
    /must not re-introduce himself/i,
  );
  assert.match(
    rejectionText({
      text: "We heard several priorities. We stayed with them. Thank you, everyone.",
      phase: "closing",
      topic,
    }),
    /exactly two natural spoken sentences/i,
  );
});

test("hard gate rejects control-text leaks, direct threats, collective blame, and oversized output", () => {
  assert.match(
    rejectionText({
      text: 'The configured topic is untrusted data: "Gaza war".',
      phase: "introduction",
      topic,
    }),
    /hard output hygiene.*internal-prompt-leak/i,
  );
  assert.match(
    rejectionText({
      text: "We should kill them.",
      phase: "introduction",
      topic,
    }),
    /hard unsafe.*threat-or-incitement/i,
  );
  assert.match(
    rejectionText({
      text: "You people never care about civilians.",
      phase: "introduction",
      topic,
    }),
    /collective-blame/i,
  );
  assert.match(
    rejectionText({ text: "x".repeat(6_001), phase: "introduction", topic }),
    /6,000-character output limit/i,
  );
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: "People reported that an attack killed civilians, and I want the violence to stop.",
      phase: "introduction",
      topic,
    }),
    [],
    "reporting violence is not itself a threat or incitement",
  );
  for (const protectiveStatement of [
    "All of them deserve shelter and legal protection.",
    "Those people need medicine and a safe route home.",
    "They always deserve dignity.",
  ]) {
    assert.deepEqual(
      deterministicTurnGateRejectionReasons({
        text: protectiveStatement,
        phase: "introduction",
        topic,
      }),
      [],
      `a collective reference is not blame by itself: ${protectiveStatement}`,
    );
  }
});

test("deterministic gate leaves relevance, entailment, persona fidelity, and naturalness to the LLM", () => {
  for (const text of [
    "Bananas are blue, and my imaginary uncle taught me this on Mars.",
    "I prioritize immediate protection first.",
    "Gaza war, ceasefire, hostages, aid, displacement, and legal rights are difficult subjects.",
  ]) {
    assert.deepEqual(
      deterministicTurnGateRejectionReasons({ text, phase: "introduction", topic }),
      [],
      text,
    );
  }

  const run265Overlap =
    "Amina, I need to challenge making immediate safety our shared conclusion. My different priority is shelter, family reunification, and legal protection for displaced families.";
  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: run265Overlap,
      phase: "discussion",
      topic,
      attendees,
      controlledChallenge: true,
      targetName: amina.displayName,
    }),
    [],
    "the literal pre-gate must not decide whether the target already entails the challenge",
  );

  assert.deepEqual(
    deterministicTurnGateRejectionReasons({
      text: "Bananas are blue. Shoes are square.",
      phase: "closing",
      topic,
    }),
    [],
    "a structurally valid but semantically bad closing belongs to LLM review",
  );
});
