# PantryCheck

React Native / Expo allergy-aware barcode demo. US-first, with nine major allergen groups. Built from scratch in this workspace.

## Run the demo

```powershell
npm install
npm run web
```

Open the displayed local URL and choose **Explore employer demo**. No account, credentials or cloud project needed. The development preview currently uses http://localhost:8081.

For a phone, run `npm start` and open the Expo QR code in an SDK-compatible Expo Go app. Use a physical iOS or Android device for camera scanning. Device and computer need a reachable network connection. Native builds can be configured later; bundle IDs and signing credentials are intentionally not invented.

The browser supports real manual barcode lookup; camera scanning is enabled in the native app only. Sample products are fictional and visibly labeled. They are never silently substituted for missing real products.

## Employer handoff

- [Employer briefing](docs/EMPLOYER-BRIEF.md): pitch, features, stack, security, limitations, roadmap, decisions.
- [Five-minute demo script](docs/DEMO-SCRIPT.md).
- [Supabase setup](docs/SUPABASE-SETUP.md): real accounts and database activation.
- [Security architecture](docs/SECURITY.md).
- [Project wiki](wiki/README.md): decisions, current state, validation, next gates.

## Validation

```powershell
npm run check
npx playwright install chromium
npm run test:e2e
npm run build:web
npx expo-doctor
npm audit
selene .
```

Unit and database tests use Vitest. Database tests execute the migration and row-level security in PGlite's PostgreSQL engine with a small Supabase Auth fixture. Browser tests use Playwright. Hosted Supabase and real device checks remain separate acceptance gates.

Live provider smoke test, opt-in because external records and network availability change:

```powershell
$env:RUN_LIVE = '1'
npx playwright test tests/e2e/live.spec.ts
Remove-Item Env:RUN_LIVE
```

## Project structure

```text
App.tsx                       App screens and session flows
src/domain/allergens.ts       Pure matching rules and barcode validation
src/data/products.ts          Fictional fixtures and live API adapter
src/lib/supabase.ts            Auth client and secure native storage adapter
supabase/migrations/           PostgreSQL schema, owner policies, delete-account RPC
tests/                        Domain, database and browser tests
docs/                         Employer handoff and setup
wiki/                         Decisions and validation record
artifacts/                    Captured browser screenshots
```

This is a demonstration product, not a clinically validated food-safety system. No result is a safe-to-eat guarantee. Read the physical package and consult appropriate professional guidance for personal medical decisions.
