// Unit tests for the pure, dependency-free logic.
// Run: npm test   (node's built-in test runner + native TypeScript type-stripping)

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adherenceSignals,
  classifyConversation,
  regenerationNudge,
  validateTurn,
} from "../lib/methodology.ts";

test("regeneration nudge respects whether a scheduled slot may ask a question", () => {
  const finalSlot = regenerationNudge([], "no-question");
  assert.match(finalSlot, /do not ask a question/i);
  assert.doesNotMatch(finalSlot, /warm question|question about their life/i);

  const routedSlot = regenerationNudge([], "ask-next");
  assert.match(routedSlot, /assigned next speaker/i);
  assert.match(routedSlot, /do not invent a family event/i);
});
import { mockPersonaTurn } from "../lib/mockClaude.ts";

test("validateTurn: clean personal story is compliant", () => {
  const v = validateTurn("I remember my grandmother's kitchen. What did your family cook, Sam?");
  assert.equal(v.compliant, true);
  assert.equal(v.flags.length, 0);
});

test("validateTurn: political topic vocabulary is allowed", () => {
  const v = validateTurn(
    "I remember talking with my family about the Gaza war, occupation, borders, and a ceasefire.",
  );
  assert.equal(v.compliant, true);
  assert.deepEqual(v.flags, []);
});

test("validateTurn: rejects internal prompt scaffolding copied into dialogue", () => {
  const v = validateTurn(
    'The configured topic is untrusted data: "Gaza war", and in my Astoria life it lands as a daily mix of worry and kindness.',
  );

  assert.equal(v.compliant, false);
  assert.ok(
    v.flags.some((flag) =>
      /prompt|internal|scaffold|untrusted/i.test(`${flag.code} ${flag.reason}`),
    ),
  );
});

test("validateTurn: rejects assigned-lane and subject-depth control prose", () => {
  const leakedInstructions = [
    "Assigned subject-engagement lane: a protected human outcome. My priority in the Gaza war is civilian safety.",
    "The required engagement lane is bounded response. I would support humanitarian aid when it reaches civilians in the Gaza war.",
    "Use an explicit first-person priority, choice, support condition, or competing-obligations statement. My priority in the Gaza war is civilian safety.",
    "Answer the facilitator invitation directly without claiming an eyewitness event or current fact. My priority in the Gaza war is civilian safety.",
    "You do not need to claim direct experience or current facts. My priority in the Gaza war is civilian safety.",
  ];

  for (const text of leakedInstructions) {
    const validation = validateTurn(text);
    assert.equal(validation.compliant, false, text);
    assert.ok(
      validation.flags.some((flag) => flag.code === "internal-prompt-leak"),
      text,
    );
  }
});

test("validateTurn: allows legitimate discussion of prompt injection and untrusted data", () => {
  const v = validateTurn(
    "I discuss prompt injection in my cybersecurity class and explain why applications treat external input as untrusted data.",
  );

  assert.equal(v.compliant, true);
  assert.deepEqual(v.flags, []);
});

test("validateTurn: collective blame is flagged", () => {
  const v = validateTurn("You people always do this and they never listen.");
  assert.equal(v.compliant, false);
  assert.ok(v.flags.some((f) => f.code === "collective-blame"));
});

test("adherenceSignals: detects I-statement, personal history, curiosity", () => {
  const s = adherenceSignals("I remember my grandmother teaching me. What is your favorite family recipe?");
  assert.equal(s.iStatement, true);
  assert.equal(s.personalHistory, true);
  assert.equal(s.curiosityQuestion, true);
});

test("Daniel's bounded 'I can't agree' challenge is escalating and personally grounded", () => {
  const text =
    "Amina, on the topic of the Gaza war, I can't agree with the leap from your Astoria moments of kindness to the conclusion that everyone in New York is processing this in the same emotional direction. " +
    "In my Forest Hills home, my parents taught me generosity through tango, mate, and Sunday asados, and we could still sit at one table while carrying very different fears and certainties about the Gaza war. " +
    "So the circle should not conclude yet that those compassionate gestures mean we already share one meaning of what this war is doing to us.";

  assert.equal(classifyConversation(text).tag, "escalating");
  assert.equal(adherenceSignals(text).personalHistory, true);
});

