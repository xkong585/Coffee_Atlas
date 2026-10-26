import { catalogFilterSchema } from "@/contracts";
import { parseQuery, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const filter = parseQuery(catalogFilterSchema, request);
    if (!filter.ok) return respond(filter);
    return respond(await services.catalog.list(filter.data));
  });
}
