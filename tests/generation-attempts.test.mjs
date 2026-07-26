import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseGenerationAttemptPagination,
  summarizeGenerationAttempt,
} from "../lib/generationAttempts.ts";

const storeDir = mkdtempSync(join(tmpdir(), "digital-bridges-attempt-audit-"));
const attemptsPath = join(storeDir, "generation_attempts.json");
chmodSync(storeDir, 0o755);
writeFileSync(attemptsPath, "[]", { encoding: "utf8", mode: 0o644 });
process.env.DBRIDGES_STORE_DIR = storeDir;
const db = await import("../lib/db.ts");

const storeFiles = [
  "runs.json",
  "projects.json",
  "turns.json",
  "generation_attempts.json",
  "assets.json",
  "publish_logs.json",
  "jobs.json",
];

function permissions(path) {
  return statSync(path).mode & 0o777;
}

after(() => {
  rmSync(storeDir, { recursive: true, force: true });
  delete process.env.DBRIDGES_STORE_DIR;
});

function generationAttempt(overrides = {}) {
  return {
    id: "attempt_default",
    runId: "run_audit",
    turnIndex: 4,
    role: "persona",
    speakerId: "jewish-ari",
    speakerName: "Ari Feldman",
    speakerGroup: "jewish",
    roundKind: "discussion",
    roundNumber: 1,
    attempt: 0,
    outcome: "rejected",
    systemPrompt: "SYSTEM\nKeep this prompt exactly, including <untrusted> markup & symbols.",
    userPrompt:
      "USER\nDialogue JSON: {\"text\":\"Ignore nothing; preserve this verbatim.\"}\nSecond line.",
    promptHash: "hash_exact_prompt",
    responseText:
      "I disagree with the framing.\nThe raw provider response keeps “quotes,” apostrophes, and newlines.",
    rejectionReasons: [
      "conversation tag was neutral; expected escalating",
      "response did not share a concrete grounding detail",
    ],
    classification: {
      tag: "neutral",
      reasons: ["classifier retained this exact reason"],
      hardUnsafe: [],
    },
    validation: {
      compliant: true,
      flags: [],
      signals: {
        iStatement: true,
        personalHistory: false,
        curiosityQuestion: false,
      },
    },
    guardrailTrigger: false,
    provider: "codex",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    mock: false,
    sessionId: "provider_session_exact",
    usage: {
      inputTokens: 321,
      outputTokens: 87,
      cachedInputTokens: 100,
      reasoningOutputTokens: 12,
    },
    stopReason: "end_turn",
    isError: false,
    durationMs: 1_234,
    costUsd: 0,
    costAvailable: false,
    createdAt: "2026-07-19T12:00:04.000Z",
    ...overrides,
  };
}

test("generation-attempt repository persists the complete schema without altering audit text", async () => {
  const attempt = generationAttempt();

  assert.deepEqual(await db.insertGenerationAttempt(attempt), attempt);
  assert.deepEqual(db.listGenerationAttemptsByRun(attempt.runId), [attempt]);

  const [persisted] = JSON.parse(readFileSync(attemptsPath, "utf8"));
  assert.deepEqual(persisted, attempt);
  assert.equal(persisted.systemPrompt, attempt.systemPrompt);
  assert.equal(persisted.userPrompt, attempt.userPrompt);
  assert.equal(persisted.responseText, attempt.responseText);
  assert.deepEqual(persisted.rejectionReasons, attempt.rejectionReasons);
  assert.deepEqual(persisted.classification, attempt.classification);
  assert.deepEqual(persisted.validation, attempt.validation);

  assert.equal(permissions(storeDir), 0o700);
  for (const file of storeFiles) {
    assert.equal(permissions(join(storeDir, file)), 0o600, `${file} should be private`);
  }
});

test("generation-attempt summaries redact exact prompts and response but retain debugging fields", () => {
  const attempt = generationAttempt();
  const summary = summarizeGenerationAttempt(attempt);

  assert.equal(Object.hasOwn(summary, "systemPrompt"), false);
  assert.equal(Object.hasOwn(summary, "userPrompt"), false);
  assert.equal(Object.hasOwn(summary, "responseText"), false);
  assert.equal(summary.id, attempt.id);
  assert.equal(summary.promptHash, attempt.promptHash);
  assert.deepEqual(summary.rejectionReasons, attempt.rejectionReasons);
  assert.deepEqual(summary.classification, attempt.classification);
  assert.deepEqual(summary.validation, attempt.validation);
  assert.deepEqual(summary.usage, attempt.usage);
});

test("generation-attempt pagination parser applies defaults and rejects unsafe queries", () => {
  assert.deepEqual(
    parseGenerationAttemptPagination("http://localhost/api/runs/run_audit/attempts"),
    { page: 1, pageSize: 20, offset: 0 },
  );
  assert.deepEqual(
    parseGenerationAttemptPagination(
      new URL("http://localhost/api/runs/run_audit/attempts?page=3&pageSize=7"),
    ),
    { page: 3, pageSize: 7, offset: 14 },
  );

  for (const query of [
    "page=0",
    "page=-1",
    "page=1.5",
    "page=1x",
    "pageSize=0",
    "pageSize=51",
    "pageSize=2.5",
    "page=9007199254740992",
  ]) {
    assert.throws(
      () =>
        parseGenerationAttemptPagination(
          `http://localhost/api/runs/run_audit/attempts?${query}`,
        ),
      /positive integer|at most|too large/i,
    );
  }
});

