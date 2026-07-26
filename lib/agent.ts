// Provider-neutral CLI agent runtime (server-only).
//
// Real calls are dispatched to either:
//   - Codex: `codex -a never exec ... --json -` (prompt on stdin)
//   - Claude: `claude -p ... --output-format json --max-turns 1`
//
// A shared process pool caps concurrency across providers. Both adapters use
// the same timeout/retry policy and normalize output into AgentCallResult.

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentError,
  buildCodexArgs,
  parseCodexJsonl,
} from "./codexProtocol";
import type { ParsedCodexResult } from "./codexProtocol";
import { getConfig } from "./config";
import { log } from "./logger";
import { normalizeReasoningEffort } from "./providers";
import type {
  AgentCallResult,
  AgentOutputSchema,
  AgentProvider,
  ReasoningEffort,
} from "./types";

export interface ProviderHealth {
  installed: boolean;
  available: boolean;
  version: string;
  authStatus?: string;
}

export interface AgentCallOptions {
  provider: AgentProvider;
  system: string;
  message: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
  /** Optional strict JSON Schema for the provider's final response. */
  responseSchema?: AgentOutputSchema;
}

function serializeOutputSchema(schema: AgentOutputSchema): string {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new AgentError("agent output schema must be a JSON object");
  }
  try {
    const serialized = JSON.stringify(schema);
    if (!serialized) throw new Error("schema did not serialize");
    return serialized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError(`could not serialize agent output schema: ${message}`);
  }
}

// --- shared bounded process pool ------------------------------------------

const MAX = Math.max(1, getConfig().maxConcurrency);
let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX) {
      active++;
      resolve();
    } else {
      waiters.push(() => {
        active++;
        resolve();
      });
    }
  });
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

// --- refusal / guardrail detection ---------------------------------------

const REFUSAL_RE =
  /\b(i can't help with that|i cannot help with that|i'm not able to|i am not able to|i can't assist|i won't be able to)\b/i;

function detectGuardrail(text: string, stopReason: string | null): boolean {
  return stopReason === "refusal" || REFUSAL_RE.test(text);
}

function retryableMessage(message: string): boolean {
  return /rate limit|429|overloaded|529|timeout|timed out|ETIMEDOUT|ECONNRESET|temporarily unavailable/i.test(
    message,
  );
}

// --- provider availability ------------------------------------------------

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try {
      // CLI launchers may spawn a native child. Each adapter creates a detached
      // process group so the whole tree receives timeout signals.
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to signaling the direct child.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // The process may already have exited.
  }
}

interface CommandOutput {
  installed: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

function commandOutput(command: string, args: string[]): Promise<CommandOutput> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: CommandOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      signalProcessTree(child, "SIGTERM");
      const killTimer = setTimeout(() => signalProcessTree(child, "SIGKILL"), 1_000);
      killTimer.unref();
      finish({ installed: true, status: null, stdout, stderr: stderr || "Command timed out." });
    }, 5_000);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        installed: error.code !== "ENOENT",
        status: null,
        stdout,
        stderr: error.message,
      });
    });
    child.on("close", (status) => finish({ installed: true, status, stdout, stderr }));
  });
}

let healthCache:
  | { expiresAt: number; value: Record<AgentProvider, ProviderHealth> }
  | undefined;

export async function checkAgentProviders(): Promise<Record<AgentProvider, ProviderHealth>> {
  if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.value;

  // Run independent checks in parallel so a slow CLI never blocks the Node
  // event loop or serially delays the health endpoint.
  const [codexVersion, codexAuth, claudeVersion] = await Promise.all([
    commandOutput("codex", ["--version"]),
    commandOutput("codex", ["login", "status"]),
    commandOutput("claude", ["--version"]),
  ]);
  const value: Record<AgentProvider, ProviderHealth> = {
    codex: {
      installed: codexVersion.installed,
      available:
        codexVersion.installed && codexVersion.status === 0 && codexAuth.status === 0,
      version: codexVersion.status === 0 ? codexVersion.stdout.trim() : "",
      authStatus: `${codexAuth.stdout}${codexAuth.stderr}`.trim(),
    },
    claude: {
      installed: claudeVersion.installed,
      // Claude has no cheap non-generating auth-status command in this adapter.
      available: claudeVersion.installed && claudeVersion.status === 0,
      version: claudeVersion.status === 0 ? claudeVersion.stdout.trim() : "",
    },
  };
  healthCache = { expiresAt: Date.now() + 30_000, value };
  return value;
}

