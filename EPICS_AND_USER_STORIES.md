# Digital Bridges NYC — Product Backlog: Epics & User Stories

**Project:** Digital Bridges NYC — a multi-agent AI simulation that models Reflective Structured Dialogue (RSD) between synthetic Muslim and Jewish personas, then turns the results into peace-campaign content to counter online polarization.

> **Agent-runtime amendment — 2026-07-18 (supersedes every Claude-only runtime requirement below):**
> The as-built application now uses a provider-neutral CLI abstraction. New runs default to the
> **Codex CLI** via `codex exec`, model **`gpt-5.5`**, with **medium reasoning**; the Claude CLI
> remains an optional selectable provider. There is still no direct model SDK/HTTP client. Both CLI
> adapters normalize output and provenance, while historical provider-less Claude records remain
> compatible. Claude reports USD cost, but Codex CLI does not, so Codex runs are explicitly unpriced
> and USD budget caps are not represented as enforced. The original Claude-specific stories and
> diagrams are retained below as historical backlog context, not current runtime constraints.

> **Persona-roster amendment — 2026-07-18 (supersedes every 10+10 / 20-student requirement below):**
> The as-built corpus contains exactly **30 fictional students: 15 Muslim and 15 Jewish**, plus one
> facilitator and one judge, for **32 versioned JSON records**. Every student was born and raised in
> New York City. Their required, structured `raisedIn` value names a neighborhood, one of the five
> boroughs, and New York City, and is immutable through the persona editor/API. Parents and extended
> family may originate anywhere; family heritage is modeled separately from the student's own NYC
> upbringing. Each community includes students from all five boroughs. Epic 2 is updated below to
> reflect this amendment; any remaining 10+10 or 20-student language is historical and non-operative.

> **Persistent project/session amendment — 2026-07-19 (supersedes a one-off-run-only workflow):**
> The as-built primary workflow is `Project → ProjectSession → Run`. Project creation persists a
> shared student roster, provider/model settings, exactly X embedded session shells, and a one-time
> random assignment of N Muslim plus N Jewish project-scoped challenge voices in
> `controversialAgentIds`. Each session is configured separately with `topic` and `rounds`; session 1
> reserves round 1 for neutral introductions. The facilitator frames the day's topic, and every
> escalating or polarizing discussion response is persisted and immediately followed by a linked
> de-escalating intervention. Project-created runs use optional linkage fields, so historical one-off
> runs remain readable. Project-session submission is a durable background job: the POST persists a
> queued job and returns HTTP 202 immediately; one FIFO worker executes jobs with concurrency 1.
> `jobs.json` and `GET /api/jobs` expose `queued | running | completed | failed` work, and `/jobs`
> shows active/history views plus elapsed and final durations. Accepted work is independent of the
> browser tab. Queued work resumes at startup; work interrupted after starting is failed, not replayed,
> to avoid duplicate paid model calls and may be submitted again. This queue is single-node only.

> **Methodology 1.12.0 amendment — 2026-07-21:** One voice from each community in the stable project
> pool rotates into each discussion go-round. Accepted controlled challenges are always persisted as
> escalating and receive their immediate facilitator repair bundle.
>
> **Methodology 1.13.0 amendment — 2026-07-21:** Every ordinary discussion turn after the first
> participant begins with one sentence naming and faithfully summarizing the immediately previous
> participant before adding a new contribution. Challenge and repair phases keep their own contracts.
>
> **Methodology 1.14.0 amendment — 2026-07-22:** Every completed session ends with Sam summarizing
> transcript-supported stakes and current differences, then explaining in conditional language how
> that specific exchange could support peacebuilding without claiming achieved reconciliation.
>
> **Methodology 1.15.0 amendment — 2026-07-24:** Project creation captures an introduction that Sam
> presents with his profile-supported degree and professional background only in project session 1.
> Sam adds one concise procedural transition before every later go-round; ordinary continuity bridges
> vary instead of repeating one opener family; and every closing explicitly thanks participants for
> their participation or contribution. Semantic-review guideline `1.1.6` enforces the corresponding
> meaning-level contracts.
>
> **Methodology 1.6.1 amendment — 2026-07-20:** Natural subject positions and faithful reflections
> are accepted without template wording; ordinary strong positions do not trigger redundant
> facilitator bundles; topic-general semantic comparison preserves real priority ordering and each
> speaker's latest position; and deterministic metrics now include facilitator fidelity.
>
> **Methodology 1.6.0 amendment — 2026-07-20 (superseded by 1.12.0 cadence):** Assigned challenge
> voices form a rotating candidate pool; this version originally allowed at most one challenge in each discussion go-round, against the freshest eligible
> ordinary contribution. Challenge semantic fidelity, substantive grounding for public topics,
> exhaustive persona-fact checks, dialogue novelty, plain-text formatting, and phase-specific
> facilitator validation are deterministic acceptance gates. Immediate repair replies close instead
> of asking a new question. Evaluation now gives the judge the full visible transcript and reports
> repetition and linked-challenge-fidelity risk alongside backward-compatible turn counts.

**Agent runtime constraint:** Every AI agent in the system — each persona (e.g., a "Jewish" persona, a "Muslim" persona), the facilitator, and the evaluation judge — is invoked by shelling out to the **Claude CLI** (`claude -p ... --append-system-prompt ...`). There is no direct SDK/HTTP client for agents; the orchestration layer is a wrapper around `claude` subprocess calls.

> **Responsible-AI note:** This backlog bakes in provenance tracking, mandatory "AI-generated" labeling, human-in-the-loop review, and non-impersonation as first-class requirements (Epic 7). Synthetic personas are explicitly fictional and must never be presented as real people. Simulation metrics describe the *simulation*, not real-world reconciliation.

---

## How to read this document

Each **Epic** has a goal and a set of **User Stories**. Each story uses the form *"As a `<role>`, I want `<capability>` so that `<value>`,"* followed by **Acceptance Criteria (AC)**, a **Priority**, and a **Phase**.

### Conventions

| Field | Values |
|---|---|
| **Priority** | `P0` (must-have / blocker), `P1` (core), `P2` (nice-to-have / post-grant) |
| **Phase** | `Wk1–3` Persona & Orchestration • `Wk4–6` Methodology & QA • `Wk7–8` Campaign & Publish • `Ongoing` • `Post-grant` |
| **Story ID** | `US-<epic>.<n>` |

