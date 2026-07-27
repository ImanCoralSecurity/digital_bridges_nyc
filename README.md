# Digital Bridges NYC

A multi-agent AI simulation of **Reflective Structured Dialogue (RSD)** between synthetic
Muslim and Jewish personas. The primary workflow creates a persistent project: a shared fictional
student roster participates in a configurable series of facilitator-led, conflict-sensitive
sessions, with every session producing a normal, auditable run. The app evaluates those runs for
methodology adherence and safety and can turn them into a labeled, human-reviewed "peace campaign"
— a working implementation of the *Digital Bridges NYC* project amendment.

> **Ethics first.** All personas are **fictional**. All generated content is **clearly labeled
> AI-generated**, carries full provenance, and **cannot be published without an administrator's
> explicit publish action**.
> Personas never impersonate real people, and evaluation metrics describe the *simulation only* —
> not real-world reconciliation. See [`docs/TOOLKIT.md`](docs/TOOLKIT.md).

### Included synthetic database snapshot

This repository intentionally includes `data/store/*.json` as the project evidence bundle requested
for the public release. It contains fictional project/session records, accepted transcripts, model
review decisions, and rejected-generation audit material. Rejected drafts can contain unsafe or
low-quality synthetic text and must never be presented as accepted dialogue. The snapshot contains
no real participants and must not be replaced with real-person or confidential research data in a
public fork. Production passwords, local environment files, and server logs are excluded.

## Agent runtimes: Codex by default, Claude optional

Every AI agent — each persona, the facilitator, the evaluation judge, and the content writer — is
routed through the provider-neutral CLI adapter in `lib/agent.ts`. New runs default to the
**Codex CLI**, **GPT-5.5**, and **medium reasoning**. The non-interactive invocation is equivalent to:

```bash
codex -a never exec --json --ephemeral --ignore-user-config \
  --skip-git-repo-check --sandbox read-only --model gpt-5.5 \
  -c 'model_reasoning_effort="medium"' -
```

The adapter sends the prompt on standard input, supplies the persona/system instructions as Codex
developer instructions, disables shell, web/browser, computer-use, image-generation, multi-agent,
and app tools, and parses the JSONL event stream. Claude remains available as an optional provider
and uses its one-turn JSON mode:

```bash
claude -p "<message>" --append-system-prompt "<system prompt>" \
  --model "<model>" --output-format json --max-turns 1
```

Both providers produce the same normalized result and share a bounded process pool, timeouts,
retry/backoff, usage capture, and refusal detection. Claude reports `total_cost_usd`; Codex CLI does
not report USD cost, so Codex runs and assets are explicitly marked as unpriced and their configured
USD budget cannot be enforced.

A deterministic **mock mode** (`lib/mockClaude.ts`) reproduces the whole pipeline with no CLI
calls and no cost — used for CI, demos, and development.

## Quick start

```bash
npm install
cp .env.example .env.local
# Replace DBRIDGES_PASSWORD in .env.local with a long random password.
npm run seed          # generate 30 students + facilitator + judge (32 records)
npm run dev           # http://localhost:3000
```

### Persona roster

The checked-in corpus has exactly **30 fictional students: 15 Muslim and 15 Jewish**, plus one
facilitator and one judge, for **32 versioned JSON records**. Every student was born and raised in
New York City. The required `raisedIn` value records a neighborhood, one of the five boroughs, and
New York City; the loader rejects an invalid location or an unbalanced roster. Each community
includes students from all five boroughs.

`raisedIn` is immutable through the persona editor and PATCH API. It describes the student's own
upbringing, not their ancestry: parents and extended family may originate anywhere, and the separate
family narrative and `regionalHistory` fields preserve that wider heritage.

The default Codex CLI must be installed and authenticated to run real agents:

```bash
codex --version
codex login status     # confirms auth
```

To use the optional Claude provider from the server API or server-side configuration,
install/authenticate its CLI:

```bash
claude --version
claude -p "hi"        # confirms auth
```

No available CLI? Set `DBRIDGES_MOCK_AGENTS=1` (or tick **Mock mode** in the UI) and everything
still runs deterministically.

The browser dashboard intentionally exposes Codex only; it does not include a provider selector.
Claude remains supported for authenticated API clients and server-side callers by sending
`provider: "claude"` with a compatible Claude model, or by setting the server default for requests
that omit `provider`.

