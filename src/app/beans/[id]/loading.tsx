import { DetailSkeleton } from "@/modules/map-experience/ui/detail-skeleton";

/** Page-shaped skeleton while the bean loads, instead of the site-wide loading screen. */
export default function Loading() {
  return <DetailSkeleton kind="bean" />;
}