### Roles (the "as a …" actors)

- **Project Leader / PM** — Marjan (product owner; configures & runs simulations; non-developer).
- **Software Developer** — builds the core code.
- **Lead Advisor (Safety & Ethics)** — cultural/community advisors and digital-safety experts.
- **QA / Data Analyst** — reviews transcripts, validates metrics.
- **Community Partner** — Columbia Hillel, MSA, JTS, Islamic Center; reviews/approves and publishes content.
- **Stakeholder / Showcase Attendee** — audience at the final public showcase.
- **Open-Source Adopter** — future peacebuilder reusing the toolkit.

---

## Architecture at a glance

```
                ┌──────────────────────────────────────────────┐
                │            Web Dashboard  /  CLI               │  configure • run • review • showcase
                └───────────────────────┬────────────────────────┘
                                        │
                ┌───────────────────────▼────────────────────────┐
                │              Orchestration Engine               │  pairing • turn-taking • checkpoint • budget
                └──────┬───────────────┬────────────────┬────────┘
                       │               │                │
        ┌──────────────▼──┐  ┌─────────▼────────┐  ┌────▼──────────────┐
        │  Persona Store   │  │ RSD Facilitator  │  │ Methodology       │
        │ 15 Muslim +      │  │  + methodology   │  │ Guardrail /       │
        │ 15 Jewish (+judge)│  │  preamble        │  │ Turn Validator    │
        └────────┬─────────┘  └─────────┬────────┘  └────┬──────────────┘
                 │                       │                │
                 └───────────┬───────────┴────────────────┘
                             │   every agent turn is one subprocess call:
                     ┌───────▼──────────────────────────────────────┐
                     │              Claude CLI Adapter               │
                     │  claude -p "<msg>" --append-system-prompt … \ │
                     │         --model … --output-format json        │
                     └───────┬──────────────────────────────────────┘
                             │
              ┌──────────────▼───┐   ┌───────────────┐   ┌────────────────────┐
              │ Transcript / Data │──▶│ Eval & Safety  │──▶│ Content Gen &       │
              │ Store (provenance)│   │  ("matrices")  │   │ Ethical Publishing  │
              └───────────────────┘   └───────────────┘   └────────────────────┘
```

**Assumed tech (swappable):** Python 3.11+, SQLite for storage, a lightweight web UI (FastAPI/Flask), the `claude` CLI as the sole agent runtime.

---

## Phase → Epic roadmap (maps to the proposal's 8-week timeline)

| Phase | Proposal milestone | Primary epics |
|---|---|---|
| **Wk1–3** | Persona Engineering & Orchestration Architecture | E0 Foundation, E1 Claude CLI, E2 Personas, E3 Orchestration |
| **Wk4–6** | Execute conflict-sensitive methodology + QA | E4 Methodology & Guardrails, E5 Safety/QA/Eval |
| **Wk7–8** | Creative teams → Collaborative Digital Peace Campaign | E6 Content Generation, E7 Review & Ethical Publishing |
| **Ongoing** | Supporting capabilities | E8 UI, E9 Data, E11 Cost/Ops, E12 Testing |
| **Post-grant** | Sustainability & Digital Legacy | E10 Open-Source Release & Toolkit |

**Epic dependency order:** E0 → E1 → (E2, E3) → E4 → E5 → E6 → E7. E8/E9/E11/E12 run throughout. E10 packages the result.

---

# EPIC 0 — Project Foundation & Developer Infrastructure
**Goal:** Stand up the repo, runtime, configuration, secrets, logging, and CI so the team can build reliably. · **Priority:** P0 · **Phase:** Wk1

### US-0.1 — Repository & project scaffold
*As a software developer, I want a scaffolded repository with tooling so that the team works in a consistent codebase.*
- **AC:** Repo initialized (src layout, `pyproject.toml`, linter/formatter, test runner).
- **AC:** `README` with setup steps; task-runner targets for install / test / run.
- **AC:** Pre-commit hooks (lint + format); CI runs lint and tests on every push.
- **Priority:** P0 · **Phase:** Wk1

### US-0.2 — Configuration system
*As a project leader, I want run and persona settings in human-readable config files so that I can adjust simulations without editing code.*
- **AC:** YAML/TOML config for run parameters (model, max turns, pairing strategy, budget cap).
- **AC:** Config validated against a schema on load with clear error messages.
- **AC:** Persona definitions loaded from versioned files (see Epic 2).
- **Priority:** P0 · **Phase:** Wk1

### US-0.3 — Secrets & Claude CLI auth preflight
*As a developer, I want Claude CLI auth and keys managed via env/secret store so that credentials are never committed and misconfig fails fast.*
- **AC:** Startup preflight verifies `claude` CLI is installed and authenticated; actionable error + remediation if not.
- **AC:** Credentials read from env or secret manager; `.env.example` documented; secrets git-ignored.
- **Priority:** P0 · **Phase:** Wk1

### US-0.4 — Structured logging & run IDs
*As a QA/data analyst, I want structured logs keyed by run ID so that I can trace every turn, cost, and error.*
- **AC:** JSON logs; each simulation gets a unique run ID; each turn logs persona, tokens, cost, latency, outcome.
- **AC:** Configurable log levels; secrets redacted; logs to file and console.
- **Priority:** P0 · **Phase:** Wk1

---

# EPIC 1 — Claude CLI Integration Layer (Agent Runtime)
**Goal:** A robust adapter that invokes every agent (persona / facilitator / judge) as a `claude` CLI subprocess and returns parsed, validated, costed results. *This is the core of the "use the Claude CLI to call agents" constraint.* · **Priority:** P0 · **Phase:** Wk1–2

### US-1.1 — Claude CLI adapter (single call)
*As a developer, I want a single function that runs `claude -p` with a system prompt + message and returns the reply so that any agent can be invoked uniformly.*
- **AC:** Adapter runs `claude -p "<message>" --append-system-prompt "<agent system prompt>" --model "<model>" --output-format json`.
- **AC:** Parses JSON output → reply text, `session_id`, usage, cost, stop reason.
- **AC:** Model, max turns/tokens, and timeout are configurable per call.
- **Priority:** P0 · **Phase:** Wk1

