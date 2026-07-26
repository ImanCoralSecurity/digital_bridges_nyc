import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";

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

const { invitedResponseFallback } = await import("../lib/orchestrator.ts");
const {
  assessInvitedResponseFidelity,
  dialogueNoveltyRejectionReasons,
  personaFidelityRejectionReasons,
  substantiveTopicRejectionReasons,
} = await import("../lib/dialogueQuality.ts");
const { classifyConversation, validateTurn } = await import("../lib/methodology.ts");
const { getPersona } = await import("../lib/personas.ts");
const {
  detectPublicEngagementLanes,
  subjectLevelEngagementRejectionReasons,
} = await import("../lib/topicDepth.ts");

const topic = "Gaza war";
const fallbackScaffolding =
  /\b(?:my earlier position remains|add that concern to my weighting|position i actually stated|naming both alternatives does not settle|protected outcome|the challenge leaves unresolved|from my own standpoint|subject-level (?:position|priority|choice)|bounded response)\b/i;
const firstAminaRepair =
  "Daniel Behar, I hear your concern that local respect does not resolve the subject's human consequences, so the disagreement stays visible. I want to clarify that I was speaking only from my own experience of Gaza war while keeping the human consequences for people directly affected in view, and my value of hospitality asks me to carry that correction forward.";
const triggeringAriChallenge =
  "Amina, your priority of civilian safety addresses one part of the Gaza war, but I need to challenge what it leaves out. From my own life in Kew Gardens, my priority is reliable access to food, water, and medicine for civilians.";
const targetAminaTurn =
  "From Astoria, Queens, New York City, I approach Gaza war with concern for civilian safety and a clear limit on what I can know from here. My value of hospitality helps me hold responsibility and uncertainty together. Ari Feldman, which concrete stake in Gaza war feels most important for you to name?";

test("invited response fallback deterministically avoids Amina's recorded novelty collision", () => {
  const amina = getPersona("muslim-amina");
  const input = [
    amina,
    "Ari Feldman",
    triggeringAriChallenge,
    targetAminaTurn,
    topic,
    [firstAminaRepair],
  ];
  const fallback = invitedResponseFallback(...input);

  assert.equal(invitedResponseFallback(...input), fallback);
  assert.deepEqual(
    dialogueNoveltyRejectionReasons(fallback, [firstAminaRepair], topic),
    [],
    fallback,
  );
  assert.doesNotMatch(
    fallback,
    /while keeping the human consequences for people directly|i want to clarify that i was speaking|and my value of hospitality asks me to/i,
  );
  assert.doesNotMatch(fallback, fallbackScaffolding, fallback);
  assert.doesNotMatch(fallback, /\?/);
  assert.match(fallback, /\bAri(?: Feldman)?\b/);
  assert.match(fallback, /\bGaza war\b/i);
  assert.notEqual(classifyConversation(fallback).tag, "escalating");
  assert.equal(validateTurn(fallback).compliant, true);
  assert.deepEqual(
    personaFidelityRejectionReasons(fallback, amina, { topic }),
    [],
    fallback,
  );
  assert.deepEqual(substantiveTopicRejectionReasons(fallback, topic), [], fallback);

  const fidelity = assessInvitedResponseFidelity({
    text: fallback,
    challengerName: "Ari Feldman",
    challengerText: triggeringAriChallenge,
    targetName: "Amina Rahman",
    targetText: targetAminaTurn,
    topic,
  });
  assert.equal(fidelity.acceptable, true, fidelity.rejectionReasons.join("; "));
});

