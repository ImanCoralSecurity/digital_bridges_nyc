import { getRun, listGenerationAttemptPageByRun } from "@/lib/db";
import {
  parseGenerationAttemptPagination,
  summarizeGenerationAttempt,
} from "@/lib/generationAttempts";
import { handle, noStore } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return noStore(
    await handle(async () => {
      const run = getRun(id);
      if (!run) throw new Error(`Run not found: ${id}`);

      const { page, pageSize, offset } = parseGenerationAttemptPagination(req.url);
      const result = listGenerationAttemptPageByRun(id, offset, pageSize);
      return {
        attempts: result.attempts.map(summarizeGenerationAttempt),
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      };
    }),
  );
}
