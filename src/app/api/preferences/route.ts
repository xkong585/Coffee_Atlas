import { preferencesSchema } from "@/contracts";
import { parseJson, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => respond(await services.accounts.getPreferences(request)));
}

export async function PUT(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(preferencesSchema, request);
    if (!input.ok) return respond(input);
    return respond(await services.accounts.savePreferences(request, input.data));
  });
}
