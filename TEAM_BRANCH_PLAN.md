# Five-Person Branch and Responsibility Plan

**Project:** Personalized Coffee Discovery Through a World Map  
**Product scope:** `writeup.md`
**Team:** Five people; one main foundation owner and four feature owners.

## 1. Working Model: Main Is Completed First

**Your assignment is to finish an independently runnable foundation on `main` before the other four members start their branches. Your completion must not depend on their code, services, data, or credentials.**

There are two distinct completion points:

- **Main foundation complete:** Your work is finished and the other four members can develop from the same baseline commit.
- **Final product complete on main:** The four feature owners have implemented and integrated their work into the existing `main` branch. This later integration is their responsibility.

Member 3, the catalog/data owner, will act as the **integration coordinator after the handoff**. The coordinator manages shared changes, merges, deployment, and final documentation assembly. Each feature owner fixes issues in their own module. This plan does not assign you a later integration or deployment development task.

These are development and integration checkpoints for one final product, not separate product releases.

## 2. Ownership Overview

| Person | Branch | Main responsibility | Deliverable |
|---|---|---|---|
| **You — Member 1** | `main` | Independent foundation, shared conventions, interfaces, and handoff documentation | A runnable base project that all four branches extend |
| **Member 2** | `codex/map-experience` | Map interactions and coffee/drink exploration screens | World → country → region exploration, detail pages, and links between beans and drinks |
| **Member 3** | `codex/catalog-data` | Coffee content, catalog storage/read access, accounts, saved information, Stripe test payments, and post-handoff integration | Sourced catalog and data interfaces; working login, persistence, checkout, and paid-access state; integrated, deployed final product |
| **Member 4** | `codex/ai-trip-map` | AI-generated future coffee destination trip map | A validated, catalog-grounded trip itinerary drawn as a route on the existing globe with a stop-by-stop list |
| **Member 5** | `codex/ai-recommendations` | Preference input, AI backend, and recommendation screens | Working personalized recommendations with grounded explanations |

Member 5 recommends **what coffee to drink**; Member 4 plans **where to go to drink it**. Both use one shared server-side AI client and key handling.

The four feature branches must start from the completed main foundation. Each member should use their own clone or working directory. No additional feature branch is assigned to you.

## 3. Your Assignment: Main Foundation

### 3.1 Build the shared application

- Choose and document the application framework, language, package manager, and local development commands.
- Create the project structure, dependency configuration, basic build checks, and configuration template. Include environment-variable names without secret values.
- Implement the shared layout, navigation, visual styles, reusable basic components, and a simple project landing page.
- Create the module directories and real route entry files that teammates will extend. Every route must render a useful placeholder or empty state before feature development begins.
- Keep the foundation runnable without a live database, authentication provider, model API, or Stripe account. Feature-specific service setup belongs to the feature owners.

### 3.2 Define the integration interfaces yourself

Prepare a short interface document and, where supported by the chosen stack, shared types or schemas. Define the inputs, outputs, and error states for:

| Interface | What main must define | Later implementation owner |
|---|---|---|
| Catalog | Country/region hierarchy; stable bean and drink IDs; item detail fields; sources; pairing relationships | Member 3 |
| Account/session | How modules obtain the current user and distinguish signed-out, signed-in, and unavailable states | Member 3 |
| Preferences | Shared preference fields and operations to load and save them | Member 3 owns persistence; Member 5 owns input UI |
| Saved items | Saving/removing a bean or drink by type and stable ID; retrieving the user's saved list | Member 3 |
| Recommendations | Geographic context, requested item type, preference input, result IDs, explanations, source references, and no-match/error responses | Member 5 |
| Trip itinerary | Preference/saved-item input, ordered stops using catalog country/region IDs, per-stop recommendations and reasons, and error responses | Member 4 (added after handoff, coordinated with Member 3) |
| Paid access | A named capability and an authoritative server-side access check | Member 3 provides access state; the owner of the paid feature enforces it |

For catalog records, distinguish **where beans grow**, **where drinks are culturally associated**, and **which bean–drink combinations are suggested**. Define source references and optional fields explicitly so teammates do not invent incompatible representations.

Provide small, clearly labeled development fixtures to illustrate these contracts. Main only needs example structures, not the researched final catalog.

### 3.3 Make every module slot safe to run

