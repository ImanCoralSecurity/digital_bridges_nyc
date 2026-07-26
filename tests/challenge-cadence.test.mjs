import assert from "node:assert/strict";
import { test } from "node:test";

const { challengeSpeakersForDiscussionRound } = await import(
  "../lib/challengeCadence.ts"
);

test("selects up to two configured challenge voices per discussion round", () => {
  const base = {
    controversialAgentIds: ["muslim-bilal", "jewish-daniel"],
    attendees: [
      { id: "muslim-amina", group: "muslim" },
      { id: "muslim-bilal", group: "muslim" },
      { id: "jewish-ari", group: "jewish" },
      { id: "jewish-daniel", group: "jewish" },
    ],
    projectSessionNumber: 2,
  };

  assert.deepEqual(
    challengeSpeakersForDiscussionRound({ ...base, discussionRoundIndex: 0 }),
    ["muslim-bilal", "jewish-daniel"],
  );
  assert.deepEqual(
    challengeSpeakersForDiscussionRound({ ...base, discussionRoundIndex: 1 }),
    ["muslim-bilal", "jewish-daniel"],
  );
});

test("advances two seats per round and one seat per project session", () => {
  const base = {
    controversialAgentIds: ["a", "b", "c", "d", "e", "f"],
    attendees: [
      { id: "a", group: "muslim" },
      { id: "b", group: "muslim" },
      { id: "c", group: "muslim" },
      { id: "d", group: "jewish" },
      { id: "e", group: "jewish" },
      { id: "f", group: "jewish" },
      { id: "ordinary", group: "jewish" },
    ],
    projectSessionNumber: 2,
  };

  assert.deepEqual(
    challengeSpeakersForDiscussionRound({ ...base, discussionRoundIndex: 0 }),
    ["b", "e"],
  );
  assert.deepEqual(
    challengeSpeakersForDiscussionRound({ ...base, discussionRoundIndex: 1 }),
    ["c", "f"],
  );
});

test("filters missing and duplicate challenge assignments", () => {
  assert.deepEqual(
    challengeSpeakersForDiscussionRound({
      controversialAgentIds: ["missing", "muslim-bilal", "muslim-bilal"],
      attendees: [
        { id: "muslim-bilal", group: "muslim" },
        { id: "jewish-ari", group: "jewish" },
      ],
      discussionRoundIndex: 8,
    }),
    ["muslim-bilal"],
  );
  assert.deepEqual(
    challengeSpeakersForDiscussionRound({
      controversialAgentIds: ["missing"],
      attendees: [
        { id: "muslim-bilal", group: "muslim" },
        { id: "jewish-ari", group: "jewish" },
      ],
      discussionRoundIndex: 0,
    }),
    [],
  );
});
