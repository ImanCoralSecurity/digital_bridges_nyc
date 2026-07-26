import { getGenerationAttemptByRun, getRun } from "@/lib/db";
import { handle, noStore } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; attemptId: string }> },
) {
  const { id, attemptId } = await ctx.params;
  return noStore(
    await handle(async () => {
      const run = getRun(id);
      if (!run) throw new Error(`Run not found: ${id}`);

      // Matching both identifiers prevents a detail URL from crossing run
      // boundaries, without revealing whether the id exists on another run.
      const attempt = getGenerationAttemptByRun(id, attemptId);
      if (!attempt) throw new Error(`Generation attempt not found: ${attemptId}`);
      return { attempt };
    }),
  );
}
