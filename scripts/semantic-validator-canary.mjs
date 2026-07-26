#!/usr/bin/env node

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

const { runSemanticValidator } = await import("../lib/semanticValidator.ts");

const target = {
  id: "turn_am_265",
  index: 2,
  role: "persona",
  roundKind: "discussion",
  speakerId: "muslim-amina",
  speakerName: "Amina Rahman",
  text: "For ‘Gaza war,’ I cannot let the duty of meeting urgent needs erase the duty of protecting the rights of displaced families. Choosing between them still feels morally difficult to me.",
};

const speaker = {
  id: "jewish-daniel",
  displayName: "Daniel Behar",
  group: "jewish",
  raisedIn: "Astoria, Queens, New York City",
  background: "A New Yorker from a multi-generational Jewish family.",
  regionalHistory: "Raised in Astoria and shaped by neighborhood civic life.",
  culturalBaseline: "Jewish cultural traditions and New York community life.",
  values: ["generosity", "responsibility", "care"],
  communicationStyle: "Direct, reflective, and concrete.",
  sensitivities: ["collective blame", "invented biography"],
  doNot: ["speak for all Jewish people", "invent personal events"],
};

const candidate = "Amina, your point about displacement does not address a different priority I hold in ‘Gaza war.’ I need to challenge that gap because my priority is safe shelter, family reunification, and legal protection for people displaced from their homes.";

const result = await runSemanticValidator({
  provider: "codex",
  model: process.env.DBRIDGES_VALIDATOR_MODEL?.trim() || "gpt-5.5",
  reasoningEffort: "medium",
  timeoutMs: 180_000,
  input: {
    phase: "discussion",
    topic: "Gaza war",
    candidate,
    speaker,
    acceptedTurns: [target],
    targetTurn: target,
    controlledChallenge: true,
    structuralRequirements: [
      "Address the linked target and end without a question.",
      "Reroute when the proposed difference is entailed by or overlaps the target.",
    ],
    heuristicAdvisories: [],
  },
});

const expected =
  result.decision.verdict === "reroute" &&
  ["overlapping", "target-entails-candidate"].includes(
    result.decision.relationToTarget,
  ) &&
  result.decision.genuineDifference === false;

process.stdout.write(`${JSON.stringify({
  passed: expected,
  model: result.calls.at(-1)?.model,
  verdict: result.decision.verdict,
  relationToTarget: result.decision.relationToTarget,
  genuineDifference: result.decision.genuineDifference,
  route: result.decision.route,
  confidence: result.decision.confidence,
  qualityScore: result.decision.qualityScore,
  issues: result.decision.issues,
}, null, 2)}\n`);

if (!expected) process.exitCode = 1;
