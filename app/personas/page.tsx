"use client";

import { useEffect, useState } from "react";
import { Badge, fetchJson } from "../ui";
import type { Persona } from "@/lib/types";

const GROUP_LABELS: Record<string, string> = {
  muslim: "Muslim personas",
  jewish: "Jewish personas",
  facilitator: "Facilitator",
  judge: "Judge",
};
const GROUP_ORDER = ["muslim", "jewish", "facilitator", "judge"];

export default function Personas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setPersonas(await fetchJson<Persona[]>("/api/personas?full=1"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <h1>Personas</h1>
      <p className="subtitle">
        These fictional personas drive the dialogues. Edit a persona&apos;s background or other
        fields and save — the change rewrites its system prompt, applies to future runs, and bumps
        its version (recorded in run provenance). Personas are synthetic and never real people.
      </p>
      {error && <div className="banner err">{error}</div>}

      {GROUP_ORDER.map((group) => {
        const items = personas.filter((p) => p.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h2>{GROUP_LABELS[group] ?? group}</h2>
            {items.map((p) => <PersonaEditor key={p.id} persona={p} />)}
          </section>
        );
      })}
    </>
  );
}

function PersonaEditor({ persona }: { persona: Persona }) {
  const isRole = persona.group === "facilitator" || persona.group === "judge";
  const [form, setForm] = useState({
    displayName: persona.displayName,
    background: persona.background,
    regionalHistory: persona.regionalHistory,
    culturalBaseline: persona.culturalBaseline,
    communicationStyle: persona.communicationStyle,
    degree: persona.degree ?? "",
    professionalBackground: persona.professionalBackground ?? "",
    roleInstructions: persona.roleInstructions ?? "",
    values: persona.values.join(", "),
    sensitivities: persona.sensitivities.join(", "),
    doNot: persona.doNot.join(", "),
  });
  const [version, setVersion] = useState(persona.version);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setNotice("");
  }

  async function save() {
    setBusy(true);
    setErr("");
    setNotice("");
    try {
      const body = {
        displayName: form.displayName,
        background: form.background,
        regionalHistory: form.regionalHistory,
        culturalBaseline: form.culturalBaseline,
        communicationStyle: form.communicationStyle,
        degree: persona.group === "facilitator" ? form.degree : undefined,
        professionalBackground:
          persona.group === "facilitator" ? form.professionalBackground : undefined,
        roleInstructions: form.roleInstructions,
        values: form.values.split(",").map((s) => s.trim()).filter(Boolean),
        sensitivities: form.sensitivities.split(",").map((s) => s.trim()).filter(Boolean),
        doNot: form.doNot.split(",").map((s) => s.trim()).filter(Boolean),
      };
      const updated = await fetchJson<Persona>(`/api/personas/${persona.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setVersion(updated.version);
      setNotice(`Saved · v${updated.version}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="inline">
        <input
          type="text"
          value={form.displayName}
          onChange={(e) => set("displayName", e.target.value)}
          style={{ maxWidth: 320, fontWeight: 700 }}
        />
        <Badge kind={persona.group === "muslim" ? "muslim" : persona.group === "jewish" ? "jewish" : "gray"}>
          {persona.group}
        </Badge>
        <span className="meta mono">{persona.id}</span>
        <span className="right meta">v{version}</span>
      </div>

      {!isRole && persona.raisedIn && (
        <p className="meta" style={{ margin: "8px 0 0" }}>
          Born and raised in <b>{persona.raisedIn}</b>
        </p>
      )}

      <label>Background (family narrative)</label>
      <textarea value={form.background} onChange={(e) => set("background", e.target.value)} rows={4} />

      <div className="row">
        <div>
          <label>Regional history</label>
          <textarea value={form.regionalHistory} onChange={(e) => set("regionalHistory", e.target.value)} rows={3} />
        </div>
        <div>
          <label>Cultural / religious baseline</label>
          <textarea value={form.culturalBaseline} onChange={(e) => set("culturalBaseline", e.target.value)} rows={3} />
        </div>
      </div>

      <label>Communication style</label>
      <input type="text" value={form.communicationStyle} onChange={(e) => set("communicationStyle", e.target.value)} />

      {persona.group === "facilitator" && (
        <div className="row">
          <div>
            <label>Degree</label>
            <input type="text" value={form.degree} onChange={(e) => set("degree", e.target.value)} />
          </div>
          <div>
            <label>Professional background</label>
            <input
              type="text"
              value={form.professionalBackground}
              onChange={(e) => set("professionalBackground", e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="row">
        <div>
          <label>Values (comma-separated)</label>
          <input type="text" value={form.values} onChange={(e) => set("values", e.target.value)} />
        </div>
        <div>
          <label>Sensitivities (comma-separated)</label>
          <input type="text" value={form.sensitivities} onChange={(e) => set("sensitivities", e.target.value)} />
        </div>
        <div>
          <label>Never / do-not (comma-separated)</label>
          <input type="text" value={form.doNot} onChange={(e) => set("doNot", e.target.value)} />
        </div>
      </div>

      {isRole && (
        <>
          <label>Role instructions</label>
          <textarea value={form.roleInstructions} onChange={(e) => set("roleInstructions", e.target.value)} rows={3} />
        </>
      )}

      {err && <div className="banner err" style={{ marginTop: 10 }}>{err}</div>}
      <div className="inline" style={{ marginTop: 12 }}>
        <button className="small" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
        {notice && <span className="badge green">{notice}</span>}
      </div>
    </div>
  );
}
