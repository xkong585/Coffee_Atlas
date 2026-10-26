import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ArrowIcon(props: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BeanIcon(props: IconProps) {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="16" cy="16" rx="9" ry="13" transform="rotate(35 16 16)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M22.5 5.8C10 11.2 22 19 9.5 26.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CupIcon(props: IconProps) {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M5 11h18v8a9 9 0 0 1-18 0v-8ZM23 12h2a4 4 0 0 1 0 8h-2M4 29h22M11 3v3M17 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompassIcon(props: IconProps) {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.6" />
      <path d="m21.5 10.5-3.8 7.2-7.2 3.8 3.8-7.2 7.2-3.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M8 4h16v24l-8-5-8 5V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
