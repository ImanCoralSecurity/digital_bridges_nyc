#!/usr/bin/env python3
"""Replay one audited Codex generation attempt without mutating application data."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STORE = PROJECT_ROOT / "data" / "store" / "generation_attempts.json"
DEFAULT_INSTRUCTIONS = PROJECT_ROOT / "config" / "codex-agent-instructions.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Replay the exact system and user prompts stored for a rejected Codex "
            "generation attempt. The script is read-only with respect to the app database."
        )
    )
    parser.add_argument("--attempt-id", required=True, help="Audited generation attempt ID")
    parser.add_argument("--store", type=Path, default=DEFAULT_STORE)
    parser.add_argument("--instructions-file", type=Path, default=DEFAULT_INSTRUCTIONS)
    parser.add_argument("--codex-bin", default="codex")
    parser.add_argument(
        "--model",
        help="Override the recorded model. By default the audited model is reused exactly.",
    )
    parser.add_argument(
        "--reasoning-effort",
        choices=("low", "medium", "high", "xhigh"),
        help="Override the recorded reasoning effort.",
    )
    parser.add_argument("--timeout", type=int, default=180, help="Timeout in seconds")
    parser.add_argument(
        "--raw-jsonl",
        action="store_true",
        help="Also write the Codex JSONL protocol stream to stderr.",
    )
    parser.add_argument(
        "--current-challenge-prompt",
        action="store_true",
        help=(
            "Reconstruct this archived challenge with the project's current prompt "
            "builder before calling Codex."
        ),
    )
    return parser.parse_args()


def load_attempt(store: Path, attempt_id: str) -> dict[str, Any]:
    try:
        data = json.loads(store.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Could not read audit store {store}: {error}") from error

    if not isinstance(data, list):
        raise SystemExit(f"Audit store {store} must contain a JSON array.")

    attempt = next(
        (item for item in data if isinstance(item, dict) and item.get("id") == attempt_id),
        None,
    )
    if attempt is None:
        raise SystemExit(f"Attempt not found: {attempt_id}")
    if attempt.get("provider") != "codex":
        raise SystemExit(
            f"Attempt {attempt_id} used provider {attempt.get('provider')!r}, not 'codex'."
        )
    for field in ("systemPrompt", "userPrompt", "model"):
        if not isinstance(attempt.get(field), str) or not attempt[field].strip():
            raise SystemExit(f"Attempt {attempt_id} has no usable {field}.")
    return attempt


def toml_string(value: str) -> str:
    # JSON string escaping is valid for the TOML basic strings Codex accepts.
    return json.dumps(value, ensure_ascii=False)


def render_current_challenge_prompt(
    attempt_id: str,
    store: Path,
    timeout: int,
) -> dict[str, Any]:
    renderer = PROJECT_ROOT / "scripts" / "render_challenge_replay.mjs"
    try:
        process = subprocess.run(
            [
                "node",
                str(renderer),
                "--attempt-id",
                attempt_id,
                "--store",
                str(store),
            ],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            timeout=min(timeout, 60),
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"Could not render the current challenge prompt: {error}") from error
    if process.returncode != 0:
        raise SystemExit(
            f"Current challenge prompt renderer failed: {(process.stderr or process.stdout).strip()}"
        )
    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Current challenge prompt renderer returned invalid JSON: {error}") from error
    if not isinstance(result, dict):
        raise SystemExit("Current challenge prompt renderer returned a non-object.")
    return result


def build_command(
    codex_bin: str,
    model: str,
    reasoning_effort: str,
    system_prompt: str,
    instructions_file: Path,
) -> list[str]:
    return [
        codex_bin,
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
        model,
        "-c",
        f"model_reasoning_effort={toml_string(reasoning_effort)}",
        "-c",
        f"developer_instructions={toml_string(system_prompt)}",
        "-c",
        f"model_instructions_file={toml_string(str(instructions_file.resolve()))}",
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
        "-",
    ]


def parse_codex_jsonl(stdout: str) -> dict[str, Any]:
    response = ""
    thread_id: str | None = None
    usage: dict[str, Any] = {}
    completed = False
    failures: list[str] = []

    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue

        event_type = event.get("type")
        if event_type == "thread.started" and isinstance(event.get("thread_id"), str):
            thread_id = event["thread_id"]
        elif event_type == "item.completed":
            item = event.get("item")
            if (
                isinstance(item, dict)
                and item.get("type") == "agent_message"
                and isinstance(item.get("text"), str)
            ):
                response = item["text"].strip()
        elif event_type == "turn.completed":
            usage = event.get("usage") if isinstance(event.get("usage"), dict) else {}
            completed = True
        elif event_type in ("turn.failed", "error"):
            failures.append(json.dumps(event, ensure_ascii=False))

    if not completed:
        detail = failures[-1] if failures else "no turn.completed event"
        raise SystemExit(f"Codex turn did not complete: {detail}")
    if not response:
        raise SystemExit("Codex returned no final agent message.")
    return {"threadId": thread_id, "usage": usage, "response": response}


def main() -> int:
    args = parse_args()
    store = args.store.resolve()
    attempt = load_attempt(store, args.attempt_id)
    prompt_source = "audited-exact"
    prompt_hash = attempt.get("promptHash")
    if args.current_challenge_prompt:
        rendered = render_current_challenge_prompt(args.attempt_id, store, args.timeout)
        attempt = {
            **attempt,
            "systemPrompt": rendered["systemPrompt"],
            "userPrompt": rendered["userPrompt"],
            "model": rendered.get("model", attempt["model"]),
            "reasoningEffort": rendered.get(
                "reasoningEffort", attempt.get("reasoningEffort")
            ),
        }
        prompt_source = "current-controlled-challenge"
        prompt_hash = rendered.get("currentPromptHash")
    instructions_file = args.instructions_file.resolve()
    if not instructions_file.is_file():
        raise SystemExit(f"Instructions file not found: {instructions_file}")

    model = args.model or attempt["model"]
    reasoning_effort = args.reasoning_effort or attempt.get("reasoningEffort") or "medium"
    command = build_command(
        args.codex_bin,
        model,
        reasoning_effort,
        attempt["systemPrompt"],
        instructions_file,
    )

    try:
        process = subprocess.run(
            command,
            cwd=PROJECT_ROOT,
            input=attempt["userPrompt"],
            text=True,
            capture_output=True,
            timeout=args.timeout,
            check=False,
        )
    except FileNotFoundError as error:
        raise SystemExit(f"Codex executable not found: {args.codex_bin}") from error
    except subprocess.TimeoutExpired as error:
        raise SystemExit(f"Codex call timed out after {args.timeout} seconds.") from error

    if args.raw_jsonl:
        print(process.stdout, file=sys.stderr, end="")
    if process.returncode != 0:
        detail = (process.stderr or process.stdout).strip()
        raise SystemExit(f"Codex exited {process.returncode}: {detail[:2000]}")

    result = parse_codex_jsonl(process.stdout)
    print(
        json.dumps(
            {
                "sourceAttemptId": attempt["id"],
                "promptSource": prompt_source,
                "promptHash": prompt_hash,
                "provider": "codex",
                "model": model,
                "reasoningEffort": reasoning_effort,
                **result,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
