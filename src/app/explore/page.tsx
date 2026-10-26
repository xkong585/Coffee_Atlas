import type { Metadata } from "next";
import { connection } from "next/server";
import { loadCatalog } from "@/modules/map-experience/server/catalog-loader";
import { ExploreWorldScreen } from "@/modules/map-experience/ui/explore-screen";

export const metadata: Metadata = {
  title: "Explore",
  description: "Explore the countries and regions where coffee grows and the drinks enjoyed there.",
};

export default async function ExplorePage() {
  // Read the catalog per request; never bake a build-time "unavailable" state into static HTML.
  await connection();
  const load = await loadCatalog();
  return <ExploreWorldScreen load={load} />;
}