### US-1.2 — Tool sandboxing for persona calls
*As a lead advisor, I want persona/facilitator/judge calls to run with no tool access so that agents only produce dialogue and cannot take actions or incur tool costs.*
- **AC:** Persona calls disable all tools (empty allowed-tools / disallowed-tools); no file, web, or shell access.
- **AC:** A test asserts a persona call cannot invoke any tool.
- **Priority:** P0 · **Phase:** Wk1

### US-1.3 — Conversation-memory strategy
*As a developer, I want a defined way to preserve each agent's context across turns so that dialogues stay coherent and isolated.*
- **AC:** Documented + implemented choice: resume CLI sessions (`--resume <session_id>`) per agent, **or** reconstruct the transcript into each prompt.
- **AC:** Per-agent memory is isolated — an agent never sees another agent's private system prompt.
- **AC:** Prompt assembly is deterministic and captured for reproducibility.
- **Priority:** P0 · **Phase:** Wk1–2

### US-1.4 — Concurrency & process pool
*As a developer, I want bounded concurrent CLI calls so that we parallelize without exhausting rate limits or machine resources.*
- **AC:** A semaphore/pool caps simultaneous `claude` subprocesses (configurable).
- **AC:** Backpressure/queueing when at capacity; no orphaned/zombie processes.
- **Priority:** P1 · **Phase:** Wk2

### US-1.5 — Retries, timeouts & error handling
*As a developer, I want resilient handling of CLI failures so that transient errors don't kill a run.*
- **AC:** Per-call timeout; exponential-backoff retry on rate-limit/5xx/transient errors, with a retry cap.
- **AC:** Non-zero exits and malformed JSON handled gracefully with actionable errors.
- **AC:** Failures recorded in the transcript with error metadata (not silently dropped).
- **Priority:** P0 · **Phase:** Wk1–2

### US-1.6 — Cost & usage accounting
*As a project leader, I want per-call and per-run cost captured from CLI output so that we stay within budget.*
- **AC:** Cost/usage parsed from `--output-format json`; aggregated per run / persona / phase.
- **AC:** Feeds the run budget cap and cost dashboard (Epic 11).
- **Priority:** P0 · **Phase:** Wk2

### US-1.7 — Mock Claude CLI for tests/CI
*As a developer, I want a mock CLI mode so that automated tests run without spending money or hitting the network.*
- **AC:** Injectable fake adapter returns canned/scripted responses (including error paths).
- **AC:** CI uses the mock by default; a marked suite can run against the real CLI on demand.
- **Priority:** P0 · **Phase:** Wk2

---

# EPIC 2 — Persona Engineering
**Goal:** Design, author, validate, and version exactly 30 synthetic student personas (15 Muslim, 15 Jewish) with rich, respectful, non-caricature system prompts, plus a facilitator and a judge persona (32 JSON records total). · **Priority:** P0 · **Phase:** Wk1–3

### US-2.1 — Persona schema & template
*As a project leader, I want a structured persona template so that all personas are authored consistently.*
- **AC:** Schema fields: `id`, fictional display name, multi-generational family narrative, regional micro-history, cultural/religious baseline, values, communication style, sensitivities, and an explicit "do-not" list.
- **AC:** Every student has a structured `raisedIn` field naming a neighborhood, one of the five boroughs, and New York City; it is immutable through the editor/API.
- **AC:** A student's NYC birthplace/upbringing is modeled separately from parental and extended-family origins, which may be anywhere.
- **AC:** Stored as versioned files (one per persona); schema-validated.
- **AC:** Every persona carries an explicit "fictional / synthetic" marker.
- **Priority:** P0 · **Phase:** Wk1

### US-2.2 — Author 15 Muslim + 15 Jewish student personas
*As a project leader with advisor input, I want 30 student personas authored with depth and internal diversity so that dialogues reflect human nuance rather than stereotypes.*
- **AC:** Exactly 30 student files are complete: 15 Muslim and 15 Jewish, with diversity within each group (borough, family origin, generation, observance level, viewpoint).
- **AC:** Every student was born and raised in New York City, and each community represents all five boroughs.
- **AC:** Each persona reviewed and signed off by a relevant cultural/community advisor (reviewer + date recorded).
- **Priority:** P0 · **Phase:** Wk1–3

### US-2.3 — Anti-caricature & sensitivity review
*As a lead advisor, I want a sensitivity checklist applied to every persona so that we avoid harmful stereotypes and tropes.*
- **AC:** Checklist covering stereotype/trope risks applied per persona; issues logged and resolved before use.
- **AC:** Sign-off recorded per persona.
- **Priority:** P0 · **Phase:** Wk1–3

### US-2.4 — Persona loader & compiled system prompt
*As a developer, I want personas loaded, validated, and compiled into system prompts so that malformed personas fail fast and prompts are reproducible.*
- **AC:** Loader parses all persona files, validates schema, surfaces errors.
- **AC:** System prompt compiled deterministically from persona fields; prompt hash recorded for provenance.
- **Priority:** P0 · **Phase:** Wk2

### US-2.5 — Facilitator & judge personas
*As a project leader, I want dedicated facilitator and evaluation-judge personas so that dialogue structure and scoring are handled by purpose-built agents (also via the Claude CLI).*
- **AC:** Facilitator persona encodes RSD ground rules and prompts; judge persona encodes the evaluation rubric.
- **AC:** Both are versioned and loadable like any persona.
- **Priority:** P1 · **Phase:** Wk2–3

### US-2.6 — Persona versioning & changelog
*As a QA analyst, I want persona versions tracked so that results are attributable to a specific revision.*
- **AC:** Semantic version per persona; changes logged; run records reference the persona versions used.
- **Priority:** P1 · **Phase:** Wk2–3

---

# EPIC 3 — Multi-Agent Orchestration Engine
**Goal:** Coordinate personas into persistent projects and facilitated sessions — planning, grouping, turn-taking, intervention, and lifecycle — using the provider-neutral CLI adapter. · **Priority:** P0 · **Phase:** Wk2–4

### US-3.1 — Pairing & grouping strategies
*As a project leader, I want to configure how personas are paired/grouped so that we can run diverse dialogue combinations.*
- **AC:** Strategies: fixed pairs, round-robin cross-group pairing, small groups.
- **AC:** Dialogue runs guarantee cross-cultural pairing (Muslim × Jewish).
- **Priority:** P0 · **Phase:** Wk2–3