- Include the placeholder implementations in main itself. Do not import files that are expected to arrive from a later branch.
- Use explicit unavailable/empty states for unconnected features. A placeholder must not pretend that a user has logged in, received a real AI response, or paid successfully.
- Put example fixtures behind a development-only mechanism. Default access to protected capabilities must remain denied until a real account/access implementation is connected.
- Document exactly which entry points each member replaces and how their module connects to the shared application.

### 3.4 Provide the handoff package

The main handoff must include:

1. A README with installation, start, build, and baseline verification commands.
2. The shared interface definitions and representative fixtures.
3. A file/directory ownership guide and route ownership map.
4. A configuration example and explanation of which member will provision each service.
5. This branch plan and the current write-up draft.
6. A pushed baseline commit that all four members can access, with repository permissions sufficient for the coordinator's later merges.

Record any product or technical decisions already made. If a detail is still open, assign it to a feature owner or the integration coordinator; do not make your completion depend on their future decision. In particular, the coordinator (who also owns accounts and payments) and the paid feature's owner must settle the actual paid benefit before implementing payment-dependent behavior.

### 3.5 When your main work is finished

Your assignment is complete when someone can clone the baseline, install dependencies, start and build the application, and visit every module entry point using only what is already in main. The README, interfaces, fixtures, and extension points must be usable without any feature branch being merged.

**A functioning map, researched catalog, real login, model integration, Stripe checkout, and final hosted product are not prerequisites for this foundation handoff.** They are the four feature owners' deliverables below.

## 4. Member 2: Map and Exploration

**Branch:** `codex/map-experience`

### Tasks

1. Replace the exploration placeholder with an interactive world map using the foundation's framework and shared styles.
2. Implement country selection, supported regional drill-down, and navigation back to broader views. Show which locations have curated content.
3. Build coffee bean and regional drink detail screens using the catalog interface. Include relevant geography, flavor, preparation/cultural information, and visible source links.
4. Present bean origin, drink association, and suggested pairings distinctly. Link between related beans and drinks without implying they must come from the same place.
5. Let users start a recommendation from the selected country, region, bean, or drink. Pass stable identifiers and geographic context to the AI module through the agreed interface.
6. Add the shared save action supplied by Member 3 to relevant item views. Do not create a second saved-items store.
7. Handle loading, unavailable content, map errors, and narrow-screen layouts. Keep basic catalog information reachable if the map cannot render.

### Dependencies and handoff

Start immediately from main's fixtures. Connect to Member 3's real catalog and save behavior when available. Coordinate recommendation links with Member 5, and agree with Member 4 on how the trip route is drawn on the existing globe.

Deliver working exploration/detail screens, documented route integration, and a short walkthrough of world → country → region → item → recommendation. Contribute screenshots and presentation/demo material for the final submission.

## 5. Member 3: Catalog, Data, Accounts, Payments, and Integration

**Branch:** `codex/catalog-data`

### Catalog tasks

1. Set up the catalog database/storage and implement the catalog interfaces defined in main.
2. Agree on supported countries and regional coverage with the feature owners, then collect the required bean and drink content. No fixed country count is assumed by this plan.
3. Create consistent records for countries/regions, bean profiles, drinks, sources, and their relationships. Use the IDs and required fields already defined by main.
4. Record source URLs and maintain concise, evidence-backed descriptions. Include geography, flavor, processing, preparation, and cultural information where supported. Leave unknown values explicit.
5. Distinguish documented traditions from suggested pairings. A drink's cultural association must not automatically become its bean origin.
6. Provide a reproducible import/seed process and the read operations needed by Map, AI recommendations, and the AI trip map. Publish a small set of real, sourced records early so integration can begin.
7. Check for broken references, duplicate IDs, missing sources, and invalid geographic relationships. Deliver the full agreed coverage before the final demonstration.

### Accounts, saved information, and payment tasks

1. Configure the authentication service and implement registration, login, logout, session handling, and the account/session interface from main.
2. Build the account screens and protect user-specific operations. A user must only access their own preferences, saved items, and purchase state.
3. Implement storage and load/save operations for the shared preference format. Member 5 owns the preference questionnaire; this branch owns its persistence.
4. Implement saved-item storage, the saved-items screen, and a reusable save action for Map and AI. Store stable catalog references rather than copies of coffee content.
5. Provide a server-side way for the trip map to read the current user's preferences and saved items.
6. Settle one payment model and its concrete user benefit with the paid feature's owner. This plan does not prescribe a subscription, price, or unapproved premium feature.
7. Configure Stripe in sandbox/test mode and build the payment entry screen, checkout creation, and return/cancel experience.
8. Verify payment events on the server, update the user's access state, and handle duplicate events without duplicating benefits. A browser redirect alone must not grant access.
9. Provide a server-readable access check that the paid feature owner can use. Cover unsuccessful/canceled payments and delayed access updates.

