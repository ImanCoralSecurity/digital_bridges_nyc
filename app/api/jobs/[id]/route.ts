import { handle } from "@/lib/apiHelpers";
import { getJob } from "@/lib/db";
import { controlProjectSessionJob, type JobControlAction } from "@/lib/jobQueue";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Context) {
  const { id } = await ctx.params;
  return handle(async () => {
    const job = getJob(id);
    if (!job) throw new Error(`Job not found: ${id}`);
    return { job };
  });
}

export async function PATCH(req: Request, ctx: Context) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    const requested = String(body?.action ?? "").toLowerCase();
    const action: JobControlAction = requested === "kill" ? "cancel" : requested as JobControlAction;
    if (action !== "pause" && action !== "continue" && action !== "cancel") {
      throw new Error('Job action must be "pause", "continue", or "kill".');
    }
    return controlProjectSessionJob(id, action);
  });
}
