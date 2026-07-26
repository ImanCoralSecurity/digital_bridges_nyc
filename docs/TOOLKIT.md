# The Digital Peacebuilding Toolkit

A technical + ethical guide for running (and adapting) the Digital Bridges NYC simulation. This is
the open-source "Digital Legacy" deliverable: a replicable blueprint for modeling conflict-sensitive
dialogue with LLM agents — used responsibly.

## 1. Responsible-use statement (read first)

This system generates synthetic dialogue and campaign content. Used carelessly, that capability can
mislead. The following are **hard requirements**, enforced in code, not suggestions:

- **Synthetic, not real.** Every persona is fictional and marked `"fictional": true`. Content must
  never present a persona as a real individual or as authentic testimony.
- **Always labeled.** Every generated asset carries a visible AI-generated disclosure that is
  prepended to any published representation (`lib/publishing.ts → publishedRepresentation`). It
  cannot be disabled for external posts.
- **Human sign-off.** Nothing reaches a partner channel without an explicit human approval, with an
  audit trail. Publishing an unapproved asset is rejected by the API.
- **No astroturfing.** Do not deploy volumes of AI content to simulate grassroots sentiment. Publish
  sparingly, labeled, and with partner consent.
- **Simulation ≠ reconciliation.** The metrics measure the behavior of an LLM system. They do **not**
  measure real intergroup healing. Never report them as evidence of real-world impact.
- **Advisor review.** Personas ship with `advisorSignoff` pending (`""`). A qualified cultural /
  community advisor must review and sign off before a persona is used in production.
- **Challenge roles are scoped simulation behavior.** A project's `controversialAgentIds` are
  randomly selected fictional attendees asked to express bounded first-person tension so the
  facilitator can practice repair. The assignment is not a claim about a community or an underlying
  persona, never applies during introductions, and must never invite slurs, threats, dehumanization,
  incitement, or collective blame.
- **Rejected-attempt logs are sensitive audit data.** `generation_attempts.json` can retain complete
  compiled persona/system prompts, the transcript-so-far included in a conversation prompt, raw
  rejected model text, and rejection reasons. It is for restricted debugging and methodology review,
  not publication. Apply access, backup, retention, and deletion controls appropriate for full prompt
  data even though every persona is fictional. This repository's checked-in synthetic database is a
  deliberate project-evidence exception; do not treat that exception as a safe default for forks or
  deployments containing confidential topics or real-person data.
- **Validator logs are equally sensitive.** `semantic_validation_attempts.json` retains the full
  evidence packet, candidate, raw validator output, and short evidence quotes in parsed decisions.
  Restrict its detail API and storage using the same prompt-data controls.

## 2. Persona design

Personas live in repository-relative `personas/*.json`, one versioned file per persona. The shipped corpus contains
exactly **30 fictional students — 15 Muslim and 15 Jewish — plus one facilitator and one judge**,
for 32 JSON records. Every student was born and raised in New York City, and each community includes
students from all five boroughs.

Author from **personal and family experience** — feelings, family conversations, NYC life, food,
memory, ritual, values, and uncertainty. Personas may discuss a configured political or
geopolitical topic directly, but they never speak for a whole community or become partisan
advocates. A student's NYC upbringing and their family's origins are distinct facts. Parents and
extended family may originate anywhere; `regionalHistory` can preserve that inherited heritage
without implying that the student was born or raised outside NYC. Diversity within each community
(borough, family origin, generation, observance) is deliberate and reduces caricature.

Schema (see `lib/types.ts → Persona`): `id`, `version`, `group`, `displayName` (fictional),
`fictional: true`, student `raisedIn`, `background`, `regionalHistory`, `culturalBaseline`,
`values[]`, `communicationStyle`, facilitator `degree` and `professionalBackground`, `sensitivities[]`,
`doNot[]`, `advisorSignoff`, and optional role instructions. A student `raisedIn` value must name a
neighborhood, a borough, and New York City.
`lib/personaRules.ts` and the loader enforce the exact 15+15 roster and reject missing or non-NYC
student locations. The persona editor and PATCH API cannot change `raisedIn`; altering this immutable
upbringing fact requires an intentional source-and-seed change with corresponding review.

