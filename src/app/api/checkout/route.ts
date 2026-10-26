import { checkoutInputSchema } from "@/contracts";
import { parseJson, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";
import { checkoutOffer } from "@/modules/accounts/server/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(checkoutInputSchema, request);
    if (!input.ok) return respond(input);
    return respond(await services.accounts.createCheckout(request, input.data));
  });
}

/** The one-time unlock's price, for the plans page. */
export async function GET(): Promise<Response> {
  return safeRoute(async () => respond(await checkoutOffer()));
}
