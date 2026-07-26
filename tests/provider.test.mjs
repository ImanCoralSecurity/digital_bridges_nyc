import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentError,
  buildCodexArgs,
  parseCodexJsonl,
} from "../lib/codexProtocol.ts";
import {
  DEFAULT_AGENT_PROVIDER,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  defaultModelForProvider,
  modelMatchesProvider,
  resolveProvider,
} from "../lib/providers.ts";
import {
  GPT_MODEL_IDS,
  isSelectableGptModel,
} from "../lib/gptModels.ts";

test("provider constants default to Codex GPT-5.5 with medium reasoning", () => {
  assert.equal(DEFAULT_AGENT_PROVIDER, "codex");
  assert.equal(DEFAULT_CODEX_MODEL, "gpt-5.5");
  assert.equal(DEFAULT_CODEX_REASONING_EFFORT, "medium");
});

test("provider helpers preserve legacy Claude records and validate pairings", () => {
  assert.equal(resolveProvider(undefined, "claude-haiku-4-5-20251001"), "claude");
  assert.equal(resolveProvider(undefined, "gpt-5.5"), "codex");
  assert.equal(defaultModelForProvider("codex"), "gpt-5.5");
  assert.equal(modelMatchesProvider("codex", "gpt-5.5"), true);
  assert.equal(modelMatchesProvider("codex", "claude-opus-4-6"), false);
  assert.equal(modelMatchesProvider("claude", "claude-opus-4-6"), true);
});

test("dashboard GPT catalog contains no Anthropic models and keeps GPT-5.5 selectable", () => {
  assert.deepEqual(GPT_MODEL_IDS, [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.3-codex-spark",
  ]);
  assert.ok(GPT_MODEL_IDS.every((model) => model.startsWith("gpt-")));
  assert.equal(isSelectableGptModel("gpt-5.5"), true);
  assert.equal(isSelectableGptModel("gpt-5.4"), false);
  assert.equal(isSelectableGptModel("gpt-5.4-mini"), false);
  assert.equal(isSelectableGptModel("claude-opus-4-6"), false);
});

test("Codex args pin GPT-5.5 medium and isolate text generation", () => {
  const args = buildCodexArgs({
    system: "You are a fictional persona.",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    instructionsFile: "/tmp/codex-agent-instructions.md",
  });
  assert.deepEqual(args.slice(0, 3), ["-a", "never", "exec"]);
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--ephemeral"));
  assert.ok(args.includes("--ignore-user-config"));
  assert.ok(args.includes("--skip-git-repo-check"));
  assert.ok(args.includes("read-only"));
  assert.equal(args[args.indexOf("--model") + 1], "gpt-5.5");
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.ok(args.includes('developer_instructions="You are a fictional persona."'));
  assert.ok(args.includes('web_search="disabled"'));
  assert.ok(args.includes("shell_tool"));
  assert.ok(args.includes("unified_exec"));
  for (const feature of [
    "apps",
    "browser_use",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "computer_use",
    "image_generation",
    "in_app_browser",
    "multi_agent",
  ]) {
    const index = args.indexOf(feature);
    assert.ok(index > 0, `${feature} is explicitly disabled`);
    assert.equal(args[index - 1], "--disable");
  }
  assert.equal(args.at(-1), "-");
});

test("Codex JSONL parser returns final message, thread, and usage", () => {
  const parsed = parseCodexJsonl(
    [
      JSON.stringify({ type: "thread.started", thread_id: "thread_123" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_1", type: "agent_message", text: "first draft" },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_2", type: "agent_message", text: "final answer" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 120,
          cached_input_tokens: 20,
          output_tokens: 15,
          reasoning_output_tokens: 4,
        },
      }),
    ].join("\n"),
  );
  assert.equal(parsed.text, "final answer");
  assert.equal(parsed.threadId, "thread_123");
  assert.deepEqual(parsed.usage, {
    inputTokens: 120,
    cachedInputTokens: 20,
    outputTokens: 15,
    reasoningOutputTokens: 4,
  });
});

test("Codex JSONL parser surfaces a failed turn", () => {
  assert.throws(
    () =>
      parseCodexJsonl(
        JSON.stringify({ type: "turn.failed", error: { message: "rate limit 429" } }),
      ),
    (error) => error instanceof AgentError && error.retryable,
  );
});

test("Codex JSONL parser rejects a truncated response even when it contains text", () => {
  assert.throws(
    () =>
      parseCodexJsonl(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "partial answer" },
        }),
      ),
    (error) => error instanceof AgentError && error.retryable,
  );
});
