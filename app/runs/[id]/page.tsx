"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Bar, InlineMarkdown, Tile, fetchJson, pct, statusKind, usd } from "../../ui";
import { resolveProvider } from "@/lib/providers";
import type {
  GenerationAttempt,
  GenerationAttemptSummary,
  Run,
  Turn,
} from "@/lib/types";

export default function RunDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<Run | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [rejectedAttemptCount, setRejectedAttemptCount] = useState(0);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genNotice, setGenNotice] = useState("");

  async function load() {
    try {
      const data = await fetchJson<{
        run: Run;
        turns: Turn[];
        rejectedAttemptCount?: number;
      }>(`/api/runs/${id}`);
      setRun(data.run);
      setTurns(data.turns);
      setRejectedAttemptCount(data.rejectedAttemptCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function generate() {
    setGenerating(true);
    setGenNotice("");
    setError("");
    try {
      const res = await fetchJson<{ assets: unknown[] }>(`/api/runs/${id}/generate`, { method: "POST" });
      setGenNotice(`Generated ${res.assets.length} draft assets — review them in Content Review.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (error && !run) return <div className="banner err">{error}</div>;
  if (!run) return <p className="meta">Loading…</p>;

  const m = run.metrics;
  const provider = resolveProvider(run.config.provider, run.config.model);
  const attendeeNameById = new Map(run.attendees.map((attendee) => [attendee.id, attendee.name]));
  const invitedResponseByInterventionId = new Map(
    turns
      .filter((turn) => turn.invitedByTurnId)
      .map((turn) => [turn.invitedByTurnId as string, turn]),
  );
  function turnClass(t: Turn): string {
    if (t.role === "facilitator") return "turn facilitator";
    return t.speakerGroup === "muslim" ? "turn persona-a" : "turn persona-b";
  }

  return (
    <>
      <p className="meta">
        {run.config.projectId ? (
          <Link href={`/projects/${run.config.projectId}`}>← Project</Link>
        ) : (
          <Link href="/">← Projects</Link>
        )}
      </p>
      <h1>Dialogue <span className="mono" style={{ fontSize: 18 }}>{run.id}</span></h1>
      <div className="inline" style={{ marginBottom: 8 }}>
        <Badge kind={statusKind(run.status)}>{run.status}</Badge>
        {run.config.projectSessionNumber && (
          <Badge kind="gray">session {run.config.projectSessionNumber}</Badge>
        )}
        {run.attendees.map((at) => (
          <Badge key={at.id} kind={at.group === "muslim" ? "muslim" : "jewish"}>{at.name}</Badge>
        ))}
        {run.config.mock && <Badge kind="gray">mock</Badge>}
        <span className="meta">provider {provider}</span>
        <span className="meta">model {run.config.model}</span>
        {provider === "codex" && (
          <span className="meta">reasoning {run.config.reasoningEffort ?? "medium"}</span>
        )}
        <span className="meta">order {run.config.selection ?? "round-robin"}</span>
      </div>
      {run.statusReason && <div className="banner warn">{run.statusReason}</div>}
      {error && <div className="banner err">{error}</div>}
      {genNotice && <div className="banner info">{genNotice} <Link href="/content">Go to Content Review →</Link></div>}

      <p className="meta">Topic: “{run.config.scenario}”</p>
      {run.config.introductionRound && (
        <div className="banner info">
          Round 1 is the mandatory introduction go-round. Discussion begins in the next round.
        </div>
      )}

      {m && (
        <>
          <h2>Evaluation matrices</h2>
          <div className="grid grid-3">
            <Tile label="Methodology adherence" value={pct(m.adherenceRate)} sub="quality checks + judge" />
            <Tile label="Synthetic empathy" value={pct(m.syntheticEmpathyScore)} sub="judge score (simulation only)" />
            <Tile label="Guardrail triggers" value={pct(m.guardrailTriggerRate)} />
            <Tile label="“I” statements" value={pct(m.iStatementRatio)} />
            <Tile label="Personal history" value={pct(m.personalHistoryRatio)} />
            <Tile
              label="Curiosity"
              value={pct(m.curiosityRatio)}
              sub={m.curiosityEligibleTurnCount !== undefined
                ? `${m.curiosityEligibleTurnCount} eligible responses`
                : undefined}
            />
            {m.topicRelevanceRate !== undefined && (
              <Tile label="Topic relevance" value={pct(m.topicRelevanceRate)} />
            )}
            {m.subjectLevelEngagementRate !== undefined && (
              <Tile label="Subject-level engagement" value={pct(m.subjectLevelEngagementRate)} />
            )}
            {m.metaDominanceRiskRate !== undefined && (
              <Tile label="Meta-dialogue risk" value={pct(m.metaDominanceRiskRate)} sub="lower is better" />
            )}
            {m.repetitionRiskRate !== undefined && (
              <Tile label="Repetition risk" value={pct(m.repetitionRiskRate)} sub="lower is better" />
            )}
            {m.challengeFidelityRiskRate !== undefined && (
              <Tile
                label="Challenge fidelity risk"
                value={pct(m.challengeFidelityRiskRate)}
                sub={`${m.challengeFidelityAssessedCount ?? 0} linked challenges assessed`}
              />
            )}
            <Tile
              label="Run cost"
              value={run.costAvailable === false ? "not reported" : usd(run.costUsd)}
              sub={`${m.visibleTurnCount ?? turns.length} visible turns · ${m.personaResponseCount ?? m.turnCount} student responses`}
            />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Judge rationale</h3>
            <p className="meta"><InlineMarkdown text={m.judgeRationale} /></p>
            {m.sentimentTrajectory.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Sentiment trajectory</h3>
                <div className="inline">
                  {m.sentimentTrajectory.map((s, i) => (
                    <div key={i} style={{ width: 26 }} title={`turn ${i + 1}: ${s}`}>
                      <Bar value={(s + 1) / 2} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      <h2>Transcript</h2>
      <div className="card">
        {turns.length === 0 && <p className="meta">No turns recorded.</p>}
        {turns.map((t) => (
          <div key={t.id} id={t.id} className={turnClass(t)}>
            <div className="turn-head">
              <span className="turn-speaker">{t.speakerName}</span>
              {t.role === "facilitator" && <Badge kind="gray">facilitator</Badge>}
              {t.roundNumber !== undefined && <Badge kind="gray">round {t.roundNumber}</Badge>}
              {t.roundKind && <Badge kind="gray">{t.roundKind}</Badge>}
              {t.controversialSpeaker && <Badge kind="amber">challenge voice</Badge>}
              {t.conversationTag === "escalating" && <Badge kind="red">escalating</Badge>}
              {t.conversationTag === "deescalating" && <Badge kind="green">de-escalating</Badge>}
              {!t.compliant && <Badge kind="red">flagged</Badge>}
              {t.guardrailTrigger && <Badge kind="amber">guardrail</Badge>}
              {t.regenerations > 0 && <Badge kind="gray">regenerated ×{t.regenerations}</Badge>}
              {t.generationSource === "local-fallback" && <Badge kind="amber">local fallback</Badge>}
              {t.generationSource === "local" && <Badge kind="gray">local transition</Badge>}
            </div>
            <div className="turn-text"><InlineMarkdown text={t.text} /></div>
            {t.respondsToTurnId && (
              <div className="meta" style={{ marginTop: 8 }}>
                Challenge grounded in <a href={`#${t.respondsToTurnId}`}>this earlier student turn</a>.
              </div>
            )}
            {t.triggeredByTurnId && (
              <div className="meta" style={{ marginTop: 8 }}>
                Intervention for <a href={`#${t.triggeredByTurnId}`}>the preceding escalating turn</a>.
                {t.interventionReason ? ` Focus: ${t.interventionReason}` : ""}
              </div>
            )}
            {t.invitedSpeakerId && (
              <div className="meta" style={{ marginTop: 8 }}>
                Invited {invitedResponseByInterventionId.get(t.id) ? (
                  <a href={`#${invitedResponseByInterventionId.get(t.id)?.id}`}>
                    {attendeeNameById.get(t.invitedSpeakerId) ?? t.invitedSpeakerId}
                  </a>
                ) : (
                  attendeeNameById.get(t.invitedSpeakerId) ?? t.invitedSpeakerId
                )} to answer immediately before the schedule continues.
              </div>
            )}
            {t.invitedByTurnId && (
              <div className="meta" style={{ marginTop: 8 }}>
                Response invited by <a href={`#${t.invitedByTurnId}`}>this facilitator intervention</a>;
                {t.consumedScheduledSlot
                  ? ` it also fulfilled the student’s scheduled contribution in go-round ${t.consumedScheduledSlot.roundNumber}.`
                  : " the student’s scheduled go-round turn is unchanged."}
              </div>
            )}
            <div className="chips">
              {t.flags.map((f, i) => <Badge key={i} kind="red">{f.code}</Badge>)}
              {t.signals.iStatement && <Badge kind="green">I-statement</Badge>}
              {t.signals.personalHistory && <Badge kind="green">personal history</Badge>}
              {t.signals.curiosityQuestion && <Badge kind="green">curiosity</Badge>}
            </div>
            {t.tagReasons && t.tagReasons.length > 0 && (
              <p className="meta" style={{ marginBottom: 0 }}>
                Tag evidence: {t.tagReasons.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <RejectedAttempts
        key={id}
        runId={id}
        initialCount={rejectedAttemptCount}
      />

      <h2>Collaborative Digital Peace Campaign</h2>
      <div className="card">
        <p className="meta">
          Group these personas into a creative team and auto-generate campaign drafts from this
          transcript. All output is labeled AI-generated and enters human review before publishing.
        </p>
        <button onClick={generate} disabled={generating || !m || m.turnCount === 0}>
          {generating ? "Generating…" : "Generate peace-campaign content"}
        </button>
      </div>
    </>
  );
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "not reported";
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function formatUsage(attempt: GenerationAttempt): string {
  const parts = [
    `${attempt.usage.inputTokens.toLocaleString()} input`,
    `${attempt.usage.outputTokens.toLocaleString()} output`,
  ];
  if (attempt.usage.cachedInputTokens) {
    parts.push(`${attempt.usage.cachedInputTokens.toLocaleString()} cached`);
  }
  if (attempt.usage.reasoningOutputTokens) {
    parts.push(`${attempt.usage.reasoningOutputTokens.toLocaleString()} reasoning`);
  }
  return parts.join(" · ");
}

function classificationKind(tag: string): string {
  if (tag === "escalating") return "red";
  if (tag === "deescalating") return "green";
  return "gray";
}

interface GenerationAttemptPageResponse {
  attempts: GenerationAttemptSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function RejectedAttempts({
  runId,
  initialCount,
}: {
  runId: string;
  initialCount: number;
}) {
  const [attempts, setAttempts] = useState<GenerationAttemptSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(initialCount);
  const [totalPages, setTotalPages] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadPage(requestedPage: number) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<GenerationAttemptPageResponse>(
        `/api/runs/${encodeURIComponent(runId)}/attempts?page=${requestedPage}&pageSize=${pageSize}`,
        { cache: "no-store" },
      );
      setAttempts(data.attempts);
      setPage(data.page);
      setPageSize(data.pageSize);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function openAudit(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && !loaded && !loading) {
      void loadPage(1);
    }
  }

  return (
    <details className="card rejected-attempts" onToggle={openAudit}>
      <summary className="rejected-attempts-summary">
        <span>Rejected attempts</span>
        <Badge kind={total ? "red" : "gray"}>{total}</Badge>
        <span className="meta">Debug output excluded from the visible transcript</span>
      </summary>

      <p className="meta rejected-attempts-intro">
        Read-only records of provider output that failed validation or provider calls that failed.
        Expand an attempt to inspect its rejection evidence; prompts are hidden separately because
        they can be long.
      </p>

      {loading && !loaded ? <p className="meta">Loading rejected-attempt summaries…</p> : null}
      {error ? (
        <div className="banner err rejected-attempt-error">
          {error}{" "}
          <button type="button" onClick={() => void loadPage(page)} disabled={loading}>
            Retry
          </button>
        </div>
      ) : null}

      {loaded && attempts.length === 0 ? (
        <p className="meta">No rejected attempts were recorded for this run.</p>
      ) : null}
      {attempts.length > 0 ? (
        <div className="rejected-attempt-list">
          {attempts.map((attempt) => (
            <RejectedAttempt key={attempt.id} runId={runId} summary={attempt} />
          ))}
        </div>
      ) : null}

      {loaded && totalPages > 1 ? (
        <div className="rejected-attempt-pagination">
          <button
            type="button"
            onClick={() => void loadPage(page - 1)}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          <span className="meta">
            Page {page} of {totalPages} · {total} records
          </span>
          <button
            type="button"
            onClick={() => void loadPage(page + 1)}
            disabled={loading || page >= totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </details>
  );
}

function RejectedAttempt({
  runId,
  summary,
}: {
  runId: string;
  summary: GenerationAttemptSummary;
}) {
  const [attempt, setAttempt] = useState<GenerationAttempt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadDetail() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ attempt: GenerationAttempt }>(
        `/api/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(summary.id)}`,
        { cache: "no-store" },
      );
      setAttempt(data.attempt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  function openAttempt(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && !attempt && !loading && !error) {
      void loadDetail();
    }
  }

  return (
    <details className="rejected-attempt" onToggle={openAttempt}>
      <summary className="rejected-attempt-summary">
        <span className="turn-speaker">{summary.speakerName}</span>
        <Badge kind="red">{summary.outcome}</Badge>
        <Badge kind="gray">{summary.roundKind}</Badge>
        <span className="meta">
          turn index {summary.turnIndex} · try {summary.attempt + 1}
          {summary.roundNumber !== undefined ? ` · round ${summary.roundNumber}` : ""}
        </span>
      </summary>

      {loading ? <p className="meta rejected-attempt-load">Loading exact audit record…</p> : null}
      {error ? (
        <div className="banner err rejected-attempt-error">
          {error}{" "}
          <button type="button" onClick={() => void loadDetail()} disabled={loading}>
            Retry
          </button>
        </div>
      ) : null}
      {attempt ? <RejectedAttemptBody attempt={attempt} /> : null}
    </details>
  );
}

function RejectedAttemptBody({ attempt }: { attempt: GenerationAttempt }) {
  const classification = attempt.classification;
  const validation = attempt.validation;
  return (
    <div className="rejected-attempt-body">
        <div className="inline rejected-attempt-badges">
          <Badge kind="gray">{attempt.role}</Badge>
          {classification && (
            <Badge kind={classificationKind(classification.tag)}>{classification.tag}</Badge>
          )}
          {validation && (
            <Badge kind={validation.compliant ? "green" : "red"}>
              {validation.compliant ? "methodology compliant" : "methodology flagged"}
            </Badge>
          )}
          {validation?.signals.iStatement && <Badge kind="green">I-statement</Badge>}
          {validation?.signals.personalHistory && <Badge kind="green">personal history</Badge>}
          {validation?.signals.curiosityQuestion && <Badge kind="green">curiosity</Badge>}
          {attempt.guardrailTrigger && <Badge kind="amber">guardrail</Badge>}
          {attempt.mock && <Badge kind="gray">mock</Badge>}
        </div>

        <div className="banner err rejected-reasons">
          <b>Why it was rejected</b>
          {attempt.rejectionReasons.length ? (
            <ul>
              {attempt.rejectionReasons.map((reason, index) => (
                <li key={`${attempt.id}-reason-${index}`}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p>No structured rejection reason was recorded.</p>
          )}
          {attempt.error && <p className="mono">{attempt.error}</p>}
        </div>

        <h3>Rejected response</h3>
        <pre className="body rejected-response">
          {attempt.responseText || "(No response text was returned.)"}
        </pre>

        {(classification?.reasons.length ||
          classification?.hardUnsafe.length ||
          validation?.flags.length) ? (
          <div className="rejected-evidence meta">
            {classification?.reasons.length ? (
              <div><b>Classification:</b> {classification.reasons.join(" · ")}</div>
            ) : null}
            {classification?.hardUnsafe.length ? (
              <div>
                <b>Hard-unsafe:</b>{" "}
                {classification.hardUnsafe.map((flag) => flag.reason).join(" · ")}
              </div>
            ) : null}
            {validation?.flags.length ? (
              <div><b>Validation:</b> {validation.flags.map((flag) => flag.reason).join(" · ")}</div>
            ) : null}
          </div>
        ) : null}

        <dl className="rejected-attempt-meta">
          <div><dt>Provider</dt><dd>{attempt.provider} · {attempt.model}</dd></div>
          <div><dt>Reasoning</dt><dd>{attempt.reasoningEffort ?? "not applicable"}</dd></div>
          <div><dt>Duration</dt><dd>{formatDuration(attempt.durationMs)}</dd></div>
          <div>
            <dt>Cost</dt>
            <dd>{attempt.costAvailable ? usd(attempt.costUsd) : "not reported"}</dd>
          </div>
          <div><dt>Usage</dt><dd>{formatUsage(attempt)}</dd></div>
          <div><dt>Stop reason</dt><dd>{attempt.stopReason ?? "not reported"}</dd></div>
          <div><dt>Provider error</dt><dd>{attempt.isError ? "yes" : "no"}</dd></div>
          <div><dt>Provider session</dt><dd className="mono">{attempt.sessionId ?? "none"}</dd></div>
          <div><dt>Speaker ID</dt><dd className="mono">{attempt.speakerId}</dd></div>
          <div><dt>Speaker group</dt><dd>{attempt.speakerGroup}</dd></div>
          <div><dt>Prompt hash</dt><dd className="mono">{attempt.promptHash}</dd></div>
          <div><dt>Recorded</dt><dd>{new Date(attempt.createdAt).toLocaleString()}</dd></div>
          <div><dt>Attempt ID</dt><dd className="mono">{attempt.id}</dd></div>
          <div><dt>Run ID</dt><dd className="mono">{attempt.runId}</dd></div>
        </dl>

        <details className="rejected-prompts">
          <summary>Prompts sent to the provider</summary>
          <h3>System prompt</h3>
          <pre className="body rejected-prompt">{attempt.systemPrompt}</pre>
          <h3>User prompt</h3>
          <pre className="body rejected-prompt">{attempt.userPrompt}</pre>
        </details>

    </div>
  );
}
