import { success } from "@/contracts";
import { respond, safeRoute, unavailableWithState } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const session = await services.accounts.getSession(request);
    return session.status === "unavailable"
      ? unavailableWithState("Accounts", session)
      : respond(success(session));
  });
}
