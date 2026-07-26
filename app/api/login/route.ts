import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, verifyPassword } from "@/lib/auth";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = (body as { password?: unknown }).password;
  // Tolerate copy-paste whitespace (trailing spaces/newlines are the #1 cause of
  // "the password doesn't work"). We compare the trimmed value.
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!verifyPassword(input)) {
    // Safe diagnostic: lengths only, never the password content.
    log.warn("login failed", {
      rawLen: typeof raw === "string" ? raw.length : -1,
      trimmedLen: input.length,
    });
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(AUTH_COOKIE, await expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    // Only mark Secure when explicitly served over HTTPS; otherwise the cookie
    // would not be sent over plain-HTTP remote access and login would fail.
    secure: process.env.DBRIDGES_SECURE_COOKIE === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return NextResponse.json({ ok: true });
}