The compiler (`lib/personas.ts`) includes `raisedIn` in a deterministic system prompt and appends the
methodology preamble; the prompt hash is recorded for provenance.

## 3. The methodology (RSD) and its guardrails

Encoded in `lib/methodology.ts`, currently versioned as methodology `1.15.1`:

- **Prompt-level:** `methodologyPreamble()` is appended to every persona/facilitator prompt.
  Challenge turns use a mode-aware version: they state bounded tension declaratively and leave
  curiosity and repair to the facilitator's immediately following turn.
- **Deterministic pre-gate:** `deterministicTurnGate.ts` rejects only literal, high-confidence
  failures: empty/oversized output, prompt scaffolding, explicit hard-unsafe language, exact
  question-count contracts, and named routing. Political vocabulary such as *war*, *ceasefire*, or
  *occupation* is not itself a violation.
- **Semantic acceptance:** every provider-generated real visible candidate is reviewed by an independent LLM using the
  full accepted transcript and complete public persona profile. It decides topic relevance,
  substantive meaning, responsiveness, novelty, target fidelity, speaker/persona consistency,
  naturalness, phase fidelity, `conversationTag`, and `needsIntervention`. Legacy lexical checks can
  be passed as advisories but cannot veto output by themselves. The local acceptance policy still
  enforces the validator's failed checks, critical issues, phase-critical warnings, challenge-target
  fidelity, and minimum quality score.
- **One selected model:** generation and semantic review remain separate calls with different roles,
  but both use the provider, model, and reasoning effort selected for the project/run. Selecting
  Spark therefore applies to persona turns, Sam, semantic review, and final evaluation alike.
- **Concrete subject rotation:** every scheduled discussion turn receives a distinct topic-specific
  content focus. That focus is a blocking phase contract and follows reroutes, retries, routed
  questions, and fallbacks, preventing a whole circle from repeating one mechanism in new wording.
- **Turn-to-turn continuity:** except for the first participant and phase-specific challenge/repair
  turns, every ordinary discussion response starts by naming the immediately previous participant
  and faithfully summarizing one distinctive point from that exact turn in one sentence. The new
  speaker's own contribution begins in sentence two and is evaluated separately for depth and novelty.
  The direct bridge varies in form; session-wide repetition of one opener family such as "I hear you
  saying" is a semantic repetition defect, not a required template or single-use forbidden phrase.
- **Evidence-based decisions:** the reviewer returns strict structured `accept`, `retry`, or
  `reroute` output. Mere style preferences remain non-blocking, while evidence-backed meaning or
  phase defects become an auditable retry. Reroute prevents a false challenge from producing a generic
  escalation, facilitator validation of a manufactured gap, and a forced concession.
- **Phase-specific facilitator validation:** in the opening, Sam identifies himself in the first
  sentence, immediately states the naturally normalized and safety-checked topic once, frames agreements as shared
  circle agreements, and gives a topic-grounded invitation. Project session 1 also includes the
  persisted project introduction and Sam's profile-supported credentials; later sessions omit both.
  The discussion-opening generation contract asks for one focused substantive question. Before every
  go-round after the first, one procedural facilitator sentence signals the next round without a new
  introduction, participant summary, or question. An intervention must reflect the trigger,
  name a concrete repair object, and end in exactly one single-focus question for the planned
  invitee without facilitator self-positioning, a leading premise, or a forced binary. A closing
  first summarizes transcript-supported stakes and any current difference, then explains how that
  specific exchange could support peacebuilding without claiming achieved reconciliation or impact
  and explicitly thanks participants for their participation or contribution.
  Sam never re-introduces himself after the opening.
