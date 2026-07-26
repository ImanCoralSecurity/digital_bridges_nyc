import { listAssets, listPublishLogs, listRuns } from "@/lib/db";
import { handle } from "@/lib/apiHelpers";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export async function GET() {
  return handle(async () => {
    const runs = listRuns();
    const withMetrics = runs.filter((r: Run) => r.metrics);
    const assets = listAssets();
    const byStatus: Record<string, number> = {};
    for (const a of assets) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;

    return {
      totalRuns: runs.length,
      completedRuns: runs.filter((r) => r.status === "completed").length,
      pausedRuns: runs.filter((r) => r.status === "paused").length,
      failedRuns: runs.filter((r) => r.status === "failed").length,
      totalCostUsd: runs
        .filter((r) => r.costAvailable !== false)
        .reduce((s, r) => s + r.costUsd, 0),
      unpricedRuns: runs.filter((r) => r.costAvailable === false).length,
      avgAdherence: avg(withMetrics.map((r) => r.metrics!.adherenceRate)),
      avgEmpathy: avg(withMetrics.map((r) => r.metrics!.syntheticEmpathyScore)),
      avgGuardrailRate: avg(withMetrics.map((r) => r.metrics!.guardrailTriggerRate)),
      avgTopicRelevance: avg(
        withMetrics
          .map((r) => r.metrics!.topicRelevanceRate)
          .filter((value): value is number => value !== undefined),
      ),
      assetsByStatus: byStatus,
      totalAssets: assets.length,
      publishEvents: listPublishLogs().length,
    };
  });
}
