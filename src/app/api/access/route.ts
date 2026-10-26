import { success } from "@/contracts";
import { respond, safeRoute, unavailableWithState } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const access = await services.accounts.getAccess(request);
    return access.status === "unavailable"
      ? unavailableWithState("Paid access", access)
      : respond(success(access));
  });
}
