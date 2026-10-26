import { success } from "@/contracts";
import { respond } from "@/lib/server/http";
import { aiConfigured } from "@/lib/server/ai-client";
import { stripeGateway } from "@/modules/accounts/server/stripe";

export const dynamic = "force-dynamic";

const configured = (value: boolean) => (value ? "configured" : "not-configured");

/**
 * Which services this server has configuration for. It reads environment
 * presence only (no provider calls), so it never certifies that a provider
 * accepts the credentials.
 */
export function GET(): Response {
  const accounts = Boolean(process.env.DATABASE_URL?.trim()) && (process.env.AUTH_SECRET?.trim().length ?? 0) >= 32;
  return respond(success({
    status: "ok",
    services: {
      catalog: "ready",
      accounts: configured(accounts),
      payments: configured(accounts && stripeGateway() !== null),
      ai: configured(aiConfigured()),
    },
  }));
}
