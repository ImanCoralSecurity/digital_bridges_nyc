"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, InlineMarkdown, fetchJson, statusKind, usd } from "../ui";
import { PARTNER_ORGS } from "@/lib/types";
import { resolveProvider } from "@/lib/providers";
import type { ContentAsset, PublishLog } from "@/lib/types";

type Asset = ContentAsset & { publishHistory: PublishLog[] };

const TABS = ["all", "draft", "approved", "published", "rejected", "retracted"] as const;

export default function ContentReview() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [error, setError] = useState("");

  async function load() {
    try {
      setAssets(await fetchJson<Asset[]>("/api/content"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = tab === "all" ? assets : assets.filter((a) => a.status === tab);

  return (
    <>
      <h1>Content Review &amp; Ethical Publishing</h1>
      <p className="subtitle">
        Every asset is AI-generated, carries provenance, and requires human sign-off before it can
        be published to a partner channel. Nothing here impersonates a real person.
      </p>
      {error && <div className="banner err">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {t} {t !== "all" ? `(${assets.filter((a) => a.status === t).length})` : `(${assets.length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card"><p className="meta">No content here yet. Generate campaign drafts from a completed run.</p></div>
      ) : (
        filtered.map((a) => <AssetCard key={a.id} asset={a} onChanged={load} />)
      )}
    </>
  );
}

function AssetCard({ asset, onChanged }: { asset: Asset; onChanged: () => void }) {
  const [reviewer, setReviewer] = useState("");
  const [reason, setReason] = useState("");
  const [partner, setPartner] = useState<string>(PARTNER_ORGS[0]);
  const [actor, setActor] = useState("");
  const [tdReason, setTdReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(asset.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(url: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fetchJson(url, { method: "POST", body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const p = asset.provenance;
  const provider = resolveProvider(p.provider, p.model);
  return (
    <div className="card">
      <div className="disclosure">{asset.disclosure}</div>
      <div className="inline">
        <h3 style={{ margin: 0 }}><InlineMarkdown text={asset.title} /></h3>
        <Badge kind="gray">{asset.type}</Badge>
        {asset.platform && <Badge kind="gray">{asset.platform}</Badge>}
        <Badge kind={statusKind(asset.status)}>{asset.status}</Badge>
        <span className="right meta">
          {p.mock ? "mock" : asset.costAvailable === false ? "cost not reported" : usd(asset.costUsd)}
        </span>
      </div>

      {editing ? (
        <>
          <label>Edit body (returns to draft for re-review)</label>
          <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} />
        </>
      ) : (
        <pre className="body"><InlineMarkdown text={asset.body} /></pre>
      )}

      <details>
        <summary className="meta">Provenance</summary>
        <div className="meta" style={{ marginTop: 6 }}>
          <div>
            AI-generated: yes · provider <span className="mono">{provider}</span> · model{" "}
            <span className="mono">{p.model}</span>{" "}
            {p.reasoningEffort ? `· reasoning ${p.reasoningEffort} ` : ""}
            {p.mock ? "· mock" : ""}
          </div>
          <div>from run <Link href={`/runs/${p.runId}`} className="mono">{p.runId}</Link></div>
          <div>personas: {p.personaIds.join(", ")}</div>
          <div>prompt hash <span className="mono">{p.promptHash}</span> · methodology v{p.methodologyVersion}</div>
          <div>generated {new Date(p.generatedAt).toLocaleString()}</div>
        </div>
      </details>

      {asset.reviews.length > 0 && (
        <div className="meta" style={{ marginTop: 8 }}>
          <b>Review history:</b>
          {asset.reviews.map((r, i) => (
            <div key={i}>· {r.action} by {r.reviewer} {r.reason ? `— ${r.reason}` : ""} <span className="mono">({new Date(r.at).toLocaleString()})</span></div>
          ))}
        </div>
      )}
      {asset.publishHistory.length > 0 && (
        <div className="meta" style={{ marginTop: 8 }}>
          <b>Publish log:</b>
          {asset.publishHistory.map((l) => (
            <div key={l.id}>· {l.action} {l.partner ? `→ ${l.partner}` : ""} by {l.actor} {l.reason ? `— ${l.reason}` : ""} <span className="mono">({new Date(l.at).toLocaleString()})</span></div>
          ))}
        </div>
      )}

      {err && <div className="banner err" style={{ marginTop: 10 }}>{err}</div>}

      {/* Actions by status */}
      {(asset.status === "draft" || asset.status === "approved") && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="row">
            <div>
              <label>Reviewer</label>
              <input type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="your name" />
            </div>
          </div>
          <div className="inline" style={{ marginTop: 10 }}>
            {editing ? (
              <>
                <button className="small" disabled={busy || !reviewer} onClick={() => act(`/api/content/${asset.id}/review`, { reviewer, action: "edit", body: editBody })}>Save edit</button>
                <button className="small secondary" onClick={() => { setEditing(false); setEditBody(asset.body); }}>Cancel</button>
              </>
            ) : (
              <>
                {asset.status === "draft" && (
                  <button className="small" disabled={busy || !reviewer} onClick={() => act(`/api/content/${asset.id}/review`, { reviewer, action: "approve" })}>Approve</button>
                )}
                <button className="small secondary" onClick={() => setEditing(true)}>Edit</button>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (for reject)" style={{ maxWidth: 220 }} />
                <button className="small danger" disabled={busy || !reviewer || !reason} onClick={() => act(`/api/content/${asset.id}/review`, { reviewer, action: "reject", reason })}>Reject</button>
              </>
            )}
          </div>
        </div>
      )}

      {asset.status === "approved" && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="row">
            <div>
              <label>Publish to partner channel</label>
              <select value={partner} onChange={(e) => setPartner(e.target.value)}>
                {PARTNER_ORGS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label>Publishing actor</label>
              <input type="text" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="who is publishing" />
            </div>
          </div>
          <div className="spacer" />
          <button className="small" disabled={busy || !actor} onClick={() => act(`/api/content/${asset.id}/publish`, { partner, actor })}>Publish (with disclosure)</button>
        </div>
      )}

      {asset.status === "published" && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="inline">
            <input type="text" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="actor" style={{ maxWidth: 160 }} />
            <input type="text" value={tdReason} onChange={(e) => setTdReason(e.target.value)} placeholder="takedown reason" style={{ maxWidth: 220 }} />
            <button className="small danger" disabled={busy || !actor || !tdReason} onClick={() => act(`/api/content/${asset.id}/takedown`, { actor, reason: tdReason })}>Take down</button>
          </div>
        </div>
      )}
    </div>
  );
}
