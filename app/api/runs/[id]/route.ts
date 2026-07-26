import {
  countGenerationAttemptsByRun,
  countSemanticValidationAttemptsByRun,
  getRun,
  listTurnsByRun,
} from "@/lib/db";
import { handle, noStore } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return noStore(
    await handle(async () => {
      const run = getRun(id);
      if (!run) throw new Error(`Run not found: ${id}`);
      return {
        run,
        turns: listTurnsByRun(id),
        rejectedAttemptCount: countGenerationAttemptsByRun(id),
        semanticValidationCount: countSemanticValidationAttemptsByRun(id),
      };
    }),
  );
}
