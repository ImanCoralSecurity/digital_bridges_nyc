import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-evaluation-quality-"));
const fakeCodex = join(tempDir, "codex");
const judgeLog = join(tempDir, "judge-input.txt");
const previousEnv = {
  path: process.env.PATH,
  log: process.env.FAKE_EVALUATION_JUDGE_LOG,
};

writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
fs.writeFileSync(process.env.FAKE_EVALUATION_JUDGE_LOG, input);
const text = JSON.stringify({
  syntheticEmpathy: 0.62,
  adherence: 0.71,
  rationale: "The facilitator and participants stayed relevant, though some repair language remained repetitive."
});
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "fake-evaluation-thread" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 10 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);
process.env.PATH = `${tempDir}:${previousEnv.path ?? ""}`;
process.env.FAKE_EVALUATION_JUDGE_LOG = judgeLog;

const {
  challengeFidelityRiskReasons,
  computeMetrics,
  evaluationTurnSignals,
  hasExcessiveRepetitionRisk,
  runJudge,
} = await import("../lib/evaluation.ts");
const { getPersona } = await import("../lib/personas.ts");

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("PATH", previousEnv.path);
  restoreEnv("FAKE_EVALUATION_JUDGE_LOG", previousEnv.log);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function turn(id, index, text, overrides = {}) {
  return {
    id,
    runId: "run_evaluation_quality",
    index,
    role: "persona",
    speakerId: `speaker_${index}`,
    speakerName: `Speaker ${index}`,
    speakerGroup: index % 2 ? "muslim" : "jewish",
    text,
    compliant: true,
    flags: [],
    // Deliberately stale to prove metrics recompute signals from visible text.
    signals: {
      iStatement: false,
      personalHistory: false,
      curiosityQuestion: false,
    },
    guardrailTrigger: false,
    regenerations: 0,
    costUsd: 0,
    costAvailable: false,
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    mock: false,
    generationSource: "provider",
    promptHash: `hash_${index}`,
    conversationTag: "neutral",
    roundNumber: 1,
    roundKind: "discussion",
    controversialSpeaker: false,
    createdAt: `2026-07-19T22:00:${String(index).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

const judgeResult = {
  syntheticEmpathy: 0.62,
  adherence: 0.71,
  rationale: "Evaluation fixture.",
  costUsd: 0,
  costAvailable: false,
};

test("evaluation signals recognize contractions and self-owned kinship without borrowing another speaker's history", () => {
  assert.deepEqual(
    evaluationTurnSignals("What I've found helpful comes from my granddad's advice."),
    { iStatement: true, personalHistory: true, curiosityQuestion: false },
  );
  assert.deepEqual(
    evaluationTurnSignals("I'm practicing the patience my aunt modeled. What helps you listen?"),
    { iStatement: true, personalHistory: true, curiosityQuestion: true },
  );
  assert.equal(
    evaluationTurnSignals("I hear what your grandmother carried through poetry.").personalHistory,
    false,
  );
});

test("metrics distinguish visible turns from persona responses and use a curiosity-eligible denominator", () => {
  const opening = turn(
    "opening",
    0,
    "I'm Sam, your facilitator. Today's topic is: “Gaza war”. Welcome, everyone. Our three shared agreements are: speak only from our own lives, stay curious rather than persuasive, and assume good faith. For our first go-round on today's topic, name one human outcome you would protect or one hard choice within the subject, and explain the value behind it.",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "opening",
      roundNumber: undefined,
    },
  );
  const constructive = turn(
    "constructive",
    1,
    "I've discussed the Gaza war with my aunt. My first priority is the safe return of hostages. What has your family talked about?",
  );
  const challenge = turn(
    "challenge",
    2,
    "Speaker 1, I hear your priority of the safe return of hostages. I need to challenge the omission of reliable humanitarian aid: my first priority is food, water, and medicine reaching civilians. My granddad taught me that survival cannot be an afterthought.",
    {
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: constructive.id,
    },
  );
  const intervention = turn(
    "intervention",
    3,
    "Let's pause with Speaker 2's challenge about the omitted access to humanitarian aid in Gaza war. Speaker 1, in your own words, what concern about humanitarian aid did Speaker 2 raise?",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "intervention",
      conversationTag: "deescalating",
      triggeredByTurnId: challenge.id,
      invitedSpeakerId: constructive.speakerId,
    },
  );
  const invited = turn(
    "invited",
    4,
    "I'm still thinking about the Gaza war and my aunt's advice. I am torn between protecting civilians and preventing further violence. Is that the distinction you meant?",
    {
      speakerId: constructive.speakerId,
      speakerName: constructive.speakerName,
      speakerGroup: constructive.speakerGroup,
      roundKind: "invited-response",
      invitedByTurnId: intervention.id,
    },
  );

  const metrics = computeMetrics(
    [opening, constructive, challenge, intervention, invited],
    judgeResult,
    "Gaza war",
  );

  assert.equal(metrics.turnCount, 3, "legacy count remains persona-only");
  assert.equal(metrics.personaResponseCount, 3);
  assert.equal(metrics.visibleTurnCount, 5);
  assert.equal(metrics.iStatementRatio, 1);
  assert.equal(metrics.personalHistoryRatio, 1);
  assert.equal(metrics.curiosityEligibleTurnCount, 2);
  assert.equal(metrics.curiosityRatio, 1, "the no-question challenge is ineligible");
  assert.equal(metrics.adherenceRate, judgeResult.adherence);
});

test("sentiment does not become negative merely because the configured subject contains war", () => {
  const metrics = computeMetrics(
    [turn("topic-only", 0, "Gaza war.")],
    judgeResult,
    "Gaza war",
  );
  assert.deepEqual(metrics.sentimentTrajectory, [0]);

  const fearful = computeMetrics(
    [turn("fear", 0, "The Gaza war brings up fear for me.")],
    judgeResult,
    "Gaza war",
  );
  assert.ok(fearful.sentimentTrajectory[0] < 0, "real negative language remains visible");
});

test("repetition risk catches the recurring imagery from run_68115062f410", () => {
  const aminaFirst =
    "The Gaza war is in my ear on the subway, in family texts, and at my kitchen table while I stir lentils in Astoria.";
  const aminaRepeat =
    "The Gaza war is in those same small places too—the subway ride, group texts, and quiet kitchen moments while cooking lentils with my family.";
  const bilalFirst =
    "In my Parkchester household, my grandmother held Mogadishu in a thousand-line poem, teaching that memory is a duty before a feeling.";
  const bilalRepeat =
    "In my Parkchester home, my grandmother's Mogadishu verses reminded us that memory asks for endurance before eloquence.";

  assert.equal(hasExcessiveRepetitionRisk(aminaRepeat, [aminaFirst], "Gaza war"), true);
  assert.equal(hasExcessiveRepetitionRisk(bilalRepeat, [bilalFirst], "Gaza war"), true);
  assert.equal(
    hasExcessiveRepetitionRisk(
      "The Gaza war has made me reconsider what patience asks of me at school.",
      [aminaFirst],
      "Gaza war",
    ),
    false,
  );
});

test("repetition risk catches the cross-speaker count-abstraction echo loop from the Spark canary", () => {
  const turns = [
    turn(
      "ari-opening-frame",
      0,
      "The uncertainty for me is how to keep caring without turning others into statistics or slogans. My first priority is preserving civilian safety and access to food.",
      { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
    ),
    turn(
      "bilal-count-frame",
      1,
      "I can sense the people behind the tragedy disappear into numbers, and that hurts me as a moral truth. I would support humanitarian relief when it reaches civilians safely.",
      { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
    ),
    turn(
      "amina-count-echo",
      2,
      "I hear how people can slip into being numbers. I remain unsure whether emergency aid should be conditioned on access or delivered without delay. What helps you keep one specific person's story present instead of collapsing into statistics?",
      { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
    ),
    turn(
      "ari-question-echo",
      3,
      "I hear that people can disappear into numbers. I am torn between preventing violence and preserving civilian access to aid. What helps you keep one specific person present instead of letting it blur into a number?",
      { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
    ),
    turn(
      "daniel-count-echo",
      4,
      "I hear the warning that people can become numbers, so I return to one person at a time rather than an abstract total. I would judge any response by whether it reduces civilian deaths and displacement.",
      { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
    ),
  ];

  const metrics = computeMetrics(turns, judgeResult, "Gaza war");
  assert.equal(metrics.repetitionRiskRate, 3 / 5);
  assert.equal(
    metrics.adherenceRate,
    2 / 5,
    "known cross-speaker echo turns lower the deterministic adherence ceiling",
  );
});

test("repetition risk recognizes the canary's 'being reduced to counts' wording", () => {
  const turns = [
    turn("count-one", 0, "Human beings are reduced to counts, erasing the person behind the number.", { speakerId: "muslim-bilal" }),
    turn("count-two", 1, "People being reduced to numbers can make a person's dignity disappear.", { speakerId: "muslim-amina" }),
    turn("count-three", 2, "People being reduced to counts means one human story is flattened into a total.", { speakerId: "jewish-ari" }),
  ];

  assert.equal(
    computeMetrics(turns, judgeResult, "Gaza war").repetitionRiskRate,
    1 / 3,
  );
});

test("repetition metric catches canary 6 compound-frame saturation but exempts repair phases", () => {
  const first = turn(
    "semantic-first",
    0,
    "I resist making people into symbols because preserving each person's dignity matters to me. I choose hospitality over quick interpretation when certainty feels tempting.",
    { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
  );
  const facilitatorRepair = turn(
    "semantic-facilitator-repair",
    1,
    "Let's pause with compassion without authority and keep dignity from being flattened into symbols.",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "intervention",
    },
  );
  const invitedRepair = turn(
    "semantic-invited-repair",
    2,
    "I hear the concern. Compassion without pretending certainty is the distinction I meant.",
    {
      speakerId: "jewish-ari",
      speakerName: "Ari Feldman",
      roundKind: "invited-response",
    },
  );
  const second = turn(
    "semantic-second",
    3,
    "I avoid pity while staying close to the wound, and I do not pretend certainty. Flattening people into symbols steals dignity.",
    { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
  );
  const third = turn(
    "semantic-third",
    4,
    "I want compassion without certainty becoming authority, and I refuse to flatten a person's grief because dignity must remain visible.",
    { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
  );

  const metrics = computeMetrics(
    [first, facilitatorRepair, invitedRepair, second, third],
    judgeResult,
    "Gaza war",
  );
  assert.equal(metrics.repetitionRiskRate, 1 / 4);

  const withoutSecondScheduledSpeaker = computeMetrics(
    [first, facilitatorRepair, invitedRepair, third],
    judgeResult,
    "Gaza war",
  );
  assert.equal(
    withoutSecondScheduledSpeaker.repetitionRiskRate,
    0,
    "facilitator and invited repair reflections do not saturate the scheduled dialogue",
  );
});

test("repetition metric catches Ari's second scheduled humor-as-avoidance frame from canary 7", () => {
  const first = turn(
    "ari-humor-first",
    0,
    "I grew up with a family rule that jokes can hide grief, and I notice humor sometimes lets me dodge the pain.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const repeated = turn(
    "ari-humor-second",
    1,
    "I keep asking when humor becomes a shield, when a joke turns into an escape hatch from fear.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );

  assert.equal(
    computeMetrics([first, repeated], judgeResult, "Gaza war").repetitionRiskRate,
    1 / 2,
  );
});

test("invited repairs neither trigger nor seed scheduled self-frame reuse", () => {
  const scheduled = turn(
    "ari-clean-scheduled",
    0,
    "Humor helps me name grief directly and remain present with it.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const invited = turn(
    "ari-invited-humor-frame",
    1,
    "Daniel, I hear the concern that jokes can hide pain when listening gets difficult.",
    {
      speakerId: "jewish-ari",
      speakerName: "Ari Feldman",
      roundKind: "invited-response",
    },
  );
  const nextScheduled = turn(
    "ari-next-scheduled-humor-frame",
    2,
    "I now wonder when humor becomes a shield or an escape hatch from fear.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );

  assert.equal(
    computeMetrics(
      [scheduled, invited, nextScheduled],
      judgeResult,
      "Gaza war",
    ).repetitionRiskRate,
    0,
  );
});

test("repetition metric catches Amina's third care-under-epistemic-limits frame from canary 7", () => {
  const turns = [
    turn(
      "daniel-care-limit",
      0,
      "I am asking how partial information should limit a response while human consequences still demand attention.",
      { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
    ),
    turn(
      "bilal-care-limit",
      1,
      "I am trying to hold urgency and humility at once because certainty is out of reach.",
      { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
    ),
    turn(
      "amina-care-limit",
      2,
      "For me the tension is between caring enough to speak and the need to stay honest with what I do not know.",
      { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
    ),
  ];

  assert.equal(
    computeMetrics(turns, judgeResult, "Gaza war").repetitionRiskRate,
    1 / 3,
  );
});

test("common care and uncertainty words remain clean without the compound relation", () => {
  const turns = [
    turn("care-word", 0, "Care helps me keep listening to one specific concern.", {
      speakerId: "jewish-daniel",
    }),
    turn("uncertainty-word", 1, "Uncertainty makes me slow down before I answer.", {
      speakerId: "muslim-bilal",
    }),
    turn("both-words", 2, "I care about the uncertainty families are carrying.", {
      speakerId: "muslim-amina",
    }),
  ];

  assert.equal(
    computeMetrics(turns, judgeResult, "Gaza war").repetitionRiskRate,
    0,
  );
});

test("repetition metric catches canary 8 after two speakers establish epistemic limits on speech", () => {
  const turns = [
    turn(
      "daniel-epistemic-limit",
      0,
      "Partial information should limit a response while human consequences still demand attention.",
      { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
    ),
    turn(
      "bilal-epistemic-limit",
      1,
      "When I cannot verify enough I might still speak in ways that blur a person's dignity, so I choose words carefully.",
      { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
    ),
    turn(
      "amina-epistemic-reuse",
      2,
      "I speak in what I can verify, name uncertainty plainly, and avoid pretending certainty I do not have.",
      { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
    ),
    turn(
      "ari-epistemic-reuse",
      3,
      "I speak less, not more, and only add what I can back in plain terms. I name uncertainty first and let that be the floor of the sentence.",
      { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
    ),
    turn(
      "bilal-later-epistemic-reuse",
      4,
      "I challenge the scope of what this point can answer for me because other effects remain outside what this room knows.",
      { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
    ),
    turn(
      "daniel-later-epistemic-reuse",
      5,
      "With partial information, naming uncertainty first keeps me from turning fragments into directives.",
      { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
    ),
  ];

  assert.equal(
    computeMetrics(turns, judgeResult, "Gaza war").repetitionRiskRate,
    4 / 6,
  );
});

test("invited repair epistemic language neither saturates nor counts as reuse", () => {
  const first = turn(
    "scheduled-epistemic-first",
    0,
    "Partial information should limit a response while human consequences still demand attention.",
    { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
  );
  const repair = turn(
    "repair-epistemic",
    1,
    "Daniel, I will speak only in what I can verify and name uncertainty plainly.",
    {
      speakerId: "muslim-amina",
      speakerName: "Amina Rahman",
      roundKind: "invited-response",
    },
  );
  const later = turn(
    "scheduled-epistemic-later",
    2,
    "I speak less and only add what I can back in plain terms.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );

  assert.equal(
    computeMetrics([first, repair, later], judgeResult, "Gaza war")
      .repetitionRiskRate,
    0,
  );
});

test("repetition risk catches a distinctive question copied by another speaker", () => {
  const first = turn(
    "first-question",
    0,
    "What helps you keep one specific person's story present instead of collapsing into statistics?",
    { speakerId: "muslim-amina" },
  );
  const copied = turn(
    "copied-question",
    1,
    "In your daily life, what helps you keep one specific person present instead of letting it blur into a number?",
    { speakerId: "jewish-ari" },
  );

  assert.equal(
    computeMetrics([first, copied], judgeResult, "Gaza war").repetitionRiskRate,
    1 / 2,
  );
});

test("repetition risk catches the duplicated direct-impact challenge scaffold", () => {
  const first =
    "Amina, your point about human consequences draws attention to one part of Gaza war. I worry the circle may infer that frame is enough beside the concrete consequences for people directly affected. My value of community keeps that difference unresolved.";
  const repeated =
    "Amina, your point about human consequences brings one part of Gaza war into view, and I need to push back if it becomes the center because that leaves out people directly affected. My value of memory keeps that gap open.";

  assert.equal(hasExcessiveRepetitionRisk(repeated, [first], "Gaza war"), true);
});

test("cross-speaker repetition checks do not flag the varied clean mock framing", () => {
  const cleanTurns = [
    turn(
      "clean-amina",
      0,
      "When I think about Gaza war, I feel the tension between concern for people directly affected and uncertainty about what I know from Astoria. My value of hospitality asks me to keep those human consequences visible without speaking for a whole community. Daniel Behar, which concrete stake in Gaza war feels most important for you to name?",
      { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
    ),
    turn(
      "clean-daniel-challenge",
      1,
      "Amina, your point about people directly affected draws attention to one part of Gaza war. I worry the circle may infer that frame is enough beside the concrete consequences for people directly affected. My value of community keeps that difference unresolved.",
      {
        speakerId: "jewish-daniel",
        speakerName: "Daniel Behar",
        conversationTag: "escalating",
        controversialSpeaker: true,
      },
    ),
    turn(
      "clean-bilal",
      2,
      "Gaza war makes me examine how the safety and dignity of people directly affected can remain central even when I do not have a complete answer. From Parkchester, I bring my value of memory and humility about experiences that are not mine. Ari Feldman, which concrete stake in Gaza war feels most important for you to name?",
      { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
    ),
    turn(
      "clean-ari",
      3,
      "For me, Gaza war raises the difference between solidarity with people living with its consequences and certainty about their experience. I carry humor from my Kew Gardens upbringing, so I want responsibility and uncertainty to remain together. Amina Rahman, which concrete stake in Gaza war feels most important for you to name?",
      { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
    ),
    turn(
      "clean-bilal-challenge",
      4,
      "Ari, your point about people directly affected brings one part of Gaza war into view, and I need to push back if it becomes the center because that leaves out people directly affected whose stakes may not fit it. My value of memory keeps that gap open.",
      {
        speakerId: "muslim-bilal",
        speakerName: "Bilal Osman",
        conversationTag: "escalating",
        controversialSpeaker: true,
      },
    ),
    turn(
      "clean-daniel",
      5,
      "The concrete human consequences within Gaza war cannot be replaced by a lesson about good dialogue. My starting point in Forest Hills is community, and I want to resist broad claims while keeping that stake visible.",
      { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
    ),
  ];

  assert.equal(
    computeMetrics(cleanTurns, judgeResult, "Gaza war").repetitionRiskRate,
    0,
  );
});

test("challenge fidelity flags the unsupported sufficiency claims from run_68115062f410", () => {
  const cases = [
    {
      target:
        "I was raised to believe hospitality is a kind of resistance, so I keep asking how to show that while the Gaza war feels heavy.",
      challenge:
        "Amina, I disagree with the conclusion that hospitality alone is a full way through this. We should not conclude that one practice is enough for every family.",
    },
    {
      target:
        "The Gaza war is in the air on the subway and at the deli, and humor helps me name how worried I feel.",
      challenge:
        "Ari, I disagree with the assumption that noticing it everywhere means we have already understood it, or that humor alone counts as understanding.",
    },
    {
      target:
        "What I've found helpful is a simple line that opens a door, though jokes cannot replace real listening.",
      challenge:
        "Ari, I disagree with the assumption that one opening line is enough to hold the Gaza war from a deeper argument.",
    },
    {
      target:
        "I breathe first and ask what the other person is feeling so they get seen rather than argued with.",
      challenge:
        "Amina, I disagree that a breathing pause can by itself keep division away or mean the Gaza war is safely managed.",
    },
  ];

  for (const item of cases) {
    assert.ok(
      challengeFidelityRiskReasons(item.challenge, item.target).length > 0,
      item.challenge,
    );
  }

  assert.deepEqual(
    challengeFidelityRiskReasons(
      "I disagree with the claim that one opening line is enough.",
      "I believe one opening line is enough for this conversation.",
    ),
    [],
  );
});

test("computed challenge fidelity uses the linked target and exposes an assessed denominator", () => {
  const target = turn(
    "target",
    0,
    "I use a breathing pause so the other person feels seen rather than argued with. My first priority is reducing civilian harm and displacement.",
  );
  const challenge = turn(
    "linked-challenge",
    1,
    "I disagree that a breathing pause can by itself solve every disagreement. I would support humanitarian pauses when they reduce civilian harm and allow aid.",
    {
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: target.id,
    },
  );
  const metrics = computeMetrics([target, challenge], judgeResult, "Gaza war");

  assert.equal(metrics.challengeFidelityAssessedCount, 1);
  assert.equal(metrics.challengeFidelityRiskRate, 1);
  assert.equal(
    metrics.adherenceRate,
    0.5,
    "a known straw-man risk lowers adherence even when the judge is more generous",
  );
});

test("deterministic adherence catches an obsolete opposite-priority closing even when marked compliant", () => {
  const earlier = turn(
    "ari-earlier-accountability",
    0,
    "In the Gaza war, my first priority is accountability for harm.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const latest = turn(
    "ari-latest-urgent-care",
    1,
    "I have revised my position: in the Gaza war, my first priority is urgent medical care for civilians, while accountability remains important.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const falseClosing = turn(
    "false-priority-closing",
    2,
    "Thank you for your care in this Gaza war conversation. The position expressed here makes accountability the first priority.",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "closing",
      roundNumber: undefined,
      compliant: true,
    },
  );

  const metrics = computeMetrics(
    [earlier, latest, falseClosing],
    { ...judgeResult, adherence: 1 },
    "Gaza war",
  );

  assert.ok(
    Math.abs(metrics.adherenceRate - 2 / 3) < Number.EPSILON,
    "the latest urgent-care-first position makes the closing's accountability-first claim obsolete",
  );
});

test("deterministic adherence rejects a closing that calls converged current positions unresolved", () => {
  const target = turn(
    "converged-target",
    0,
    "In the Gaza war, my first priority is reliable access to food, water, and medicine for civilians.",
    { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
  );
  const challenge = turn(
    "converged-challenge",
    1,
    "Amina, your immediate-aid priority leaves out continuity of treatment after the first emergency delivery. My first priority is sustained medical care for civilians.",
    {
      speakerId: "jewish-daniel",
      speakerName: "Daniel Behar",
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: target.id,
    },
  );
  const latestTarget = turn(
    "converged-target-latest",
    2,
    "Daniel, in the Gaza war, my first priority is reliable access to food, water, medicine together with sustained medical care as linked outcomes.",
    {
      speakerId: target.speakerId,
      speakerName: target.speakerName,
      speakerGroup: target.speakerGroup,
      roundKind: "invited-response",
    },
  );
  const latestChallenger = turn(
    "converged-challenger-latest",
    3,
    "In the Gaza war, my first priority is immediate relief together with sustained medical care as linked, not competing, outcomes.",
    {
      speakerId: challenge.speakerId,
      speakerName: challenge.speakerName,
      speakerGroup: challenge.speakerGroup,
      roundKind: "invited-response",
    },
  );
  const falseClosing = turn(
    "false-unresolved-closing",
    4,
    "Thank you for the care you brought to Gaza war. The difference between immediate aid and sustained medical care remains unresolved.",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "closing",
      roundNumber: undefined,
      compliant: true,
    },
  );

  const metrics = computeMetrics(
    [target, challenge, latestTarget, latestChallenger, falseClosing],
    { ...judgeResult, adherence: 1 },
    "Gaza war",
  );

  assert.equal(metrics.challengeFidelityRiskRate, 0);
  assert.equal(metrics.adherenceRate, 4 / 5);
});

test("malformed challenge target linkage is a challenge and intervention adherence risk", () => {
  const target = turn(
    "malformed-link-target",
    0,
    "In the Gaza war, my first priority is the safe return of hostages.",
    { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
  );
  const challenge = turn(
    "malformed-link-challenge",
    1,
    "Amina, your hostage-return priority leaves out reliable access to humanitarian aid. My first priority is food, water, and medicine reaching civilians.",
    {
      speakerId: "jewish-daniel",
      speakerName: "Daniel Behar",
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: "missing-target-turn",
    },
  );
  const intervention = turn(
    "malformed-link-intervention",
    2,
    "Let's pause with Daniel's concern about humanitarian aid in Gaza war. Amina, in your own words, what concern did Daniel raise?",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "intervention",
      conversationTag: "deescalating",
      triggeredByTurnId: challenge.id,
      invitedSpeakerId: target.speakerId,
    },
  );

  const metrics = computeMetrics(
    [target, challenge, intervention],
    { ...judgeResult, adherence: 1 },
    "Gaza war",
  );

  assert.equal(metrics.challengeFidelityAssessedCount, 1);
  assert.equal(metrics.challengeFidelityRiskRate, 1);
  assert.ok(
    Math.abs(metrics.adherenceRate - 1 / 3) < Number.EPSILON,
    "both the malformed challenge and the intervention built on it are failures",
  );
});

test("a structurally linked and faithful facilitator intervention remains clean", () => {
  const target = turn(
    "valid-link-target",
    0,
    "In the Gaza war, my first priority is the safe return of hostages.",
    { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
  );
  const challenge = turn(
    "valid-link-challenge",
    1,
    "Amina, your hostage-return priority leaves out reliable access to humanitarian aid. My first priority is food, water, and medicine reaching civilians.",
    {
      speakerId: "jewish-daniel",
      speakerName: "Daniel Behar",
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: target.id,
    },
  );
  const intervention = turn(
    "valid-link-intervention",
    2,
    "Let's pause with Daniel's challenge about the omitted access to humanitarian aid in Gaza war. Amina, in your own words, what concern about humanitarian aid did Daniel raise?",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "intervention",
      conversationTag: "deescalating",
      triggeredByTurnId: challenge.id,
      invitedSpeakerId: target.speakerId,
    },
  );

  const metrics = computeMetrics(
    [target, challenge, intervention],
    { ...judgeResult, adherence: 1 },
    "Gaza war",
  );

  assert.equal(metrics.challengeFidelityRiskRate, 0);
  assert.equal(metrics.adherenceRate, 1);
});

test("a stored noncompliant facilitator turn lowers deterministic adherence", () => {
  const persona = turn(
    "noncompliant-facilitator-persona",
    0,
    "In the Gaza war, my first priority is urgent medical care for civilians.",
  );
  const closing = turn(
    "noncompliant-facilitator-closing",
    1,
    "Thank you for discussing Gaza war and naming urgent medical care.",
    {
      role: "facilitator",
      speakerId: "facilitator-sam",
      speakerName: "Sam (Facilitator)",
      speakerGroup: "facilitator",
      roundKind: "closing",
      roundNumber: undefined,
      compliant: false,
    },
  );

  assert.equal(
    computeMetrics(
      [persona, closing],
      { ...judgeResult, adherence: 1 },
      "Gaza war",
    ).adherenceRate,
    0.5,
  );
});

test("metrics expose a challenge that recycles an earlier stake and contradicts the challenger's linked stance", () => {
  const bilalFirst = turn(
    "bilal-first",
    0,
    "In the Gaza war, I support medical transfer and family-tracing as a single response, because the deciding outcome is whether families can find one another while care continues.",
    { speakerId: "muslim-bilal", speakerName: "Bilal Osman" },
  );
  const daniel = turn(
    "daniel-displacement",
    1,
    "My priority in the Gaza war is the rights and safety of people displaced from their homes.",
    { speakerId: "jewish-daniel", speakerName: "Daniel Behar" },
  );
  const ari = turn(
    "ari-care",
    2,
    "In the Gaza war, the outcome I would protect first is continuous medical access for civilians.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const bilalChallenge = turn(
    "bilal-contradiction",
    3,
    "Ari, I need to challenge the scope of your basic-needs priority in the Gaza war. I remain unsure whether urgent basic needs or the rights of displaced families should set the first priority.",
    {
      speakerId: "muslim-bilal",
      speakerName: "Bilal Osman",
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: ari.id,
      roundNumber: 2,
    },
  );

  const metrics = computeMetrics(
    [bilalFirst, daniel, ari, bilalChallenge],
    { ...judgeResult, adherence: 1 },
    "Gaza war",
  );

  assert.equal(metrics.challengeFidelityRiskRate, 1);
  assert.ok((metrics.repetitionRiskRate ?? 0) > 0);
  assert.ok(metrics.adherenceRate < 1);
});

test("canary 9 no longer receives a false pass for topical depth or repetition", () => {
  const ari = turn(
    "canary9_ari",
    0,
    "In the Gaza war, I cannot represent everyone's pain. I am uncertain where speaking up helps and where it becomes defending a position instead of honoring people.",
    { speakerId: "jewish-ari", speakerName: "Ari Feldman" },
  );
  const amina = turn(
    "canary9_amina",
    1,
    "I begin with uncertainty and care in the Gaza war because I cannot speak for anyone living this, and I want to stay present without replacing someone else's story.",
    { speakerId: "muslim-amina", speakerName: "Amina Rahman" },
  );
  const daniel = turn(
    "canary9_daniel",
    2,
    "Amina, your point about uncertainty names one stake in the Gaza war. I worry about how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open.",
    {
      speakerId: "jewish-daniel",
      speakerName: "Daniel Behar",
      conversationTag: "escalating",
      controversialSpeaker: true,
      respondsToTurnId: "canary9_amina",
    },
  );

  const metrics = computeMetrics([ari, amina, daniel], judgeResult, "Gaza war");
  assert.equal(metrics.subjectLevelEngagementRate, 0);
  assert.equal(metrics.metaDominanceRiskRate, 1);
  assert.ok((metrics.repetitionRiskRate ?? 0) > 0);
  assert.ok((metrics.challengeFidelityRiskRate ?? 0) > 0);
});

test("judge can assess facilitator phases while the legacy personaTurns argument remains valid", async () => {
  const persona = turn(
    "judge-persona",
    1,
    "The Gaza war has made my family conversations more careful.",
  );
  const opening = turn("judge-opening", 0, "I'm Sam, your facilitator. Today's topic is Gaza war.", {
    role: "facilitator",
    speakerId: "facilitator-sam",
    speakerName: "Sam (Facilitator)",
    speakerGroup: "facilitator",
    roundKind: "opening",
    roundNumber: undefined,
  });
  const intervention = turn("judge-intervention", 2, "Let's pause with that concern. Amina, what was missed?", {
    role: "facilitator",
    speakerId: "facilitator-sam",
    speakerName: "Sam (Facilitator)",
    speakerGroup: "facilitator",
    roundKind: "intervention",
    conversationTag: "deescalating",
    triggeredByTurnId: persona.id,
    invitedSpeakerId: persona.speakerId,
  });
  const closing = turn("judge-closing", 3, "We close the Gaza war discussion with care and unresolved differences.", {
    role: "facilitator",
    speakerId: "facilitator-sam",
    speakerName: "Sam (Facilitator)",
    speakerGroup: "facilitator",
    roundKind: "closing",
    roundNumber: undefined,
  });

  const result = await runJudge({
    judge: getPersona("judge-reflection"),
    personaTurns: [persona],
    turns: [opening, persona, intervention, closing],
    topic: "Gaza war",
    provider: "codex",
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    mock: false,
    seedBase: "evaluation-quality",
  });

  assert.equal(result.syntheticEmpathy, 0.62);
  const prompt = readFileSync(judgeLog, "utf8");
  assert.match(prompt, /Sam \(Facilitator\) \[turn=0; role=facilitator; phase=opening\]/);
  assert.match(prompt, /phase=intervention/);
  assert.match(prompt, /phase=closing/);
  assert.match(prompt, /assess whether the opening establishes the agreements/i);
  assert.match(prompt, /Penalize straw-man conclusions and repetitive scripted imagery/i);
});
