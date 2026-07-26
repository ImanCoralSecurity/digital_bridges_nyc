import type { NextRequest } from "next/server";
import { listAssets, listPublishLogs } from "@/lib/db";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const runId = req.nextUrl.searchParams.get("runId") || undefined;
  return handle(async () =>
    listAssets({ status, runId }).map((a) => ({
      ...a,
      publishHistory: listPublishLogs(a.id),
    })),
  );
}
