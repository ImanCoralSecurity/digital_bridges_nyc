// Shared domain types for Digital Bridges NYC.
// Safe to import from client components via `import type` (fully erased at build).

export type PersonaGroup = "muslim" | "jewish" | "facilitator" | "judge";

/** CLI backend used for real (non-mock) agent calls. */
export type AgentProvider = "codex" | "claude";

/** Reasoning levels supported by Codex's GPT-5.5 model. */
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface AdvisorSignoff {
  reviewer: string;
  date: string; // ISO date; empty string means "pending review"
}

/** A synthetic, fictional persona. NEVER a real individual. */
export interface Persona {
  id: string;
  version: string; // semver, e.g. "1.0.0"
  group: PersonaGroup;
  displayName: string; // clearly fictional
  fictional: true;
  /** Required for student personas: NYC neighborhood, borough, and city. */
  raisedIn?: string;
  /** Multi-generational family narrative. */
  background: string;
  /** Regional micro-history the persona carries. */
  regionalHistory: string;
  /** Cultural / religious baseline. */
  culturalBaseline: string;
  values: string[];
  communicationStyle: string;
  /** Facilitator-only academic qualification, spoken only in project session 1. */
  degree?: string;
  /** Facilitator-only professional experience, spoken only in project session 1. */
  professionalBackground?: string;
  sensitivities: string[];
  doNot: string[];
  /** Facilitator/judge-only: extra role instructions or rubric. */
  roleInstructions?: string;
  advisorSignoff: AdvisorSignoff;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
}

/** JSON Schema supplied to a provider for strict structured output. */
export type AgentOutputSchema = Record<string, unknown>;

/** Normalized result of one agent call (real CLI or mock). */
export interface AgentCallResult {
  text: string;
  sessionId: string | null;
  costUsd: number;
  usage: AgentUsage;
  stopReason: string | null;
  isError: boolean;
  durationMs: number;
  provider: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  mock: boolean;
  /** Claude reports USD cost; Codex JSONL currently reports tokens but not USD. */
  costAvailable: boolean;
  /** Detected guardrail trigger (refusal / safety completion). */
  guardrailTrigger: boolean;
}

export interface TurnSignals {
  iStatement: boolean;
  personalHistory: boolean;
  curiosityQuestion: boolean;
}

export interface TurnFlag {
  code: string; // e.g. "collective-blame", "dehumanizing-language"
  reason: string;
}

export type TurnRole = "facilitator" | "persona";

/** Semantic label used to inspect escalation and facilitator repair in a transcript. */
export type ConversationTag = "neutral" | "escalating" | "deescalating";

/** The part of a project session that produced a turn. */
export type RoundKind =
  | "opening"
  | "introduction"
  | "discussion"
  | "round-transition"
  | "intervention"
  | "invited-response"
  | "closing";

/**
 * Durable proof that an immediate invited repair reply also fulfilled the
 * next ordinary discussion slot. The ordinal is zero-based in the run's
 * deterministic schedule and makes pause/resume validation unambiguous.
 */
export interface ConsumedScheduledSlot {
  ordinal: number;
  roundNumber: number;
  roundKind: "discussion";
  speakerId: string;
}

export interface Turn {
  id: string;
  runId: string;
  index: number;
  role: TurnRole;
  speakerId: string; // persona id or "facilitator"
  speakerName: string;
  speakerGroup: PersonaGroup; // muslim | jewish | facilitator | judge — for UI grouping
  text: string;
  compliant: boolean;
  flags: TurnFlag[];
  signals: TurnSignals;
  guardrailTrigger: boolean;
  regenerations: number;
  costUsd: number;
  /** Missing on legacy records; provider is inferred from their model. */
  provider?: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  mock: boolean;
  /** Whether visible text came from the provider, mock generator, or a local safety fallback. */
  generationSource?: "provider" | "mock" | "local" | "local-fallback";
  costAvailable?: boolean;
  promptHash: string;
  /** Added for project sessions; absent on legacy one-off runs. */
  conversationTag?: ConversationTag;
  /** One-based go-round number; openings/closings do not have one. */
  roundNumber?: number;
  roundKind?: RoundKind;
  /** True when this speaker was randomly assigned the project's controlled-escalation role. */
  controversialSpeaker?: boolean;
  /** On a controlled challenge, points to the grounded student turn it addresses. */
  respondsToTurnId?: string;
  /** On an intervention, points to the escalating turn that caused it. */
  triggeredByTurnId?: string;
  /** On an intervention, attendee selected from the facilitator's final named invitation. */
  invitedSpeakerId?: string;
  /** On an extra persona reply, points to the facilitator turn that invited it. */
  invitedByTurnId?: string;
  /** Present when this invited reply also replaces the immediately next scheduled turn. */
  consumedScheduledSlot?: ConsumedScheduledSlot;
  interventionReason?: string;
  tagReasons?: string[];
  /** Authoritative LLM decision for runs using semantic-validator guideline 1.0+. */
  semanticValidation?: SemanticValidationDecision;
  createdAt: string; // ISO
}

