import Link from "next/link";
import { BeanIcon } from "@/components/icons";
import { AccountNav } from "@/modules/accounts/ui/account-nav";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="wordmark" href="/" aria-label="Coffee Atlas home">
          <BeanIcon width={25} height={25} />
          <span>Coffee Atlas<span className="wordmark-dot">.</span></span>
        </Link>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link href="/explore">Explore</Link>
          <Link href="/recommendations">Find your coffee</Link>
          <Link href="/trip">Plan a trip</Link>
          <Link href="/saved">Saved</Link>
        </nav>
        <AccountNav />
      </div>
    </header>
  );
}
