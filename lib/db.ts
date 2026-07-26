// JSON-file data store (server-only). Zero native dependencies so the app runs
// anywhere Node runs. The repository interface is deliberately small so it can
// be swapped for SQLite/Postgres later without touching callers.
//
// Writes are serialized per-collection with an async mutex and made atomic via
// temp-file + rename, which is sufficient for this single-node local tool.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { deriveProjectStatus } from "./projectRules";
import type {
  ContentAsset,
  GenerationAttempt,
  Job,
  Project,
  PublishLog,
  Run,
  SemanticValidationAttempt,
  Turn,
} from "./types";

const STORE_DIR = process.env.DBRIDGES_STORE_DIR
  ? resolve(process.env.DBRIDGES_STORE_DIR)
  : join(process.cwd(), "data", "store");

const FILES = {
  runs: join(STORE_DIR, "runs.json"),
  projects: join(STORE_DIR, "projects.json"),
  turns: join(STORE_DIR, "turns.json"),
  generationAttempts: join(STORE_DIR, "generation_attempts.json"),
  semanticValidationAttempts: join(STORE_DIR, "semantic_validation_attempts.json"),
  assets: join(STORE_DIR, "assets.json"),
  publishLogs: join(STORE_DIR, "publish_logs.json"),
  jobs: join(STORE_DIR, "jobs.json"),
} as const;

function ensureStore() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
  // Audit prompts and provider responses can contain sensitive dialogue. Keep
  // both newly created and pre-existing stores private to this OS account.
  chmodSync(STORE_DIR, 0o700);
  for (const f of Object.values(FILES)) {
    if (!existsSync(f)) {
      writeFileSync(f, "[]", { encoding: "utf8", mode: 0o600 });
    }
    chmodSync(f, 0o600);
  }
}