- **Regeneration and repair:** introduction drift, off-topic output, and hard-unsafe output are
  retried and, if needed, replaced with a safe, topic-preserving fallback. Bounded tension is
  persisted as `escalating` and immediately paired with a facilitator repair instead of being
  silently regenerated away. A candidate discarded during these bounded checks is durably recorded
  with its prompts, response, rejection reasons, attempt number, and provider metadata before the
  orchestrator retries or chooses a local fallback.
- **Output hygiene:** prompt-control labels, JSON context keys, retry headings, and output-format
  instructions never become accepted dialogue. `safeContextDetail()` skips contaminated sentences
  before creating a challenge/fallback anchor; campaign copy and judge rationale use the same gate.
  Dialogue candidates are also normalized to plain text before validation and persistence: balanced
  Markdown emphasis, inline-code markers, heading markers, and trailing hard-break spaces are
  removed without altering the words.
- **Safe-stop:** repeated guardrail triggers set the Run to automatic `paused` for human review. This
  is distinct from a user's resumable Job pause, which sets the Run to `suspended`.

The exact reviewer guideline, decision schema, confidence thresholds, outage policy, and hard-vs-
semantic boundary are maintained in `docs/SEMANTIC_VALIDATOR_GUIDELINE.md`.

## 4. Orchestration

`lib/projects.ts` adds a persistent planning layer above the existing `Run` engine. A `Project`
stores a user-authored project introduction, one shared student roster, provider/model settings,
`sessionCount`, and exactly that many embedded `ProjectSession` shells. At creation,
`lib/projectRules.ts`'s
`selectControversialAgentIds()` samples `controversialPerCommunity` Muslim attendees and the same
number of Jewish attendees without replacement. It persists those `controversialAgentIds` once; it
does not re-randomize by session or modify `personas/*.json`.

Each session starts `unconfigured`, with its own stable ID and one-based `number`. Configure it with
a non-empty `topic` and a valid `rounds` count before running. Session 1 has
`mandatoryIntroductionRound: true`: round 1 is limited to each participant's name, NYC upbringing,
family background, culture or faith, and one value. That round counts toward the configured total,
and challenge behavior is disabled within it. Other sessions begin discussion in round 1.

`lib/orchestrator.ts` has the facilitator open every session by naming and framing that day's
sanitized topic verbatim and restating the agreements. An opening that fails the deterministic
structure/safety gate or receives an evidence-backed semantic retry gets bounded correction
attempts; a fallback must pass the same gates before becoming visible.
Session 1 also introduces the whole project and Sam's profile-supported degree and professional
background before explaining the mandatory introductions, without replacing its configured topic.
Those project-level details are not supplied to later sessions. The
orchestrator then alternates persona turns. Project-assigned challenge voices form a stable candidate
pool; up to two distinct voices, one per community, receive the bounded `escalating` prompt in each
discussion go-round. The selected pair rotates by project session and discussion-round index, distributing the challenge
role instead of making every assigned student adversarial on every turn. A separate semantic-review call using
the same selected run model tags
each accepted response; only an accepted persona response with `needsIntervention=true` is followed—
before the next participant—by a facilitator repair turn. The facilitator closes that repair with a
question for one named attendee. That attendee responds immediately and must close with a statement.
When the attendee also owns the exact next scheduled slot in the same go-round, one integrated
response fulfills both the invitation and that slot; otherwise the invited reply is additional and
the later slot is unchanged.
The merged-slot claim is persisted so pause/resume cannot regenerate it.

Each challenge addresses the freshest eligible ordinary, neutral scheduled discussion contribution
from another student. Invited repair replies are excluded from the target history. The prompt
supplies that complete accepted target plus a short safe anchor and forbids attributing an unstated
claim to a memory-only contribution. The semantic reviewer compares exact central positions and
accepts only a genuine target-supported contradiction, consequential omission, competing priority,
boundary, or materially different weighting. Compatible additions are not manufactured into
disagreement. A retry receives evidence-backed correction guidance; hard-unsafe draft text is never
replayed. A false challenge is rerouted to another defensible target or a constructive contribution.
Transcript records use:

