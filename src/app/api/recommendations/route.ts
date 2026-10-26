import { recommendationRequestSchema } from "@/contracts";
import { parseJson, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(recommendationRequestSchema, request);
    if (!input.ok) return respond(input);
    return respond(await services.recommendations.recommend(request, input.data));
  });
}
