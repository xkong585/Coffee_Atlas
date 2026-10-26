import { signUpInputSchema } from "@/contracts";
import { parseJson, respond, respondWithCookie, safeRoute } from "@/lib/server/http";
import { authService } from "@/modules/accounts/server/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const input = await parseJson(signUpInputSchema, request);
    if (!input.ok) return respond(input);
    const { result, cookie } = await authService.signUp(request, input.data);
    return respondWithCookie(result, cookie);
  });
}