### US-3.2 — Turn-taking dialogue loop
*As a developer, I want a turn-taking engine so that two or more personas exchange messages for N rounds.*
- **AC:** Configurable max turns / stop conditions; speaker alternation; prior context passed per the memory strategy (US-1.3).
- **AC:** Each turn persisted immediately (crash-safe).
- **Priority:** P0 · **Phase:** Wk3

### US-3.3 — Facilitator-driven session flow
*As a project leader, I want a facilitator agent to run each session so that dialogues follow the RSD structure.*
- **AC:** Facilitator opens every session with `I'm Sam, your facilitator.`, immediately names and briefly frames its configured topic, states agreements as shared circle commitments, uses one focused substantive invitation when discussion begins, and closes the session without re-introducing himself.
- **AC:** Every provider, mock, or local-fallback opening places a clean statement of the complete sanitized configured topic immediately after Sam's introduction and anchors its go-round invitation to that topic; delayed identity, facilitator-only `I will` agreements, checklist invitations, prompt leakage, and generic narrowing receive bounded correction and a topic-preserving fallback.
- **AC:** Interventions reflect the triggering concern, name a concrete repair object, avoid facilitator self-positioning or invented intent, and end with exactly one open, single-focus question for the planned named attendee. Closings identify a transcript-supported connection without consensus and preserve an unresolved difference after challenge turns.
- **AC:** Session 1 round 1 is a mandatory neutral introduction go-round covering name, NYC upbringing, family background, culture or faith, and one value; it counts toward `rounds` and contains no assigned challenge behavior.
- **AC:** Facilitator turns are distinct from persona turns in the transcript.
- **Priority:** P1 · **Phase:** Wk3–4

### US-3.4 — Durable session-job lifecycle and restart reconciliation
*As a project leader, I want accepted session work to continue independently of my browser so that long simulations are observable and do not depend on one open tab.*
- **AC:** Session-run POST persists the job and session claim, returns HTTP 202 immediately, and does not wait for dialogue execution.
- **AC:** Job statuses are `queued | running | completed | failed`; one FIFO worker claims the oldest queued job and enforces concurrency 1.
- **AC:** Queued jobs survive a browser close/refresh and resume processing after server startup.
- **AC:** A job interrupted while running is reconciled to `failed` instead of replayed, avoiding duplicate paid model calls; the session can be submitted again.
- **AC:** Run statuses remain `pending | running | paused | completed | failed`; interrupted runs do not resume from a turn checkpoint in the as-built queue.
- **Priority:** P1 · **Phase:** Wk3–4

### US-3.5 — Scenario / topic configuration
*As a project leader, I want to define dialogue scenarios so that runs target relevant themes within methodology limits.*
- **AC:** Scenario config (opening prompt, allowed themes, number of rounds) is validated against prompt-injection and hard-safety guardrails without excluding a topic merely because it is political or geopolitical.
- **Priority:** P1 · **Phase:** Wk3–4

### US-3.6 — Persistent project and session planning
*As a project leader, I want to create a named multi-session project with one shared roster so that a dialogue program is planned and auditable as a coherent series.*
- **AC:** `POST /api/projects` captures `name`, `sessionCount` (1–20), `attendeeIds`, `controversialPerCommunity`, and shared provider/model/reasoning/order/budget/mock settings.
- **AC:** Creation persists exactly `sessionCount` embedded `ProjectSession` shells with stable IDs, one-based numbers, `unconfigured` status, empty topic, and null rounds.
- **AC:** The shared roster contains at least one Muslim and one Jewish student; IDs are deduplicated and names/groups are snapshotted on the project.
- **AC:** Each session is configured independently through its stable ID with a non-empty `topic` and a whole-number `rounds` count bounded by 10 and the 60-persona-turn cap.
- **AC:** Submitting a session creates a persistent job, locks the session while queued/running, and later creates an ordinary `Run` with optional job/project/session linkage; terminal run status and `runId` are copied back to the session.
- **AC:** Existing `POST /api/runs` one-off runs and historical records that omit project fields remain readable.
- **Priority:** P0 · **Phase:** Wk3–4

### US-3.7 — Balanced challenge voices and immediate facilitator repair
*As a lead advisor, I want bounded simulated tension followed by visible facilitator repair so that the system demonstrates de-escalation rather than merely avoiding disagreement.*
- **AC:** Project creation samples exactly N Muslim and N Jewish attendees without replacement and persists the one-time assignment in `controversialAgentIds`; it never mutates the global persona records.
- **AC:** Assigned personas form a stable candidate pool. Up to two distinct voices, one per community, receive the project-scoped challenge prompt per discussion go-round, rotating by project session and discussion-round index; introductions have none. Selected speakers stay in first-person lived experience and are prohibited from slurs, threats, dehumanization, incitement, and whole-group claims.
- **AC:** A controlled challenge targets the freshest eligible ordinary, neutral scheduled discussion contribution from another student; invited repair replies are excluded. Semantic-fidelity checks reject invented/direct target attribution, unsupported sufficiency/universal/automatic conclusions, canned endings, and structural reuse of recent challenges.
- **AC:** Every participant response is classified `neutral`, `escalating`, or `deescalating`; classification reasons and hard-unsafe detections are auditable.
- **AC:** An escalating or polarizing discussion turn is immediately followed, before another persona speaks, by a facilitator intervention tagged `deescalating` and linked with `triggeredByTurnId`.
- **AC:** The intervention's named attendee receives one linked immediate repair reply that reflects the triggering concern, answers the facilitator's question, clarifies intent, and ends in a reflective statement without asking a new question; the scheduled go-round then resumes unchanged.
- **AC:** Turn records expose `roundKind`, `roundNumber`, `conversationTag`, `controversialSpeaker`, `tagReasons`, and intervention reasons.
- **Priority:** P0 · **Phase:** Wk4–6

---

# EPIC 4 — Reflective Structured Dialogue Methodology & Conflict-Sensitive Guardrails
**Goal:** Programmatically enforce conflict-sensitive, topic-faithful dialogue — allow difficult and geopolitical topics through first-person lived impact while preventing collective blame, dehumanization, and topic drift. · **Priority:** P0 · **Phase:** Wk4–6