### Using it

1. **Public site** (`/public`) — the default destination for visitors who are not logged in. It lists
   published projects and shows only allowlisted
   fictional persona fields and successfully completed session transcripts. Everything is read only.
2. **Projects dashboard** (`/`, after administrator login) — create and list persistent projects. Creation captures the project
   name and introduction, number of sessions, shared Muslim/Jewish attendee roster, number of
   project-scoped challenge voices per community, model/reasoning settings, turn order, and mock mode.
   The model dropdown
   contains:
   - GPT-5.6 Sol (`gpt-5.6-sol`) — frontier
   - GPT-5.6 Terra (`gpt-5.6-terra`) — balanced
   - GPT-5.6 Luna (`gpt-5.6-luna`) — fast
   - GPT-5.5 (`gpt-5.5`) — default
   - GPT-5.3 Codex Spark (`gpt-5.3-codex-spark`) — fast preview

   Reasoning choices are Low, Medium (default), High, and Extra high.
3. **Project detail** (`/projects/[id]`) — configure each pre-created session shell with its own
   topic and number of go-rounds, submit it to the background queue, and follow the resulting run
   record. After at least one session completes, **Publish project** creates a public read-only view
   at `/public/projects/[id]`. The release is a frozen snapshot; later persona edits and reruns stay
   private until **Update public page** is selected. **Unpublish** removes access immediately.
   Session 1 reserves round 1 for mandatory introductions; its configured round count includes that introduction.
4. **Jobs** (`/jobs`) — see and control queued, running, pause-requested, paused, and
   cancel-requested work; inspect cumulative active time; and open completed, cancelled, or failed
   history and transcript links.
5. **Run detail** (`/runs/[id]`) — read the accepted, annotated transcript and evaluation matrices;
   lazily inspect paginated rejected-generation evidence and exact records; then generate campaign
   drafts.
6. **Content Review** (`/content`) — review provenance, approve/reject/edit, publish to a partner
   channel (disclosure is always attached), and take content down.
7. **Operator showcase** (`/showcase`) — an authenticated, projector-friendly preview. This is
   separate from the unauthenticated published-project site.

### Persistent project workflow

Creating a project atomically persists `sessionCount` unconfigured `ProjectSession` shells and one
shared roster. The service samples exactly `controversialPerCommunity` Muslim attendees and the same
number of Jewish attendees, without replacement, and stores their IDs once in
`controversialAgentIds`. The assignment is reused across all sessions and does not modify the global
persona records. These fictional participants receive a bounded first-person challenge role during
discussion turns only; they remain neutral during session 1's mandatory introduction round. The
assignment is a candidate pool, not a command for every assigned persona to challenge on every turn:
up to two distinct assigned voices—one per represented community—challenge in each discussion
go-round, rotating by project session and discussion-round index.

Every session must be configured separately with `topic` and `rounds`. The facilitator opens every
run by introducing himself first (`I'm Sam, your facilitator.`) and immediately naming the complete
sanitized topic. In project session 1 only, Sam then presents the persisted, administrator-authored
project introduction as opaque verbatim display text and
his profile-supported academic degree and professional background; later sessions do not repeat
those details. Political and geopolitical
topics are valid: agents address them through first-person values, uncertainty, NYC perspective,
and only the personal or family facts actually present in their profiles, without collective blame.
Provider openings are checked
for identity order, a clean topic sentence, topic fidelity, and a topic-grounded invitation; bounded retries and the local
fallback preserve those requirements instead of substituting a generic invitation. Discussion responses are classified as `neutral`,
`escalating`, or `deescalating`. An escalating or polarizing discussion turn is immediately followed
by a facilitator intervention; the persisted turns record `conversationTag`, `roundKind`, reasons,
the challenge's optional `respondsToTurnId`, the intervention's `triggeredByTurnId`, and whether
visible text came from the provider, mock generator, or a local safety fallback. Controlled
challenges rotate through distinct context-grounded moves. Each one targets the freshest eligible
ordinary, neutral scheduled discussion turn by another student; invited repair replies are excluded
so a challenge cannot start a challenge-repair loop. Its prompt includes the complete target turn
and directs disagreement at a narrow interpretation—not at the speaker or memory. Semantic-fidelity
checks reject invented claims, unsupported universal/sufficiency conclusions, and structurally
recycled challenge language. The
participant leaves that tension unresolved in declarative language; the immediately following
facilitator turn owns validation, curiosity, and repair. A controlled challenge receives up to five
provider drafts; safe rejected evidence and reviewer guidance inform later drafts so the provider
does not repeat a blind variation. A reviewer finding no target-supported difference may reroute
early instead of manufacturing one. Interventions rotate through concise reflection, precise-
difference naming, and direct-response invitation shapes instead of repeating one canned response.