### Integration coordinator tasks after the main handoff

- Take responsibility for shared configuration, integration bindings, dependency changes, and contract revisions. Coordinate revisions with affected feature owners.
- Organize pull requests and merge the four branches into `main` in a dependency-aware order. Each author resolves their feature's implementation issues.
- Verify the combined catalog and account schema/import process on a fresh database.
- Provision hosting and coordinate deployment configuration with the service owners. Final deployment must not depend on you returning to complete the main foundation.
- Replace development placeholders and fixtures with real feature implementations for the final product.
- Coordinate end-to-end checks on the live URL, including authentication and payment behavior, and track integration defects to their feature owners.
- Assemble the final README, actual architecture diagram, design rationale, and report from all members' contributions. Keep the final write-up within the professor's 4–5-page limit.

### Deliverable

A source-backed catalog consumed by Map, AI recommendations, and the trip map; an actual registration → login → save/revisit → Stripe test checkout → access-update journey; and a final integrated deployment and submission materials. The recommendation questionnaire and AI result screens belong to Member 5, and the trip itinerary belongs to Member 4.

## 6. Member 4: AI-Generated Coffee Destination Trip Map

**Branch:** `codex/ai-trip-map`

### Tasks

1. Build a trip-planning entry point that sends the signed-in user's preferences and saved items to the server. Read them through Member 3's account interfaces; do not create a second preference or saved-item store.
2. Implement a server-side trip-planning flow that calls the AI model with the server-held API key. The key lives only in a server environment variable and never reaches the browser.
3. Give the model the catalog's existing country and region IDs as the only allowed stops. The model selects and orders stops; it must not invent places.
4. Validate the model output on the server: every stop must be a real catalog country/region ID, regions must belong to their country, and each stop must carry a recommendation and a reason. Reject or repair invalid output rather than displaying it.
5. Return a structured itinerary: ordered stops, a recommended bean or drink (catalog ID) for each stop, and the reason it fits the user.
6. Draw the itinerary as a route on the existing map globe and show a stop-by-stop list beside it, with links to Member 2's country, region, bean, and drink pages. Coordinate the map layer with Member 2 rather than building a second map.
7. Handle missing preferences, too little catalog coverage, invalid model output, and provider failures with clear messages and recovery options.
8. If the agreed paid benefit is the trip map, enforce Member 3's server-side access decision before running it.
9. Document the trip-planning design and show representative normal and failure cases.

### Dependencies and handoff

Share one server-side AI client and key handling with Member 5: Member 5 recommends what coffee to drink, Member 4 plans where to go to drink it. Add the itinerary contract to `src/contracts/` together with Member 3. Develop against main's fixtures and the map's development preview data, then connect the real catalog, account data, and model service. Supply the coordinator with configuration instructions.

Deliver a real preferences/saved items → AI trip plan → validated itinerary → route on the globe → stop detail flow. Hardcoded itineraries do not count as the completed feature.

## 7. Member 5: AI Recommendations and Preference Experience

**Branch:** `codex/ai-recommendations`

### Tasks

1. Build the preference input screen using understandable choices and natural-language input. Use the shared preference format and Member 3's persistence interface.
2. Configure the model service and implement a server-side recommendation flow using real catalog entries from Member 3.
3. Interpret preferences, identify eligible candidates, and generate explanations that relate the selection to the user's tastes and drinking habits.
4. Support the requested geographic context and beans, drinks, or both. Clarify whether the user wants results within the selected area or across supported locations.
5. Return stable catalog IDs, recommendation reasons, relevant trade-offs, and source references. Validate outputs before displaying them; do not invent unavailable items or unsupported historical claims.
6. Build recommendation results with links to Member 2's detail views and the reusable save behavior from Member 3.
7. Handle unclear or conflicting preferences, insufficient catalog information, empty results, invalid model output, and provider failures with useful recovery options.
8. If the agreed paid benefit belongs to the AI module, implement its actual behavior and enforce Member 3's server-side access decision. A payment button without a working unlocked benefit is incomplete.
9. Document the recommendation design, important limitations, and evidence from representative normal and failure cases. Keep model credentials on the server, and share the server-side AI client and key handling with Member 4's trip map.

