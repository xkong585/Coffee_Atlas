import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { stableIdSchema } from "@/contracts";
import { loadDrink } from "@/modules/map-experience/server/catalog-loader";
import { DrinkDetailScreen } from "@/modules/map-experience/ui/detail-screen";

type Props = { params: Promise<{ id: string }> };

/** One catalog read per request, shared by generateMetadata and the page. */
const getDrink = cache((id: string) => loadDrink(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!stableIdSchema.safeParse(id).success) return { title: "Regional drink" };
  await connection();
  const load = await getDrink(id);
  return load.status === "ready"
    ? { title: load.item.name, description: load.item.description }
    : { title: "Regional drink" };
}

export default async function DrinkPage({ params }: Props) {
  const { id } = await params;
  if (!stableIdSchema.safeParse(id).success) notFound();
  await connection();
  const load = await getDrink(id);
  if (load.status === "not-found") notFound();
  return <DrinkDetailScreen load={load} />;
}