Every ordinary discussion contribution after the first participant links directly to the immediately
previous participant before adding a new idea. The link must be faithful by meaning, but its surface
form rotates; a session-wide chain of repeated "I hear you saying" openers is treated as mechanical
repetition rather than as a required formula. Before each go-round after the first, Sam contributes
one concise procedural sentence that moves the circle into the next round without reintroducing
himself, summarizing a participant, or asking a question.

Every completed session ends with a two-sentence facilitator closing. Sam first summarizes
transcript-supported stakes, connections, and any current difference, then explicitly explains how
that specific exchange could support peacebuilding without claiming achieved reconciliation,
changed attitudes, or real-world impact, and thanks the participants explicitly for participating or
contributing.

Every provider-generated non-introduction dialogue candidate passes a deterministic structure/safety
gate and, on real runs, semantic review by the selected model; the trusted local round-transition
sentence passes its dedicated deterministic contract. For closings and invited replies, regex-based topic,
fidelity, and support diagnostics are advisory only; the semantic reviewer decides whether the
concern was answered and whether examples are supported by the transcript. Mandatory introduction
turns are intentionally exempt from topic relevance. New Runs
also expose `topicRelevanceRate` across non-introduction persona responses; historical Run records
remain readable without that field. The judge receives the configured topic and must penalize
avoidance or substitution rather than reward
the absence of political vocabulary.

Topic words alone are not enough for difficult public topics. Accepted non-introduction persona
dialogue must add a concrete human consequence, ethical tension, uncertainty, or New York impact
rather than merely locating the topic in headlines, messages, kitchens, commutes, or conversations.
Every generated persona turn is checked against the complete authored profile; invented relatives,
events, settings, routines,
teachings, quotes, or other biographical details are audited and retried. Non-introduction turns are
also checked against recent dialogue for material phrase or concept-bundle reuse. These
persona-fidelity and novelty checks apply with phase-appropriate rules.

Visible output also passes a prompt-scaffolding hygiene gate. A response that echoes internal task
labels, JSON context metadata, retry instructions, or data-handling prose is audited and retried even
when it contains the correct topic words. Contaminated historical sentences are excluded when
building challenge anchors, so local fallbacks cannot quote them into a new response. The same gate
protects generated campaign copy and judge rationale. Before validation and persistence, visible
dialogue is normalized to plain text by removing balanced Markdown emphasis, code markers, headings,
and trailing hard-break spaces without changing the spoken words.

Each intervention ends with one question addressed to a named attendee. That attendee responds
immediately and non-escalatingly before the schedule continues. If the attendee also owns the exact
next scheduled slot in the same go-round, one integrated reply fulfills both the invitation and that
slot; otherwise the
reply remains extra and the attendee's later slot is unchanged. The intervention stores
`invitedSpeakerId`; the reply stores `invitedByTurnId`, `roundKind="invited-response"`, and, when
merged, `consumedScheduledSlot`, so the transcript and resume cursor preserve both links. Spark
assesses whether the reply answers the actual concern and remains supported by the transcript; the
deterministic gate enforces only structure, routing, output hygiene, and hard safety.

Facilitator acceptance is phase-specific. Openings enforce identity/topic order, shared-agreement
language, and a topic-grounded invitation; a discussion opening's prompt and local scaffold ask one
focused, substantive question without asking students to invent a witnessed event or public scene.
Round transitions require one concise procedural sentence grounded in the next go-round.
Interventions require reflection, a concrete repair object, and
exactly one single-focus final question for the planned invitee without Sam speaking as a
participant. Closings
preserve both a supported connection and any unresolved difference without manufacturing consensus
and explicitly thank the participants for taking part.

The 60-slot planning cap applies to scheduled go-round contributions (`attendees × rounds`). An
invited reply is bounded to one per intervention and either fulfills the exact next scheduled slot
or remains an additional visible turn. Every invited reply is persisted and enters the public
transcript, judge context, evaluation metrics, and run cost.

