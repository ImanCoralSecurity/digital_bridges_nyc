import { getRun, getSemanticValidationAttemptByRun } from "@/lib/db";
import { handle, noStore } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; validationId: string }> },
) {
  const { id, validationId } = await ctx.params;
  return noStore(
    await handle(async () => {
      const run = getRun(id);
      if (!run) throw new Error(`Run not found: ${id}`);

      // Scoping the lookup by both identifiers prevents cross-run audit access
      // without disclosing whether the validation id belongs to another run.
      const validation = getSemanticValidationAttemptByRun(id, validationId);
      if (!validation) {
        throw new Error(`Semantic validation not found: ${validationId}`);
      }
      return { validation };
    }),
  );
}
