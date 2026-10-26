import type { Metadata } from "next";
import { AccountScreen } from "@/modules/accounts/ui/account-screen";

export const metadata: Metadata = { title: "Saved discoveries" };

export default function SavedPage() {
  return <AccountScreen view="saved" />;
}
