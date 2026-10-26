import { z } from "zod";
import { checkoutSessionIdSchema } from "@/contracts";
import { parseQuery, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

const querySchema = z.strictObject({ sessionId: checkoutSessionIdSchema });

/** The checkout as last confirmed by a verified webhook. A redirect alone never grants access. */
export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const query = parseQuery(querySchema, request);
    if (!query.ok) return respond(query);
    return respond(await services.accounts.getCheckoutState(request, query.data.sessionId));
  });
}