Evaluation uses the complete visible transcript, including opening, round transitions, facilitator
repair turns, invited replies, and closing, with causal invitation/response links supplied to the
judge. New Runs
retain the legacy persona-only `turnCount`, add explicit visible-turn and persona-response counts,
and expose `repetitionRiskRate` and `challengeFidelityRiskRate`. Final adherence is capped by both
deterministic noncompliance/quality risks and the judge's full-transcript adherence score.

Across facilitator openings, round transitions, scheduled persona turns, interventions, invited
replies, and closings,
candidates rejected during bounded generation/validation—including provider-call failures—are
retained separately from accepted turns in `generation_attempts.json`. Each immutable audit record
links to its Run and generation phase and captures the submitted system/persona prompt and
conversation message, raw rejected response, machine-readable rejection reasons, classification and
validation evidence when available, attempt number, and provider/model/usage metadata. The ordinary
run-detail response exposes only `rejectedAttemptCount`. Opening the collapsed **Rejected attempts**
section fetches a paginated summary page that omits `systemPrompt`, `userPrompt`, and `responseText`;
opening one row fetches that exact run-scoped record. These records never enter the public transcript
or evaluation as accepted turns, and all three run/audit GET responses use `Cache-Control: no-store`.

Attempt logging begins prospectively when this collection is deployed: historical Runs are not
backfilled and therefore show no rejected attempts. These records are operationally sensitive even
though the personas are fictional. A prompt can contain the complete transcript so far, compiled
persona/system instructions, methodology rules, and configured topic, while a rejected response can
contain unsafe text. Do not publish or casually export `generation_attempts.json`; restrict access,
backups, and retention more tightly than public campaign material. The checked-in database in this
specific public release is an explicit, reviewed exception containing fictional simulation data only;
it was scanned for common credential and private-key signatures before publication. Remove these
audit collections before using the repository with confidential topics or real-person data.

Session submission is asynchronous. `POST /api/projects/[id]/sessions/[sessionId]/run` persists a
job, marks the session `queued`, and returns HTTP 202 immediately. The job state machine is
`queued | running | pause-requested | paused | cancel-requested | cancelled | completed | failed`.
The project and Jobs pages poll every nonterminal control state, lock active sessions against
configuration changes or duplicate execution, and separate active work from completed, cancelled,
and failed history. Once submission is accepted, refreshing, navigating away, or closing the browser
tab does not cancel it.

One process-local worker runs exactly one job at a time. **Pause** on queued work is immediate;
**Continue now** gives queued work priority over ordinary FIFO jobs but never preempts the job already
running; and **Kill** cancels queued or paused work immediately. On a running job, Pause and Kill move
to `pause-requested` and `cancel-requested`. The orchestrator cooperatively applies the request after
the current safe dialogue bundle: the opening, or one scheduled participant turn together with any
required facilitator intervention and invited reply, or the closing/judge step. A pending pause can
be withdrawn with Continue before the checkpoint is acknowledged.

At an acknowledged user pause, the Run becomes `suspended`, the Job becomes `paused`, and the worker
slot is released. Continue requeues the same Job with priority and resumes the same Run from its
validated transcript checkpoint without duplicating completed turns. `durationMs` accumulates only
active worker segments, excluding queued and paused time. By contrast, an automatic budget or
guardrail stop leaves the Run `paused` but completes the Job; it is not a resumable user suspension,
and the project UI offers a new run instead. A killed job finishes terminally as `cancelled`.

Queue records live in `jobs.json`. On server startup, queued work remains queued and explicitly
paused jobs remain paused until Continued. A restart during active provider work still fails a
`running` or unacknowledged `pause-requested` job and its linked active Run/session instead of
replaying a possibly billed call. A `cancel-requested` job is finalized as cancelled during recovery.
This is a single-node JSON-file queue with worker concurrency 1, not a distributed or transactional
queue; do not run multiple app processes against the same store.

The original one-off `POST /api/runs` workflow and all historical run/turn/asset JSON remain readable.
Project sessions create ordinary `Run` records with optional project metadata, so run detail,
content generation, review, and publishing continue to use the existing run-based paths. Campaign
generation prefers the first six non-escalating persona turns (falling back to all persona turns only
if none are constructive) and copies optional project/session IDs into asset provenance.
Completed sessions can be run again with their locked configuration; each rerun appends a new Run,
preserves the prior Run, and updates the session to point to the newest `runId`.

