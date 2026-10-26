import "server-only";
import {
  type ApiFailure,
  type CatalogService,
  type CatalogSnapshot,
  catalogSnapshotSchema,
  success,
} from "@/contracts";
import { CATALOG_RECORDS } from "@/modules/catalog/data/records";
import { filterCatalog } from "@/modules/catalog/lib/filter";
import { findCatalogProblems } from "@/modules/catalog/lib/integrity";

const notFound = (what: string): ApiFailure => ({
  ok: false,
  error: { code: "NOT_FOUND", message: `${what} is not in the catalog.`, retryable: false },
});

const broken: ApiFailure = {
  ok: false,
  error: { code: "INTERNAL_ERROR", message: "The coffee catalog could not be loaded.", retryable: false },
};

type Loaded = { ok: true; snapshot: CatalogSnapshot } | { ok: false };

/**
 * Parses the records with the contract schema and checks referential integrity
 * once. A broken catalog is never served partially: every read reports an
 * internal error (the problems go to the server log only).
 */
export function loadCatalogRecords(records: unknown): Loaded {
  const parsed = catalogSnapshotSchema.safeParse(records);
  if (!parsed.success) {
    console.error("Catalog records do not match the contract.", parsed.error.issues.slice(0, 5));
    return { ok: false };
  }
  const problems = findCatalogProblems(parsed.data);
  if (problems.length > 0) {
    console.error("Catalog records failed integrity checks.", problems.slice(0, 10));
    return { ok: false };
  }
  return { ok: true, snapshot: parsed.data };
}

export function createCatalogService(load: () => Loaded): CatalogService {
  let cached: Loaded | null = null;
  const catalog = () => (cached ??= load());
  // Callers get their own copy, so nothing can mutate the shared snapshot.
  const copy = <T>(value: T): T => structuredClone(value);

  return {
    async list(filter) {
      const loaded = catalog();
      if (!loaded.ok) return broken;
      const filtered = filterCatalog(loaded.snapshot, filter);
      return filtered ? success(copy(filtered)) : notFound(filter.regionId ? "This region" : "This country");
    },
    async getBean(id) {
      const loaded = catalog();
      if (!loaded.ok) return broken;
      const bean = loaded.snapshot.beans.find((entry) => entry.id === id);
      return bean ? success(copy(bean)) : notFound("This bean");
    },
    async getDrink(id) {
      const loaded = catalog();
      if (!loaded.ok) return broken;
      const drink = loaded.snapshot.drinks.find((entry) => entry.id === id);
      return drink ? success(copy(drink)) : notFound("This drink");
    },
  };
}

/** Real catalog reads from the versioned records in src/modules/catalog/data/. */
export const catalogService: CatalogService = createCatalogService(() => loadCatalogRecords(CATALOG_RECORDS));
