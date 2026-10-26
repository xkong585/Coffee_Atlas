import "server-only";
import { type CatalogSnapshot, catalogSnapshotSchema } from "@/contracts";
import { catalogService } from "@/modules/catalog/server/service";
import { getMapPreviewCatalog } from "@/modules/map-experience/dev/preview-catalog";

export type RecommendationCatalog =
  | { status: "ready"; snapshot: CatalogSnapshot; preview: boolean }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The whole catalog, read from the shared catalog service. Like the map, only
 * when that service is unavailable AND the development fixture gate is open
 * does the labeled map preview catalog stand in; the page must then show the
 * preview notice. (Imported directly rather than through lib/server/services,
 * which itself imports the recommendation service.)
 */
export async function loadRecommendationCatalog(): Promise<RecommendationCatalog> {
  try {
    const result = await catalogService.list({});
    if (result.ok) {
      const parsed = catalogSnapshotSchema.safeParse(result.data);
      return parsed.success ? { status: "ready", snapshot: parsed.data, preview: false } : { status: "error" };
    }
    if (result.error.code === "SERVICE_UNAVAILABLE") {
      const preview = getMapPreviewCatalog();
      return preview ? { status: "ready", snapshot: preview, preview: true } : { status: "unavailable" };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
