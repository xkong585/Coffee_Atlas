import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { stableIdSchema } from "@/contracts";
import { loadCatalog } from "@/modules/map-experience/server/catalog-loader";
import { ExploreCountryScreen } from "@/modules/map-experience/ui/explore-screen";

type Props = { params: Promise<{ countryId: string }> };

/** One catalog read per request, shared by generateMetadata and the page. */
const getCatalog = cache(() => loadCatalog());

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countryId } = await params;
  if (!stableIdSchema.safeParse(countryId).success) return { title: "Explore a country" };
  await connection();
  const load = await getCatalog();
  const country = load.status === "ready" ? load.index.countries.get(countryId) : undefined;
  return country
    ? { title: country.name, description: country.summary }
    : { title: "Explore a country" };
}

export default async function CountryPage({ params }: Props) {
  const { countryId } = await params;
  if (!stableIdSchema.safeParse(countryId).success) notFound();
  await connection();
  const load = await getCatalog();
  if (load.status === "ready" && !load.index.countries.has(countryId)) notFound();
  return <ExploreCountryScreen load={load} countryId={countryId} />;
}