- `conversationTag`: `neutral | escalating | deescalating`;
- `roundKind`: `opening | introduction | discussion | round-transition | intervention | invited-response | closing`;
- `roundNumber`, `controversialSpeaker`, and `tagReasons`; and
- `triggeredByTurnId`, `interventionReason`, and `invitedSpeakerId` on a facilitator intervention;
  plus `invitedByTurnId` on its attendee reply and `consumedScheduledSlot` when that reply also
  fulfills the exact next scheduled contribution.

Controlled challenges receive up to five provider drafts before fallback, unless semantic review
determines earlier that no genuine target-supported difference exists and reroutes the slot.
Facilitator interventions contain exactly two spoken sentences and rotate through concise
reflection, precise-difference naming, and direct-response invitation shapes.
One local facilitator `round-transition` turn precedes each go-round after the first and resets the
ordinary continuity anchor so that round's first student responds to the new round rather than
summarizing the prior round's final participant.

Hard-unsafe output never becomes visible. Local fallbacks are subjected to the same deterministic
and semantic gates when the validator is available. The system does not substitute a generic
first-person escalation when a target does not support genuine disagreement, and it suppresses an
intervention/invited-response chain built on an invalid challenge. If the validator remains
unavailable after its structured-output retry, the hard-safe provider draft is preserved with an
`unavailable` audit record instead of being replaced by canned dialogue.

Rejected candidates and failed provider calls from openings, scheduled persona turns, interventions,
invited replies, and closings are not Turn records and do not enter the transcript, judge input, or
metrics. They are linked to the Run in `generation_attempts.json`. Ordinary run detail returns only a
count; opening the audit section lazily fetches paginated summaries with exact prompts and response
text removed, and opening one row fetches its exact run-scoped record. These responses are marked
`no-store`. Logging is prospective: Runs created before this collection was introduced have no
backfilled attempt history, so an empty audit section does not prove that an older Run never
regenerated output.

Every semantic-review call is independently linked to the Run in
`semantic_validation_attempts.json`. Its paginated summary API removes the full system/user prompts,
candidate, and raw response; its exact detail API is run-scoped. Both use private no-store headers.
The parsed decision remains in a summary and can contain short evidence quotes, so the summary is
still restricted audit data. Validator outages are recorded as `unavailable` rather than
mislabeling a provider draft as semantically rejected.

Each turn remains a fresh call through the provider-neutral adapter (`lib/agent.ts`) using Codex by
default or Claude when requested through the API or server-side configuration. An agent receives the
public transcript but never another persona's private system prompt. Turns persist immediately, the
budget is checked when the provider reports USD cost, and the judge and metrics run at the end.
The configured 60-persona-turn cap limits scheduled go-round slots; repair replies are separately
bounded to one per intervention and still count in the transcript, judge, metrics, and run cost.

### Project API and background jobs

The authenticated workflow is `POST /api/projects`, session configuration through
`PATCH /api/projects/[id]/sessions/[sessionId]`, then execution through
`POST /api/projects/[id]/sessions/[sessionId]/run`. Project and session GET routes use the same path
shape; `GET /api/projects` lists all projects. The final POST persists a job, marks the session
`queued`, and returns HTTP 202 without waiting for facilitator/persona/judge calls. The worker later
creates a normal `Run` carrying optional `projectId`, `projectSessionId`,
`projectSessionNumber`, `jobId`, `controversialAgentIds`, and `introductionRound` config fields.
Existing one-off runs omit these fields and remain valid.

The project workspace also exposes confirmed removal actions. `DELETE /api/projects/[id]` removes
the project planning aggregate, and `DELETE /api/projects/[id]/sessions/[sessionId]` removes one
session shell without renumbering the survivors. Both are non-cascading: historical Jobs, Runs,
transcripts, rejected-generation evidence, validator evidence, and content records remain available.
Deletion is rejected while linked work is queued, running, pause-requested, paused, or
cancel-requested; the final session must be removed by deleting the project itself.