/**
 * Immutable audit record for a generated dialogue attempt that was not used as
 * the visible Turn. These records intentionally retain full prompts and model
 * output so validator decisions can be reproduced and debugged.
 */
export interface GenerationAttempt {
  id: string;
  runId: string;
  /** Index the eventual visible Turn occupies (or would have occupied). */
  turnIndex: number;
  role: TurnRole;
  speakerId: string;
  speakerName: string;
  speakerGroup: PersonaGroup;
  roundKind: RoundKind;
  roundNumber?: number;
  /** Zero-based orchestration attempt; adapter-internal transport retries are not expanded. */
  attempt: number;
  outcome: "rejected" | "provider-error";
  systemPrompt: string;
  userPrompt: string;
  promptHash: string;
  responseText: string;
  rejectionReasons: string[];
  classification: {
    tag: ConversationTag;
    reasons: string[];
    hardUnsafe: TurnFlag[];
  } | null;
  validation: {
    compliant: boolean;
    flags: TurnFlag[];
    signals: TurnSignals;
  } | null;
  guardrailTrigger: boolean;
  provider: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  mock: boolean;
  sessionId: string | null;
  usage: AgentUsage;
  stopReason: string | null;
  isError: boolean;
  durationMs: number;
  costUsd: number;
  costAvailable: boolean;
  error?: string;
  createdAt: string;
}

/**
 * Safe list-view representation of a rejected generation attempt. The exact
 * prompts and provider response are only returned by the run-scoped detail
 * endpoint after an operator explicitly expands a record.
 */
export type GenerationAttemptSummary = Omit<
  GenerationAttempt,
  "systemPrompt" | "userPrompt" | "responseText"
>;

/** Action returned by the semantic dialogue validator. */
export type SemanticValidationVerdict = "accept" | "retry" | "reroute";

export type SemanticValidationPhase =
  | "opening"
  | "introduction"
  | "discussion"
  | "controlled-challenge"
  | "round-transition"
  | "intervention"
  | "invited-response"
  | "closing";

export interface SemanticValidationEvidence {
  source:
    | "candidate"
    | "topic"
    | "target"
    | "challenge"
    | "intervention"
    | "history"
    | "persona"
    | "contract";
  sourceId: string | null;
  quote: string;
}

export interface SemanticValidationCheck {
  status: "pass" | "warning" | "fail" | "not-applicable";
  reason: string;
  evidence: SemanticValidationEvidence[];
}

/** One evidence-backed blocking defect or non-blocking warning. */
export interface SemanticValidationIssue {
  code: string;
  dimension:
    | "topic"
    | "context"
    | "meaning"
    | "novelty"
    | "target-fidelity"
    | "speaker-consistency"
    | "persona-fidelity"
    | "naturalness"
    | "phase-contract";
  severity: "blocking" | "warning";
  message: string;
  correction: string;
  evidence: SemanticValidationEvidence[];
}

