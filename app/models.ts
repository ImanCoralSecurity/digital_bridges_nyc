// Browser-safe catalog for the GPT model and reasoning controls on the dashboard.

import {
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
} from "@/lib/providers";
import { GPT_MODEL_GROUPS, isSelectableGptModel } from "@/lib/gptModels";
import type { ReasoningEffort } from "@/lib/types";

export { GPT_MODEL_GROUPS };

export const REASONING_OPTIONS: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
];

export const DEFAULT_PROVIDER_ID = DEFAULT_AGENT_PROVIDER;
export const DEFAULT_MODEL_ID = DEFAULT_CODEX_MODEL;
export const DEFAULT_REASONING_EFFORT = DEFAULT_CODEX_REASONING_EFFORT;

export function isKnownUiModel(model: string): boolean {
  return isSelectableGptModel(model);
}
