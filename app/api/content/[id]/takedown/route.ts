import { takedownAsset } from "@/lib/publishing";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    return takedownAsset(id, {
      actor: String(body?.actor ?? ""),
      reason: String(body?.reason ?? ""),
    });
  });
}
