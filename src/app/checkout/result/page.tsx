import type { Metadata } from "next";
import { checkoutSessionIdSchema } from "@/contracts";
import { AccountScreen } from "@/modules/accounts/ui/account-screen";

export const metadata: Metadata = { title: "Checkout status" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutResultPage({ searchParams }: { searchParams: Search }) {
  const { session_id: sessionId, canceled } = await searchParams;
  const parsed = checkoutSessionIdSchema.safeParse(sessionId);
  return <AccountScreen view="checkout-result" sessionId={parsed.success ? parsed.data : null} canceled={canceled === "1"} />;
}
