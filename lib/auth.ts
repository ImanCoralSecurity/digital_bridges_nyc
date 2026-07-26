// Password gate (Edge-safe: uses Web Crypto + process.env only, no node:crypto/fs,
// so it can be imported by middleware which runs on the Edge runtime).
//
// A single environment-provided password gates the whole app. The login route
// verifies it on the backend and sets an httpOnly cookie holding a derived
// token; middleware checks that token on every request. Without it, the API
// returns 401 and pages redirect to /login — the app cannot be used.

export const AUTH_COOKIE = "dbridges_auth";

export function getPassword(): string {
  const password = process.env.DBRIDGES_PASSWORD?.trim();
  if (!password) {
    throw new Error("DBRIDGES_PASSWORD must be configured before starting the app.");
  }
  return password;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The cookie token derived from the current password. Not the password itself. */
export function expectedToken(): Promise<string> {
  return sha256Hex(getPassword() + "::dbridges::auth::v1");
}

/** Constant-time-ish comparison of a submitted password against the secret. */
export function verifyPassword(input: unknown): boolean {
  const pw = getPassword();
  if (typeof input !== "string" || input.length !== pw.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= input.charCodeAt(i) ^ pw.charCodeAt(i);
  return diff === 0;
}

export async function tokenIsValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  return token === (await expectedToken());
}
