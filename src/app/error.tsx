"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="content-width status-page" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>Let’s try that again.</h1>
      <p>We couldn’t load this page. Try again, or return to the start.</p>
      <div className="button-row">
        <button className="button button-primary" onClick={reset} type="button">Try again</button>
        <Link className="text-link" href="/">Back to home</Link>
      </div>
    </div>
  );
}
