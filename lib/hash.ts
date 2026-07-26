// Small hashing helpers (server-only) used for prompt provenance and IDs.
import { createHash, randomUUID } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Short, stable hash for prompt provenance. */
export function shortHash(input: string): string {
  return sha256Hex(input).slice(0, 16);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
