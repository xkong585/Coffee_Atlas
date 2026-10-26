import { success } from "@/contracts";
import { getDevelopmentFixtures } from "@/dev/fixtures";
import { respond } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const fixtures = getDevelopmentFixtures();
  if (!fixtures) {
    return respond({ ok: false, error: { code: "NOT_FOUND", message: "Not found.", retryable: false } });
  }
  return respond(success(fixtures));
}