// --- Claude adapter -------------------------------------------------------

interface RawClaudeResult {
  result?: string;
  structured_output?: unknown;
  session_id: string | null;
  total_cost_usd: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason: string | null;
  is_error: boolean;
  api_error_status: number | null;
  duration_ms: number;
}

export function buildClaudeArgs(opts: {
  system: string;
  message: string;
  model: string;
  outputSchema?: AgentOutputSchema;
}): string[] {
  const args = [
    "-p",
    opts.message,
    "--append-system-prompt",
    opts.system,
    "--model",
    opts.model,
    "--output-format",
    "json",
    "--max-turns",
    "1",
  ];
  if (opts.outputSchema) {
    args.push("--json-schema", serializeOutputSchema(opts.outputSchema));
  }
  return args;
}

function runClaudeOnce(opts: {
  system: string;
  message: string;
  model: string;
  timeoutMs: number;
  outputSchema?: AgentOutputSchema;
}): Promise<RawClaudeResult> {
  const args = buildClaudeArgs(opts);

  return new Promise<RawClaudeResult>((resolve, reject) => {
    const child = spawn("claude", args, {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      let finished = false;
      let killTimer: NodeJS.Timeout | undefined;
      const finishTimeout = () => {
        if (finished) return;
        finished = true;
        if (killTimer) clearTimeout(killTimer);
        reject(new AgentError(`claude call timed out after ${opts.timeoutMs}ms`, true));
      };
      child.once("close", finishTimeout);
      signalProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => {
        signalProcessTree(child, "SIGKILL");
        finishTimeout();
      }, 2_000);
    }, opts.timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new AgentError(
              "`claude` CLI not found on PATH. Install/authenticate it, select Codex, or use mock mode.",
            )
          : new AgentError(`failed to spawn claude: ${err.message}`, true),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new AgentError(
            `claude exited ${code}: ${stderr.slice(0, 500)}`,
            retryableMessage(stderr),
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout) as RawClaudeResult);
      } catch {
        reject(new AgentError(`could not parse claude JSON output: ${stdout.slice(0, 300)}`, true));
      }
    });
  });
}

// --- Codex adapter --------------------------------------------------------

function runCodexProcess(opts: {
  system: string;
  message: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs: number;
  outputSchemaPath?: string;
}): Promise<ParsedCodexResult> {
  const args = buildCodexArgs(opts);
  return new Promise<ParsedCodexResult>((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      let finished = false;
      let killTimer: NodeJS.Timeout | undefined;
      const finishTimeout = () => {
        if (finished) return;
        finished = true;
        if (killTimer) clearTimeout(killTimer);
        reject(new AgentError(`codex call timed out after ${opts.timeoutMs}ms`, true));
      };
      child.once("close", finishTimeout);
      // The npm launcher forwards SIGTERM to its native child. Escalate the
      // entire detached group only if it does not exit within the grace period.
      signalProcessTree(child, "SIGTERM");
      killTimer = setTimeout(() => {
        signalProcessTree(child, "SIGKILL");
        finishTimeout();
      }, 2_000);
    }, opts.timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.stdin.on("error", () => undefined);
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new AgentError(
              "`codex` CLI not found on PATH. Install it, run `codex login`, or use mock mode.",
            )
          : new AgentError(`failed to spawn codex: ${err.message}`, true),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new AgentError(
            `codex exited ${code}: ${(stderr || stdout).slice(0, 700)}`,
            retryableMessage(`${stderr}\n${stdout}`),
          ),
        );
        return;
      }
      try {
        resolve(parseCodexJsonl(stdout));
      } catch (error) {
        reject(
          error instanceof AgentError
            ? error
            : new AgentError(`could not parse codex JSONL: ${String(error)}`, true),
        );
      }
    });

    child.stdin.end(opts.message);
  });
}

