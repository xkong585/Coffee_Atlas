import type { Metadata } from "next";
import { connection } from "next/server";
import { AccountScreen } from "@/modules/accounts/ui/account-screen";
import { tripRequiresAccess } from "@/modules/trip-map/server/service";

export const metadata: Metadata = { title: "Plans" };

export default async function UpgradePage() {
  await connection();
  return <AccountScreen view="upgrade" includesTrips={tripRequiresAccess()} />;
}
