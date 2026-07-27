import { handle } from "@/lib/apiHelpers";
import { getProject, listJobs } from "@/lib/db";
import { deleteProject } from "@/lib/jobQueue";
import { setProjectPublication } from "@/lib/projects";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

function withJobStatuses(project: Project): Project {
  const jobStatusById = new Map(listJobs().map((job) => [job.id, job.status]));
  return {
    ...project,
    sessions: project.sessions.map((session) => ({
      ...session,
      jobStatus: session.jobId ? jobStatusById.get(session.jobId) : undefined,
    })),
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const project = getProject(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    return withJobStatuses(project);
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { published?: unknown };
    if (typeof body.published !== "boolean") {
      throw new Error("Published must be true or false.");
    }
    return withJobStatuses(await setProjectPublication(id, body.published));
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return handle(async () => deleteProject(id));
}