### Project and jobs API

All routes in this table are authenticated by the same middleware as the operator UI. Public
project pages are server-rendered through a strict allowlist and do not expose the private project,
run, persona, job, or audit APIs.

| Method and route | Purpose |
|---|---|
| `GET /api/projects` | List persistent projects, newest first. |
| `POST /api/projects` | Create a project, shared roster, one-time challenge assignments, and X session shells. |
| `GET /api/projects/[id]` | Read one project with its embedded sessions. |
| `PATCH /api/projects/[id]` | Set `{ "published": true | false }`; `true` creates or replaces the frozen safe snapshot and requires at least one non-empty completed transcript. |
| `DELETE /api/projects/[id]` | Remove an idle project plan while preserving historical jobs, runs, transcripts, and audits. |
| `GET /api/projects/[id]/sessions/[sessionId]` | Read one session together with its project. |
| `PATCH /api/projects/[id]/sessions/[sessionId]` | Set the session's `topic` and `rounds`. |
| `DELETE /api/projects/[id]/sessions/[sessionId]` | Remove one idle session plan; survivor numbers stay stable and the final session must be removed with its project. |
| `POST /api/projects/[id]/sessions/[sessionId]/run` | Persist and enqueue the configured session; returns HTTP 202 immediately with its job and project state. |
| `GET /api/jobs` | List all persistent jobs for the `/jobs` active/history view; also kicks the worker if needed. |
| `GET /api/jobs/[id]` | Read one persistent job. |
| `PATCH /api/jobs/[id]` | Apply `{ "action": "pause" | "continue" | "kill" }`; returns the updated `{ job, project }`. |
| `GET /api/runs/[id]` | Read the Run, accepted turns, and ordinary `rejectedAttemptCount`; exact audit text is excluded. |
| `GET /api/runs/[id]/attempts?page=&pageSize=` | Read run-scoped summaries, default 20 and maximum 50 per page, with exact prompts/response omitted. |
| `GET /api/runs/[id]/attempts/[attemptId]` | Read one exact attempt only when it belongs to the Run. |

## Configuration

Copy `.env.example` to `.env` and adjust. Key values:

| Variable | Meaning |
|---|---|
| `DBRIDGES_MOCK_AGENTS` | `1` forces mock mode for all providers and runs |
| `DBRIDGES_DEFAULT_PROVIDER` | default for API/server callers that omit `provider`: `codex` or `claude`; the dashboard remains Codex-only |
| `DBRIDGES_CODEX_DEFAULT_MODEL` | Codex model id; defaults to `gpt-5.5` |
| `DBRIDGES_CODEX_REASONING_EFFORT` | Codex reasoning effort: `low`, `medium` (default), `high`, or `xhigh` |
| `DBRIDGES_CLAUDE_DEFAULT_MODEL` | model id used by API/server callers when Claude is the default provider |
| `DBRIDGES_CALL_TIMEOUT_MS` | per-call timeout |
| `DBRIDGES_MAX_CONCURRENCY` | max concurrent agent CLI subprocesses across providers |
| `DBRIDGES_DEFAULT_BUDGET_USD` | per-run cap for providers that report USD cost; Codex is unpriced |
| `DBRIDGES_STORE_DIR` | optional absolute or working-directory-relative runtime JSON-store directory; defaults to `data/store` |

`DBRIDGES_DEFAULT_MODEL` and `DBRIDGES_MOCK_CLAUDE` remain accepted as compatibility aliases for
older deployments. Prefer the provider-specific variables above for new configuration.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build (also type-checks)
npm start          # serve the build
npm run seed       # (re)generate persona files
npm test           # projects, roster, providers/protocol, methodology, and mock modes
npm run typecheck  # tsc --noEmit
```

Replay an audited challenge with its original prompt, or rebuild it with the current controlled-
challenge prompt, without modifying application data:

```bash
python3 scripts/test_escalation_response.py --attempt-id <attempt_id>
python3 scripts/test_escalation_response.py --attempt-id <attempt_id> --current-challenge-prompt
```

## Project structure

```
app/                    Next.js App Router
  page.tsx              Authenticated projects dashboard and creation controls
  public/page.tsx       Public published-project landing page
  public/projects/[id]/page.tsx Safe, read-only persona and completed-transcript view
  projects/[id]/page.tsx Per-session topic/round configuration and run launcher
  jobs/page.tsx         Background job status, controls, history, and active durations
  runs/[id]/page.tsx    Transcript + metrics + lazy rejected-attempt audit + content generation
  content/page.tsx      Review, provenance, approve/reject/publish/takedown
  showcase/page.tsx     Public showcase view
  api/                  Route handlers (projects/sessions, runs, content, metrics, personas, health)
  models.ts             Dashboard GPT catalog/reasoning options
  ui.tsx, globals.css   Shared UI + styling
