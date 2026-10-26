import type { CatalogSnapshot, LocationReference } from "@/contracts";

/**
 * Referential checks the contract schemas cannot express. Returns one line per
 * problem; an empty list means the snapshot is safe to serve.
 */
export function findCatalogProblems(snapshot: CatalogSnapshot): string[] {
  const problems: string[] = [];
  const ids = (label: string, records: readonly { id: string }[]) => {
    const seen = new Set<string>();
    for (const { id } of records) {
      if (seen.has(id)) problems.push(`Duplicate ${label} ID "${id}".`);
      seen.add(id);
    }
    return seen;
  };

  const countries = ids("country", snapshot.countries);
  ids("region", snapshot.regions);
  const beans = ids("bean", snapshot.beans);
  const drinks = ids("drink", snapshot.drinks);
  ids("pairing", snapshot.pairings);
  const sources = ids("source", snapshot.sources);
  const regionCountry = new Map(snapshot.regions.map((region) => [region.id, region.countryId]));

  const isoCodes = new Set<string>();
  for (const country of snapshot.countries) {
    if (!country.isoCode) continue;
    if (isoCodes.has(country.isoCode)) problems.push(`Duplicate ISO code "${country.isoCode}".`);
    isoCodes.add(country.isoCode);
  }

  const location = (owner: string, reference: LocationReference) => {
    if (!countries.has(reference.countryId)) {
      problems.push(`${owner} references unknown country "${reference.countryId}".`);
    } else if (reference.regionId !== null) {
      const parent = regionCountry.get(reference.regionId);
      if (parent === undefined) problems.push(`${owner} references unknown region "${reference.regionId}".`);
      else if (parent !== reference.countryId) {
        problems.push(`${owner} places region "${reference.regionId}" in "${reference.countryId}", but it belongs to "${parent}".`);
      }
    }
  };

  for (const region of snapshot.regions) {
    if (!countries.has(region.countryId)) problems.push(`Region "${region.id}" references unknown country "${region.countryId}".`);
  }
  for (const bean of snapshot.beans) location(`Bean "${bean.id}"`, bean.origin);
  for (const drink of snapshot.drinks) {
    const seen = new Set<string>();
    for (const reference of drink.associatedLocations) {
      const key = `${reference.countryId}/${reference.regionId ?? ""}`;
      if (seen.has(key)) problems.push(`Drink "${drink.id}" repeats location "${key}".`);
      seen.add(key);
      location(`Drink "${drink.id}"`, reference);
    }
  }

  const pairs = new Set<string>();
  for (const pairing of snapshot.pairings) {
    if (!beans.has(pairing.beanId)) problems.push(`Pairing "${pairing.id}" references unknown bean "${pairing.beanId}".`);
    if (!drinks.has(pairing.drinkId)) problems.push(`Pairing "${pairing.id}" references unknown drink "${pairing.drinkId}".`);
    const key = `${pairing.beanId}+${pairing.drinkId}`;
    if (pairs.has(key)) problems.push(`Pairing "${pairing.id}" repeats ${key}.`);
    pairs.add(key);
  }

  const cited = new Set<string>();
  const records = [
    ...snapshot.countries.map((record) => ["Country", record] as const),
    ...snapshot.regions.map((record) => ["Region", record] as const),
    ...snapshot.beans.map((record) => ["Bean", record] as const),
    ...snapshot.drinks.map((record) => ["Drink", record] as const),
    ...snapshot.pairings.map((record) => ["Pairing", record] as const),
  ];
  for (const [label, record] of records) {
    for (const sourceId of record.sourceIds) {
      cited.add(sourceId);
      if (!sources.has(sourceId)) problems.push(`${label} "${record.id}" cites unknown source "${sourceId}".`);
    }
  }
  for (const source of snapshot.sources) {
    if (!cited.has(source.id)) problems.push(`Source "${source.id}" is not cited by any record.`);
  }
  return problems;
}