### Dependencies and handoff

Develop the input/results screens and contract behavior from main's fixtures, then connect the real catalog, account persistence, and model service. Supply the coordinator with configuration instructions and reproducible recommendation examples.

Deliver a real preference → catalog-backed AI recommendation → explanation → detail/save flow. Hardcoded recommendation results do not count as the completed AI backend.

## 8. Shared Ownership and Conflict Rules

| Area | Before handoff | After handoff |
|---|---|---|
| Shared layout, configuration, interface definitions, integration bindings | You | Member 3 coordinates changes with affected owners |
| Map and item-detail screens | Main creates placeholders | Member 2 |
| Catalog records, catalog schema, import/read operations | Main defines contracts/fixtures | Member 3 |
| Authentication, preferences/saved-item storage, payment/access state | Main defines contracts/placeholders | Member 3 |
| AI trip map: itinerary planning, validation, and route on the globe | Not in main | Member 4 |
| Preference questionnaire, AI backend, recommendation screens | Main defines contracts/placeholders | Member 5 |

Each member owns both the frontend and backend work assigned to their feature. Main is not a future backend service that they must wait for you to implement.

Feature owners should coordinate changes to shared files before editing them. If the selected framework uses a single schema or central routing file, Member 3 owns its combined edits after handoff. Domain owners provide their required additions. Keep dependency files and lockfiles consistent when merging.

## 9. Integration Sequence After Main Is Complete

The following work is coordinated by Member 3 and performed by the four feature owners:

1. **Start from the common baseline.** Create all four branches from the same completed main commit.
2. **Connect shared services.** Integrate catalog storage, representative sourced records, account/session behavior, and preference persistence early.
3. **Connect exploration, recommendations, and the trip map.** Replace Map/AI fixtures with real catalog access; connect saved preferences, item links, and saved selections; feed the trip map real catalog IDs and draw its route on the globe.
4. **Complete payment and access.** Connect Stripe test events to the actual paid feature and confirm access persists across sessions.
5. **Deploy and verify together.** Run the complete journey at the public URL, address integration defects, and finish the report/demo materials.

Map, AI recommendations, and the trip map can develop concurrently against the completed main interfaces while Catalog and Accounts are implemented. Use small, runnable pull requests from the same assigned branches; do not postpone all integration until every feature is finished. Synchronize branches with merged main changes before final review.

## 10. Final Product Responsibilities

| Professor's requirement | Responsible owner(s) |
|---|---|
| Clear problem, target user, and product scope | Your initial write-up; Member 3 maintains the final version against the implemented product |
| User registration and login | Member 3 |
| Map exploration and connected bean/drink information | Member 2 + Member 3 |
| AI backend delivering core value | Member 5, using Member 3's catalog |
| Stripe sandbox/test payment and actual access change | Member 3 + the owner of the paid feature |
| AI errors and edge cases | Member 5 |
| Account/payment errors, access isolation, and payment secrets | Member 3 |
| AI trip map with validated, catalog-grounded stops | Member 4, using Member 3's catalog and account data and the shared AI client |
| Trip map errors and edge cases | Member 4 |
| Catalog/map empty states and content correctness | Member 2 + Member 3 |
| Stable public URL and deployment configuration | Member 3, with AI service configuration supplied by Members 4 and 5 |
| Structured repository, README, architecture diagram, design decisions | Your baseline; Member 3 assembles final updates from feature owners |
| Concise final write-up, lessons, and next steps | Member 3 assembles; each feature owner contributes actual work and findings |
| Live demo and clear team contributions | Member 2 organizes the walkthrough; all five explain their own contribution |

Before submission, the four feature owners must demonstrate the integrated journey on the public URL: register/log in → explore a country/region → inspect beans and drinks → enter preferences → receive real AI recommendations → generate an AI trip map and follow its route on the globe → save and revisit an item → complete a Stripe test payment → use the agreed paid benefit.

The final product must use real catalog storage, authentication, AI, and Stripe test integration. Development fixtures and placeholder success states must not substitute for completed features. Each owner supplies a short verification record and fixes defects in their area; the coordinator confirms the complete system works together.
