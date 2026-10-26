import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-wordmark">Coffee Atlas<span className="wordmark-dot">.</span></p>
        <p>A little curiosity. A different cup.</p>
        <div className="footer-links">
          <span className="preview-label"><span aria-hidden="true" />Project preview</span>
          <Link href="/">Back to home <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </footer>
  );
}
