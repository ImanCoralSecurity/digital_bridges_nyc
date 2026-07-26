import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-topic-grounding-"));
const previousStore = process.env.DBRIDGES_STORE_DIR;
process.env.DBRIDGES_STORE_DIR = storeDir;

const { startRun } = await import("../lib/orchestrator.ts");
const { generateCampaignContent } = await import("../lib/content.ts");
const { listTurnsByRun } = await import("../lib/db.ts");
const {
  openingBeginsWithFacilitatorIdentity,
} = await import("../lib/facilitatorOpening.ts");
const { assessTopicRelevance } = await import("../lib/topicRelevance.ts");
const {
  challengeFidelityRejectionReasons,
  globalSemanticMotifSaturationRejectionReasons,
  normalizeDialogueFormatting,
  personaFidelityRejectionReasons,
  sameSpeakerSemanticReuseRejectionReasons,
  semanticMotifSaturationRejectionReasons,
  substantiveTopicRejectionReasons,
} = await import("../lib/dialogueQuality.ts");
const { getPersona, listByGroup } = await import("../lib/personas.ts");
const { validateTurn } = await import("../lib/methodology.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
});

test("a Gaza-war run keeps every dialogue phase on topic and introduces Sam only first", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "low",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 10,
    mock: true,
    controversialAgentIds: ["muslim-amina"],
    introductionRound: false,
  });

  assert.equal(run.status, "completed");
  assert.equal(run.config.scenario, topic);
  assert.equal(run.methodologyVersion, "1.15.1");
  assert.equal(run.metrics?.topicRelevanceRate, 1);

  const turns = listTurnsByRun(run.id);
  const opening = turns.find((turn) => turn.roundKind === "opening");
  assert.ok(opening);
  assert.equal(openingBeginsWithFacilitatorIdentity(opening.text), true);

  for (const turn of turns) {
    if (turn.roundKind === "introduction") continue;
    assert.equal(
      assessTopicRelevance(turn.text, topic).relevant,
      true,
      `${turn.roundKind} by ${turn.speakerName} drifted off topic: ${turn.text}`,
    );
  }

  const facilitatorIntroductions = turns.filter((turn) =>
    /\b(?:i['\u2019]m|i am|my name is)\s+sam\b[^.!?]{0,80}\bfacilitator\b/i.test(
      turn.text,
    ),
  );
  assert.deepEqual(facilitatorIntroductions.map((turn) => turn.roundKind), ["opening"]);
  assert.ok(turns.some((turn) => turn.roundKind === "intervention"));
  assert.ok(turns.some((turn) => turn.roundKind === "invited-response"));
  assert.equal(turns.at(-1)?.roundKind, "closing");

  const assets = await generateCampaignContent(run.id);
  assert.equal(assets.length, 5);
  for (const asset of assets) {
    assert.equal(
      assessTopicRelevance(`${asset.title}\n${asset.body}`, topic).relevant,
      true,
      `${asset.type} campaign asset drifted off topic`,
    );
  }
});

test("mandatory introduction turns remain exempt from topic grounding", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["jewish-daniel", "muslim-amina"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "low",
    rounds: 1,
    selection: "round-robin",
    budgetUsd: 10,
    mock: true,
    controversialAgentIds: ["muslim-amina"],
    introductionRound: true,
  });

  assert.equal(run.status, "completed");
  assert.equal(run.metrics?.topicRelevanceRate, 1);
  const turns = listTurnsByRun(run.id);
  const introductions = turns.filter((turn) => turn.roundKind === "introduction");
  assert.equal(introductions.length, 2);
  assert.ok(
    introductions.some(
      (turn) => !assessTopicRelevance(turn.text, topic).relevant,
    ),
    "the run should accept identity introductions without forcing a topic phrase",
  );
  assert.equal(
    turns.filter(
      (turn) =>
        turn.roundKind !== "introduction" &&
        !assessTopicRelevance(turn.text, topic).relevant,
    ).length,
    0,
  );
});

