import { notFound } from "next/navigation";
import type { Bean, Drink } from "@/contracts";
import type { ItemLoad } from "@/modules/map-experience/server/catalog-loader";
import { BeanDetail } from "./bean-detail";
import { DetailProblem } from "./detail-parts";
import { DrinkDetail } from "./drink-detail";

/**
 * Bean and drink detail screens for every catalog state. Pages call
 * notFound() for unknown IDs first; this is a safety net for the same case.
 */
export function BeanDetailScreen({ load }: { load: ItemLoad<Bean> }) {
  if (load.status === "not-found") notFound();
  if (load.status !== "ready") return <DetailProblem kind="bean" status={load.status} />;
  return <BeanDetail bean={load.item} index={load.index} preview={load.preview} />;
}

export function DrinkDetailScreen({ load }: { load: ItemLoad<Drink> }) {
  if (load.status === "not-found") notFound();
  if (load.status !== "ready") return <DetailProblem kind="drink" status={load.status} />;
  return <DrinkDetail drink={load.item} index={load.index} preview={load.preview} />;
}
