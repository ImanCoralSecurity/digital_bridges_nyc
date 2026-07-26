import { handle } from "@/lib/apiHelpers";
import { isSelectableGptModel } from "@/lib/gptModels";
import { enqueueProjectSessionJob } from "@/lib/jobQueue";
import { isReasoningEffort } from "@/lib/providers";

export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await ctx.params;
  return handle(async () => {
    const raw = await req.text();
    const body = raw ? JSON.parse(raw) : {};
    const model = body.model === undefined ? undefined : String(body.model);
    if (model && !isSelectableGptModel(model)) {
      throw new Error(`GPT model "${model}" is not available in the dashboard catalog.`);
    }
    if (
      body.reasoningEffort !== undefined &&
      !isReasoningEffort(body.reasoningEffort)
    ) {
      throw new Error("Reasoning effort must be low, medium, high, or xhigh.");
    }
    return enqueueProjectSessionJob(id, sessionId, {
      model,
      reasoningEffort: isReasoningEffort(body.reasoningEffort)
        ? body.reasoningEffort
        : undefined,
    });
  }, 202);
}