function readAll<T>(file: string, failClosedLabel = ""): T[] {
  ensureStore();
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T[];
  } catch (error) {
    if (failClosedLabel) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot read persistent ${failClosedLabel} store ${file}: ${message}`);
    }
    return [];
  }
}

function readJobs(): Job[] {
  return readAll<Job>(FILES.jobs, "job");
}

function readGenerationAttempts(): GenerationAttempt[] {
  return readAll<GenerationAttempt>(FILES.generationAttempts, "generation-attempt audit");
}

function readSemanticValidationAttempts(): SemanticValidationAttempt[] {
  return readAll<SemanticValidationAttempt>(
    FILES.semanticValidationAttempts,
    "semantic-validation audit",
  );
}

function writeAll<T>(file: string, items: T[]): void {
  ensureStore();
  const tmp = `${file}.tmp`;
  // A stale temp file may have survived a crash with broader permissions.
  // Tighten it before writing as well as after creation so sensitive data is
  // never exposed during the atomic replacement window.
  if (existsSync(tmp)) chmodSync(tmp, 0o600);
  writeFileSync(tmp, JSON.stringify(items, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

// Per-file async mutex to serialize read-modify-write.
class Mutex {
  private p: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = this.p.then(() => fn());
    this.p = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
type CollectionLocks = Record<keyof typeof FILES, Mutex>;
const globalForDb = globalThis as typeof globalThis & {
  __digitalBridgesDbLocks?: CollectionLocks;
};
const existingLocks = globalForDb.__digitalBridgesDbLocks;
const locks: CollectionLocks = {
  runs: existingLocks?.runs ?? new Mutex(),
  projects: existingLocks?.projects ?? new Mutex(),
  turns: existingLocks?.turns ?? new Mutex(),
  generationAttempts: existingLocks?.generationAttempts ?? new Mutex(),
  // A development hot reload can retain a lock map created before a new
  // collection existed. Initialize the missing lock without replacing mutexes
  // already serializing writes for the other collections.
  semanticValidationAttempts:
    existingLocks?.semanticValidationAttempts ?? new Mutex(),
  assets: existingLocks?.assets ?? new Mutex(),
  publishLogs: existingLocks?.publishLogs ?? new Mutex(),
  jobs: existingLocks?.jobs ?? new Mutex(),
};
globalForDb.__digitalBridgesDbLocks = locks;

// --- runs ------------------------------------------------------------------

export function insertRun(run: Run): Promise<Run> {
  return locks.runs.run(() => {
    const runs = readAll<Run>(FILES.runs);
    runs.push(run);
    writeAll(FILES.runs, runs);
    return run;
  });
}

export function updateRun(id: string, patch: Partial<Run>): Promise<Run> {
  return locks.runs.run(() => {
    const runs = readAll<Run>(FILES.runs);
    const i = runs.findIndex((r) => r.id === id);
    if (i === -1) throw new Error(`Run not found: ${id}`);
    runs[i] = { ...runs[i], ...patch, updatedAt: new Date().toISOString() };
    writeAll(FILES.runs, runs);
    return runs[i];
  });
}

export function getRun(id: string): Run | undefined {
  return readAll<Run>(FILES.runs).find((r) => r.id === id);
}

export function listRuns(): Run[] {
  return readAll<Run>(FILES.runs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- background jobs ------------------------------------------------------

export function insertJob(job: Job): Promise<Job> {
  return locks.jobs.run(() => {
    const jobs = readJobs();
    if (jobs.some((item) => item.id === job.id)) {
      throw new Error(`Job already exists: ${job.id}`);
    }
    if (
      jobs.some(
        (item) =>
          item.projectId === job.projectId &&
          item.sessionId === job.sessionId &&
          (item.status === "queued" ||
            item.status === "running" ||
            item.status === "pause-requested" ||
            item.status === "paused" ||
            item.status === "cancel-requested"),
      )
    ) {
      throw new Error(`Session ${job.sessionId} already has an active job.`);
    }
    jobs.push(job);
    writeAll(FILES.jobs, jobs);
    return job;
  });
}

export function getJob(id: string): Job | undefined {
  return readJobs().find((job) => job.id === id);
}

export function listJobs(): Job[] {
  return readJobs().sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function updateJob(id: string, patch: Partial<Job>): Promise<Job> {
  return locks.jobs.run(() => {
    const jobs = readJobs();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) throw new Error(`Job not found: ${id}`);
    jobs[index] = { ...jobs[index], ...patch, id };
    writeAll(FILES.jobs, jobs);
    return jobs[index];
  });
}

/** Atomically transform the whole job collection and return a derived value. */
export function mutateJobs<T>(
  mutate: (jobs: Job[]) => { jobs: Job[]; result: T },
): Promise<T> {
  return locks.jobs.run(() => {
    const current = readJobs();
    const next = mutate(current);
    writeAll(FILES.jobs, next.jobs);
    return next.result;
  });
}

// --- projects --------------------------------------------------------------

export function insertProject(project: Project): Promise<Project> {
  return locks.projects.run(() => {
    const projects = readAll<Project>(FILES.projects);
    projects.push(project);
    writeAll(FILES.projects, projects);
    return project;
  });
}

export function getProject(id: string): Project | undefined {
  return readAll<Project>(FILES.projects).find((project) => project.id === id);
}

export function listProjects(): Project[] {
  return readAll<Project>(FILES.projects).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Delete only the mutable project planning aggregate. Historical jobs, runs,
 * turns, validation attempts, generated content, and publishing records live
 * in separate collections and are intentionally not cascaded.
 */
export function deleteProject(id: string): Promise<Project> {
  return locks.projects.run(() => {
    // Deletion must fail closed: a corrupt project store must never be replaced
    // with an apparently valid empty collection.
    const projects = readAll<Project>(FILES.projects, "project");
    const index = projects.findIndex((project) => project.id === id);
    if (index === -1) throw new Error(`Project not found: ${id}`);
    const deleted = projects[index];
    writeAll(
      FILES.projects,
      projects.filter((_, projectIndex) => projectIndex !== index),
    );
    return deleted;
  });
}

/**
 * Remove one session shell without renumbering the surviving stable sessions.
 * The project must retain at least one shell; deleting the whole project is a
 * separate explicit operation.
 */
export function deleteProjectSession(
  projectId: string,
  sessionId: string,
): Promise<Project> {
  return locks.projects.run(() => {
    const projects = readAll<Project>(FILES.projects, "project");
    const projectIndex = projects.findIndex((project) => project.id === projectId);
    if (projectIndex === -1) throw new Error(`Project not found: ${projectId}`);
    const project = projects[projectIndex];
    if (!project.sessions.some((session) => session.id === sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (project.sessions.length === 1) {
      throw new Error(
        "Cannot delete the project's only remaining session; delete the project instead.",
      );
    }

    const sessions = project.sessions.filter((session) => session.id !== sessionId);
    const updated: Project = {
      ...project,
      sessions,
      sessionCount: sessions.length,
      status: deriveProjectStatus(sessions),
      updatedAt: new Date().toISOString(),
    };
    const next = projects.slice();
    next[projectIndex] = updated;
    writeAll(FILES.projects, next);
    return updated;
  });
}

export function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  return locks.projects.run(() => {
    const projects = readAll<Project>(FILES.projects);
    const i = projects.findIndex((project) => project.id === id);
    if (i === -1) throw new Error(`Project not found: ${id}`);
    projects[i] = { ...projects[i], ...patch, updatedAt: new Date().toISOString() };
    writeAll(FILES.projects, projects);
    return projects[i];
  });
}

/** Atomically validate and mutate one project (used to claim a session run). */
export function mutateProject(
  id: string,
  mutate: (project: Project) => Project,
): Promise<Project> {
  return locks.projects.run(() => {
    const projects = readAll<Project>(FILES.projects);
    const i = projects.findIndex((project) => project.id === id);
    if (i === -1) throw new Error(`Project not found: ${id}`);
    const next = mutate(projects[i]);
    projects[i] = { ...next, id, updatedAt: new Date().toISOString() };
    writeAll(FILES.projects, projects);
    return projects[i];
  });
}

// --- turns -----------------------------------------------------------------

export function insertTurn(turn: Turn): Promise<Turn> {
  return locks.turns.run(() => {
    const turns = readAll<Turn>(FILES.turns);
    turns.push(turn);
    writeAll(FILES.turns, turns);
    return turn;
  });
}

export function listTurnsByRun(runId: string): Turn[] {
  return readAll<Turn>(FILES.turns)
    .filter((t) => t.runId === runId)
    .sort((a, b) => a.index - b.index);
}

// --- rejected generation-attempt audit -----------------------------------

export function insertGenerationAttempt(
  attempt: GenerationAttempt,
): Promise<GenerationAttempt> {
  return locks.generationAttempts.run(() => {
    const attempts = readGenerationAttempts();
    if (attempts.some((item) => item.id === attempt.id)) {
      throw new Error(`Generation attempt already exists: ${attempt.id}`);
    }
    attempts.push(attempt);
    writeAll(FILES.generationAttempts, attempts);
    return attempt;
  });
}

export function listGenerationAttemptsByRun(runId: string): GenerationAttempt[] {
  return readGenerationAttempts()
    .filter((attempt) => attempt.runId === runId)
    .sort(
      (a, b) =>
        a.turnIndex - b.turnIndex ||
        a.attempt - b.attempt ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function countGenerationAttemptsByRun(runId: string): number {
  return readGenerationAttempts().filter((attempt) => attempt.runId === runId).length;
}

/** Lookup is deliberately scoped by both identifiers to enforce run ownership. */
export function getGenerationAttemptByRun(
  runId: string,
  attemptId: string,
): GenerationAttempt | undefined {
  return readGenerationAttempts().find(
    (attempt) => attempt.runId === runId && attempt.id === attemptId,
  );
}

export function listGenerationAttemptPageByRun(
  runId: string,
  offset: number,
  limit: number,
): { attempts: GenerationAttempt[]; total: number } {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Generation-attempt page offset must be a non-negative integer.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Generation-attempt page limit must be a positive integer.");
  }
  const attempts = listGenerationAttemptsByRun(runId);
  return {
    attempts: attempts.slice(offset, offset + limit),
    total: attempts.length,
  };
}

// --- semantic-validation audit -------------------------------------------

export function insertSemanticValidationAttempt(
  attempt: SemanticValidationAttempt,
): Promise<SemanticValidationAttempt> {
  return locks.semanticValidationAttempts.run(() => {
    const attempts = readSemanticValidationAttempts();
    if (attempts.some((item) => item.id === attempt.id)) {
      throw new Error(`Semantic validation attempt already exists: ${attempt.id}`);
    }
    attempts.push(attempt);
    writeAll(FILES.semanticValidationAttempts, attempts);
    return attempt;
  });
}

export function listSemanticValidationAttemptsByRun(
  runId: string,
): SemanticValidationAttempt[] {
  return readSemanticValidationAttempts()
    .filter((attempt) => attempt.runId === runId)
    .sort(
      (a, b) =>
        a.turnIndex - b.turnIndex ||
        a.generationAttempt - b.generationAttempt ||
        a.validationAttempt - b.validationAttempt ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

export function countSemanticValidationAttemptsByRun(runId: string): number {
  return readSemanticValidationAttempts().filter(
    (attempt) => attempt.runId === runId,
  ).length;
}

/** Lookup is deliberately scoped by both identifiers to enforce run ownership. */
export function getSemanticValidationAttemptByRun(
  runId: string,
  attemptId: string,
): SemanticValidationAttempt | undefined {
  return readSemanticValidationAttempts().find(
    (attempt) => attempt.runId === runId && attempt.id === attemptId,
  );
}

export function listSemanticValidationAttemptPageByRun(
  runId: string,
  offset: number,
  limit: number,
): { attempts: SemanticValidationAttempt[]; total: number } {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(
      "Semantic-validation-attempt page offset must be a non-negative integer.",
    );
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(
      "Semantic-validation-attempt page limit must be a positive integer.",
    );
  }
  const attempts = listSemanticValidationAttemptsByRun(runId);
  return {
    attempts: attempts.slice(offset, offset + limit),
    total: attempts.length,
  };
}

// --- content assets --------------------------------------------------------

export function insertAsset(asset: ContentAsset): Promise<ContentAsset> {
  return locks.assets.run(() => {
    const assets = readAll<ContentAsset>(FILES.assets);
    assets.push(asset);
    writeAll(FILES.assets, assets);
    return asset;
  });
}

export function updateAsset(id: string, patch: Partial<ContentAsset>): Promise<ContentAsset> {
  return locks.assets.run(() => {
    const assets = readAll<ContentAsset>(FILES.assets);
    const i = assets.findIndex((a) => a.id === id);
    if (i === -1) throw new Error(`Asset not found: ${id}`);
    assets[i] = { ...assets[i], ...patch, updatedAt: new Date().toISOString() };
    writeAll(FILES.assets, assets);
    return assets[i];
  });
}

export function getAsset(id: string): ContentAsset | undefined {
  return readAll<ContentAsset>(FILES.assets).find((a) => a.id === id);
}

export function listAssets(filter?: { runId?: string; status?: string }): ContentAsset[] {
  let items = readAll<ContentAsset>(FILES.assets);
  if (filter?.runId) items = items.filter((a) => a.runId === filter.runId);
  if (filter?.status) items = items.filter((a) => a.status === filter.status);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- publish logs ----------------------------------------------------------

export function insertPublishLog(entry: PublishLog): Promise<PublishLog> {
  return locks.publishLogs.run(() => {
    const logs = readAll<PublishLog>(FILES.publishLogs);
    logs.push(entry);
    writeAll(FILES.publishLogs, logs);
    return entry;
  });
}

export function listPublishLogs(assetId?: string): PublishLog[] {
  const logs = readAll<PublishLog>(FILES.publishLogs);
  return (assetId ? logs.filter((l) => l.assetId === assetId) : logs).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}
