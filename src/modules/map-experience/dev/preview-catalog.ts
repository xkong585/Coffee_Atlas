/**
 * DEVELOPMENT PREVIEW ONLY. The map's preview records became the real catalog
 * (src/modules/catalog/data/records.ts), which the catalog service now serves.
 *
 * This gate stays only because the map and recommendation loaders still fall
 * back to it when the catalog service reports SERVICE_UNAVAILABLE, which the
 * connected service no longer does. It returns null unless NODE_ENV=development
 * AND ENABLE_DEV_FIXTURES=true. Delete it together with those fallbacks.
 */
import "server-only";
import { type CatalogSnapshot, catalogSnapshotSchema } from "@/contracts";
import { developmentFixturesEnabled } from "@/dev/fixtures";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";

export function getMapPreviewCatalog(): CatalogSnapshot | null {
  if (!developmentFixturesEnabled()) return null;
  return catalogSnapshotSchema.parse(CATALOG_RECORDS);
}
