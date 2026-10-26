import { stableIdSchema } from "@/contracts";
import { parseInput, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return safeRoute(async () => {
    const id = parseInput(stableIdSchema, (await context.params).id);
    if (!id.ok) return respond(id);
    return respond(await services.catalog.getDrink(id.data));
  });
}
