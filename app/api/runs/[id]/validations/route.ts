import { getRun, listSemanticValidationAttemptPageByRun } from "@/lib/db";
import { handle, noStore } from "@/lib/apiHelpers";
import {
  parseSemanticValidationPagination,
  summarizeSemanticValidationAttempt,
} from "@/lib/semanticValidationAttempts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return noStore(
    await handle(async () => {
      const run = getRun(id);
      if (!run) throw new Error(`Run not found: ${id}`);

      const { page, pageSize, offset } = parseSemanticValidationPagination(req.url);
      const result = listSemanticValidationAttemptPageByRun(id, offset, pageSize);
      return {
        validations: result.attempts.map(summarizeSemanticValidationAttempt),
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      };
    }),
  );
}
