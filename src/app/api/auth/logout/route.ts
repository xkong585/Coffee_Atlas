import { respondWithCookie, safeRoute } from "@/lib/server/http";
import { authService } from "@/modules/accounts/server/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return safeRoute(async () => {
    const { result, cookie } = await authService.signOut(request);
    return respondWithCookie(result, cookie);
  });
}
