import Link from "next/link";
import { ArrowIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="content-width status-page">
      <p className="eyebrow">404 / A little off the map</p>
      <h1>This stop isn’t in our atlas.</h1>
      <p>The page may have moved, or the address may be incomplete. There’s still plenty of room for curiosity.</p>
      <Link className="button button-primary" href="/">Back to home<ArrowIcon /></Link>
    </div>
  );
}