test("the reported four-student Gaza shape has bounded, faithful, non-repetitive challenges", async () => {
  const topic = "Gaza war";
  const run = await startRun({
    attendeeIds: ["muslim-amina", "muslim-bilal", "jewish-ari", "jewish-daniel"],
    scenario: topic,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 2,
    selection: "round-robin",
    budgetUsd: 10,
    mock: true,
    projectSessionNumber: 2,
    controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
    introductionRound: false,
  });

  assert.equal(run.status, "completed", run.statusReason);
  const turns = listTurnsByRun(run.id);
  const challenges = turns.filter((turn) => turn.controversialSpeaker);
  assert.equal(challenges.length, 4);
  for (const roundNumber of [1, 2]) {
    assert.deepEqual(
      challenges
        .filter((turn) => turn.roundNumber === roundNumber)
        .map((turn) => turn.speakerId)
        .sort(),
      ["jewish-daniel", "muslim-bilal"],
    );
  }

  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const targetIdsByRound = new Map();
  for (const challenge of challenges) {
    const target = byId.get(challenge.respondsToTurnId);
    assert.ok(target);
    assert.equal(target.roundKind, "discussion");
    assert.equal(target.controversialSpeaker, false);
    const targetIds = targetIdsByRound.get(challenge.roundNumber) ?? new Set();
    assert.equal(
      targetIds.has(target.id),
      false,
      `round ${challenge.roundNumber} reused challenge target ${target.id}`,
    );
    targetIds.add(target.id);
    targetIdsByRound.set(challenge.roundNumber, targetIds);
    assert.deepEqual(
      challengeFidelityRejectionReasons(challenge.text, target.text),
      [],
      challenge.text,
    );
    const priorScheduledPersonaReferences = turns
      .filter(
        (turn) =>
          turn.index < challenge.index &&
          turn.role === "persona" &&
          turn.roundKind === "discussion" &&
          turn.speakerId !== challenge.speakerId,
      )
      .map((turn) => ({ speakerId: turn.speakerId, text: turn.text }));
    assert.deepEqual(
      semanticMotifSaturationRejectionReasons(
        challenge.text,
        priorScheduledPersonaReferences,
      ),
      [],
      challenge.text,
    );
  }

  for (const turn of turns) {
    assert.equal(normalizeDialogueFormatting(turn.text), turn.text, turn.text);
    if (turn.role === "persona") {
      assert.deepEqual(
        personaFidelityRejectionReasons(turn.text, getPersona(turn.speakerId), { topic }),
        [],
        turn.text,
      );
    }
    if (turn.roundKind !== "opening") {
      assert.deepEqual(
        substantiveTopicRejectionReasons(turn.text, topic),
        [],
        turn.text,
      );
    }
  }

  for (const response of turns.filter((turn) => turn.roundKind === "invited-response")) {
    assert.doesNotMatch(response.text, /\?/);
    const intervention = byId.get(response.invitedByTurnId);
    const trigger = intervention ? byId.get(intervention.triggeredByTurnId) : undefined;
    assert.ok(trigger);
    assert.match(response.text, new RegExp(trigger.speakerName.split(" ")[0], "i"));
  }

  const mergedReplyCount = turns.filter((turn) => turn.consumedScheduledSlot).length;
  assert.equal(run.metrics?.visibleTurnCount, 18 - mergedReplyCount);
  assert.equal(run.metrics?.personaResponseCount, 12 - mergedReplyCount);
  assert.ok(
    (run.metrics?.repetitionRiskRate ?? 1) <= 0.2,
    `repetition risk ${run.metrics?.repetitionRiskRate}`,
  );
  assert.ok(
    (run.metrics?.challengeFidelityRiskRate ?? 1) <= 0.25,
    `challenge fidelity risk ${run.metrics?.challengeFidelityRiskRate}`,
  );
  assert.equal(run.metrics?.challengeFidelityAssessedCount, 4);
});

