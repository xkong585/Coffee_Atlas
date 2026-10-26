import type { Metadata } from "next";
import { connection } from "next/server";
import { loadRecommendationCatalog } from "@/modules/recommendations/server/catalog-source";
import { TripScreen } from "@/modules/trip-map/ui/trip-screen";

export const metadata: Metadata = { title: "Plan a coffee trip" };

export default async function TripPage() {
  await connection();
  return <TripScreen catalog={await loadRecommendationCatalog()} />;
}
