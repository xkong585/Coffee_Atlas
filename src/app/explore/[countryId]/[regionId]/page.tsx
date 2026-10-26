import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { stableIdSchema } from "@/contracts";
import { regionBelongsToCountry } from "@/modules/map-experience/lib/catalog-view";
import { loadCatalog } from "@/modules/map-experience/server/catalog-loader";
import { ExploreRegionScreen } from "@/modules/map-experience/ui/explore-screen";

type Props = { params: Promise<{ countryId: string; regionId: string }> };

/** One catalog read per request, shared by generateMetadata and the page. */
const getCatalog = cache(() => loadCatalog());

const validIds = (countryId: string, regionId: string) =>
  stableIdSchema.safeParse(countryId).success && stableIdSchema.safeParse(regionId).success;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryId, regionId } = await params;
  if (!validIds(countryId, regionId)) return { title: "Explore a region" };
  await connection();
  const load = await getCatalog();
  if (load.status !== "ready" || !regionBelongsToCountry(load.index, countryId, regionId)) {
    return { title: "Explore a region" };
  }
  const region = load.index.regions.get(regionId);
  const country = load.index.countries.get(countryId);
  return region && country
    ? { title: `${region.name}, ${country.name}`, description: region.summary }
    : { title: "Explore a region" };
}

export default async function RegionPage({ params }: Props) {
  const { countryId, regionId } = await params;
  if (!validIds(countryId, regionId)) notFound();
  await connection();
  const load = await getCatalog();
  // A region page exists only when the region's recorded parent is this country.
  if (load.status === "ready" && !regionBelongsToCountry(load.index, countryId, regionId)) notFound();
  return <ExploreRegionScreen load={load} countryId={countryId} regionId={regionId} />;
}
