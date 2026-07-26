import type { NextRequest } from "next/server";
import { handle } from "@/lib/apiHelpers";
import { getProject } from "@/lib/db";
import { deleteProjectSession } from "@/lib/jobQueue";
import { configureProjectSession } from "@/lib/projects";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(_req: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return handle(async () => {
    const project = getProject(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    const session = project.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return { project, session };
  });
}

export async function PATCH(req: NextRequest, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    return configureProjectSession(id, sessionId, {
      topic: String(body.topic ?? ""),
      rounds: Number(body.rounds),
    });
  });
}

export async function DELETE(_req: Request, ctx: Context) {
  const { id, sessionId } = await ctx.params;
  return handle(async () => deleteProjectSession(id, sessionId));
}
