import assert from "node:assert/strict";
import { test } from "node:test";

const {
  assessTopicRelevance,
  extractTopicAnchors,
  normalizeTopicRelevanceText,
} = await import("../lib/topicRelevance.ts");

test("normalizes compatibility Unicode, punctuation, and whitespace", () => {
  assert.equal(
    normalizeTopicRelevanceText("  Ｇａｚａ—WAR:\nCéasefire  "),
    "gaza war céasefire",
  );
});

test("accepts an explicit topic mention after punctuation normalization", () => {
  const result = assessTopicRelevance(
    "I feel torn when I talk about the Gaza—war with people I love.",
    "Gaza war",
  );

  assert.equal(result.relevant, true);
  assert.equal(result.exactTopicMention, true);
  assert.equal(result.matchKind, "exact-topic");
  assert.deepEqual(result.matchedAnchors, ["gaza", "war"]);
  assert.deepEqual(result.missingAnchors, []);
});

test("rejects generic first-person family talk for the Gaza war topic", () => {
  const result = assessTopicRelevance(
    "My grandfather told jokes at dinner, and my family learned to carry grief through humor.",
    "Gaza war",
  );

  assert.equal(result.relevant, false);
  assert.equal(result.matchKind, "insufficient-anchors");
  assert.deepEqual(result.matchedAnchors, []);
  assert.deepEqual(result.missingAnchors, ["gaza", "war"]);
  assert.equal(result.requiredAnchorCount, 2);
});

test("one generic overlapping anchor is not enough for a multi-anchor topic", () => {
  const result = assessTopicRelevance(
    "In my family, even a small disagreement can feel like a war.",
    "Gaza war",
  );

  assert.equal(result.relevant, false);
  assert.deepEqual(result.matchedAnchors, ["war"]);
  assert.deepEqual(result.missingAnchors, ["gaza"]);
});

test("accepts reordered topic anchors without claiming an exact phrase match", () => {
  const result = assessTopicRelevance(
    "The war has changed how I listen to relatives speaking about Gaza.",
    "Gaza war",
  );

  assert.equal(result.relevant, true);
  assert.equal(result.exactTopicMention, false);
  assert.equal(result.matchKind, "topic-anchors");
  assert.deepEqual(result.matchedAnchors, ["gaza", "war"]);
});

test("extracts domain anchors while ignoring function and session words", () => {
  assert.deepEqual(
    extractTopicAnchors("A discussion about climate change in New York neighborhoods"),
    ["climate", "change", "new", "york", "neighborhoods"],
  );
});

test("long topics require three distinct anchors and report the missing evidence", () => {
  const topic = "Climate change and public housing in New York neighborhoods";
  const result = assessTopicRelevance(
    "Public housing in my neighborhood shaped how I see community.",
    topic,
  );

  assert.equal(result.relevant, false);
  assert.equal(result.requiredAnchorCount, 3);
  assert.deepEqual(result.matchedAnchors, ["public", "housing"]);
  assert.deepEqual(result.missingAnchors, ["climate", "change", "new", "york", "neighborhoods"]);
});

test("supports a one-anchor configured topic and empty input safely", () => {
  const housing = assessTopicRelevance("Housing shaped where we could settle.", "Housing");
  assert.equal(housing.relevant, true);
  assert.equal(housing.requiredAnchorCount, 1);

  assert.equal(assessTopicRelevance("some text", "").matchKind, "empty-topic");
  assert.equal(assessTopicRelevance("", "Gaza war").matchKind, "empty-text");
});

test("does not use substring matches as anchor evidence", () => {
  const result = assessTopicRelevance("We went to a bazaar after the award ceremony.", "war");
  assert.equal(result.relevant, false);
  assert.deepEqual(result.matchedAnchors, []);
});
