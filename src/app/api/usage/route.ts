import { respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** The signed-in user's free AI recommendation quota and paid state. */
export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => respond(await services.accounts.getRecommendationAllowance(request)));
}
