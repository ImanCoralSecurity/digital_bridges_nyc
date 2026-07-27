"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "Login failed");
      }
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const next = requestedNext?.startsWith("/") &&
        !requestedNext.startsWith("//") &&
        !requestedNext.includes("\\")
        ? requestedNext
        : "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "8vh auto 0" }}>
      <div className="card">
        <h1 style={{ fontSize: 22 }}>Digital Bridges NYC</h1>
        <p className="subtitle">Enter the administrator password to unlock project creation, editing, jobs, and review tools.</p>
        <form onSubmit={submit}>
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <div className="banner err" style={{ marginTop: 12 }}>{error}</div>}
          <div className="spacer" />
          <button type="submit" disabled={busy || !password} style={{ width: "100%" }}>
            {busy ? "Verifying…" : "Unlock"}
          </button>
        </form>
        <p className="meta" style={{ marginBottom: 0, textAlign: "center" }}>
          <Link href="/public">Return to the public, read-only site</Link>
        </p>
      </div>
    </div>
  );
}
