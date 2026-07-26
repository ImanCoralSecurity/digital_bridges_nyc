"use client";

import { useEffect, useState } from "react";
import { Badge, InlineMarkdown, Tile, fetchJson, pct } from "../ui";
import type { ContentAsset, Run, Turn } from "@/lib/types";

export default function Showcase() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ run: Run; turns: Turn[] } | null>(null);
  const [published, setPublished] = useState<ContentAsset[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [r, pub] = await Promise.all([
          fetchJson<Run[]>("/api/runs"),
          fetchJson<ContentAsset[]>("/api/content?status=published"),
        ]);
        const withMetrics = r.filter((x) => x.metrics);
        setRuns(withMetrics);
        setPublished(pub);
        if (withMetrics[0]) setSelectedId(withMetrics[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    fetchJson<{ run: Run; turns: Turn[] }>(`/api/runs/${selectedId}`).then(setDetail).catch(() => {});
  }, [selectedId]);

  const highlights = detail?.turns.filter((t) => t.role === "persona").slice(0, 4) ?? [];
  const m = detail?.run.metrics;

  return (
    <>
      <h1 style={{ fontSize: 34 }}>Digital Bridges NYC — Showcase</h1>
      <p className="subtitle" style={{ fontSize: 17 }}>
        A demonstration of how automated, conflict-sensitive dialogue can be engineered — and
        rigorously labeled — to model understanding across communities.
      </p>
      {error && <div className="banner err">{error}</div>}

      {runs.length === 0 ? (
        <div className="card"><p className="meta">No completed runs to show yet.</p></div>
      ) : (
        <>
          <div className="card">
            <label>Featured dialogue</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ maxWidth: 480 }}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.attendees.map((a) => a.name.split(" ")[0]).slice(0, 4).join(", ")}
                  {r.attendees.length > 4 ? ` +${r.attendees.length - 4}` : ""} — {r.id}
                </option>
              ))}
            </select>
          </div>

          {m && (
            <div className="grid grid-3">
              <Tile label="Methodology adherence" value={pct(m.adherenceRate)} />
              <Tile label="Synthetic empathy" value={pct(m.syntheticEmpathyScore)} />
              <Tile label="Personal-history focus" value={pct(m.personalHistoryRatio)} />
              {m.topicRelevanceRate !== undefined && (
                <Tile label="Topic relevance" value={pct(m.topicRelevanceRate)} />
              )}
              {m.subjectLevelEngagementRate !== undefined && (
                <Tile label="Subject-level engagement" value={pct(m.subjectLevelEngagementRate)} />
              )}
              {m.metaDominanceRiskRate !== undefined && (
                <Tile label="Meta-dialogue risk" value={pct(m.metaDominanceRiskRate)} />
              )}
            </div>
          )}

          {highlights.length > 0 && (
            <>
              <h2>Dialogue highlights</h2>
              <div className="card">
                {highlights.map((t) => (
                  <div key={t.id} className={`turn ${t.speakerGroup === "muslim" ? "persona-a" : "persona-b"}`}>
                    <div className="turn-speaker">{t.speakerName}</div>
                    <div className="turn-text"><InlineMarkdown text={t.text} /></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2>Published campaign pieces</h2>
      {published.length === 0 ? (
        <div className="card"><p className="meta">No published pieces yet. Approve and publish content in Content Review.</p></div>
      ) : (
        <div className="grid grid-2">
          {published.map((a) => (
            <div key={a.id} className="card" style={{ margin: 0 }}>
              <div className="disclosure">{a.disclosure}</div>
              <div className="inline">
                <h3 style={{ margin: 0 }}><InlineMarkdown text={a.title} /></h3>
                <Badge kind="gray">{a.type}</Badge>
                {a.platform && <Badge kind="gray">{a.platform}</Badge>}
              </div>
              <pre className="body"><InlineMarkdown text={a.body} /></pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
