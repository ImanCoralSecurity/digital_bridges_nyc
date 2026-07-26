import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  STUDENTS_PER_COMMUNITY,
  TOTAL_STUDENTS,
  assertStudentRoster,
  isNycRaisedLocation,
} from "../lib/personaRules.ts";

const personaDir = new URL("../personas/", import.meta.url);

function loadCorpus() {
  return readdirSync(personaDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      persona: JSON.parse(readFileSync(new URL(file, personaDir), "utf8")),
    }));
}

test("persona corpus is exactly 15 Muslim + 15 Jewish students and two role agents", () => {
  const corpus = loadCorpus();
  const personas = corpus.map(({ persona }) => persona);
  assert.equal(corpus.length, TOTAL_STUDENTS + 2);
  assert.equal(personas.filter((p) => p.group === "muslim").length, STUDENTS_PER_COMMUNITY);
  assert.equal(personas.filter((p) => p.group === "jewish").length, STUDENTS_PER_COMMUNITY);
  assert.equal(personas.filter((p) => p.group === "facilitator").length, 1);
  assert.equal(personas.filter((p) => p.group === "judge").length, 1);
  assert.doesNotThrow(() => assertStudentRoster(personas));

  const ids = personas.map((p) => p.id);
  const names = personas.map((p) => p.displayName);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(names).size, names.length);
  for (const { file, persona } of corpus) assert.equal(file, `${persona.id}.json`);
});

test("every student is explicitly born and raised in a New York City borough", () => {
  const students = loadCorpus()
    .map(({ persona }) => persona)
    .filter((p) => p.group === "muslim" || p.group === "jewish");

  for (const student of students) {
    assert.equal(student.version, "2.0.0", `${student.id} has the NYC-roster version`);
    assert.equal(isNycRaisedLocation(student.raisedIn), true, `${student.id} has valid raisedIn`);
    assert.match(student.background, /\bBorn and raised\b/i, `${student.id} states NYC upbringing`);
    assert.equal(student.fictional, true);
  }

  for (const group of ["muslim", "jewish"]) {
    const locations = students.filter((p) => p.group === group).map((p) => p.raisedIn);
    for (const borough of ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"]) {
      assert.ok(
        locations.some((location) => location.includes(borough)),
        `${group} roster includes ${borough}`,
      );
    }
  }
});

test("roster validation rejects non-NYC upbringing and unbalanced groups", () => {
  assert.throws(
    () =>
      assertStudentRoster([
        { id: "bad", group: "muslim", raisedIn: "Los Angeles, California" },
      ]),
    /raisedIn/,
  );
  assert.throws(
    () => assertStudentRoster([]),
    /exactly 15 Muslim and 15 Jewish/,
  );
});
