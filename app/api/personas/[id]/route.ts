import { getPersona, updatePersona } from "@/lib/personas";
import { handle } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => getPersona(id));
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handle(async () => {
    const body = await req.json();
    return updatePersona(id, {
      displayName: body?.displayName,
      background: body?.background,
      regionalHistory: body?.regionalHistory,
      culturalBaseline: body?.culturalBaseline,
      communicationStyle: body?.communicationStyle,
      degree: body?.degree,
      professionalBackground: body?.professionalBackground,
      roleInstructions: body?.roleInstructions,
      values: Array.isArray(body?.values) ? body.values : undefined,
      sensitivities: Array.isArray(body?.sensitivities) ? body.sensitivities : undefined,
      doNot: Array.isArray(body?.doNot) ? body.doNot : undefined,
    });
  });
}
