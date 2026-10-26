import type { Metadata } from "next";
import { AccountScreen } from "@/modules/accounts/ui/account-screen";

export const metadata: Metadata = { title: "Create an account" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: Search }) {
  const { next } = await searchParams;
  return <AccountScreen view="signup" next={typeof next === "string" ? next : null} />;
}
