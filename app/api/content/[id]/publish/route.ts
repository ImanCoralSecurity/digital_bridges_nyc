import { publishAsset } from "@/lib/publishing";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    return publishAsset(id, {
      partner: String(body?.partner ?? ""),
      actor: String(body?.actor ?? ""),
    });
  });
}
