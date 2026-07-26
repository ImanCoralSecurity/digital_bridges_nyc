import { handle } from "@/lib/apiHelpers";
import { getProject, listJobs } from "@/lib/db";
import { deleteProject } from "@/lib/jobQueue";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const project = getProject(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    const jobStatusById = new Map(listJobs().map((job) => [job.id, job.status]));
    return {
      ...project,
      sessions: project.sessions.map((session) => ({
        ...session,
        jobStatus: session.jobId ? jobStatusById.get(session.jobId) : undefined,
      })),
    };
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return handle(async () => deleteProject(id));
}
