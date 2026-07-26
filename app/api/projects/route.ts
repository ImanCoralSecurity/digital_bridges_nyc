import type { NextRequest } from "next/server";
import { handle } from "@/lib/apiHelpers";
import { listProjects } from "@/lib/db";
import { isSelectableGptModel } from "@/lib/gptModels";
import { createProject } from "@/lib/projects";
import {
  isAgentProvider,
  isReasoningEffort,
  modelMatchesProvider,
  resolveProvider,
} from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => listProjects());
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    if (body.provider !== undefined && !isAgentProvider(body.provider)) {
      throw new Error('Provider must be either "codex" or "claude".');
    }
    if (body.reasoningEffort !== undefined && !isReasoningEffort(body.reasoningEffort)) {
      throw new Error("Codex reasoning effort must be low, medium, high, or xhigh.");
    }
    const requestedModel = body.model ? String(body.model) : undefined;
    if (requestedModel) {
      const provider = resolveProvider(
        isAgentProvider(body.provider) ? body.provider : undefined,
        requestedModel,
      );
      if (!modelMatchesProvider(provider, requestedModel)) {
        throw new Error(`Model "${requestedModel}" is not compatible with provider "${provider}".`);
      }
      if (provider === "codex" && !isSelectableGptModel(requestedModel)) {
        throw new Error(`GPT model "${requestedModel}" is not available in the dashboard catalog.`);
      }
    }
    return createProject({
      name: String(body.name ?? ""),
      projectIntroduction:
        body.projectIntroduction === undefined
          ? undefined
          : String(body.projectIntroduction),
      sessionCount: Number(body.sessionCount),
      attendeeIds: Array.isArray(body.attendeeIds)
        ? body.attendeeIds.map((value: unknown) => String(value))
        : [],
      controversialPerCommunity: Number(body.controversialPerCommunity ?? 0),
      provider: isAgentProvider(body.provider) ? body.provider : undefined,
      model: requestedModel,
      reasoningEffort: isReasoningEffort(body.reasoningEffort)
        ? body.reasoningEffort
        : undefined,
      selection: body.selection === "random" ? "random" : "round-robin",
      budgetUsd: body.budgetUsd !== undefined ? Number(body.budgetUsd) : undefined,
      mock: body.mock === true,
    });
  });
}
