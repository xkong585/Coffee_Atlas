import type { Metadata } from "next";
import { connection } from "next/server";
import { loadRecommendationCatalog } from "@/modules/recommendations/server/catalog-source";
import { RecommendationScreen } from "@/modules/recommendations/ui/recommendation-screen";
import { getInitialSearch, type RecommendationSearchParams } from "@/modules/recommendations/ui/search-context";

export const metadata: Metadata = { title: "Find your coffee" };

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<RecommendationSearchParams> }) {
  const initial = getInitialSearch(await searchParams);
  await connection();
  return <RecommendationScreen catalog={await loadRecommendationCatalog()} initial={initial} />;
}
