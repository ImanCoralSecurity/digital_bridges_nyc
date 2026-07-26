import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLIC_ENGAGEMENT_LANES,
  detectPrimaryPublicEngagementLane,
  detectPublicEngagementLanes,
  isDifficultPublicTopic,
  isMetaDominantPublicEngagement,
  publicEngagementLaneForTurn,
  publicEngagementLaneInstruction,
  selectPublicEngagementLane,
  subjectLevelEngagementRejectionReasons,
} from "../lib/topicDepth.ts";

const canaryNinePersonaTurns = [
  `When I hear “Gaza war,” I feel the pull between wanting to react immediately and knowing I can’t represent everyone’s pain.
From where I stand, the concrete human cost I can’t ignore is how it can turn real families into headlines and numbers, especially in a city where everyone is used to moving through pain fast.
I live by honesty and resilience, but I get uncertain about where speaking up helps and where it becomes me defending a position instead of honoring the people behind it.
Amina Rahman, what helps you hold that line between staying present and not speaking past people who are living this in ways you can’t fully know?`,
  `Ari, I hear you, and for me in this “Gaza war” conversation, the concrete thing that matters most is the New York impact of people feeling reduced to a label before they’re even heard, which can make them pull back from even small, human exchanges with those around them.
What helps me hold that line is to make my first move be uncertainty and care—saying I can’t speak for anyone living this and that I want to stay present without replacing someone else’s story.
Daniel, when you sense that tension, what value helps you decide whether speaking up is serving dignity or just adding pressure?`,
  `Amina, your point about uncertainty names one concrete stake in “Gaza war.” I worry about what that point leaves unresolved for me: how partial information should limit a response while human consequences still demand attention. My boundary is to keep both obligations open through my value of generosity from Forest Hills, Queens, New York City.`,
  `Daniel Behar, your concern is that the obligations to acknowledge human consequences and remain limited by partial information stay open together in Gaza war. I can answer by limiting my claim to what I know from my own experience, so I will keep that boundary explicit. Hospitality requires me to leave questions of harm and dignity unresolved.`,
  `In this Gaza war conversation, the concrete harm I notice is how one person can be asked to carry too much of everyone’s grief, and that can erase the many distinct human faces behind it.
I was raised in Parkchester, and what I trust to hold me steady is the rhythm of my grandmother’s oral poetry—memory as a sacred trust—so I stay with what I know and refuse to claim what I do not.
The ethical tension is real: urgency pushes me to speak, yet partial knowledge must keep me from turning pain into certainty, and I choose humility over certainty so the dignity of those living this remains intact.`,
  `From Astoria, Queens, New York City, I approach Gaza war with concern for the safety and dignity of people directly affected, together with a clear limit on what I can know from here. My value of hospitality helps me hold responsibility and uncertainty together. Ari Feldman, which concrete stake in Gaza war feels most important for you to name?`,
  `Amina, to your question, the concrete stake I want to name in this Gaza war is the pressure on one person to stand in for everyone’s experience.
I hear Bilal’s point about one person carrying too much grief, and I relate to it: from my Kew Gardens life, I know humor can be a lifeline, but I’m also aware it can blur the boundary and make my own response look bigger than it is.
That leaves me with the uncertainty of speaking without claiming certainty, while still trying to stay honest and humane.
Bilal Osman, when that pressure shows up, what value helps you keep your voice from becoming the only voice allowed on a single face?`,
  `Ari, your point about uncertainty gives me a bounded starting point in “Gaza war.” I feel uneasy about the question it cannot answer for me: how to preserve compassion without claiming authority when information is partial. My boundary is to keep that distinction open through my value of eloquence from Parkchester, Bronx, New York City.`,
  `What Bilal Osman pushed back on was the risk that I could sound uncertain on the Gaza war and still speak like I know the whole story. In my own terms, I keep a hard boundary between what I feel from New York life—watching one person be asked to carry an impossible emotional load in conversations here—and what I can responsibly claim, because that load is a concrete human consequence I can witness but not universalize. So I answer this by speaking in the first person only, naming my limits, and trying to stay with the discomfort instead of turning my uncertainty into authority.`,
  `I’m holding on to what Ari said about separating my own uncertainty from false certainty in the Gaza war.
From my place in Forest Hills, a concrete thing I keep noticing is how uncertainty can make people go quiet rather than wrong-foot each other, and that silence itself becomes a human cost in our neighborhoods.
My values of community and generosity pull me toward careful, smaller interventions, and the most honest thing I can offer is to stay attentive and humble when the stakes are this high.`,
];

