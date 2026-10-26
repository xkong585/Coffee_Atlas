/**
 * Plain-text wording for map markers and tooltips, also used by the
 * server-rendered panels (format.ts). Pure, so it can be unit tested.
 */

export interface ContentCounts {
  regionCount?: number;
  beanCount: number;
  drinkCount: number;
}

const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * ["3 regions", "1 bean"]: zero counts are left out (a drinks-only country reads
 * "2 drinks"), regions only appear when given (country markers), and a place
 * with nothing recorded yet says so.
 */
export function countsLabel({ regionCount, beanCount, drinkCount }: ContentCounts): string[] {
  const parts: string[] = [];
  if (regionCount) parts.push(plural(regionCount, "region", "regions"));
  if (beanCount) parts.push(plural(beanCount, "bean", "beans"));
  if (drinkCount) parts.push(plural(drinkCount, "drink", "drinks"));
  return parts.length > 0 ? parts : ["Nothing recorded yet"];
}

/** "Ethiopia — 3 regions, 3 beans, 2 drinks" or "Sidama, Ethiopia — 1 bean, 1 drink". */
export function markerAriaLabel(name: string, counts: ContentCounts, parentName?: string | null): string {
  const place = parentName ? `${name}, ${parentName}` : name;
  return `${place} — ${countsLabel(counts).join(", ")}`;
}

/** Visible dot diameter in pixels: grows gently with the amount of curated content. */
export function markerDiameter(total: number): number {
  const amount = Number.isFinite(total) && total > 0 ? total : 0;
  return Math.round(Math.min(24, 12 + 2.4 * Math.sqrt(amount)));
}