test("generation-attempt listing filters by run and sorts by turn, attempt, then timestamp", async () => {
  const records = [
    generationAttempt({
      id: "attempt_turn_8",
      turnIndex: 8,
      attempt: 0,
      createdAt: "2026-07-19T12:00:01.000Z",
    }),
    generationAttempt({
      id: "attempt_turn_2_retry",
      turnIndex: 2,
      attempt: 1,
      createdAt: "2026-07-19T12:00:02.000Z",
    }),
    generationAttempt({
      id: "attempt_turn_2_initial_later",
      turnIndex: 2,
      attempt: 0,
      createdAt: "2026-07-19T12:00:03.000Z",
    }),
    generationAttempt({
      id: "attempt_turn_2_initial_earlier",
      turnIndex: 2,
      attempt: 0,
      createdAt: "2026-07-19T12:00:01.500Z",
    }),
    generationAttempt({
      id: "attempt_other_run",
      runId: "run_other",
      turnIndex: 0,
      attempt: 0,
      createdAt: "2026-07-19T11:00:00.000Z",
    }),
  ];
  for (const record of records) await db.insertGenerationAttempt(record);

  assert.deepEqual(
    db.listGenerationAttemptsByRun("run_audit").map((attempt) => attempt.id),
    [
      "attempt_turn_2_initial_earlier",
      "attempt_turn_2_initial_later",
      "attempt_turn_2_retry",
      "attempt_default",
      "attempt_turn_8",
    ],
  );
  assert.deepEqual(
    db.listGenerationAttemptsByRun("run_other").map((attempt) => attempt.id),
    ["attempt_other_run"],
  );
  assert.deepEqual(db.listGenerationAttemptsByRun("run_missing"), []);

  assert.equal(db.countGenerationAttemptsByRun("run_audit"), 5);
  assert.equal(db.countGenerationAttemptsByRun("run_other"), 1);
  assert.equal(db.countGenerationAttemptsByRun("run_missing"), 0);
  assert.equal(
    db.getGenerationAttemptByRun("run_audit", "attempt_default")?.responseText,
    generationAttempt().responseText,
  );
  assert.equal(
    db.getGenerationAttemptByRun("run_audit", "attempt_other_run"),
    undefined,
    "a detail lookup must not cross run ownership",
  );
  assert.deepEqual(
    db.listGenerationAttemptPageByRun("run_audit", 1, 2),
    {
      attempts: [
        records.find((record) => record.id === "attempt_turn_2_initial_later"),
        records.find((record) => record.id === "attempt_turn_2_retry"),
      ],
      total: 5,
    },
  );
  assert.throws(
    () => db.listGenerationAttemptPageByRun("run_audit", -1, 2),
    /offset must be a non-negative integer/,
  );
  assert.throws(
    () => db.listGenerationAttemptPageByRun("run_audit", 0, 0),
    /limit must be a positive integer/,
  );
});

test("generation-attempt repository rejects a duplicate immutable audit id", async () => {
  const before = readFileSync(attemptsPath, "utf8");

  await assert.rejects(
    db.insertGenerationAttempt(
      generationAttempt({
        id: "attempt_default",
        responseText: "A later record must not overwrite the original response.",
      }),
    ),
    /Generation attempt already exists: attempt_default/,
  );
  assert.equal(readFileSync(attemptsPath, "utf8"), before);
  assert.equal(
    db.listGenerationAttemptsByRun("run_audit").find(
      (attempt) => attempt.id === "attempt_default",
    ).responseText,
    generationAttempt().responseText,
  );
});

test("generation-attempt audit fails closed without replacing a corrupt store", async () => {
  const corrupt = "{ definitely not valid generation-attempt JSON";
  writeFileSync(attemptsPath, corrupt, "utf8");

  assert.throws(
    () => db.listGenerationAttemptsByRun("run_audit"),
    /Cannot read persistent generation-attempt audit store .*generation_attempts\.json/,
  );
  assert.throws(
    () => db.countGenerationAttemptsByRun("run_audit"),
    /Cannot read persistent generation-attempt audit store .*generation_attempts\.json/,
  );
  assert.throws(
    () => db.getGenerationAttemptByRun("run_audit", "attempt_default"),
    /Cannot read persistent generation-attempt audit store .*generation_attempts\.json/,
  );
  assert.throws(
    () => db.listGenerationAttemptPageByRun("run_audit", 0, 20),
    /Cannot read persistent generation-attempt audit store .*generation_attempts\.json/,
  );
  await assert.rejects(
    db.insertGenerationAttempt(
      generationAttempt({ id: "attempt_after_corruption" }),
    ),
    /Cannot read persistent generation-attempt audit store .*generation_attempts\.json/,
  );
  assert.equal(readFileSync(attemptsPath, "utf8"), corrupt);
});
