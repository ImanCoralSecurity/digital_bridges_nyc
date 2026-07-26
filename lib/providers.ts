// Browser-safe provider/model defaults and normalization helpers.

import type { AgentProvider, ReasoningEffort } from "./types";

export const DEFAULT_AGENT_PROVIDER: AgentProvider = "codex";
export const DEFAULT_CODEX_MODEL = "gpt-5.5";
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_CODEX_REASONING_EFFORT: ReasoningEffort = "medium";

export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === "codex" || value === "claude";
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && REASONING_EFFORTS.includes(value as ReasoningEffort);
}

/** Preserve old provider-less records by recognizing their Claude model ids. */
export function resolveProvider(value: unknown, model?: string): AgentProvider {
  if (isAgentProvider(value)) return value;
  return model?.toLowerCase().startsWith("claude") ? "claude" : DEFAULT_AGENT_PROVIDER;
}

export function defaultModelForProvider(provider: AgentProvider): string {
  return provider === "codex" ? DEFAULT_CODEX_MODEL : DEFAULT_CLAUDE_MODEL;
}

export function modelMatchesProvider(provider: AgentProvider, model: string): boolean {
  const claudeModel = model.toLowerCase().startsWith("claude");
  return provider === "claude" ? claudeModel : !claudeModel;
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return isReasoningEffort(value) ? value : DEFAULT_CODEX_REASONING_EFFORT;
}
