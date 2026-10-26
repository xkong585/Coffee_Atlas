import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { stableIdSchema } from "@/contracts";
import { loadBean } from "@/modules/map-experience/server/catalog-loader";
import { BeanDetailScreen } from "@/modules/map-experience/ui/detail-screen";

type Props = { params: Promise<{ id: string }> };

/** One catalog read per request, shared by generateMetadata and the page. */
const getBean = cache((id: string) => loadBean(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!stableIdSchema.safeParse(id).success) return { title: "Coffee bean" };
  await connection();
  const load = await getBean(id);
  return load.status === "ready"
    ? { title: load.item.name, description: load.item.description }
    : { title: "Coffee bean" };
}

export default async function BeanPage({ params }: Props) {
  const { id } = await params;
  if (!stableIdSchema.safeParse(id).success) notFound();
  await connection();
  const load = await getBean(id);
  if (load.status === "not-found") notFound();
  return <BeanDetailScreen load={load} />;
}
