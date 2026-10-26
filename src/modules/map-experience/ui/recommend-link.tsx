import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { type RecommendationLinkInput, recommendationHref } from "@/modules/map-experience/lib/links";

/**
 * Deep link into /recommendations with the documented query names. The
 * recommendation page validates and confirms the context; this link only
 * passes stable IDs and the requested scope.
 */
export function RecommendLink({
  context,
  children,
  variant = "button",
}: {
  context: RecommendationLinkInput;
  children: string;
  variant?: "button" | "text";
}) {
  return (
    <Link
      className={variant === "button" ? "button button-primary" : "text-link"}
      href={recommendationHref(context)}
      prefetch={false}
    >
      {children}
      <ArrowIcon />
    </Link>
  );
}
