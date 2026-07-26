// Small helpers for route handlers (server-only).
import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Prevent browsers and intermediary caches from retaining sensitive records. */
export function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

/** Run a handler and translate thrown errors into JSON error responses. */
export async function handle<T>(
  fn: () => Promise<T>,
  successStatus = 200,
): Promise<NextResponse> {
  try {
    return ok(await fn(), successStatus);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const explicitStatus =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status?: unknown }).status)
        : NaN;
    // Domain services may expose a narrow HTTP status (for example, 409 when
    // deleting an aggregate would orphan active work). Unknown values do not
    // escape the normal 400/404 mapping.
    const status =
      Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus <= 599
        ? explicitStatus
        : /not found|unknown/i.test(message)
          ? 404
          : 400;
    return fail(message, status);
  }
}
