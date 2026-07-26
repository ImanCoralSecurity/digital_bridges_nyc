import type { NextRequest } from "next/server";
import { loadPersonas } from "@/lib/personas";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const full = req.nextUrl.searchParams.get("full") === "1";
  return handle(async () => {
    const personas = loadPersonas();
    if (full) return personas;
    return personas.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      group: p.group,
      raisedIn: p.raisedIn,
      version: p.version,
      reviewed: Boolean(p.advisorSignoff.reviewer),
    }));
  });
}
