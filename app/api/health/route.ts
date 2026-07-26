import { checkAgentProviders } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import { ok } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getConfig();
  const providers = await checkAgentProviders();
  return ok({
    forceMock: cfg.forceMock,
    defaultProvider: cfg.defaultProvider,
    defaultModel: cfg.defaultModel,
    defaultReasoningEffort: cfg.defaultReasoningEffort,
    defaultBudgetUsd: cfg.defaultBudgetUsd,
    semanticValidator: {
      enabled: cfg.semanticValidatorEnabled,
      usesSelectedRunModel: true,
    },
    providers,
  });
}