### US-4.1 — Methodology rule set
*As a lead advisor, I want the RSD methodology encoded as explicit, versioned rules so that enforcement is consistent and auditable.*
- **AC:** Documented rules: every discussion turn stays connected to the configured topic; political and geopolitical topics are allowed through lived personal impact; public-conflict topics require a concrete human consequence, ethical tension, uncertainty, or NYC impact; personal-history focus; "I"-statements; curiosity over persuasion; no collective blame; shared ground-rule agreements.
- **AC:** Authored persona fields are the exhaustive biography source; unsupported relationships, teachings, quotations, events, routines, settings, routes, travel, losses, and other personal facts are prohibited, as is material reuse of recent phrasing or concept bundles.
- **AC:** Rules referenced by both prompts and validators; versioned with a hash.
- **Priority:** P0 · **Phase:** Wk4

### US-4.2 — Prompt-level enforcement
*As a developer, I want methodology rules injected into every agent prompt so that agents are steered toward compliant dialogue.*
- **AC:** Shared methodology preamble appended to persona and facilitator prompts.
- **AC:** Preamble version/hash recorded per run for reproducibility.
- **Priority:** P0 · **Phase:** Wk4

### US-4.3 — Turn validator (guardrail check)
*As a lead advisor, I want each generated turn checked against the rules so that off-methodology turns are caught.*
- **AC:** Validator flags prohibited content (collective blame and dehumanizing language) without treating political vocabulary itself as a violation.
- **AC:** Opening validation requires Sam's identity in the first sentence, safe methodology-compliant output, the complete sanitized configured topic immediately afterward, shared-agreement framing, and a go-round invitation explicitly grounded in that topic; the discussion-opening prompt and local fallback request one focused substantive question, and safe curiosity wording does not fail merely because it matches de-escalation markers.
- **AC:** Every non-introduction phase passes deterministic topic-relevance validation; non-introduction persona responses on public topics also pass a substantive-grounding gate. Off-topic, shallow-topic, neutral-introduction drift, and hard-unsafe output use bounded retry/topic-preserving fallback; bounded challenge turns are persisted as `escalating` and immediately routed to facilitator repair.
- **AC:** Persona candidates pass exhaustive profile-fidelity checks; non-introduction candidates also pass dialogue-novelty checks, and controlled challenges pass target-semantic-fidelity checks.
- **AC:** Facilitator openings, interventions, invited replies, and closings use phase-specific structural acceptance rules rather than a single generic dynamics label.
- **AC:** Visible-output validation rejects internal prompt labels, JSON metadata, retry instructions, and output-format scaffolding; exact rejected text remains available only in the attempt audit and is never reused as a challenge anchor. Balanced Markdown emphasis/code/headings and trailing hard-break spaces are normalized to plain text before validation and persistence.
- **AC:** Validator decisions logged with reason codes.
- **Priority:** P0 · **Phase:** Wk4–5

### US-4.4 — Adherence signals ("I"-statements & personal history)
*As a QA analyst, I want measurable adherence signals per turn so that we can quantify methodology compliance.*
- **AC:** Per-turn signals computed: I-statement presence, personal-history reference, curiosity-question presence.
- **AC:** Signals stored per turn for the evaluation dashboards (Epic 5).
- **AC:** New Runs recompute signals from visible text and compute the stored topic-relevance rate across non-introduction persona responses; every non-introduction generation phase remains protected by its acceptance validator, and historical Runs remain readable without newer metric fields.
- **Priority:** P1 · **Phase:** Wk5

### US-4.5 — De-escalation & safe-stop
*As a lead advisor, I want automatic de-escalation/stop conditions so that a dialogue that turns harmful is halted.*
- **AC:** `classifyConversation()` distinguishes dialogue dynamics from methodology adherence and identifies hard-unsafe slurs, threats/incitement, and dehumanizing language.
- **AC:** Escalating or polarizing but bounded discussion is retained for audit and immediately repaired by the facilitator; hard-unsafe model output is replaced with a safe fallback.
- **AC:** Configurable triggers (repeated guardrail trips, harmful content) pause the run and flag for human review.
- **AC:** Safe-stop events recorded; no further turns until a human clears the run.
- **Priority:** P0 · **Phase:** Wk5–6

---

# EPIC 5 — Safety, QA & Evaluation ("the Matrices")
**Goal:** Capture logs and compute the evaluation matrices — guardrail triggers, methodology alignment, and "moments of synthetic empathy" — for advisor review. · **Priority:** P1 · **Phase:** Wk4–6

### US-5.1 — Transcript & raw-log capture
*As a QA analyst, I want complete transcripts plus raw system logs per run so that everything is auditable.*
- **AC:** Every turn stored with full prompt, response, model, versions, cost, and validator results.
- **AC:** Raw logs exportable.
- **Priority:** P0 · **Phase:** Wk4

### US-5.2 — Guardrail-trigger detection & tagging
*As a QA analyst, I want safety-guardrail triggers detected and tagged so that we can map where models refuse or safety-complete.*
- **AC:** Detect refusals / safety completions / stop reasons; tag turns; aggregate frequency by persona and topic.
- **AC:** Store `ConversationTag` (`neutral | escalating | deescalating`) separately from refusal guardrails and methodology compliance flags.
- **AC:** Store `RoundKind` (`opening | introduction | discussion | intervention | invited-response | closing`) and preserve challenge-target, intervention-trigger, named-invitee, and invited-reply causal links.
- **Priority:** P1 · **Phase:** Wk4–5

### US-5.3 — Evaluation metrics engine
*As a lead advisor, I want defined metrics computed per run so that we can assess dialogue quality and safety.*
- **AC:** Metrics: methodology adherence ("algorithmic alignment"), guardrail-trigger rate, I-statement/personal-history/curiosity ratios, sentiment trajectory, topic relevance, repetition risk, linked-challenge-fidelity risk, and an operationalized "synthetic empathy" score.
- **AC:** Retain legacy persona-response `turnCount` while separately reporting all visible turns, an explicit persona-response alias, curiosity-eligible turns, and challenge-fidelity assessed count.
- **AC:** Final adherence is the lower of a deterministic floor that includes noncompliance/repetition/challenge-fidelity risk and the full-transcript judge's adherence score.
- **AC:** Each metric has a written, versioned definition.
- **Priority:** P1 · **Phase:** Wk5