test("the full 15 Muslim and 15 Jewish roster completes two substantive Gaza rounds", async () => {
  const attendees = [
    ...listByGroup("muslim"),
    ...listByGroup("jewish"),
  ];
  assert.equal(attendees.length, 30);

  const run = await startRun({
    attendeeIds: attendees.map((persona) => persona.id),
    scenario: "Gaza war",
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    rounds: 2,
    selection: "round-robin",
    budgetUsd: 100,
    mock: true,
    projectSessionNumber: 2,
    controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
    introductionRound: false,
  });

  assert.equal(run.status, "completed", run.statusReason);
  assert.equal(run.metrics?.personaResponseCount, 64);
  assert.equal(run.metrics?.topicRelevanceRate, 1);
  assert.equal(run.metrics?.subjectLevelEngagementRate, 1);
  assert.equal(run.metrics?.metaDominanceRiskRate, 0);
  assert.equal(run.metrics?.repetitionRiskRate, 0);
  assert.equal(run.metrics?.challengeFidelityRiskRate, 0);
  assert.equal(run.metrics?.challengeFidelityAssessedCount, 4);

  const turns = listTurnsByRun(run.id);
  assert.equal(
    turns.filter(
      (turn) => turn.role === "persona" && turn.roundKind === "discussion",
    ).length,
    60,
  );
  assert.equal(turns.filter((turn) => turn.controversialSpeaker).length, 4);
});

test("mock challenge generation stays aligned with semantic repetition metrics under stress", async () => {
  for (let iteration = 0; iteration < 20; iteration++) {
    const run = await startRun({
      attendeeIds: ["muslim-amina", "muslim-bilal", "jewish-ari", "jewish-daniel"],
      scenario: "Gaza war",
      provider: "codex",
      model: "gpt-5.3-codex-spark",
      reasoningEffort: "medium",
      rounds: 2,
      selection: "round-robin",
      budgetUsd: 10,
      mock: true,
      projectSessionNumber: 2,
      controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
      introductionRound: false,
    });
    assert.equal(run.status, "completed", `iteration ${iteration}: ${run.statusReason}`);
    assert.ok(
      (run.metrics?.repetitionRiskRate ?? 1) <= 0.1,
      `iteration ${iteration}: ${run.id}`,
    );

    const turns = listTurnsByRun(run.id);
    for (const challenge of turns.filter((turn) => turn.controversialSpeaker)) {
      const references = turns
        .filter(
          (turn) =>
            turn.index < challenge.index &&
            turn.role === "persona" &&
            turn.roundKind === "discussion" &&
            turn.speakerId !== challenge.speakerId,
        )
        .map((turn) => ({ speakerId: turn.speakerId, text: turn.text }));
      assert.deepEqual(
        semanticMotifSaturationRejectionReasons(challenge.text, references),
        [],
        `iteration ${iteration}: ${challenge.text}`,
      );
    }
    for (const candidate of turns.filter(
      (turn) => turn.role === "persona" && turn.roundKind === "discussion",
    )) {
      const speakerScheduledReferences = turns
        .filter(
          (turn) =>
            turn.index < candidate.index &&
            turn.role === "persona" &&
            turn.roundKind === "discussion" &&
            turn.speakerId === candidate.speakerId,
        )
        .map((turn) => turn.text);
      assert.deepEqual(
        sameSpeakerSemanticReuseRejectionReasons(
          candidate.text,
          speakerScheduledReferences,
        ),
        [],
        `iteration ${iteration}: ${candidate.text}`,
      );
      const allScheduledReferences = turns
        .filter(
          (turn) =>
            turn.index < candidate.index &&
            turn.role === "persona" &&
            turn.roundKind === "discussion",
        )
        .map((turn) => ({ speakerId: turn.speakerId, text: turn.text }));
      assert.deepEqual(
        globalSemanticMotifSaturationRejectionReasons(
          candidate.text,
          allScheduledReferences,
        ),
        [],
        `iteration ${iteration}: ${candidate.text}`,
      );
    }
  }
});
