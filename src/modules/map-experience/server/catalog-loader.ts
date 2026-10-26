import "server-only";
import type { z } from "zod";
import {
  type Bean,
  beanSchema,
  catalogSnapshotSchema,
  type Drink,
  drinkSchema,
} from "@/contracts";
import { services } from "@/lib/server/services";
import { getMapPreviewCatalog } from "@/modules/map-experience/dev/preview-catalog";
import { type CatalogIndex, indexCatalog } from "@/modules/map-experience/lib/catalog-view";

/**
 * Server-side reads for the map and detail pages. All content comes from the
 * shared catalog service. Only when that service is unavailable AND the
 * development fixture gate is open (NODE_ENV=development and
 * ENABLE_DEV_FIXTURES=true) does the labeled map preview catalog stand in.
 */

export type CatalogLoad =
  | { status: "ready"; index: CatalogIndex; preview: boolean }
  | { status: "unavailable" }
  | { status: "error" };

export type ItemLoad<T> =
  | { status: "ready"; item: T; index: CatalogIndex; preview: boolean }
  | { status: "not-found" }
  | { status: "unavailable" }
  | { status: "error" };

/** The preview stands in for the whole catalog; pages never request a filtered snapshot. */
function previewIndex(): CatalogIndex | null {
  const preview = getMapPreviewCatalog();
  return preview ? indexCatalog(preview) : null;
}

/** Loads the whole catalog for exploration and detail pages. */
export async function loadCatalog(): Promise<CatalogLoad> {
  try {
    const result = await services.catalog.list({});
    if (result.ok) {
      const parsed = catalogSnapshotSchema.safeParse(result.data);
      return parsed.success ? { status: "ready", index: indexCatalog(parsed.data), preview: false } : { status: "error" };
    }
    if (result.error.code === "SERVICE_UNAVAILABLE") {
      const index = previewIndex();
      return index ? { status: "ready", index, preview: true } : { status: "unavailable" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

async function loadItem<T extends Bean | Drink>(
  id: string,
  read: (id: string) => ReturnType<typeof services.catalog.getBean> | ReturnType<typeof services.catalog.getDrink>,
  schema: z.ZodType<T>,
  pick: (index: CatalogIndex) => T | undefined,
): Promise<ItemLoad<T>> {
  try {
    const result = await read(id);
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") return { status: "not-found" };
      if (result.error.code !== "SERVICE_UNAVAILABLE") return { status: "error" };
      const index = previewIndex();
      if (!index) return { status: "unavailable" };
      const item = pick(index);
      return item ? { status: "ready", item, index, preview: true } : { status: "not-found" };
    }
    // Validate the item like the snapshot, so malformed service data shows the error state.
    const parsed = schema.safeParse(result.data);
    if (!parsed.success) return { status: "error" };
    // The item comes from its own read; the full snapshot supplies names, sources and pairings.
    const context = await loadCatalog();
    if (context.status !== "ready") return context;
    return { status: "ready", item: parsed.data, index: context.index, preview: context.preview };
  } catch {
    return { status: "error" };
  }
}

export function loadBean(id: string): Promise<ItemLoad<Bean>> {
  return loadItem<Bean>(id, (value) => services.catalog.getBean(value), beanSchema, (index) => index.beans.get(id));
}

export function loadDrink(id: string): Promise<ItemLoad<Drink>> {
  return loadItem<Drink>(id, (value) => services.catalog.getDrink(value), drinkSchema, (index) => index.drinks.get(id));
}
