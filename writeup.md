# Coffee Atlas: Personalized Coffee Discovery

**Live product:** [coffee-atlas-phi.vercel.app](https://coffee-atlas-phi.vercel.app)

## 1. Problem and Scoped PRD

Coffee-curious consumers can describe what they enjoy—fruity, chocolatey, creamy, or black—but often lack the origin knowledge and tasting vocabulary to choose an unfamiliar bean or regional drink. Coffee information is scattered across technical descriptions and geographic lists, leaving a practical question unanswered: **“What should I try next, and why?”**

Our idea was to connect personal taste with geographic discovery. The scoped product requirements were to let users explore coffee origins, understand sourced bean and drink descriptions, save preferences and favorites, and receive AI suggestions with understandable reasons. An AI trip map extends discovery into an ordered itinerary of coffee destinations.

### Target user and why AI

For some people coffee is a daily morning necessity; for others it is a hobby worth studying. We serve both. The **daily drinker** orders the same iced Americano every morning and wants a little variety without gambling on a cup they will not like. The **explorer** wants niche origins and new varieties, and wants to know why each one is worth trying. A third group, **coffee travelers**, plans trips around where coffee grows. Most of them do not speak the language of origins, processing methods, or tasting notes; they describe coffee the way they experience it: "sweet with milk," "not too sour," "something like the chocolatey one I liked." For all of them, Coffee Atlas is meant to be a personalized coffee recommendation and tasting plan.

The market is large: 66% of U.S. adults drink coffee every day, and 46% had a specialty coffee in the past day (NCA and SCA, *National Coffee Data Trends*, 2025). Yet the usual alternatives each miss something: roaster websites only sell their own beans, review and map apps rate places rather than personal taste, and general AI chatbots have no sourced catalog and can invent coffees.

AI is the right tool because the hard step is translation, not lookup. A filter can match a "chocolate" checkbox to a "chocolate" tag, but it cannot interpret free-text notes, weigh conflicting wishes (bright but low-acid, black but sweet), relate a home brewing method to a regional drink, or explain in plain language why an unfamiliar Ethiopian bean or Vietnamese drink suits this particular person. Ordering a set of destinations into a coherent trip around saved favorites is similarly open-ended. A language model handles this interpretation and explanation well, while our catalog supplies the facts: the model may only choose from catalog items the server has already selected, so the AI adds personalization without inventing coffees, places, or sources.

The capstone scope also required account registration/login, persistent personal data, Stripe sandbox payments, and a publicly deployed application. A successful user journey therefore runs from browsing and signup through a personalized result, saving, payment, and returning to the same account. Coffee sales, café availability, travel booking, and realistic transport scheduling are outside scope.

## 2. Solution and User Journey

Coffee Atlas combines an interactive globe with a curated catalog of **60 countries, 54 regions, 61 beans, 27 drinks, 33 pairings, and 135 sources**. Users move from a country to its regions and coffee details, follow source links, and save items they want to revisit.

In **Find your coffee**, users answer a short card-swipe quiz: one near-full-page card per option for acidity, sweetness, roast, and milk, head-to-head rounds that rank flavors, then preparation methods and optional notes. Any question can be skipped, and the full one-page form remains available as a preference editor. AI selects eligible catalog items and explains their fit and trade-offs. **Plan a trip** uses preferences and optionally saved items to produce a 2–6-stop route with numbered map pins, connecting lines, recommendations, and links to the same detail pages.

Each account receives three free successful recommendations. A one-time **USD $5.00 Stripe test payment** unlocks unlimited recommendations without moving real money. Trips currently remain outside the payment gate and do not consume recommendation credits; a server setting can include them in the same paid entitlement. Preferences, saved items, and paid access persist after logout and login.

### Business model

The pricing has three tiers so that each customer can choose the version that matches how much they value the product, a form of second-degree price discrimination. **Free** covers the globe, every catalog profile, and three AI recommendations. The **lifetime unlock** is the $5 one-time payment described above and is live today. A **monthly Atlas Pro** plan (planned, about $2.99/month) would add unlimited trips and new AI features first; the server switch that can place trips behind payment is already in place. Serving costs stay low because the map uses open-source MapLibre with no per-visit fee and the AI model is called only when a user asks.

## 3. Architecture and Key Decisions

The product is a single **Next.js application with React and TypeScript**, deployed on Vercel. Pages and API routes delegate to modules for the map, catalog, accounts/payments, recommendations, and trips. Shared **Zod contracts** validate data crossing module, HTTP, and model boundaries. **MapLibre** renders geographic exploration and trip routes.

Curated catalog records live in Git, where edits can be reviewed and checked for broken references. Personal state lives in **Turso/libSQL** in production and SQLite locally. This separation keeps editorial content consistent across maps and AI results while allowing geographic browsing independently of the user database. Passwords use salted scrypt hashing; HttpOnly cookie-based sessions identify users, and server queries enforce ownership of preferences and saved items. We store only what personalization needs (email, preferences, saved items, and payment status); card details are entered on Stripe's hosted checkout and never reach our servers. Prompts sent to the model contain taste preferences, notes, and catalog candidates, never the user's name or email.

Both AI features call **Anthropic through one server-only client**. The server constructs eligible catalog candidates before requesting an answer, then validates returned items, geographic relationships, duplicates, and reasons. Invalid answers receive one corrective retry; a second failure produces an error. Source links come from catalog records. These checks constrain outputs, while recommendation relevance and the accuracy of generated explanations still require evaluation.

Payment access is also controlled by the server. **Stripe Checkout** collects a simulated payment, and a signed, verified webhook grants the entitlement; returning to the website alone does not unlock access. Duplicate events are handled idempotently. Recommendation credits are claimed atomically only for validated results containing matches. Provider credentials remain on the server.

## 4. Implementation, Deployment, and Validation

The delivery path was **idea → scoped PRD → architecture → implementation → deployment**. The discovery problem defined the user journey and boundaries; shared contracts and feature modules supported parallel implementation; integrated features were then connected to hosted accounts, AI, and payments.

The merged application passed the recorded local verification suite: type checking, lint, **441 tests across 24 files**, a production build, and smoke checks covering **15 pages**. Tests cover account persistence, catalog integrity, invalid model output, quota enforcement, and payment events.

The live application uses Vercel, Turso, Anthropic, and Stripe sandbox. GitHub `main` is connected to Vercel: successful builds automatically publish to the existing public URL. The latest checked release, `f3536d6`, was verified as a ready production deployment triggered by a GitHub push.

On October 21, the team completed the public-site walkthrough and reported all steps passing: browsing, signup, saving, preference persistence, AI recommendations, trip generation, sandbox checkout, and retained data/access after re-login, including another recommendation after payment. Separately, a hosted Stripe checkout was verified to unlock access through its webhook. These results establish the working functional journey; broader quality and performance evaluation remains future work.

## 5. Lessons Learned

- **Agree on contracts before splitting the work.** Shared Zod schemas, stable catalog IDs, and placeholder modules on `main` let five people build in parallel. Where an interface was settled late, such as trip planning reading account data, integration took extra rounds of fixes.
- **Treat model output as untrusted input.** A model can return an unknown ID, a region in the wrong country, or a duplicate stop, so our tests cover each of these cases. Having the server choose eligible candidates and validate every answer, with one corrective retry, was more reliable than refining the prompt alone.
- **Server-side state must be the source of truth for money and quotas.** Paid access is granted only by a verified Stripe webhook, never by the checkout redirect. Testing exposed that parallel requests could exceed the free recommendation quota, which we fixed with atomic credit claims.
- **Merge strategy matters as much as code.** Our first catalog and trip pull requests had to be closed and redone because the branches diverged in shared files. Merging in a planned order, with merge commits that preserve history, made the final integration predictable.
- **Keep development data clearly separate.** Sample fixtures helped the map start before the real catalog existed, but they had to be gated so they could never appear in production.
- **Automated tests and live walkthroughs answer different questions.** Tests with controlled model responses prove error handling and access rules; only the public-site walkthrough proved that hosting, database, AI provider, and Stripe worked together.

## 6. Next Steps

Our direction comes from one idea: other coffee sites recommend what is popular; Coffee Atlas should be about the individual user.

- **Photo recognition:** photograph a bag of coffee in a store and get its origin, flavor profile, and fit with the user's taste, saved to a personal coffee archive.
- **Coffee community:** a forum where users rate and review beans and drinks.
- Add one-click export and deletion of account data before a public launch.
- Evaluate recommendation relevance with users and a repeatable preference test set, including contradictory requests.
- Improve trip ordering and overlapping map pins, while making the itinerary's discovery purpose clear.
- Expand sourced tasting information and prefilter candidates as the catalog grows to control AI latency and cost.
- Add account recovery, stronger abuse controls, operational monitoring, and refund/dispute support before wider commercial use.

Implementation details and supporting evidence are available in the [architecture](docs/ARCHITECTURE.md), [deployment record](docs/DEPLOYMENT.md), [recommendation evidence](src/modules/recommendations/EVIDENCE.md), and [trip report](src/modules/trip-map/README.md).