/** Parsed, structured semantic-validator response used by orchestration. */
export interface SemanticValidationDecision {
  schemaVersion: "1.0";
  guidelineVersion: string;
  phase: SemanticValidationPhase;
  verdict: SemanticValidationVerdict;
  confidence: number;
  qualityScore: number;
  conversationTag: ConversationTag;
  /** Whether this accepted turn warrants an immediate facilitator repair. */
  needsIntervention: boolean;
  candidateCentralPosition: string | null;
  targetCentralPosition: string | null;
  relationToTarget:
    | "not-applicable"
    | "equivalent"
    | "overlapping"
    | "target-entails-candidate"
    | "candidate-entails-target"
    | "materially-distinct-omission"
    | "genuine-tension"
    | "contradiction"
    | "unrelated"
    | "unclear";
  genuineDifference: boolean | null;
  speakerConsistency:
    | "not-applicable"
    | "consistent"
    | "explained-change"
    | "unexplained-change"
    | "unclear";
  checks: {
    topicRelevance: SemanticValidationCheck;
    contextResponsiveness: SemanticValidationCheck;
    subjectMeaning: SemanticValidationCheck;
    novelty: SemanticValidationCheck;
    targetFidelity: SemanticValidationCheck;
    speakerConsistency: SemanticValidationCheck;
    personaFidelity: SemanticValidationCheck;
    naturalness: SemanticValidationCheck;
    phaseContract: SemanticValidationCheck;
  };
  issues: SemanticValidationIssue[];
  route:
    | "none"
    | "choose-different-target"
    | "constructive-instead-of-challenge"
    | "suppress-repair-chain";
  retryGuidance: string | null;
}

/**
 * Immutable audit record for one semantic-validator call.
 *
 * This is deliberately separate from GenerationAttempt: a valid generation can
 * have multiple validator calls, and validator infrastructure failures must not
 * be misreported as defects in the generated dialogue.
 */
export interface SemanticValidationAttempt {
  id: string;
  runId: string;
  /** Index of the visible turn being considered (or its eventual slot). */
  turnIndex: number;
  role: TurnRole;
  speakerId: string;
  speakerName: string;
  speakerGroup: PersonaGroup;
  roundKind: RoundKind;
  roundNumber?: number;
  /** Zero-based generation retry whose candidate is being validated. */
  generationAttempt: number;
  /** Zero-based retry of the validator for that same candidate. */
  validationAttempt: number;
  outcome: "accepted" | "rejected" | "unavailable";
  /** Version of the semantic guideline embedded in the validator prompt. */
  guidelineVersion: string;
  systemPrompt: string;
  userPrompt: string;
  promptHash: string;
  /** Exact generated dialogue submitted to the validator. */
  candidateText: string;
  /** Exact, unparsed validator output, retained for reproducible debugging. */
  rawResponse: string;
  /** Null only when no valid structured decision could be obtained. */
  decision: SemanticValidationDecision | null;
  provider: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  mock: boolean;
  sessionId: string | null;
  usage: AgentUsage;
  stopReason: string | null;
  isError: boolean;
  guardrailTrigger: boolean;
  durationMs: number;
  costUsd: number;
  costAvailable: boolean;
  /** Transport, provider, or structured-output parsing failure details. */
  error?: string;
  createdAt: string;
}

/**
 * Redacted list-view record for the validator audit. Full prompts, the exact
 * candidate, and raw model output are exposed only by the run-scoped detail
 * endpoint because they can contain complete transcript evidence.
 */
export type SemanticValidationAttemptSummary = Omit<
  SemanticValidationAttempt,
  "systemPrompt" | "userPrompt" | "candidateText" | "rawResponse"
>;

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "paused" // hit budget cap or safe-stop
  | "suspended" // explicitly paused by a user; may resume in the same run
  | "cancelled"
  | "failed";

/** How the facilitator picks who speaks next. */
export type SelectionStrategy = "round-robin" | "random";

export interface RunConfig {
  /** Student personas (Muslim/Jewish) attending this group session — 2 or more. */
  attendeeIds: string[];
  scenario: string; // opening topic / prompt (within methodology limits)
  /** Missing on legacy records; their Claude model id is used to infer it. */
  provider?: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  /** Number of go-rounds; each attendee speaks once per round. */
  rounds: number;
  /** Speaker order: "round-robin" alternates communities; "random" shuffles each round. */
  selection: SelectionStrategy;
  budgetUsd: number;
  mock: boolean;
  /** Project metadata is optional so historical one-off runs remain readable. */
  projectId?: string;
  projectSessionId?: string;
  projectSessionNumber?: number;
  /** Session-one-only spoken context, snapshotted for provenance and resume safety. */
  sessionOneOpening?: {
    projectIntroduction: string;
    facilitatorDegree: string;
    facilitatorProfessionalBackground: string;
  };
  /** Persistent background job that owns this run, when queued. */
  jobId?: string;
  controversialAgentIds?: string[];
  /** Session 1 reserves its first go-round for attendee introductions. */
  introductionRound?: boolean;
  /** Immutable provenance for the LLM acceptance gate used by this run. */
  semanticValidator?: {
    enabled: boolean;
    guidelineVersion: string;
    provider: AgentProvider;
    model: string;
    reasoningEffort?: ReasoningEffort;
  };
}

