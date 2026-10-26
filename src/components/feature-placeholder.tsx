import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon, CompassIcon } from "@/components/icons";

type Action = { href: string; label: string };

export function FeaturePlaceholder({
  label,
  title,
  description,
  icon,
  primaryAction = { href: "/", label: "Back to home" },
  secondaryAction,
  children,
}: {
  label: string;
  title: string;
  description: string;
  icon?: ReactNode;
  primaryAction?: Action;
  secondaryAction?: Action;
  children?: ReactNode;
}) {
  return (
    <section className="feature-placeholder" aria-labelledby="feature-heading">
      <div className="placeholder-mark">{icon ?? <CompassIcon width={34} height={34} />}</div>
      <p className="eyebrow">{label}</p>
      <h1 id="feature-heading">{title}</h1>
      <p className="placeholder-description">{description}</p>
      {children}
      <div className="button-row">
        <Link className="button button-primary" href={primaryAction.href}>{primaryAction.label}<ArrowIcon /></Link>
        {secondaryAction && <Link className="text-link" href={secondaryAction.href}>{secondaryAction.label}<ArrowIcon /></Link>}
      </div>
      <p className="placeholder-note">This feature is not available in the project preview.</p>
    </section>
  );
}
