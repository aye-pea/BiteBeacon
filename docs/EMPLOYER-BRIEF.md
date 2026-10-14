# BiteBeacon — employer product briefing

Prepared September 30, 2026. Working name; trademark and domain availability not checked.

## Product pitch

BiteBeacon helps shoppers compare reported food ingredients with their own allergy profile. Users create an account, select their allergies, and scan a packaged food barcode. The app explains available allergen signals, shows its source, and prompts users to verify the physical label. The initial market is the United States.

This is decision-support information, not a guarantee that a food is safe. A barcode identifies a product record; it does not measure the contents of a package.

## What we can demonstrate today

| Feature | Current status |
|---|---|
| Responsive dashboard and navigation | Working React Native screens, browser-tested at desktop and phone widths |
| Allergy profile editor | Working; nine US major allergen groups, multiple selections |
| Demo session | Working without credentials; local memory only, starts with milk and peanuts |
| Barcode lookup | USDA FoodData Central (manufacturer-submitted) first, Open Food Facts fallback |
| Native camera scanning | Implemented using Expo Camera; physical-device acceptance still required |
| Manual barcode entry | Working, including UPC/EAN check-digit validation |
| Personalized result | Allergen signal, possible traces, insufficient data, or no match in available data |
| Source and ingredients | Visible ingredients, tags, traces, retrieval time and available source-update time |
| Recent scans | Session-only, capped at 30; clearable; recomputed against current saved profile |
| Fictional presentation samples | Four predictable examples, clearly labeled and separate from live lookup |
| Email signup/sign-in/sign-out | Implemented with Supabase Auth; requires project configuration and hosted verification |
| Private cloud allergy profile | Schema, owner-only policies and app connection implemented; deployment pending |
| Account deletion | Self-only database function and confirmation UI implemented; local database tests pass, hosted verification pending |
| Image recognition | Roadmap only; not represented as a working feature |

The supported groups are milk, eggs, peanuts, tree nuts, soy, wheat, fish, crustacean shellfish and sesame. This is not comprehensive allergy coverage. Wheat matching is not a celiac/gluten assessment, and crustacean shellfish does not include mollusks. See the [FDA overview](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies).

## Technology choices

| Layer | Choice | Purpose |
|---|---|---|
| App | React Native, Expo SDK 57, TypeScript | Shared iOS/Android app plus browser presentation |
| Design | Custom responsive React Native UI, Lucide icons | Clear, accessible flows and restrained green/cream visual identity |
| Barcode camera | Expo Camera | On-device barcode detection |
| Identity | Supabase Auth | Email/password identity and session management |
| Database | Supabase PostgreSQL | Durable account-owned allergy selections |
| Authorization | PostgreSQL row-level security | Enforce ownership at database boundary |
| Native token storage | Expo SecureStore | OS-backed storage for native session tokens |
| Food records | USDA FoodData Central; Open Food Facts fallback | External barcode-to-product data |
| Validation | TypeScript, Vitest, PGlite, Playwright, Expo Doctor | Code, decision logic, database policy and browser workflow checks |

Supabase keeps authentication and database management together while PostgreSQL provides a mature relational model. The app sends only the barcode and app-identification metadata to the product provider; allergy matching occurs on the device. The provider can also see normal request metadata such as IP address. No allergy profile or email is sent to it by this app.

## How a check works

1. User signs in or enters the visibly labeled demo.
2. User saves at least one supported allergy.
3. Camera or manual entry provides a barcode; check-digit validation rejects malformed codes.
4. App requests a product record, with timeout and request spacing.
5. Matching evaluates structured allergen tags, reported traces and a limited English ingredient vocabulary.
6. Result displays reasons, ingredients, provenance and limitations. No source data or unsupported language means an uncertain result unless a positive signal is already found.

| Result | What it means |
|---|---|
| Allergen signal found | A selected allergen is reported in structured tags or matched in ingredient text. Text matches can include warnings or negated phrases; review is still necessary. |
| May contain your allergen | Reported traces/cross-contact tags match a selection. |
| Not enough information | Missing fields, unsupported ingredient language or ambiguous gluten information prevents a meaningful negative comparison. |
| No selected allergens found | No match in available data; **not** allergy-free certification and **not** permission to eat. |

