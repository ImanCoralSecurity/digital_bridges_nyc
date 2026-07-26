import type { NextRequest } from "next/server";
import { listRuns } from "@/lib/db";
import { startRun } from "@/lib/orchestrator";
import { handle } from "@/lib/apiHelpers";
import {
  isAgentProvider,
  isReasoningEffort,
  modelMatchesProvider,
  resolveProvider,
} from "@/lib/providers";
import { isSelectableGptModel } from "@/lib/gptModels";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function GET() {
  return handle(async () => listRuns());
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json();
    if (!Array.isArray(body?.attendeeIds) || body.attendeeIds.length < 2) {
      throw new Error("Select at least two students to attend (attendeeIds).");
    }
    if (
      body.rounds !== undefined &&
      (!Number.isFinite(Number(body.rounds)) || !Number.isInteger(Number(body.rounds)))
    ) {
      throw new Error("Rounds must be a whole number from 1 to 10.");
    }
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
    return startRun({
      attendeeIds: body.attendeeIds.map((x: unknown) => String(x)),
      scenario: String(body.scenario ?? ""),
      provider: isAgentProvider(body.provider) ? body.provider : undefined,
      model: requestedModel,
      reasoningEffort: isReasoningEffort(body.reasoningEffort)
        ? body.reasoningEffort
        : undefined,
      rounds: body.rounds !== undefined ? Number(body.rounds) : undefined,
      selection: body.selection === "random" ? "random" : "round-robin",
      budgetUsd: body.budgetUsd !== undefined ? Number(body.budgetUsd) : undefined,
      mock: body.mock === true,
    });
  });
}
