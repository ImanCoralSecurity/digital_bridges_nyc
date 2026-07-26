// Pure Codex CLI protocol helpers. This module intentionally has no local
// runtime imports so Node's native TypeScript test loader can exercise it.

import { join } from "node:path";
import type { AgentUsage, ReasoningEffort } from "./types";

export class AgentError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "AgentError";
    this.retryable = retryable;
  }
}

interface CodexUsageEvent {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

export interface ParsedCodexResult {
  text: string;
  threadId: string | null;
  usage: AgentUsage;
  stopReason: string;
}

function retryableMessage(message: string): boolean {
  return /rate limit|429|overloaded|529|timeout|timed out|ETIMEDOUT|ECONNRESET|temporarily unavailable/i.test(
    message,
  );
}

function eventError(event: Record<string, unknown>): string {
  const error = event.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return String(e.message ?? e.error ?? JSON.stringify(e));
  }
  return String(event.message ?? "Codex turn failed.");
}

/** Parse `codex exec --json` JSONL and return its final agent message. */
export function parseCodexJsonl(stdout: string): ParsedCodexResult {
  let text = "";
  let threadId: string | null = null;
  let usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
  let failure = "";
  let completed = false;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue; // CLI notices belong on stderr, but tolerate them defensively.
    }

    if (event.type === "thread.started") {
      threadId = typeof event.thread_id === "string" ? event.thread_id : threadId;
    } else if (event.type === "item.completed") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === "agent_message" && typeof item.text === "string") text = item.text;
    } else if (event.type === "turn.completed") {
      const u = (event.usage ?? {}) as CodexUsageEvent;
      usage = {
        inputTokens: Number(u.input_tokens) || 0,
        cachedInputTokens: Number(u.cached_input_tokens) || 0,
        outputTokens: Number(u.output_tokens) || 0,
        reasoningOutputTokens: Number(u.reasoning_output_tokens) || 0,
      };
      completed = true;
    } else if (event.type === "turn.failed" || event.type === "error") {
      failure = eventError(event);
    }
  }

  if (!completed && failure) {
    throw new AgentError(`codex failed: ${failure}`, retryableMessage(failure));
  }
  if (!completed) {
    throw new AgentError("codex JSONL ended before turn.completed", true);
  }
  if (!text.trim()) {
    throw new AgentError(
      `codex JSONL contained no final agent message${failure ? `: ${failure}` : ""}`,
      Boolean(failure && retryableMessage(failure)),
    );
  }
  return { text: text.trim(), threadId, usage, stopReason: "end_turn" };
}

function tomlString(value: string): string {
  // JSON basic-string escaping is compatible with TOML for the characters used
  // in prompts and paths, and avoids shell interpolation because spawn gets argv.
  return JSON.stringify(value);
}

export function buildCodexArgs(opts: {
  system: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  instructionsFile?: string;
  outputSchemaPath?: string;
}): string[] {
  const effort = opts.reasoningEffort ?? "medium";
  const instructionsFile =
    opts.instructionsFile ?? join(process.cwd(), "config", "codex-agent-instructions.md");
  const args = [
    "-a",
    "never",
    "exec",
    "--json",
    "--color",
    "never",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--model",
    opts.model,
    "-c",
    `model_reasoning_effort=${tomlString(effort)}`,
    "-c",
    `developer_instructions=${tomlString(opts.system)}`,
    "-c",
    `model_instructions_file=${tomlString(instructionsFile)}`,
    "-c",
    'web_search="disabled"',
    "-c",
    "tools.web_search=false",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
    "--disable",
    "multi_agent",
    "--disable",
    "apps",
    "--disable",
    "browser_use",
    "--disable",
    "browser_use_external",
    "--disable",
    "browser_use_full_cdp_access",
    "--disable",
    "computer_use",
    "--disable",
    "image_generation",
    "--disable",
    "in_app_browser",
  ];
  if (opts.outputSchemaPath) {
    args.push("--output-schema", opts.outputSchemaPath);
  }
  args.push("-");
  return args;
}