Community data can be stale, wrong, region-specific or incomplete. Recipe changes, manufacturing cross-contact and mislabeled packaging cannot be solved by barcode lookup alone. The ingredient dictionary is intentionally limited and has not undergone clinical validation.

## Security we have implemented

- Database policies prevent one authenticated user reading or changing another user's profile. Anonymous clients have no profile privileges.
- Public app configuration uses a publishable key, never a database password or service-role key. Authorization comes from the user's session and RLS.
- Native tokens use SecureStore. Browser auth stays in memory instead of local storage, so reloading requires sign-in.
- Allergy profiles store only user ID, supported selections, consent version and timestamps. Email/password handling is delegated to Auth; application tables do not store passwords.
- Camera images are not uploaded or saved. Scan history remains in memory and is cleared on session exit/reload.
- Account deletion takes caller identity from the authenticated session, not an arbitrary user ID supplied by the app.
- No ad SDK or analytics was added. Environment files are excluded from version control.

These are implemented controls, not an external security audit or compliance certification. Hosted email verification, password policy, SMTP, abuse controls, backups, restore testing, log retention and project access still need configuration and validation. Device compromise, stolen sessions and provider outages remain relevant risks. Details in [Security architecture](SECURITY.md).

## What remains before a connected employer demonstration

1. Create an employer-owned Supabase project and apply the included migration.
2. Configure email confirmation, minimum 12-character passwords, approved redirect URLs and email delivery.
3. Supply public project URL and publishable key through the local environment file.
4. Test two independent accounts: signup, verification, login, saving, relaunch, access isolation and account deletion.
5. Test camera permissions and multiple real UPC/EAN products on physical iOS and Android devices.

Until then, present this accurately as a **working local demonstration with real product lookup and a prepared cloud integration**, not as a deployed production service.

## Roadmap and launch gates

| Stage | Deliverable | Exit evidence |
|---|---|---|
| Current demo | Barcode flow, allergy editor, clear result states, employer documentation | Automated checks and browser walkthrough |
| Connected pilot | Hosted Auth/database, email delivery, account recovery, native builds, physical scanning | Two-user isolation and device acceptance checklist |
| Reliability and trust | Expert-reviewed taxonomy, regional datasets, source freshness rules, audited access, rate limiting, monitoring | Reviewed allergy test corpus, restore exercise, security assessment |
| Label recognition | Opt-in label photo, OCR text extraction, confidence display and user correction | Labeled test set, measured OCR failure rate, explicit confirmation flow |
| Release | Privacy/legal review, accessibility, distribution signing, support process | Approved release checklist and store review |

For image recognition, start with **ingredient-label OCR**, not visual guesses about food. A photo cannot reveal hidden ingredients or cross-contact. Any future upload requires explicit consent, retention/deletion rules, private storage and evaluation. Never convert an uncertain model response into a food-safety assurance.

## Employer decisions and ownership

- Confirm product name, audience, minimum user age and US-first scope.
- Assign owners for product, allergy-content review, security, support and vendor accounts.
- Approve authoritative data strategy: community provider alone is a demo dependency, not a complete assurance strategy.
- Choose hosting region, retention policy, incident response, data deletion handling and access controls.
- Approve vendor budget. Costs depend on active users, database/backups, email, native builds, store distribution, monitoring and later OCR; no production price promise is made here.
- Review Open Food Facts attribution and database-license obligations before storing or redistributing a product catalogue. Check current [provider API terms](https://openfoodfacts.github.io/openfoodfacts-server/api/) and [ODbL license](https://opendatacommons.org/licenses/odbl/1-0/).

## Suggested 30-second explanation

“BiteBeacon turns a food barcode into a personalized ingredient check. Users keep an allergy profile, scan a product, and see matching allergens, possible traces or gaps in the available data. We built the demo in React Native with Expo, and prepared Supabase authentication and PostgreSQL with owner-only access policies. The demo already performs live product lookup; the next milestones are hosted account validation and physical-device scanning. It supports label checking—it does not certify food as safe. Ingredient-label recognition is our next planned feature.”

## Technical sources

- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Open Food Facts API and data limitations](https://openfoodfacts.github.io/openfoodfacts-server/api/)