const factFreeNormativeFixtures = [
  {
    topic: "Gaza war",
    text: "My priority in the Gaza war is civilian safety and reliable access to food and medicine. I would judge any response first by whether it protects those needs without making accountability disappear.",
    lanes: ["protected-human-outcome", "bounded-response"],
  },
  {
    topic: "AI in public schools",
    text: "I would accept classroom AI only when student privacy is protected and a teacher remains responsible for grading.",
    lanes: ["bounded-response"],
  },
  {
    topic: "rent increases in NYC",
    text: "I would prioritize keeping families housed when higher costs conflict with that stability.",
    lanes: ["protected-human-outcome"],
  },
  {
    topic: "immigration policy",
    text: "I am torn between reducing long family separations and preserving a fair legal review, and I would not pretend either obligation disappears.",
    lanes: ["competing-obligations"],
  },
  {
    topic: "climate change",
    text: "The choice I cannot resolve is whether to fund immediate flood protection or move more resources toward long-term emissions cuts.",
    lanes: ["unresolved-subject-choice"],
  },
];

test("detects difficult public issues without depending on one named conflict", () => {
  for (const topic of [
    "Gaza war",
    "Ukraine armed conflict",
    "AI in public schools",
    "rent increases in NYC",
    "immigration policy",
    "climate change",
  ]) {
    assert.equal(isDifficultPublicTopic(topic), true, topic);
  }
  for (const topic of [
    "multi-generational family narratives",
    "favorite pizza in New York",
    "a grandmother's recipe",
  ]) {
    assert.equal(isDifficultPublicTopic(topic), false, topic);
  }
});

test("defines four practical, stable engagement lanes", () => {
  assert.deepEqual(
    PUBLIC_ENGAGEMENT_LANES.map((lane) => lane.id),
    [
      "protected-human-outcome",
      "competing-obligations",
      "bounded-response",
      "unresolved-subject-choice",
    ],
  );
  for (const lane of PUBLIC_ENGAGEMENT_LANES) {
    assert.equal(publicEngagementLaneInstruction(lane.id), lane.instruction);
    assert.ok(lane.instruction.length > 40);
  }
});

test("Latin-square lane assignment varies speakers and rounds", () => {
  const bySpeaker = Array.from({ length: 4 }, () => new Set());
  for (let roundIndex = 0; roundIndex < 2; roundIndex += 1) {
    const roundLanes = [];
    for (let speakerOrdinal = 0; speakerOrdinal < 4; speakerOrdinal += 1) {
      const lane = publicEngagementLaneForTurn(speakerOrdinal, roundIndex);
      roundLanes.push(lane);
      assert.equal(bySpeaker[speakerOrdinal].has(lane), false);
      bySpeaker[speakerOrdinal].add(lane);
    }
    assert.equal(new Set(roundLanes).size, 4);
  }
});

test("lane selection skips a lane already used by the same speaker", () => {
  assert.equal(
    selectPublicEngagementLane({
      speakerOrdinal: 0,
      roundIndex: 0,
      usedBySpeaker: ["protected-human-outcome"],
    }),
    "competing-obligations",
  );
  assert.equal(
    selectPublicEngagementLane({
      speakerOrdinal: 0,
      roundIndex: 4,
      usedBySpeaker: PUBLIC_ENGAGEMENT_LANES.map((lane) => lane.id),
    }),
    "protected-human-outcome",
  );
  assert.equal(
    selectPublicEngagementLane({
      speakerOrdinal: 0,
      roundIndex: 4,
      usedBySpeaker: PUBLIC_ENGAGEMENT_LANES.map((lane) => lane.id),
      avoid: "protected-human-outcome",
    }),
    "competing-obligations",
  );
});