lib/
  agent.ts              Provider-neutral Codex/Claude CLI runtime + process pool
  codexProtocol.ts      Codex argument builder and JSONL parser
  gptModels.ts          Browser-safe selectable GPT model catalog
  providers.ts          Provider/model defaults, validation, legacy normalization
  mockClaude.ts         Deterministic mock generator
  personas.ts           Persona loader + system-prompt compilation
  personaRules.ts       Exact roster and NYC-upbringing invariants
  projects.ts           Persistent project/session planning and execution service
  publicProjects.ts     Frozen, allowlisted public-project read model
  projectRules.ts       Pure project/session cardinality, sampling, and round-cap rules
  jobQueue.ts           Persistent single-worker FIFO queue and startup reconciliation
  jobRules.ts           Pure job state, ordering, and duration transitions
  methodology.ts        RSD rules, turn validator, dynamics classification, adherence signals
  challengePrompt.ts    Controlled-challenge prompt, retry feedback, and form checks
  challengeCadence.ts   Up to two rotating challenge speakers per discussion go-round
  dialogueQuality.ts    Persona fidelity, novelty, challenge fidelity, topic substance, formatting
  dialogueFlow.ts       Phase-specific facilitator-intervention validation and routing
  orchestrator.ts       Dialogue loop, introductions, escalation/intervention, budget, safe-stop
  evaluation.ts         Full-transcript judge + adherence, repetition, and fidelity metrics
  content.ts            Creative teams → campaign assets (with provenance + disclosure)
  publishing.ts         Human review, publishing, takedown
  db.ts                 JSON-file data store (swappable for SQLite/Postgres)
  types.ts, config.ts, logger.ts, hash.ts
personas/               30 fictional students + facilitator + judge (32 versioned JSON records)
scripts/seed-personas.mjs
scripts/test_escalation_response.py, render_challenge_replay.mjs
config/codex-agent-instructions.md
tests/*.test.mjs
docs/TOOLKIT.md         The Digital Peacebuilding Toolkit
```

## How this maps to the backlog

The build implements the core application portions of the epics from `EPICS_AND_USER_STORIES.md`: Foundation (E0), the amended
provider-neutral CLI runtime (E1), Persona Engineering (E2), Orchestration (E3), Methodology & Guardrails (E4),
Safety/QA/Evaluation (E5), Content Generation (E6), Ethical Publishing (E7), UI & Showcase (E8),
Data (E9), the Toolkit (E10), Cost/Budget controls (E11), and Testing (E12).

## Data & storage

State defaults to `data/store/*.json`. This public project intentionally includes one synthetic
evidence snapshot; production forks should normally keep their runtime store private. The repository interface in `lib/db.ts` is
intentionally small so it can be swapped for SQLite/Postgres without changing callers. The store
contains `projects.json` (projects with embedded session shells), `jobs.json`, `runs.json`,
`turns.json`, `generation_attempts.json`, `semantic_validation_attempts.json`, `assets.json`, and
`publish_logs.json`. `project_publications.json` contains only frozen, allowlisted persona and
accepted-transcript snapshots created by explicit project publication, including the safe dialogue
labels shown beside public turns. Project creation
and queue/session claims use process-local file mutexes; queue-to-project-to-run/turn/attempt
transitions span multiple files and are not a database transaction. The queue is intentionally
limited to one Node process and one worker. The store directory is forced to mode `0700`, and every
collection plus atomic temp file to `0600`. Rejected-attempt records are immutable, append-style audit
data with no historical backfill or built-in retention/deletion policy; list responses redact exact
prompt/response text, while the run-scoped detail endpoint deliberately returns it on demand.

## License

Intended for open-source release as the project's "Digital Legacy." Add your OSS license here.
