import { generateCampaignContent } from "@/lib/content";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => ({ assets: await generateCampaignContent(id) }));
}