export interface RunMetrics {
  /** Legacy persona-response count retained for existing API/UI consumers. */
  turnCount: number;
  /** All persisted dialogue turns, including facilitator phases. */
  visibleTurnCount?: number;
  /** Explicit alias for the legacy persona-only turn count. */
  personaResponseCount?: number;
  /** Conservative combination of deterministic quality checks and judge adherence. */
  adherenceRate: number;
  guardrailTriggerRate: number;
  iStatementRatio: number;
  personalHistoryRatio: number;
  curiosityRatio: number;
  /** Persona turns for which the methodology permits or requests curiosity. */
  curiosityEligibleTurnCount?: number;
  syntheticEmpathyScore: number; // 0..1, from judge
  /** Added in methodology 1.5.0; absent on historical runs. */
  topicRelevanceRate?: number;
  /** Difficult-public-topic persona turns with a concrete subject-level proposition. */
  subjectLevelEngagementRate?: number;
  /** Persona turns dominated by speaking/knowledge process without a subject position. */
  metaDominanceRiskRate?: number;
  /** Later same-speaker/challenge turns that reuse excessive imagery or phrasing. */
  repetitionRiskRate?: number;
  /** Linked challenges that introduce unsupported sufficiency or universal claims. */
  challengeFidelityRiskRate?: number;
  /** Number of linked challenges for which fidelity could be assessed. */
  challengeFidelityAssessedCount?: number;
  sentimentTrajectory: number[]; // per persona turn, -1..1
  judgeRationale: string;
  computedAt: string;
}

export interface Attendee {
  id: string;
  name: string;
  group: PersonaGroup;
}

export interface Run {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  statusReason: string; // e.g. "budget cap exceeded", "safe-stop: repeated guardrail trips"
  config: RunConfig;
  attendees: Attendee[];
  costUsd: number;
  /** False when the selected CLI does not expose USD cost. */
  costAvailable?: boolean;
  metrics: RunMetrics | null;
  methodologyVersion: string;
  /** Persona id -> version used, for provenance. */
  personaVersions: Record<string, string>;
}

export type ProjectStatus = "planned" | "active" | "completed";

export type ProjectSessionStatus =
  | "unconfigured"
  | "ready"
  | "queued"
  | "running"
  | "pause-requested"
  | "completed"
  | "paused"
  | "cancel-requested"
  | "cancelled"
  | "failed";