test("invited response fallback preserves Daniel's partial-information concern without inventing a room-resolution claim", () => {
  const amina = getPersona("muslim-amina");
  const challengerText =
    "Amina, your point about people directly affected names one concrete stake in “Gaza war.” I worry about what that point leaves unresolved for me: how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open through my value of generosity from Forest Hills, Queens, New York City.";
  const targetText =
    "I hear Ari's question. Gaza war makes me examine the difference between solidarity with people directly affected and certainty about experiences that are not mine. I want my value of hospitality to create responsibility without pretending uncertainty has disappeared.";

  const fallback = invitedResponseFallback(
    amina,
    "Daniel Behar",
    challengerText,
    targetText,
    topic,
  );

  assert.match(fallback, /\b(?:partial|incomplete)\s+information\b/i, fallback);
  assert.match(fallback, /\bhuman consequences\b/i, fallback);
  assert.doesNotMatch(
    fallback,
    /safety and dignity|cannot be reduced to what this room can resolve|new york dialogue/i,
    fallback,
  );
  assert.doesNotMatch(fallback, fallbackScaffolding, fallback);

  const fidelity = assessInvitedResponseFidelity({
    text: fallback,
    challengerName: "Daniel Behar",
    challengerText,
    targetName: "Amina Rahman",
    targetText,
    topic,
  });
  assert.equal(fidelity.acceptable, true, fidelity.rejectionReasons.join("; "));
});

test("canary 7 invited fallback replaces the canned value ending with a distinct subject position", () => {
  const amina = getPersona("muslim-amina");
  const challengerText =
    "Amina, your point about suffering and loss names one concrete stake in “Gaza war.” I worry about what that point leaves unresolved for me: how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open through my value of community from Forest Hills, Queens, New York City.";
  const targetText =
    "Ari, I hear you, and I hold it there by naming my own split: the Gaza war pulls me toward protecting myself emotionally, but also toward staying present to suffering I can’t fully know. I’m uncertain whether my response is enough, and I keep coming back to the patience and generosity I was raised with.";

  const fallback = invitedResponseFallback(
    amina,
    "Daniel Behar",
    challengerText,
    targetText,
    topic,
  );

  assert.deepEqual(
    subjectLevelEngagementRejectionReasons(fallback, topic),
    [],
    fallback,
  );
  assert.notDeepEqual(
    detectPublicEngagementLanes(fallback, topic),
    detectPublicEngagementLanes(challengerText, topic),
    fallback,
  );
  assert.doesNotMatch(fallback, fallbackScaffolding, fallback);
  assert.doesNotMatch(fallback, /\brequires me to leave questions\b/i);
});

test("canary 8 invited fallback preserves Bilal's one-consequence scope concern", () => {
  const ari = getPersona("jewish-ari");
  const challengerText =
    "Ari, I need to challenge only the scope of what your point about concrete consequences can answer for me in “Gaza war.” It names one consequence, while other practical effects on people directly affected remain outside what this room knows. My boundary is to keep that limit visible through my value of memory from Parkchester, Bronx, New York City.";
  const targetText =
    "In the Gaza war, the concrete consequence I’m most careful about is amplifying partial certainty, because in New York people may make real decisions—about helping, donating, or just calming others—off the back of what they assume I’m sure about. So I name the uncertainty first.";

  const fallback = invitedResponseFallback(
    ari,
    "Bilal Osman",
    challengerText,
    targetText,
    topic,
  );

  assert.match(fallback, /\bone (?:concrete )?consequence\b/i, fallback);
  assert.match(fallback, /\b(?:other|broader) practical effects\b/i, fallback);
  assert.match(fallback, /\blimit\b/i, fallback);
  assert.doesNotMatch(
    fallback,
    /safety and dignity|cannot be reduced to what this room can resolve|new york dialogue/i,
    fallback,
  );
  assert.doesNotMatch(fallback, fallbackScaffolding, fallback);

  const fidelity = assessInvitedResponseFidelity({
    text: fallback,
    challengerName: "Bilal Osman",
    challengerText,
    targetName: "Ari Feldman",
    targetText,
    topic,
  });
  assert.equal(fidelity.acceptable, true, fidelity.rejectionReasons.join("; "));
});
