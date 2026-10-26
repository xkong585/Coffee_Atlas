import { savedItemInputSchema } from "@/contracts";
import { parseJson, respond, safeRoute } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return safeRoute(async () => respond(await services.accounts.listSaved(request)));
}

export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(savedItemInputSchema, request);
    if (!input.ok) return respond(input);
    return respond(await services.accounts.saveItem(request, input.data));
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(savedItemInputSchema, request);
    if (!input.ok) return respond(input);
    return respond(await services.accounts.removeSaved(request, input.data));
  });
}