test("rejects every canary-9 persona turn as meta-level rather than subject-level", () => {
  for (const text of canaryNinePersonaTurns) {
    const reasons = subjectLevelEngagementRejectionReasons(text, "Gaza war");
    assert.ok(reasons.length > 0, text);
    assert.equal(detectPublicEngagementLanes(text, "Gaza war").length, 0, text);
  }
});

test("magic stake words do not satisfy depth without a subject-level position", () => {
  const text =
    "From New York, I hold safety and dignity for people directly affected together with uncertainty about what I can know or claim.";
  const reasons = subjectLevelEngagementRejectionReasons(text, "Gaza war");
  assert.match(reasons.join(" "), /dialogue|representation|limits on knowledge/i);
  assert.equal(isMetaDominantPublicEngagement(text, "Gaza war"), true);

  const abstractChoice =
    "In the Gaza war, urgency pushes me to speak, but I choose humility over certainty and keep dignity visible.";
  assert.ok(
    subjectLevelEngagementRejectionReasons(abstractChoice, "Gaza war").length > 0,
  );
});

test("rejects lane-shaped answers whose actual priority remains cautious speech or dialogue", () => {
  const metaNormativeAnswers = [
    "My priority in the Gaza war is careful language and responsible speech amid uncertainty.",
    "My priority in the Gaza war is families speaking carefully and choosing responsible words.",
    "I prioritize avoiding rushed conclusions and preserving open dialogue amid uncertainty about the Gaza war.",
    "I would support speaking cautiously and avoiding rushed conclusions amid uncertainty about the Gaza war.",
  ];

  for (const text of metaNormativeAnswers) {
    assert.ok(
      subjectLevelEngagementRejectionReasons(text, "Gaza war").length > 0,
      text,
    );
    assert.equal(isMetaDominantPublicEngagement(text, "Gaza war"), true, text);
  }
});

test("stakeholder nouns cannot launder meta-dialogue into a war position", () => {
  const text =
    "My priority in the Gaza war is families speaking carefully and choosing responsible words.";

  assert.deepEqual(detectPublicEngagementLanes(text, "Gaza war"), []);
  assert.match(
    subjectLevelEngagementRejectionReasons(text, "Gaza war").join(" "),
    /dialogue|representation|subject-level/i,
  );
  assert.equal(isMetaDominantPublicEngagement(text, "Gaza war"), true);
});

test("rejects lane-shaped positions that name Gaza but concern an unrelated subject", () => {
  const unrelatedPositions = [
    "My priority in the Gaza war is affordable subway fares and cleaner city parks.",
    "I would support rent control and more protected bike lanes in response to the Gaza war.",
    "I am torn between better pizza and faster trains in the Gaza war.",
    "The choice I cannot resolve in the Gaza war is whether to expand libraries or renovate playgrounds.",
  ];

  for (const text of unrelatedPositions) {
    assert.ok(
      subjectLevelEngagementRejectionReasons(text, "Gaza war").length > 0,
      text,
    );
  }
});

test("accepts fact-free normative engagement across unrelated public topics", () => {
  for (const fixture of factFreeNormativeFixtures) {
    assert.deepEqual(
      subjectLevelEngagementRejectionReasons(fixture.text, fixture.topic),
      [],
      fixture.text,
    );
    const detected = detectPublicEngagementLanes(fixture.text, fixture.topic);
    for (const lane of fixture.lanes) {
      assert.ok(detected.includes(lane), `${fixture.text}\nmissing ${lane}`);
    }
    assert.equal(detectPrimaryPublicEngagementLane(fixture.text, fixture.topic), fixture.lanes[0]);
  }
});