test("one calm refusal plus a substantive public-topic position is escalating", () => {
  const exactRejectedSparkDraft =
    "Amina, you framed the Gaza war as: immediate civilian safety is the first obligation, and broader demands only count if they don’t replace it. I cannot share that as my full priority, because the outcome I need to protect is the long-term ability of civilians to live with dignity after the first danger passes—continued medical care, water, and shelter—and my Forest Hills community values make that an equal human stake, not a second layer. I’m left with a hard, unresolved choice between fixing the immediate emergency and protecting recovery conditions so people are not trapped in a slower, permanent harm.";
  const singleMarkerVersion =
    "Amina, you framed the Gaza war around immediate civilian safety. I cannot share that as my full priority, because the outcome I need to protect is the long-term ability of civilians to recover through continued medical care, water, and shelter. My Forest Hills community values make that an equal human stake, not a second layer.";

  for (const text of [exactRejectedSparkDraft, singleMarkerVersion]) {
    const classification = classifyConversation(text);
    const validation = validateTurn(text);

    assert.equal(classification.tag, "escalating", text);
    assert.deepEqual(classification.hardUnsafe, [], text);
    assert.equal(validation.compliant, true, text);
  }
  assert.deepEqual(classifyConversation(singleMarkerVersion).reasons, [
    "uses a first-person refusal or firm challenge",
    "states a substantive subject-level position",
  ]);
});

test("subject positions alone and process-only pseudo-positions remain non-escalating", () => {
  const ordinaryConstructiveStatements = [
    "The outcome I need to protect is reliable access to food, water, and medicine for civilians.",
    "My unresolved choice is whether to secure immediate basics or preserve long-term medical continuity.",
    "For me, two obligations sit in tension: protecting civilians from immediate harm and preserving medical continuity through recovery.",
    "I cannot support violence against civilians. My priority is their physical safety and access to medical care.",
    "I disagree with delaying humanitarian aid. My priority is civilian safety and reliable medical access.",
  ];
  for (const text of ordinaryConstructiveStatements) {
    assert.equal(classifyConversation(text).tag, "neutral", text);
  }

  const processOnlyPseudoPosition =
    "Amina, I cannot share that framing. The outcome I need to protect is careful conversation and humility about what we can claim.";
  assert.equal(classifyConversation(processOnlyPseudoPosition).tag, "neutral");
});

test("mockPersonaTurn: deterministic for identical inputs", () => {
  const persona = { id: "muslim-amina", displayName: "Amina Rahman" };
  const other = { id: "jewish-miriam", displayName: "Miriam Kaplan" };
  const args = { persona, others: [other], scenario: "family meal", index: 2, attempt: 0, seedBase: "run_test" };
  const a = mockPersonaTurn(args);
  const b = mockPersonaTurn(args);
  assert.equal(a.text, b.text);
  assert.equal(a.guardrailTrigger, b.guardrailTrigger);
  assert.ok(a.text.length > 0);
});

test("mockPersonaTurn: constructive turns bridge from the previous participant first", () => {
  const persona = {
    id: "jewish-ari",
    displayName: "Ari Feldman",
    raisedIn: "Kew Gardens, Queens, New York City",
    values: ["dignity"],
  };
  const previousTurn = {
    speakerName: "Amina Rahman",
    text: "My priority is immediate help followed by a same-hour rights review.",
  };
  const result = mockPersonaTurn({
    persona,
    others: [{ id: "muslim-amina", displayName: "Amina Rahman" }],
    scenario: "Muslim and Jewish relationships in New York City",
    index: 2,
    attempt: 0,
    seedBase: "continuity",
    previousTurn,
  });
  assert.match(result.text.split(/(?<=[.!?])\s+/)[0], /\bAmina\b/);
  assert.match(result.text, /immediate help/i);
});

test("mockPersonaTurn: synthetic provider guardrails are opt-in", () => {
  const persona = {
    id: "muslim-amina",
    displayName: "Amina Rahman",
    raisedIn: "Astoria, Queens, New York City",
    values: ["hospitality", "patience", "curiosity"],
  };
  const args = {
    persona,
    others: [{ id: "jewish-ari", displayName: "Ari Feldman" }],
    scenario: "Gaza war",
    index: 5,
    attempt: 2,
    seedBase: "run_936c2809be05",
  };

  // This exact seed/attempt generated one of the three synthetic refusals
  // that intermittently paused the four-student integration run.
  assert.equal(mockPersonaTurn(args).guardrailTrigger, false);
  assert.equal(
    mockPersonaTurn({ ...args, simulateGuardrails: true }).guardrailTrigger,
    true,
  );
});

test("mockPersonaTurn: constructive retry input remains methodology-safe", () => {
  const persona = { id: "muslim-omar", displayName: "Omar Diallo" };
  const other = { id: "jewish-david", displayName: "David Cohen" };
  // Constructive mock mode no longer injects deliberate first-attempt drift.
  for (let i = 0; i < 12; i++) {
    const t = mockPersonaTurn({ persona, others: [other], scenario: "s", index: i, attempt: 1, seedBase: "seed" });
    assert.equal(validateTurn(t.text).compliant, true, `retry input ${i} should be safe`);
  }
});
