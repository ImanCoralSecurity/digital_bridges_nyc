import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Next's ESM package exposes this file to the bundler extensionlessly, but
    // direct Node test execution needs the concrete subpath.
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
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

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-project-delete-"));
const previousStore = process.env.DBRIDGES_STORE_DIR;
const previousWorkerSetting = process.env.DBRIDGES_DISABLE_JOB_WORKER;
process.env.DBRIDGES_STORE_DIR = storeDir;
process.env.DBRIDGES_DISABLE_JOB_WORKER = "1";

const db = await import("../lib/db.ts");
const {
  ProjectDeletionConflictError,
  deleteProject,
  deleteProjectSession,
} = await import("../lib/jobQueue.ts");
const { handle } = await import("../lib/apiHelpers.ts");

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  restoreEnv("DBRIDGES_STORE_DIR", previousStore);
  restoreEnv("DBRIDGES_DISABLE_JOB_WORKER", previousWorkerSetting);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function session(projectId, number, overrides = {}) {
  return {
    id: `session_${projectId}_${number}`,
    projectId,
    number,
    topic: number === 1 ? "Introductions" : `Topic ${number}`,
    rounds: 1,
    mandatoryIntroductionRound: number === 1,
    status: "ready",
    statusReason: "",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function project(id, sessions) {
  return {
    id,
    name: `Project ${id}`,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    status: "active",
    sessionCount: sessions.length,
    attendeeIds: ["muslim-amina", "jewish-ari"],
    attendees: [
      { id: "muslim-amina", name: "Amina Rahman", group: "muslim" },
      { id: "jewish-ari", name: "Ari Feldman", group: "jewish" },
    ],
    controversialPerCommunity: 0,
    controversialAgentIds: [],
    provider: "codex",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    selection: "round-robin",
    budgetUsd: 2,
    mock: true,
    sessions,
  };
}

function job(projectId, sessionId, status, id = `job_${projectId}_${status}`) {
  return {
    id,
    type: "project-session-run",
    status,
    projectId,
    projectName: `Project ${projectId}`,
    sessionId,
    sessionNumber: 1,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    attempts: status === "queued" || status === "paused" ? 0 : 1,
  };
}

function run(id, projectId, sessionId, jobId) {
  return {
    id,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:01:00.000Z",
    status: "completed",
    statusReason: "",
    config: {
      attendeeIds: ["muslim-amina", "jewish-ari"],
      scenario: "Topic",
      provider: "codex",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      rounds: 1,
      selection: "round-robin",
      budgetUsd: 2,
      mock: true,
      projectId,
      projectSessionId: sessionId,
      projectSessionNumber: 1,
      jobId,
    },
    attendees: [],
    costUsd: 0,
    costAvailable: true,
    metrics: null,
    methodologyVersion: "test",
    personaVersions: {},
  };
}

test("project/session deletion preserves history and rejects active work", async (t) => {
  await t.test("session deletion keeps stable numbers and terminal job history", async () => {
    const projectId = "project_delete_middle";
    const secondJob = job(
      projectId,
      `session_${projectId}_2`,
      "completed",
      "job_delete_middle_terminal",
    );
    const sessions = [
      session(projectId, 1, { status: "completed" }),
      session(projectId, 2, { status: "completed", jobId: secondJob.id }),
      session(projectId, 3, { status: "unconfigured", topic: "", rounds: null }),
    ];
    await db.insertProject(project(projectId, sessions));
    await db.insertJob(secondJob);

    const updated = await deleteProjectSession(projectId, sessions[1].id);

    assert.equal(updated.sessionCount, 2);
    assert.deepEqual(updated.sessions.map((item) => item.number), [1, 3]);
    assert.deepEqual(
      updated.sessions.map((item) => item.mandatoryIntroductionRound),
      [true, false],
    );
    assert.equal(updated.status, "active");
    assert.deepEqual(db.getProject(projectId), updated);
    assert.equal(db.getJob(secondJob.id)?.status, "completed");
  });

  await t.test("project deletion preserves terminal jobs, runs, turns, and audits", async () => {
    const projectId = "project_delete_history";
    const firstSession = session(projectId, 1, { status: "completed" });
    const terminalJob = job(
      projectId,
      firstSession.id,
      "completed",
      "job_delete_history_terminal",
    );
    const historicalRun = run(
      "run_delete_history",
      projectId,
      firstSession.id,
      terminalJob.id,
    );
    firstSession.jobId = terminalJob.id;
    firstSession.runId = historicalRun.id;
    await db.insertProject(project(projectId, [firstSession, session(projectId, 2)]));
    await db.insertJob({
      ...terminalJob,
      runId: historicalRun.id,
      runStatus: "completed",
    });
    await db.insertRun(historicalRun);
    await db.insertTurn({
      id: "turn_delete_history",
      runId: historicalRun.id,
      index: 0,
      text: "Historical transcript text remains available.",
    });
    await db.insertGenerationAttempt({
      id: "attempt_delete_history",
      runId: historicalRun.id,
      turnIndex: 0,
      attempt: 0,
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.insertSemanticValidationAttempt({
      id: "semantic_delete_history",
      runId: historicalRun.id,
      turnIndex: 0,
      generationAttempt: 0,
      validationAttempt: 0,
      createdAt: "2026-07-20T00:00:00.000Z",
    });

    const result = await deleteProject(projectId);

    assert.deepEqual(result, {
      deleted: true,
      projectId,
      preservedRunCount: 1,
      preservedJobCount: 1,
    });
    assert.equal(db.getProject(projectId), undefined);
    assert.equal(db.getJob(terminalJob.id)?.runId, historicalRun.id);
    assert.equal(db.getRun(historicalRun.id)?.id, historicalRun.id);
    assert.equal(db.listTurnsByRun(historicalRun.id).length, 1);
    assert.equal(db.listGenerationAttemptsByRun(historicalRun.id).length, 1);
    assert.equal(db.listSemanticValidationAttemptsByRun(historicalRun.id).length, 1);
  });

  await t.test("every active or resumable linked job blocks project deletion", async () => {
    for (const status of [
      "queued",
      "running",
      "pause-requested",
      "paused",
      "cancel-requested",
    ]) {
      const projectId = `project_delete_block_${status}`;
      const linkedJob = job(projectId, `session_${projectId}_1`, status);
      const linkedSession = session(projectId, 1, {
        status,
        jobId: linkedJob.id,
      });
      await db.insertProject(project(projectId, [linkedSession, session(projectId, 2)]));
      await db.insertJob(linkedJob);

      await assert.rejects(
        () => deleteProject(projectId),
        (error) =>
          error instanceof ProjectDeletionConflictError &&
          error.status === 409 &&
          error.message.includes(linkedJob.id) &&
          error.message.includes(status),
      );
      assert.ok(db.getProject(projectId));
    }
  });

  await t.test("every in-flight session state blocks deletion without a job record", async () => {
    for (const status of [
      "queued",
      "running",
      "pause-requested",
      "paused",
      "cancel-requested",
    ]) {
      const projectId = `project_delete_stranded_${status}`;
      const strandedSession = session(projectId, 1, {
        status,
        jobId: `job_missing_${status}`,
      });
      await db.insertProject(
        project(projectId, [strandedSession, session(projectId, 2)]),
      );

      await assert.rejects(
        () => deleteProject(projectId),
        (error) =>
          error instanceof ProjectDeletionConflictError &&
          error.status === 409 &&
          error.message.includes(strandedSession.id) &&
          error.message.includes(status),
      );
      assert.ok(db.getProject(projectId));
    }
  });

  await t.test("active session deletion is a 409-compatible conflict", async () => {
    const projectId = "project_delete_active_session";
    const activeJob = job(
      projectId,
      `session_${projectId}_2`,
      "running",
      "job_delete_active_session",
    );
    const sessions = [
      session(projectId, 1),
      session(projectId, 2, { status: "running", jobId: activeJob.id }),
    ];
    await db.insertProject(project(projectId, sessions));
    await db.insertJob(activeJob);

    await assert.rejects(
      () => deleteProjectSession(projectId, sessions[1].id),
      (error) => error instanceof ProjectDeletionConflictError && error.status === 409,
    );
    assert.equal(db.getProject(projectId)?.sessions.length, 2);

    const response = await handle(() => deleteProjectSession(projectId, sessions[1].id));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /cannot be deleted.*running/i);
  });

  await t.test("an automatic paused Run with a completed Job can be removed", async () => {
    const projectId = "project_delete_automatic_pause";
    const pausedSession = session(projectId, 2, { status: "paused" });
    const completedJob = job(
      projectId,
      pausedSession.id,
      "completed",
      "job_delete_automatic_pause",
    );
    pausedSession.jobId = completedJob.id;
    await db.insertProject(
      project(projectId, [session(projectId, 1), pausedSession]),
    );
    await db.insertJob(completedJob);

    const updated = await deleteProjectSession(projectId, pausedSession.id);

    assert.deepEqual(updated.sessions.map((item) => item.number), [1]);
    assert.equal(db.getJob(completedJob.id)?.status, "completed");
  });

  await t.test("last-session deletion is rejected with project-deletion guidance", async () => {
    const projectId = "project_delete_only_session";
    const onlySession = session(projectId, 7, {
      mandatoryIntroductionRound: false,
    });
    await db.insertProject(project(projectId, [onlySession]));

    await assert.rejects(
      () => deleteProjectSession(projectId, onlySession.id),
      /only remaining session; delete the project instead/i,
    );
    assert.equal(db.getProject(projectId)?.sessionCount, 1);
  });

  await t.test("delete DB operations fail closed on a corrupt project store", async () => {
    const projectsPath = join(storeDir, "projects.json");
    writeFileSync(projectsPath, "{corrupt", "utf8");

    await assert.rejects(
      () => db.deleteProject("project_any"),
      /Cannot read persistent project store/i,
    );
    assert.equal(readFileSync(projectsPath, "utf8"), "{corrupt");
  });
});
