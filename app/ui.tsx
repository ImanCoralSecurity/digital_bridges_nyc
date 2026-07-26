// Shared presentational helpers + a fetch wrapper. No hooks here, so this file
// works whether imported by a server or client component.

import { parseInlineMarkdown } from "@/lib/inlineMarkdown";

export async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export function pct(n: number): string {
  return `${Math.round((n || 0) * 100)}%`;
}

export function usd(n: number): string {
  return `$${(n || 0).toFixed(n && n < 0.01 ? 4 : 2)}`;
}

export function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {parseInlineMarkdown(text).map((token, index) => {
        if (token.type === "strong") return <strong key={index}>{token.text}</strong>;
        if (token.type === "emphasis") return <em key={index}>{token.text}</em>;
        return token.text;
      })}
    </>
  );
}

export function statusKind(status: string): string {
  switch (status) {
    case "completed":
    case "approved":
    case "published":
      return "green";
    case "paused":
    case "suspended":
    case "queued":
    case "draft":
      return "amber";
    case "ready":
      return "green";
    case "running":
    case "active":
      return "muslim";
    case "failed":
    case "cancelled":
    case "rejected":
    case "retracted":
      return "red";
    default:
      return "gray";
  }
}

export function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub ? <div className="tile-sub">{sub}</div> : null}
    </div>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