async function runCodexOnce(opts: {
  system: string;
  message: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  timeoutMs: number;
  outputSchema?: AgentOutputSchema;
}): Promise<ParsedCodexResult> {
  if (!opts.outputSchema) return runCodexProcess(opts);

  const schemaJson = serializeOutputSchema(opts.outputSchema);
  let schemaDir: string;
  try {
    schemaDir = await mkdtemp(join(tmpdir(), "digital-bridges-output-schema-"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError(`could not create Codex output-schema directory: ${message}`);
  }
  const outputSchemaPath = join(schemaDir, "schema.json");
  try {
    await writeFile(outputSchemaPath, schemaJson, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return await runCodexProcess({ ...opts, outputSchemaPath });
  } catch (error) {
    if (error instanceof AgentError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AgentError(`could not prepare Codex output schema: ${message}`);
  } finally {
    try {
      await rm(schemaDir, { recursive: true, force: true });
    } catch (error) {
      log.warn("could not remove temporary Codex output-schema directory", {
        directory: schemaDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// --- provider-neutral public API -----------------------------------------

const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callAgentCLI(opts: AgentCallOptions): Promise<AgentCallResult> {
  const cfg = getConfig();
  const timeoutMs = opts.timeoutMs || cfg.callTimeoutMs;
  const reasoningEffort =
    opts.provider === "codex" ? normalizeReasoningEffort(opts.reasoningEffort) : undefined;

  await acquire();
  const started = Date.now();
  try {
    let lastErr: AgentError | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (opts.provider === "codex") {
          const raw = await runCodexOnce({
            system: opts.system,
            message: opts.message,
            model: opts.model,
            reasoningEffort,
            timeoutMs,
            outputSchema: opts.responseSchema,
          });
          return {
            text: raw.text,
            sessionId: raw.threadId,
            costUsd: 0,
            costAvailable: false,
            usage: raw.usage,
            stopReason: raw.stopReason,
            isError: false,
            durationMs: Date.now() - started,
            provider: "codex",
            model: opts.model,
            reasoningEffort,
            mock: false,
            guardrailTrigger: detectGuardrail(raw.text, raw.stopReason),
          };
        }

        const raw = await runClaudeOnce({
          system: opts.system,
          message: opts.message,
          model: opts.model,
          timeoutMs,
          outputSchema: opts.responseSchema,
        });
        if (raw.is_error) {
          const retryable = raw.api_error_status === 429 || (raw.api_error_status ?? 0) >= 500;
          throw new AgentError(
            `claude returned is_error (status ${raw.api_error_status})`,
            retryable,
          );
        }
        const text = raw.structured_output === undefined
          ? (raw.result ?? "").trim()
          : JSON.stringify(raw.structured_output);
        return {
          text,
          sessionId: raw.session_id ?? null,
          costUsd: raw.total_cost_usd ?? 0,
          costAvailable: true,
          usage: {
            inputTokens: raw.usage?.input_tokens ?? 0,
            outputTokens: raw.usage?.output_tokens ?? 0,
          },
          stopReason: raw.stop_reason ?? null,
          isError: false,
          durationMs: Date.now() - started,
          provider: "claude",
          model: opts.model,
          mock: false,
          guardrailTrigger: detectGuardrail(text, raw.stop_reason ?? null),
        };
      } catch (error) {
        const err = error instanceof AgentError ? error : new AgentError(String(error), true);
        lastErr = err;
        if (!err.retryable || attempt === MAX_RETRIES) throw err;
        const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        log.warn("agent call failed, retrying", {
          provider: opts.provider,
          attempt,
          backoff,
          error: err.message,
        });
        await sleep(backoff);
      }
    }
    throw lastErr ?? new AgentError("unknown agent error");
  } finally {
    release();
  }
}

/** Synthesize an AgentCallResult for deterministic mock mode. */
export function mockResult(
  text: string,
  guardrailTrigger: boolean,
  provider: AgentProvider,
  model: string,
  reasoningEffort?: ReasoningEffort,
): AgentCallResult {
  return {
    text: text.trim(),
    sessionId: null,
    costUsd: 0,
    costAvailable: true,
    usage: { inputTokens: 0, outputTokens: 0 },
    stopReason: "end_turn",
    isError: false,
    durationMs: 0,
    provider,
    model,
    reasoningEffort: provider === "codex" ? normalizeReasoningEffort(reasoningEffort) : undefined,
    mock: true,
    guardrailTrigger,
  };
}