Jobs persist in `jobs.json` with
`queued | running | pause-requested | paused | cancel-requested | cancelled | completed | failed`
status. One worker in the Next.js Node process enforces concurrency 1. `GET /api/jobs` returns all
records, and `PATCH /api/jobs/[id]` accepts `pause | continue | kill` and returns the updated Job and
Project. `/jobs` shows status counts, cumulative active time, control actions, and active/history
groups; the project page polls and locks every active control state.

Queued Pause is immediate. Queued Continue gives that job priority over ordinary FIFO work without
preempting the current worker, and queued/paused Kill is immediate. Running Pause or Kill first records
`pause-requested` or `cancel-requested`; the orchestrator honors it after the current complete opening,
participant/repair bundle, closing, or judge step. Continue can withdraw a pending pause. Once paused,
Continue requeues the same Job and resumes its existing `suspended` Run from validated persisted turns;
queued/paused time is excluded from cumulative `durationMs`. `cancelled` is terminal.

Do not conflate an automatic Run `paused` by budget/safety limits with this user control. Automatic
`paused` completes its Job and a later launch creates a new Run. A user pause produces Run
`suspended` + Job `paused`, retains the same IDs, and remains locked/resumable through Continue.
Startup reconciliation preserves queued and explicitly paused jobs. A restart during active provider
work still fails running or not-yet-acknowledged pause work rather than replaying a possibly billed
call; pending cancellation is completed during recovery.

Runtime state is stored in eight JSON arrays: `projects.json`, `jobs.json`, `runs.json`, `turns.json`,
`generation_attempts.json`, `semantic_validation_attempts.json`, `assets.json`, and
`publish_logs.json`. A project embeds its session
shells so creation is one atomic project-file replacement; queuing and execution cross the job,
project, run, turn, and attempt collections and are not a cross-file transaction. The JSON-file
mutexes and worker coordination are process-local: run only one application process against a store.
This single-node JSON-store limitation requires a transactional queue/database before scaling to
multiple processes or hosts. The application enforces mode `0700` on the runtime-store directory and
`0600` on every collection and atomic temp file; backups still require equivalent protection and an
explicit retention/deletion policy.

## 5. Evaluation ("the matrices")

`lib/evaluation.ts` recomputes quality signals from the accepted visible text, retains legacy
persona-only `turnCount`, and adds explicit counts for all visible turns, all persona responses, and
the turns eligible for a curiosity question. It reports methodology adherence, guardrail-trigger
rate, I-statement / personal-history / curiosity ratios, non-introduction persona topic relevance,
sentiment trajectory,
`repetitionRiskRate`, and `challengeFidelityRiskRate`, plus a judge-scored "synthetic empathy"
value. The risk metrics look for repeated same-speaker/challenge language and unsupported
strengthening in challenges linked to their targets.

`runJudge()` receives the complete visible transcript—not only persona discussion turns—including
the opening, facilitator interventions, invited replies, and closing. It also receives
`respondsTo`, `triggeredBy`, `invitedBy`, and invitation metadata so it can judge whether each
challenge was faithful, each repair reply answered the actual invitation, and the closing preserved
current differences while grounding its conditional peacebuilding implication in the discussion.
Final adherence is the lower of the deterministic floor (including
noncompliance, repetition, and challenge-fidelity risks) and the judge's adherence score.
`computeMetrics()` remains pure. **Calibrate the judge against human ratings before trusting it, and
never overclaim.**

## 6. Content generation & publishing

