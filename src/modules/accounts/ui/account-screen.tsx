import "server-only";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { catalogService } from "@/modules/catalog/server/service";
import { beanPath, drinkPath } from "@/modules/map-experience/lib/links";
import { AccountPanel } from "./account-panel";
import { AuthForm } from "./auth-form";
import { CheckoutResult } from "./checkout-result";
import { type SavedLookup, SavedList } from "./saved-list";
import { UpgradePanel } from "./upgrade-panel";
import styles from "./accounts.module.css";

export type AccountView =
  | { view: "login" | "signup"; next: string | null }
  | { view: "account" | "saved" }
  | { view: "upgrade"; includesTrips?: boolean }
  | { view: "checkout-result"; sessionId: string | null; canceled: boolean };

const content: Record<AccountView["view"], { breadcrumb: string; label: string; title: string; description: string }> = {
  login: {
    breadcrumb: "Sign in",
    label: "Your coffee atlas",
    title: "Good to see you here.",
    description: "Sign in to return to your preferences, saved coffee and recommendations.",
  },
  signup: {
    breadcrumb: "Create an account",
    label: "Your coffee atlas",
    title: "Make room for a little discovery.",
    description: "An account keeps your taste preferences and saved beans and drinks together, and includes 3 free AI recommendations.",
  },
  account: {
    breadcrumb: "Account",
    label: "A taste of your own",
    title: "Your journey, all in one place.",
    description: "Your details, recommendation plan and saved taste preferences.",
  },
  saved: {
    breadcrumb: "Saved",
    label: "Keep your curiosity close",
    title: "A collection worth coming back to.",
    description: "The beans and drinks you want to try, saved from the atlas and your recommendations.",
  },
  upgrade: {
    breadcrumb: "Plans",
    label: "More to explore",
    title: "Keep the recommendations coming.",
    description: "Every account gets 3 AI recommendations free. One payment unlocks unlimited recommendations.",
  },
  "checkout-result": {
    breadcrumb: "Checkout status",
    label: "Checkout status",
    title: "Your checkout",
    description: "Access changes only after Stripe confirms the payment to our server.",
  },
};

/** Names and links for saved items; the saved list itself is read in the browser for the signed-in user. */
async function savedLookup(): Promise<SavedLookup> {
  const result = await catalogService.list({});
  if (!result.ok) return {};
  const countries = new Map(result.data.countries.map((country) => [country.id, country.name]));
  const regions = new Map(result.data.regions.map((region) => [region.id, region.name]));
  const lookup: SavedLookup = {};
  for (const bean of result.data.beans) {
    const place = [bean.origin.regionId ? regions.get(bean.origin.regionId) : null, countries.get(bean.origin.countryId)].filter(Boolean).join(", ");
    lookup[`bean:${bean.id}`] = { name: bean.name, href: beanPath(bean.id), place: place || null };
  }
  for (const drink of result.data.drinks) {
    const place = [...new Set(drink.associatedLocations.map((location) => countries.get(location.countryId)))].filter(Boolean).join(", ");
    lookup[`drink:${drink.id}`] = { name: drink.name, href: drinkPath(drink.id), place: place || null };
  }
  return lookup;
}

export async function AccountScreen(props: AccountView) {
  const selected = content[props.view];
  return (
    <div className="content-width interior-page">
      <Breadcrumbs items={[{ label: selected.breadcrumb }]} />
      <header className={styles.intro}>
        <p className="eyebrow">{selected.label}</p>
        <h1>{selected.title}</h1>
        <p className={styles.lede}>{props.view === "upgrade" && props.includesTrips
          ? "Every account gets 3 AI recommendations free. One payment unlocks unlimited recommendations and AI trip planning."
          : selected.description}</p>
      </header>
      {props.view === "login" || props.view === "signup" ? <AuthForm mode={props.view} next={props.next} /> : null}
      {props.view === "account" ? <AccountPanel /> : null}
      {props.view === "saved" ? <SavedList lookup={await savedLookup()} /> : null}
      {props.view === "upgrade" ? <UpgradePanel includesTrips={props.includesTrips} /> : null}
      {props.view === "checkout-result" ? <CheckoutResult sessionId={props.sessionId} canceled={props.canceled} /> : null}
    </div>
  );
}
