import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

const tempDir = mkdtempSync(join(tmpdir(), "digital-bridges-agent-schema-test-"));
const codexLog = join(tempDir, "codex-log.json");
const claudeLog = join(tempDir, "claude-log.json");
const previousPath = process.env.PATH;
const previousCodexLog = process.env.FAKE_CODEX_SCHEMA_LOG;
const previousClaudeLog = process.env.FAKE_CLAUDE_SCHEMA_LOG;

const fakeCodex = join(tempDir, "codex");
writeFileSync(
  fakeCodex,
  `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
fs.readFileSync(0, "utf8");
const args = process.argv.slice(2);
const schemaFlag = args.indexOf("--output-schema");
if (schemaFlag < 0 || !args[schemaFlag + 1]) throw new Error("missing --output-schema");
const schemaPath = args[schemaFlag + 1];
fs.writeFileSync(process.env.FAKE_CODEX_SCHEMA_LOG, JSON.stringify({
  args,
  schemaPath,
  schema: JSON.parse(fs.readFileSync(schemaPath, "utf8")),
  schemaMode: fs.statSync(schemaPath).mode & 0o777,
  directoryMode: fs.statSync(path.dirname(schemaPath)).mode & 0o777,
}));
const text = JSON.stringify({ verdict: "accept", issues: [] });
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "schema-thread" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 12, output_tokens: 7 } }) + "\\n");
`,
  { mode: 0o700 },
);
chmodSync(fakeCodex, 0o700);

const fakeClaude = join(tempDir, "claude");
writeFileSync(
  fakeClaude,
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_CLAUDE_SCHEMA_LOG, JSON.stringify({ args }));
process.stdout.write(JSON.stringify({
  result: "",
  structured_output: { verdict: "reject", issues: ["off-topic"] },
  session_id: "claude-schema-session",
  total_cost_usd: 0.001,
  usage: { input_tokens: 9, output_tokens: 4 },
  stop_reason: "end_turn",
  is_error: false,
  api_error_status: null,
  duration_ms: 3,
}));
`,
  { mode: 0o700 },
);
chmodSync(fakeClaude, 0o700);

process.env.PATH = `${tempDir}:${previousPath ?? ""}`;
process.env.FAKE_CODEX_SCHEMA_LOG = codexLog;
process.env.FAKE_CLAUDE_SCHEMA_LOG = claudeLog;

const { callAgentCLI } = await import("../lib/agent.ts");

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["accept", "reject"] },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "issues"],
};

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  restoreEnv("PATH", previousPath);
  restoreEnv("FAKE_CODEX_SCHEMA_LOG", previousCodexLog);
  restoreEnv("FAKE_CLAUDE_SCHEMA_LOG", previousClaudeLog);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("Codex receives a private temporary response schema that is cleaned up", async () => {
  const result = await callAgentCLI({
    provider: "codex",
    system: "Return the validation decision.",
    message: "Validate this candidate.",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    timeoutMs: 2_000,
    responseSchema,
  });

  assert.deepEqual(JSON.parse(result.text), { verdict: "accept", issues: [] });
  const logged = JSON.parse(readFileSync(codexLog, "utf8"));
  assert.deepEqual(logged.schema, responseSchema);
  assert.equal(logged.schemaMode, 0o600);
  assert.equal(logged.directoryMode, 0o700);
  assert.equal(logged.args.at(-1), "-");
  assert.equal(existsSync(logged.schemaPath), false);
  assert.equal(existsSync(dirname(logged.schemaPath)), false);
});

test("Claude receives the inline response schema and exposes structured_output as text", async () => {
  const result = await callAgentCLI({
    provider: "claude",
    system: "Return the validation decision.",
    message: "Validate this candidate.",
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 2_000,
    responseSchema,
  });

  assert.deepEqual(JSON.parse(result.text), {
    verdict: "reject",
    issues: ["off-topic"],
  });
  assert.equal(result.sessionId, "claude-schema-session");
  assert.equal(result.costUsd, 0.001);

  const { args } = JSON.parse(readFileSync(claudeLog, "utf8"));
  const schemaFlag = args.indexOf("--json-schema");
  assert.ok(schemaFlag >= 0);
  assert.deepEqual(JSON.parse(args[schemaFlag + 1]), responseSchema);
});
