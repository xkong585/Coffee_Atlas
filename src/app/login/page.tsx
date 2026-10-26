import type { Metadata } from "next";
import { AccountScreen } from "@/modules/accounts/ui/account-screen";

export const metadata: Metadata = { title: "Sign in" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const { next } = await searchParams;
  return <AccountScreen view="login" next={typeof next === "string" ? next : null} />;
}