### US-5.4 — LLM-as-judge scoring (via Claude CLI)
*As a QA analyst, I want a judge agent (invoked via the Claude CLI) to score empathy/adherence so that qualitative signals are quantified.*
- **AC:** Judge is a distinct agent with a rubric; outputs structured scores plus rationale.
- **AC:** Judge input contains the complete visible transcript in turn order—including opening, facilitator interventions, invited replies, and closing—plus challenge/trigger/invitation/response relationship metadata.
- **AC:** Rubric checks challenge fidelity to its target, whether repair replies answer the actual invitation, repeated/canned dialogue, strawman risk, and whether the closing preserves unresolved differences without manufacturing consensus.
- **AC:** Judge prompts/rubric are versioned; judge runs are themselves logged and costed.
- **Priority:** P1 · **Phase:** Wk5

### US-5.5 — Judge calibration & human validation
*As a lead advisor, I want judge scores validated against human ratings so that we don't rely on unvalidated metrics.*
- **AC:** A human-labeled sample is compared to judge scores; agreement reported.
- **AC:** Documentation states plainly that metrics describe the *simulation*, not real-world reconciliation, and warns against metric gaming.
- **Priority:** P1 · **Phase:** Wk5–6

### US-5.6 — Evaluation dashboard
*As a project leader, I want dashboards of the matrices so that advisors can review results.*
- **AC:** Per-run and cross-run views; drill-down to individual turns; export to CSV/PNG.
- **Priority:** P2 · **Phase:** Wk6

---

# EPIC 6 — Content Generation: Collaborative Digital Peace Campaign
**Goal:** Group personas into cross-cultural "creative teams" to auto-generate campaign content from the simulated dialogues. · **Priority:** P1 · **Phase:** Wk7–8

### US-6.1 — Creative-team formation
*As a project leader, I want personas grouped into cross-cultural creative teams so that content reflects both communities.*
- **AC:** Teams mix Muslim + Jewish personas; team composition saved with the run.
- **Priority:** P1 · **Phase:** Wk7

### US-6.2 — Social-media script generation
*As a project leader, I want the app to draft platform-specific social scripts so that we have campaign-ready copy.*
- **AC:** Generates variants per platform (length/tone); each asset tagged with source personas + prompt hashes.
- **AC:** Output validated against methodology rules before it enters the review queue.
- **Priority:** P1 · **Phase:** Wk7–8

### US-6.3 — Campaign blueprint generation
*As a project leader, I want campaign blueprints (themes, calendar, messaging pillars) so that partners can execute a coordinated campaign.*
- **AC:** Structured, editable blueprint output referencing methodology themes.
- **Priority:** P2 · **Phase:** Wk7–8

### US-6.4 — Testimonial-style dialogue text generation
*As a project leader, I want testimonial-style texts drawn from the simulated dialogues so that we can illustrate cross-community understanding.*
- **AC:** Generated only from actual simulated transcripts.
- **AC:** Every asset is explicitly labeled as *synthetic / AI-generated — not a real person's testimony* (enforced in Epic 7).
- **Priority:** P1 · **Phase:** Wk7–8

### US-6.5 — Content templates & tone guidelines
*As a project leader, I want reusable templates and tone guidelines so that outputs are consistent.*
- **AC:** Templates per asset type; tone/brand config applied; outputs validated against methodology rules.
- **Priority:** P2 · **Phase:** Wk7–8

---

# EPIC 7 — Content Review, Provenance & Ethical Publishing
**Goal:** Ensure all published content is human-reviewed, clearly labeled as AI-generated, non-deceptive, and partner-approved. *This is a guardrail epic — treated as P0.* · **Priority:** P0 · **Phase:** Wk7–8

### US-7.1 — Provenance metadata on every asset
*As a lead advisor, I want provenance recorded for each asset so that origin is always traceable.*
- **AC:** Each asset stores: AI-generated flag, model, persona versions, prompt hashes, timestamp,
  run ID, and optional project/session IDs copied from a project-created run.
- **AC:** Provenance travels with every export.
- **Priority:** P0 · **Phase:** Wk7

### US-7.2 — Mandatory AI-generated disclosure/labeling
*As a community partner, I want every published asset to carry a visible "AI-generated" disclosure so that audiences are never deceived.*
- **AC:** Publishing pipeline injects a visible label/disclosure that cannot be disabled for external posts.
- **AC:** No asset may present a synthetic persona as a real individual.
- **Priority:** P0 · **Phase:** Wk7

### US-7.3 — Human-in-the-loop review queue
*As a lead advisor, I want an approval gate so that no content is published without human sign-off.*
- **AC:** Review queue with approve / reject / edit; rejection requires a reason; full audit trail (reviewer + decision + time).
- **AC:** External publishing is blocked until an item is approved.
- **Priority:** P0 · **Phase:** Wk7

### US-7.4 — Automated content safety screening
*As a lead advisor, I want automated screening before human review so that hateful/misleading content is caught early.*
- **AC:** Screens for hate, harassment, misinformation, and sensitivity issues; flagged items routed to advisors.
- **Priority:** P1 · **Phase:** Wk7–8

### US-7.5 — Partner publishing & sign-off workflow
*As a community partner, I want a controlled workflow to publish to our channels so that each org approves what goes out under its name.*
- **AC:** Per-partner approval required before cross-posting; a partner can decline.
- **AC:** Publish log records what / where / when / by whom.
- **Priority:** P1 · **Phase:** Wk8

### US-7.6 — Takedown / kill switch
*As a lead advisor, I want a takedown mechanism so that we can retract content quickly.*
- **AC:** One action flags an asset as retracted and updates the publish log.
- **AC:** Tooling to request removal from partner channels.
- **Priority:** P1 · **Phase:** Wk8

---

# EPIC 8 — Application UI: Dashboard, Control & Showcase
**Goal:** A UI for non-developers to configure/run simulations, review outputs, and present at the public showcase. · **Priority:** P1 · **Phase:** Wk3–8

### US-8.1 — Simulation control panel
*As a project leader, I want to configure and launch runs from a UI so that I don't need the command line.*
- **AC:** The primary dashboard creates/lists persistent projects; `/projects/[id]` configures session topics/rounds and launches each session.
- **AC:** Project creation selects a shared roster, X session count, N challenge voices per community, model/reasoning, order, and mock mode.
- **AC:** Session launch receives HTTP 202 after the persistent job is accepted, shows queued/running state, and links to the resulting `/runs/[id]` transcript when `runId` exists.
- **AC:** Closing, refreshing, or navigating away after acceptance does not cancel the job; queued/running sessions remain locked against editing or duplicate execution.
- **AC:** `/jobs` has separate active and previous-job sections, polls while work is active, and displays submitted/started/finished times, live waiting/running duration, final duration, error, and transcript link.
- **Priority:** P1 · **Phase:** Wk4–5

