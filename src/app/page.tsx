import Link from "next/link";
import { ArrowIcon, BeanIcon, CompassIcon, CupIcon } from "@/components/icons";
import { CoffeeGlobe } from "@/components/coffee-globe";

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="hero content-width" aria-labelledby="home-heading">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow"><span className="small-rule" />Follow your curiosity</p>
          <h1 id="home-heading">A world of coffee.<br />A taste of<br /><em>somewhere new.</em></h1>
          <p className="hero-description">From the place a bean grows to the way a cup is shared. Explore coffee through its origins, its traditions, and your own taste.</p>
          <div className="button-row">
            <Link href="/explore" className="button button-primary">Explore the map<ArrowIcon /></Link>
            <Link href="/recommendations" className="text-link">Find your coffee<ArrowIcon /></Link>
          </div>
        </div>
        <div className="hero-illustration"><CoffeeGlobe /><span className="illustration-index" aria-hidden="true">FIELD NOTES / 001</span></div>
      </section>

      <section className="discovery-section content-width" aria-labelledby="discovery-heading">
        <div className="section-topline">
          <h2 id="discovery-heading">Every cup has a point of view.</h2>
          <span className="eyebrow">Three ways to begin</span>
        </div>
        <div className="discovery-grid">
          <Link href="/explore" className="discovery-link">
            <div className="discovery-meta"><span className="discovery-number">01 / ORIGIN</span><BeanIcon /></div>
            <h3>Start with a place.</h3>
            <p>Follow coffee back to where it grows. Discover the geography behind the bean.</p>
            <span className="discovery-action">Explore origins<ArrowIcon /></span>
          </Link>
          <Link href="/explore" className="discovery-link">
            <div className="discovery-meta"><span className="discovery-number">02 / TRADITION</span><CupIcon /></div>
            <h3>Meet a different cup.</h3>
            <p>Get to know regional drinks, local preparations, and the stories around them.</p>
            <span className="discovery-action">Discover coffee culture<ArrowIcon /></span>
          </Link>
          <Link href="/recommendations" className="discovery-link">
            <div className="discovery-meta"><span className="discovery-number">03 / YOUR TASTE</span><CompassIcon /></div>
            <h3>Find your next favorite.</h3>
            <p>Connect what you like with something unfamiliar, one thoughtful choice at a time.</p>
            <span className="discovery-action">Follow your taste<ArrowIcon /></span>
          </Link>
        </div>
      </section>
      <aside className="preview-banner content-width" aria-label="Inside the atlas">
        <span className="preview-label"><span aria-hidden="true" />Inside the atlas</span>
        <p>Discover coffee-growing regions and local drink traditions, with source links to keep exploring.</p>
      </aside>
    </div>
  );
}