test("recognizes natural public-topic lane wording", () => {
  const fixtures = [
    {
      text: "The outcome I need to protect is reliable access to food, water, and medicine for civilians during the Gaza war.",
      lane: "protected-human-outcome",
    },
    {
      text: "My unresolved choice is whether to secure immediate basics like food and water for civilians or prioritize sustained medical continuity during recovery in the Gaza war.",
      lane: "unresolved-subject-choice",
    },
    {
      text: "For me, two obligations sit in tension: protecting civilians from immediate harm and preserving medical continuity through recovery in the Gaza war.",
      lane: "competing-obligations",
    },
  ];

  for (const fixture of fixtures) {
    assert.deepEqual(
      subjectLevelEngagementRejectionReasons(fixture.text, "Gaza war"),
      [],
      fixture.text,
    );
    assert.ok(
      detectPublicEngagementLanes(fixture.text, "Gaza war").includes(fixture.lane),
      fixture.text,
    );
  }
});

test("recognizes natural protected-outcome frames from the Spark canary", () => {
  const texts = [
    "My protected outcome is keeping families and kinship ties intact through displacement, because survival without a path to reunion leaves lasting harm.",
    "I need to protect one different human outcome—families staying connected and children having a stable path to care and learning through displacement.",
    "In this same crisis, I also hold a hard obligation to the rights and safety of people displaced from their homes.",
    "The competing obligation I hold is to make sure displaced people are not rendered invisible while uncertainty about loved ones remains a real human injury.",
    "In the Gaza war, I would name my second priority as protecting displaced people from erosion of their legal standing and chance to rebuild.",
    "In my own view, I’d set a hard minimum on urgent care first because delay can turn preventable suffering into irreversible harm.",
  ];

  for (const text of texts) {
    assert.deepEqual(
      subjectLevelEngagementRejectionReasons(text, "Gaza war"),
      [],
      text,
    );
    assert.ok(
      detectPublicEngagementLanes(text, "Gaza war").includes(
        "protected-human-outcome",
      ),
      text,
    );
  }
});

test("recognizes natural bounded-response frames from the Spark canary", () => {
  const texts = [
    "My position is that I can work for food, medicine, and immediate protection now without treating crisis relief as the final outcome.",
    "My position is that I would support family tracing and legal protection for displaced civilians.",
    "My position is that I support family reunification and safe shelter for displaced civilians.",
    "My position is that I work for family reconnection and legal standing for displaced civilians.",
    "My condition for support is simple: dignity must be measurable through reduced family separation and fear.",
    "My boundary is that I cannot endorse a response that leaves displaced families in legal limbo.",
    "My boundary is that I cannot support aid without a concrete track to reconnect families.",
  ];

  for (const text of texts) {
    assert.deepEqual(
      subjectLevelEngagementRejectionReasons(text, "Gaza war"),
      [],
      text,
    );
    assert.ok(
      detectPublicEngagementLanes(text, "Gaza war").includes(
        "bounded-response",
      ),
      text,
    );
  }
});

test("recognizes a topic-qualified unresolved choice from the Spark canary", () => {
  const text =
    "The unresolved choice in this Gaza war for me is whether to prioritize the fastest route for aid and treatment now, or to require stronger accountability steps that reduce hidden harm.";

  assert.deepEqual(subjectLevelEngagementRejectionReasons(text, "Gaza war"), []);
  assert.ok(
    detectPublicEngagementLanes(text, "Gaza war").includes(
      "unresolved-subject-choice",
    ),
  );
});

test("recognizes concrete Gaza continuity, reunion, and legal-status stakes", () => {
  const texts = [
    "I would put immediate life-saving care first.",
    "I would support family-tracing that helps people reconnect with families.",
    "I would support family reunion and kinship ties through displacement.",
    "I would support family linkage and reduced family separation during recovery.",
    "I would protect legal standing so displaced civilians do not remain in legal limbo.",
  ];

  for (const text of texts) {
    assert.deepEqual(
      subjectLevelEngagementRejectionReasons(text, "Gaza war"),
      [],
      text,
    );
    assert.ok(detectPublicEngagementLanes(text, "Gaza war").length > 0, text);
  }
});