`lib/content.ts` forms a creative team from run attendees and generates social scripts, a campaign
blueprint, and testimonial texts **from the actual transcript**. Each asset gets provenance + the
mandatory disclosure and enters as a `draft`. Project sessions still create ordinary runs, so the
existing run-to-asset-to-publish-log provenance chain is unchanged. Controlled-escalation turns are
not campaign source material when at least one constructive/introductory persona turn exists; the
generator takes up to six non-escalating turns and falls back to all persona turns only if it would
otherwise have no source. New asset provenance copies optional `projectId`, `projectSessionId`, and
`projectSessionNumber`; legacy provenance can omit them.

`lib/publishing.ts` is the gate: `draft → approved → published`, with reject (reason required), edit
(returns to draft), per-partner publish (disclosure prepended, logged), and takedown.

## 7. Model alignment & cost

- The browser dashboard is Codex-only and has no provider selector. Its GPT model dropdown offers
  GPT-5.6 Sol (`gpt-5.6-sol`), GPT-5.6 Terra (`gpt-5.6-terra`), GPT-5.6 Luna
  (`gpt-5.6-luna`), GPT-5.5 (`gpt-5.5`, the default), and GPT-5.3 Codex Spark
  (`gpt-5.3-codex-spark`).
- The dashboard also exposes Low, Medium (default), High, and Extra high reasoning effort. It sends
  the selected model and effort with `provider: "codex"` for every browser-created run.
- Claude remains an optional provider through authenticated server API calls and server-side
  configuration; it is not selectable in the dashboard. Its CLI reports `total_cost_usd`, so Claude
  runs can enforce `budgetUsd` and checkpoint against actual reported cost.
- Server/API defaults remain configurable with `DBRIDGES_DEFAULT_PROVIDER`,
  `DBRIDGES_CODEX_DEFAULT_MODEL`, `DBRIDGES_CLAUDE_DEFAULT_MODEL`, and
  `DBRIDGES_CODEX_REASONING_EFFORT`. These settings do not add Claude to the browser model dropdown.
- Codex CLI does not report USD cost. Codex runs and assets are marked unpriced, and a USD budget is
  not treated as enforced for those calls. Do not interpret a displayed `$0.00` known cost as proof
  that a Codex run was free.
- Codex runs are ephemeral, read-only, non-interactive, and launched with shell, web, browser,
  computer-use, image-generation, multi-agent, and app tools disabled. Claude persona
  calls retain `--max-turns 1`.

## 8. Adapting for another context

1. Replace `personas/*.json` with your communities' fictional personas (advisor-reviewed). If the
   roster size, community labels, or geography changes, deliberately revise `lib/personaRules.ts`
   and its tests rather than weakening validation.
2. Edit `RSD_RULES` / `methodologyPreamble()` for your dialogue method.
3. Adjust both `validateTurn()` and `classifyConversation()` heuristics to your context's
   sensitivities, and have culturally competent reviewers test challenge and repair examples.
4. Revisit the balanced sampling rule and names such as `controversialAgentIds` before adapting to a
   different community context. Keep the assignment project-scoped and describe it publicly as a
   simulated challenge role, not an identity trait.
5. Keep the ethics requirements in section 1 intact.

## 9. Reproducibility

Projects persist their shared attendee snapshot, exact one-time `controversialAgentIds` assignment,
provider/model settings, and session plans. Runs record their optional project/session linkage,
provider, model, Codex reasoning effort when applicable, cost availability, persona versions,
methodology version, and prompt hashes. Mock dialogue is deterministic once a run ID exists; project
challenge assignment itself uses `Math.random` once and is made reproducible by persisting the chosen
IDs; up to two challenge speakers, one per community, are then selected deterministically
from that persisted pool, project-session number, and discussion-round index. Legacy one-off and
provider-less records omit the new optional fields and are interpreted from
their existing model identifiers, so historical Claude provenance remains accurate. Rejected
generation attempts add exact prompt/response evidence only for new generations after attempt logging
was deployed; they do not reconstruct or alter historical provenance. Semantic validator calls are
also prospective and preserve their guideline version, full evidence packet, exact candidate/raw
response, structured decision, and provider metadata in a separate immutable audit collection.