export interface ProjectSession {
  id: string;
  projectId: string;
  /** One-based position within the project. */
  number: number;
  topic: string;
  /** Total go-rounds, including the mandatory introduction round in session 1. */
  rounds: number | null;
  mandatoryIntroductionRound: boolean;
  status: ProjectSessionStatus;
  statusReason: string;
  /** Latest queue job submitted for this session. */
  jobId?: string;
  /** Read-model decoration distinguishing a user-paused job from a terminal run pause. */
  jobStatus?: JobStatus;
  runId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A persistent series of facilitated sessions sharing one student roster. */
export interface Project {
  id: string;
  name: string;
  /** User-authored overview spoken by Sam only in project session 1. */
  projectIntroduction?: string;
  /** Explicit operator-controlled visibility on the read-only public site. */
  published?: boolean;
  /** Most recent time this project was made public. */
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  sessionCount: number;
  attendeeIds: string[];
  attendees: Attendee[];
  /** Requested number from each community. */
  controversialPerCommunity: number;
  /** Random assignment made once at creation and reused in every session. */
  controversialAgentIds: string[];
  provider: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  selection: SelectionStrategy;
  budgetUsd: number;
  mock: boolean;
  sessions: ProjectSession[];
}

/** Safe fictional-persona fields captured for one explicit public release. */
export interface PublicPersonaSnapshot {
  id: string;
  displayName: string;
  group: "muslim" | "jewish";
  fictional: true;
  raisedIn: string;
  background: string;
  regionalHistory: string;
  culturalBaseline: string;
  values: string[];
  communicationStyle: string;
}

/** Safe accepted-turn fields captured for one explicit public release. */
export interface PublicTurnSnapshot {
  /** Added in public snapshot schema 2; schema 1 records fall back to index anchors. */
  id?: string;
  index: number;
  role: TurnRole;
  speakerName: string;
  speakerGroup: PersonaGroup;
  text: string;
  roundNumber?: number;
  roundKind?: RoundKind;
  conversationTag?: ConversationTag;
  controversialSpeaker?: boolean;
  compliant?: boolean;
  guardrailTrigger?: boolean;
  regenerations?: number;
  generationSource?: "provider" | "mock" | "local" | "local-fallback";
  flags?: string[];
  signals?: TurnSignals;
  respondsToTurnId?: string;
  triggeredByTurnId?: string;
  invitedSpeakerId?: string;
  invitedByTurnId?: string;
  consumedScheduledRoundNumber?: number;
}

export interface PublicSessionSnapshot {
  id: string;
  number: number;
  topic: string;
  rounds: number;
  turns: PublicTurnSnapshot[];
}

/** Frozen allowlisted release; operator records remain in their private stores. */
export interface ProjectPublicationSnapshot {
  schemaVersion: 1 | 2;
  projectId: string;
  name: string;
  introduction: string;
  publishedAt: string;
  updatedAt: string;
  sourceProjectUpdatedAt: string;
  sourceSessionCount: number;
  personas: PublicPersonaSnapshot[];
  sessions: PublicSessionSnapshot[];
}

export type JobStatus =
  | "queued"
  | "running"
  | "pause-requested"
  | "paused"
  | "cancel-requested"
  | "cancelled"
  | "completed"
  | "failed";

/** Persistent background work record for one project-session execution. */
export interface Job {
  id: string;
  type: "project-session-run";
  status: JobStatus;
  projectId: string;
  /** Snapshot retained even if the project is later unavailable. */
  projectName: string;
  sessionId: string;
  sessionNumber: number;
  /** Model selection snapshotted when this session run was submitted. */
  model?: string;
  reasoningEffort?: ReasoningEffort;
  runId?: string;
  runStatus?: RunStatus;
  createdAt: string;
  updatedAt: string;
  /** Most recent time this job entered the queue (initial submission or resume). */
  queuedAt?: string;
  /** First time any worker started this job. */
  startedAt?: string;
  /** Start of the current/most recent running segment. */
  currentStartedAt?: string;
  completedAt?: string;
  /** Cumulative active worker time, excluding time spent paused or queued. */
  durationMs?: number;
  /** A queued Continue action promotes this job ahead of ordinary FIFO work. */
  priorityRequestedAt?: string;
  pauseRequestedAt?: string;
  pausedAt?: string;
  cancelRequestedAt?: string;
  cancelledAt?: string;
  /** Number of explicit paused -> queued resumptions. */
  resumeCount?: number;
  statusReason?: string;
  error?: string;
  /** Number of times a worker claimed this job. */
  attempts: number;
}

export type AssetType =
  | "social-script"
  | "campaign-blueprint"
  | "testimonial";

export type AssetStatus =
  | "draft" // awaiting review
  | "approved"
  | "rejected"
  | "published"
  | "retracted";

/** Proof of how an asset was produced. Travels with every export. */
export interface Provenance {
  aiGenerated: true;
  /** Missing on legacy assets; inferred from model when displayed/used. */
  provider?: AgentProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  runId: string;
  projectId?: string;
  projectSessionId?: string;
  projectSessionNumber?: number;
  personaIds: string[];
  personaVersions: Record<string, string>;
  promptHash: string;
  methodologyVersion: string;
  generatedAt: string;
  mock: boolean;
}

export interface ReviewRecord {
  reviewer: string;
  action: "approve" | "reject" | "edit";
  reason: string;
  at: string;
}

export interface ContentAsset {
  id: string;
  runId: string;
  type: AssetType;
  platform: string | null; // for social scripts
  title: string;
  body: string;
  /** Mandatory, always-visible AI-generated disclosure text. */
  disclosure: string;
  status: AssetStatus;
  provenance: Provenance;
  reviews: ReviewRecord[];
  costUsd: number;
  costAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublishLog {
  id: string;
  assetId: string;
  partner: string;
  action: "publish" | "takedown";
  actor: string;
  reason: string;
  at: string;
}

export const PARTNER_ORGS = [
  "Columbia Hillel",
  "Muslim Students Association",
  "Jewish Theological Seminary",
  "Morningside Heights Islamic Center",
  "International House",
] as const;