test("new natural lane frames still reject meta or one-sided substitutes", () => {
  const invalid = [
    "My protected outcome is families speaking carefully and choosing responsible words about the Gaza war.",
    "I need to protect one different human outcome—families listening without reaching a conclusion about the Gaza war.",
    "My condition for support is simple: use cautious language and leave every perspective open in the Gaza war.",
    "My boundary is that I cannot endorse rushed conclusions in conversations about the Gaza war.",
    "The unresolved choice in this Gaza war for me is whether to protect urgent medical care or to choose more responsible words.",
  ];

  for (const text of invalid) {
    assert.ok(
      subjectLevelEngagementRejectionReasons(text, "Gaza war").length > 0,
      text,
    );
  }
});

test("accepts concise high-signal subject positions", () => {
  const text = "I support a ceasefire.";

  assert.deepEqual(subjectLevelEngagementRejectionReasons(text, "Gaza war"), []);
  assert.deepEqual(detectPublicEngagementLanes(text, "Gaza war"), [
    "bounded-response",
  ]);
});

test("requires both alternatives in an unresolved choice to be subject-level stakes", () => {
  const valid =
    "My unresolved choice is whether to support a ceasefire for civilian safety or preserve reliable food, water, and medical access during the Gaza war.";
  assert.deepEqual(subjectLevelEngagementRejectionReasons(valid, "Gaza war"), []);
  assert.ok(
    detectPublicEngagementLanes(valid, "Gaza war").includes(
      "unresolved-subject-choice",
    ),
  );

  const oneSided =
    "My unresolved choice is whether to protect civilian safety or choose responsible words about the Gaza war.";
  const metaOnBothSides =
    "My unresolved choice is whether families should speak carefully or civilians should listen responsibly during the Gaza war.";
  for (const text of [oneSided, metaOnBothSides]) {
    assert.equal(
      detectPublicEngagementLanes(text, "Gaza war").includes(
        "unresolved-subject-choice",
      ),
      false,
      text,
    );
    assert.ok(
      subjectLevelEngagementRejectionReasons(text, "Gaza war").length > 0,
      text,
    );
  }
});

test("keeps conjunction-heavy genuine competing obligations", () => {
  const text =
    "For me, two obligations sit in tension: getting food, water, and medicine to displaced families immediately and preserving shelter, treatment, and medical continuity through recovery in the Gaza war.";

  assert.deepEqual(subjectLevelEngagementRejectionReasons(text, "Gaza war"), []);
  assert.ok(
    detectPublicEngagementLanes(text, "Gaza war").includes(
      "competing-obligations",
    ),
  );
});

test("does not treat a dialogue-process concern as a second subject obligation", () => {
  const text =
    "For me, two obligations sit in tension: getting food, water, and medicine to civilians immediately and keeping New York conversation from dehumanizing people.";

  assert.equal(
    detectPublicEngagementLanes(text, "Gaza war").includes("competing-obligations"),
    false,
  );
});

test("allows uncertainty as a secondary clause when a subject position exists", () => {
  const text =
    "I cannot know every current fact about the Gaza war. Even so, my priority is reliable access to food and medical care for civilians, and I would support responses that protect those needs.";
  assert.deepEqual(subjectLevelEngagementRejectionReasons(text, "Gaza war"), []);
  assert.equal(isMetaDominantPublicEngagement(text, "Gaza war"), false);
});

test("can require the lane assigned by orchestration", () => {
  const text =
    "My priority in the Gaza war is civilian safety and reliable access to medicine.";
  assert.deepEqual(
    subjectLevelEngagementRejectionReasons(text, "Gaza war", {
      requiredLane: "protected-human-outcome",
    }),
    [],
  );
  assert.match(
    subjectLevelEngagementRejectionReasons(text, "Gaza war", {
      requiredLane: "bounded-response",
    }).join(" "),
    /assigned engagement lane/i,
  );
});

test("leaves ordinary personal and cultural topics unrestricted", () => {
  const metaText =
    "I am uncertain what I can claim, so I would rather listen before speaking.";
  assert.deepEqual(
    subjectLevelEngagementRejectionReasons(metaText, "a grandmother's recipe"),
    [],
  );
  assert.equal(isMetaDominantPublicEngagement(metaText, "a grandmother's recipe"), false);
});
