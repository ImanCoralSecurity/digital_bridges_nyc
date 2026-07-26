import { reviewAsset } from "@/lib/publishing";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    return reviewAsset(id, {
      reviewer: String(body?.reviewer ?? ""),
      action: body?.action,
      reason: body?.reason ? String(body.reason) : undefined,
      body: body?.body ? String(body.body) : undefined,
    });
  });
}
