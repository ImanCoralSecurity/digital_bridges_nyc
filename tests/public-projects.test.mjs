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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-public-projects-"));
const previousStore = process.env.DBRIDGES_STORE_DIR;
process.env.DBRIDGES_STORE_DIR = storeDir;

const db = await import("../lib/db.ts");
const { setProjectPublication } = await import("../lib/projects.ts");
const { getPublishedProject, listPublishedProjectSummaries } = await import(
  "../lib/publicProjects.ts"
);

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  if (previousStore === undefined) delete process.env.DBRIDGES_STORE_DIR;
  else process.env.DBRIDGES_STORE_DIR = previousStore;
});

function session(projectId, number, overrides = {}) {
  return {
    id: `session_${projectId}_${number}`,
    projectId,
    number,
    topic: `Session ${number} topic`,
    rounds: 2,
    mandatoryIntroductionRound: number === 1,
    status: "ready",
    statusReason: "operator-only reason",
    jobId: `job_${projectId}_${number}`,
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

function project(id, sessions) {
  return {
    id,
    name: "Public dialogue project",
    projectIntroduction: "A public project introduction.",
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:00:00.000Z",
    status: "active",
    sessionCount: sessions.length,
    attendeeIds: ["muslim-amina", "jewish-ari"],
    attendees: [
      { id: "muslim-amina", name: "Amina Rahman", group: "muslim" },
      { id: "jewish-ari", name: "Ari Feldman", group: "jewish" },
    ],
    controversialPerCommunity: 1,
    controversialAgentIds: ["muslim-amina", "jewish-ari"],
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    selection: "round-robin",
    budgetUsd: 99,
    mock: false,
    sessions,
  };
}

function run(id, projectId, sessionId, status = "completed") {
  return {
    id,
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T10:05:00.000Z",
    status,
    statusReason: "internal run reason",
    config: {
      attendeeIds: ["muslim-amina", "jewish-ari"],
      scenario: "Session topic",
      provider: "codex",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      rounds: 2,
      selection: "round-robin",
      budgetUsd: 99,
      mock: false,
      projectId,
      projectSessionId: sessionId,
      projectSessionNumber: 1,
      jobId: "job_secret",
    },
    attendees: [],
    costUsd: 12.34,
    metrics: null,
    methodologyVersion: "test",
    personaVersions: {},
  };
}

test("private projects are undiscoverable and cannot publish without a completed run", async () => {
  const projectId = "project_private";
  await db.insertProject(project(projectId, [session(projectId, 1)]));

  assert.equal(getPublishedProject(projectId), undefined);
  assert.deepEqual(listPublishedProjectSummaries(), []);
  await assert.rejects(
    () => setProjectPublication(projectId, true),
    /Complete at least one project session with an accepted transcript before publishing/,
  );
});

test("a completed run with no accepted turns cannot be published", async () => {
  const projectId = "project_empty_run";
  const completed = session(projectId, 1, {
    status: "completed",
    runId: "run_empty",
  });
  await db.insertProject(project(projectId, [completed]));
  await db.insertRun(run("run_empty", projectId, completed.id));

  await assert.rejects(
    () => setProjectPublication(projectId, true),
    /accepted transcript/,
  );
  assert.equal(getPublishedProject(projectId), undefined);
});

test("public projection exposes only safe persona fields and completed owned transcripts", async () => {
  const projectId = "project_publishable";
  const completed = session(projectId, 1, {
    status: "completed",
    runId: "run_public",
  });
  const mismatched = session(projectId, 2, {
    status: "completed",
    runId: "run_wrong_owner",
  });
  const partial = session(projectId, 3, {
    status: "running",
    runId: "run_partial",
  });
  await db.insertProject(project(projectId, [completed, mismatched, partial]));
  await db.insertRun(run("run_public", projectId, completed.id));
  await db.insertRun(run("run_wrong_owner", "project_someone_else", mismatched.id));
  await db.insertRun(run("run_partial", projectId, partial.id, "running"));
  await db.insertTurn({
    id: "turn_public",
    runId: "run_public",
    index: 0,
    role: "persona",
    speakerId: "muslim-amina",
    speakerName: "Amina Rahman",
    speakerGroup: "muslim",
    text: "This visible response is safe public dialogue.",
    promptHash: "must-not-be-public",
    semanticValidation: { verdict: "accept", rationale: "internal" },
    costUsd: 4.2,
    createdAt: "2026-07-27T10:01:00.000Z",
  });

  const published = await setProjectPublication(projectId, true);
  assert.equal(published.published, true);
  assert.ok(published.publishedAt);

  const summaries = listPublishedProjectSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].completedSessionCount, 1);
  assert.equal("model" in summaries[0], false);
  assert.equal("controversialAgentIds" in summaries[0], false);

  const publicProject = getPublishedProject(projectId);
  assert.ok(publicProject);
  assert.equal(publicProject.sessions.length, 1);
  assert.equal(publicProject.sessions[0].id, completed.id);
  assert.equal(publicProject.sessions[0].turns.length, 1);
  assert.deepEqual(Object.keys(publicProject.sessions[0].turns[0]).sort(), [
    "index",
    "role",
    "roundKind",
    "roundNumber",
    "speakerGroup",
    "speakerName",
    "text",
  ]);
  assert.equal("promptHash" in publicProject.sessions[0].turns[0], false);
  assert.equal("semanticValidation" in publicProject.sessions[0].turns[0], false);
  assert.equal("costUsd" in publicProject.sessions[0].turns[0], false);

  assert.equal(publicProject.personas.length, 2);
  assert.deepEqual(Object.keys(publicProject.personas[0]).sort(), [
    "background",
    "communicationStyle",
    "culturalBaseline",
    "displayName",
    "fictional",
    "group",
    "id",
    "raisedIn",
    "regionalHistory",
    "values",
  ]);
  assert.equal("sensitivities" in publicProject.personas[0], false);
  assert.equal("doNot" in publicProject.personas[0], false);
  assert.equal("advisorSignoff" in publicProject.personas[0], false);

  await db.insertTurn({
    id: "turn_added_after_publish",
    runId: "run_public",
    index: 1,
    role: "facilitator",
    speakerName: "Sam",
    speakerGroup: "facilitator",
    text: "This later workspace change remains private until an explicit update.",
    createdAt: "2026-07-27T10:02:00.000Z",
  });
  assert.equal(getPublishedProject(projectId)?.sessions[0].turns.length, 1);

  const firstPublishedAt = published.publishedAt;
  const updated = await setProjectPublication(projectId, true);
  assert.equal(updated.publishedAt, firstPublishedAt);
  assert.equal(getPublishedProject(projectId)?.sessions[0].turns.length, 2);
});

test("unpublishing removes public access immediately", async () => {
  const projectId = "project_unpublish";
  const completed = session(projectId, 1, {
    status: "completed",
    runId: "run_unpublish",
  });
  await db.insertProject(project(projectId, [completed]));
  await db.insertRun(run("run_unpublish", projectId, completed.id));
  await db.insertTurn({
    id: "turn_unpublish",
    runId: "run_unpublish",
    index: 0,
    role: "facilitator",
    speakerName: "Sam",
    speakerGroup: "facilitator",
    text: "A complete transcript.",
    createdAt: "2026-07-27T10:01:00.000Z",
  });
  await setProjectPublication(projectId, true);
  assert.ok(getPublishedProject(projectId));

  await setProjectPublication(projectId, false);

  assert.equal(getPublishedProject(projectId), undefined);
  assert.equal(
    listPublishedProjectSummaries().some((project) => project.id === projectId),
    false,
  );
});