### US-8.2 — Transcript viewer
*As a QA analyst, I want to read dialogues with annotations so that I can review turn-by-turn.*
- **AC:** Transcript view shows validator flags, guardrail tags, and adherence signals inline.
- **AC:** Project runs also display introduction/discussion/intervention phase, challenge-speaker status, escalating/deescalating tags, reasons, and intervention linkage.
- **Priority:** P1 · **Phase:** Wk5

### US-8.3 — Metrics & matrices dashboard (UI)
*As a project leader, I want visual dashboards so that advisors can interpret results.* (surfaces Epic 5)
- **AC:** Charts for key metrics; run comparison; export.
- **Priority:** P2 · **Phase:** Wk6

### US-8.4 — Content library & review UI
*As a community partner, I want to browse, review, and approve generated content in one place so that publishing is manageable.* (surfaces Epic 7)
- **AC:** Filter/search assets; review actions; provenance and AI labels always visible.
- **Priority:** P1 · **Phase:** Wk7–8

### US-8.5 — Showcase presentation mode
*As a stakeholder at the showcase, I want a clean presentation view so that results are legible to a public audience.*
- **AC:** Read-only, projector-friendly view of selected transcripts, metrics, and campaign samples; no sensitive internals exposed.
- **Priority:** P2 · **Phase:** Wk8

---

# EPIC 9 — Data Persistence, Export & Reporting
**Goal:** Durable storage and reproducible exports for projects, sessions, personas, runs, turns, metrics, content, and reviews. · **Priority:** P1 · **Phase:** Wk2–8

### US-9.1 — Data model & storage
*As a developer, I want a schema and storage layer so that all artifacts persist reliably.*
- **AC:** As-built JSON collections: projects with embedded sessions, persistent jobs, runs with embedded metrics, turns, assets with embedded reviews, and publish logs; personas remain versioned source JSON.
- **AC:** `jobs.json` stores job status, project/session identity, lifecycle timestamps, terminal duration/error, and optional run result; `GET /api/jobs` lists it for the Jobs UI.
- **AC:** Project creation/session claiming uses a project-file mutex and atomic replacement; project-to-run execution is explicitly documented as a non-transactional cross-file workflow.
- **AC:** Project metadata on `RunConfig` and dynamics annotations on `Turn` are optional so legacy one-off JSON remains readable without migration.
- **Future hardening AC:** Replace or wrap the JSON store with migrations and referential integrity;
  the as-built repository has neither.
- **Priority:** P0 · **Phase:** Wk2

### US-9.2 — Reproducibility bundle
*As a QA analyst, I want a run exportable as a self-contained bundle so that results are reproducible.*
- **AC:** Bundle includes configs, persona versions, prompts/hashes, transcripts, metrics, and costs.
- **Priority:** P1 · **Phase:** Wk6

### US-9.3 — Run reports & summaries
*As a project leader, I want auto-generated run reports so that I can share results with advisors and the funder.*
- **AC:** Markdown/PDF report per run: setup, metrics, notable dialogues, costs, and caveats.
- **Priority:** P2 · **Phase:** Wk6–8

### US-9.4 — Data export (CSV/JSON)
*As a QA analyst, I want structured exports so that I can analyze data externally.*
- **AC:** Export transcripts and metrics to CSV/JSON with provenance attached.
- **Priority:** P2 · **Phase:** Wk6–8

---

