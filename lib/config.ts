// Runtime configuration (server-only). Reads env with safe defaults.
// See .env.example for documentation of each value.

import {
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CLAUDE_MODEL,
  defaultModelForProvider,
  isAgentProvider,
  normalizeReasoningEffort,
  resolveProvider,
} from "./providers";
import type { AgentProvider, ReasoningEffort } from "./types";

export interface AppConfig {
  /** Force mock mode for every run regardless of per-run setting. */
  forceMock: boolean;
  defaultProvider: AgentProvider;
  defaultModel: string;
  defaultReasoningEffort: ReasoningEffort;
  callTimeoutMs: number;
  maxConcurrency: number;
  defaultBudgetUsd: number;
  /** Semantic reviewer used before any generated turn is visible. */
  semanticValidatorEnabled: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getConfig(): AppConfig {
  // DBRIDGES_DEFAULT_MODEL and DBRIDGES_MOCK_CLAUDE remain supported for
  // deployments created before the provider abstraction was introduced.
  const legacyModel = process.env.DBRIDGES_DEFAULT_MODEL;
  const requestedProvider = process.env.DBRIDGES_DEFAULT_PROVIDER;
  const explicitProvider = isAgentProvider(requestedProvider) ? requestedProvider : undefined;
  const defaultProvider = explicitProvider
    ? explicitProvider
    : legacyModel
      ? resolveProvider(undefined, legacyModel)
      : DEFAULT_AGENT_PROVIDER;
  const providerModel =
    defaultProvider === "codex"
      ? process.env.DBRIDGES_CODEX_DEFAULT_MODEL || DEFAULT_CODEX_MODEL
      : process.env.DBRIDGES_CLAUDE_DEFAULT_MODEL || DEFAULT_CLAUDE_MODEL;
  return {
    forceMock:
      process.env.DBRIDGES_MOCK_AGENTS === "1" ||
      process.env.DBRIDGES_MOCK_CLAUDE === "1",
    defaultProvider,
    // New provider-specific settings win over the legacy all-provider model.
    // Without an explicit provider, the legacy model remains authoritative and
    // also determines the inferred provider for backward compatibility.
    defaultModel:
      (!explicitProvider && legacyModel) || providerModel || defaultModelForProvider(defaultProvider),
    defaultReasoningEffort: normalizeReasoningEffort(
      process.env.DBRIDGES_CODEX_REASONING_EFFORT,
    ),
    callTimeoutMs: num(process.env.DBRIDGES_CALL_TIMEOUT_MS, 120_000),
    maxConcurrency: num(process.env.DBRIDGES_MAX_CONCURRENCY, 4),
    defaultBudgetUsd: num(process.env.DBRIDGES_DEFAULT_BUDGET_USD, 2.0),
    semanticValidatorEnabled: process.env.DBRIDGES_SEMANTIC_VALIDATOR !== "0",
  };
}