# EPIC 10 — Open-Source Release & Digital Peacebuilding Toolkit
**Goal:** Publish the app and toolkit on GitHub as a reusable, well-documented, ethically-guardrailed open-source project (the proposal's "Digital Legacy"). · **Priority:** P2 · **Phase:** Post-grant

### US-10.1 — Repo hardening & license
*As an open-source adopter, I want a clean, licensed repo so that I can reuse it safely.*
- **AC:** OSS license; contribution guide; code of conduct; no secrets/PII anywhere in history.
- **Priority:** P2 · **Phase:** Post-grant

### US-10.2 — Digital Peacebuilding Toolkit docs
*As an open-source adopter, I want a technical guide so that I can run my own program.*
- **AC:** Docs covering persona/prompt design, methodology encoding, model alignment, dialogue parameters, evaluation, and ethical publishing.
- **Priority:** P2 · **Phase:** Post-grant

### US-10.3 — Example configs & one-command quickstart
*As an open-source adopter, I want runnable examples so that I can get started quickly.*
- **AC:** Example (clearly fictional) personas, a sample scenario, and a one-command demo that runs against the mock CLI.
- **Priority:** P2 · **Phase:** Post-grant

### US-10.4 — Ethics & responsible-use statement
*As a lead advisor, I want a prominent ethics/limitations statement so that adopters understand appropriate use.*
- **AC:** Documents mandatory synthetic-content labeling, non-impersonation, limitations, and that simulation ≠ real reconciliation.
- **Priority:** P2 · **Phase:** Post-grant

### US-10.5 — Workshop integration materials
*As a Columbia workshop instructor, I want teaching materials so that the tool fits computational-social-science courses.*
- **AC:** Lesson/lab guide plus an example bundle referencing the toolkit.
- **Priority:** P2 · **Phase:** Post-grant

---

# EPIC 11 — Cost Control, Rate-Limiting & Operational Reliability
**Goal:** Keep Claude CLI usage within budget and runs reliable at scale. · **Priority:** P1 · **Phase:** Wk2–8

### US-11.1 — Budget caps & alerts
*As a project leader, I want per-run and global budget caps so that costs are controlled.*
- **AC:** Configurable caps; warnings at thresholds; hard stop + checkpoint when a cap is hit.
- **Priority:** P0 · **Phase:** Wk2–3

### US-11.2 — Rate-limit-aware scheduling
*As a developer, I want scheduling that respects rate limits so that runs don't fail en masse.*
- **AC:** Adaptive throttling/backoff; concurrency auto-tunes to observed limits.
- **Priority:** P1 · **Phase:** Wk3–4

### US-11.3 — Cost dashboard & forecasting
*As a project leader, I want cost visibility so that I can plan the 8-week budget.*
- **AC:** Spend broken down by run / phase / persona; a simple forecast to completion.
- **Priority:** P2 · **Phase:** Wk4–6

### US-11.4 — Idempotency & safe retries
*As a developer, I want idempotent turn execution so that retries don't duplicate or corrupt data.*
- **AC:** Turn writes are idempotent; replays detected; accounting avoids double-counting where possible.
- **Priority:** P1 · **Phase:** Wk3–4

---

# EPIC 12 — Testing, CI & Quality Assurance
**Goal:** Automated tests and evaluation regression so the system stays correct and safe as it evolves. · **Priority:** P1 · **Phase:** Wk1–8

### US-12.1 — Unit tests
*As a developer, I want unit tests for adapters, validators, and metrics so that core logic is verified.*
- **AC:** Coverage for CLI output parsing, guardrail validators, metric calculations, and provenance recording.
- **Priority:** P1 · **Phase:** Ongoing

### US-12.2 — Integration tests (mock CLI)
*As a developer, I want end-to-end dialogue tests against the mock CLI so that orchestration works without cost.*
- **AC:** A full run executes with the mock; transcripts/metrics asserted; runs in CI.
- **Priority:** P1 · **Phase:** Ongoing

### US-12.3 — Guardrail regression suite
*As a lead advisor, I want a fixture suite of compliant/non-compliant turns so that guardrail changes don't regress.*
- **AC:** Labeled fixtures; the validator asserts expected flags; runs in CI.
- **Priority:** P1 · **Phase:** Wk4–8

### US-12.4 — Concurrency / load tests
*As a developer, I want load tests so that the pool and rate-limit handling hold under scale.*
- **AC:** Many concurrent runs simulated (mock CLI); no leaks/deadlocks; bounded resource use.
- **Priority:** P2 · **Phase:** Ongoing

### US-12.5 — Live smoke test (real CLI)
*As a developer, I want a small opt-in real-CLI smoke test so that we catch real integration breaks.*
- **AC:** A minimal real `claude` run behind a flag; asserts parsing + cost capture; excluded from default CI.
- **Priority:** P2 · **Phase:** Ongoing

---

## Cross-cutting non-functional requirements (NFRs)

- **Reliability / resumability:** accepted project-session jobs survive browser abandonment; queued jobs resume after process startup, while interrupted running jobs are failed without replay and can be resubmitted (US-3.4).
- **As-built reliability boundary:** `jobs.json` and worker locks are single-node/process-local, and running work has no turn-level checkpoint resume. Use a transactional distributed queue before multi-process deployment.
- **Cost efficiency:** every agent call is budgeted, capped, and accounted (Epics 1, 11).
- **Security:** secrets never committed; least-privilege agent sandboxing (US-1.2).
- **Privacy:** all personas are synthetic; no real individuals represented or impersonated.
- **Auditability:** full provenance and logs for every turn and asset (Epics 5, 7, 9).
- **Reproducibility:** deterministic prompt assembly + versioned personas/methodology/rubrics.
- **Portability:** model and storage backends are swappable; agent runtime is the `claude` CLI.
- **Accessibility:** showcase/presentation UI is legible and projector-friendly.

## Definition of Ready (DoR)
A story is ready when: acceptance criteria are clear and testable; dependencies are known; and any persona/methodology/publishing story has advisor review scoped in.

## Definition of Done (DoD)
A story is done when: code + tests pass in CI; docs updated; provenance and AI-labeling enforced where applicable; advisor sign-off obtained for persona/methodology/publishing items; and no secrets are committed.

---

## Assumptions, risks & open questions

| # | Item | Type | Mitigation / owner |
|---|---|---|---|
| 1 | The pivot from a human cohort to a software simulation is a **material change of scope** vs. the original grant. | Open question | Confirm funder approval before build starts (Project Leader). |
| 2 | AI-generated "testimonials"/campaigns could be perceived as **astroturfing** if presented as authentic voices. | Ethical risk | Mandatory AI-labeling, human review, non-impersonation (Epic 7). |
| 3 | Metrics measure the **simulation, not real reconciliation**; risk of overclaiming impact. | Validity risk | Explicit caveats in reports and toolkit (US-5.5, US-10.4). |
| 4 | LLM personas can **caricature** real identities. | Representational risk | Advisor-reviewed personas + sensitivity checklist (Epic 2). |
| 5 | Partner orgs must **consent** to representation and to publishing under their name. | Consent risk | Per-partner sign-off workflow (US-7.5). |
| 6 | Many CLI calls can be **expensive**. | Cost risk | Budget caps, cost dashboard, mock CLI in CI (Epics 11, 1). |
| 7 | Tech stack (Python / SQLite / FastAPI) is an assumption. | Assumption | Kept swappable; agent runtime fixed to the `claude` CLI. |
| 8 | The durable job store and FIFO worker are single-node; a running job interrupted by restart cannot safely replay non-idempotent paid calls. | Reliability risk | Mark interrupted work failed, show the reason in `/jobs`, allow resubmission, and move to a transactional distributed queue plus idempotent checkpoints before scaling. |

---

## Glossary

- **RSD (Reflective Structured Dialogue):** a facilitated dialogue methodology emphasizing ground rules, personal stories, structured turns, and curiosity over debate.
- **Persona / agent:** a synthetic character invoked as a `claude` CLI subprocess with its own system prompt.
- **Facilitator:** an agent that runs the RSD session structure.
- **Judge:** an agent that scores dialogues against a rubric (LLM-as-judge).
- **The matrices:** the set of evaluation metrics reviewed by advisors (adherence, guardrail triggers, synthetic empathy, etc.).
- **Guardrail trigger:** a point where a model refuses or safety-completes.
- **Provenance:** the metadata proving how an asset was produced (model, persona versions, prompt hashes, timestamps).
- **Creative team:** a cross-cultural grouping of personas that co-generates campaign content.
- **Project:** a persistent multi-session plan containing a shared attendee snapshot, provider settings, one-time challenge assignments, and embedded session shells.
- **Project session:** one numbered, independently configured topic/round plan that creates a normal run when executed.
- **Job:** a persisted project-session work record with queued/running/completed/failed state, timing, error, and optional Run linkage; processed FIFO by the single-node worker.
- **Challenge voice:** a project-scoped, randomly assigned fictional participant prompted to express bounded first-person tension during discussion so the facilitator can demonstrate repair; not an identity trait.
- **Conversation tag:** the stored dialogue-dynamics label `neutral`, `escalating`, or `deescalating`, separate from methodology compliance and provider guardrail/refusal status.
