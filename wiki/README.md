# PantryCheck project wiki

Project second brain. Update after material behavior, architecture or acceptance changes.

## Reported allergen display — 2026-09-30

- Reported allergen tags and traces now remove language prefixes such as `en:`, replace tag hyphens with spaces, and display uppercase names with the same body typography as reported ingredients (for example, `GLUTEN, MILK, PEANUTS, SOYBEANS`).
- Formatting is display-only; original provider values, assessment matching and missing-data messages remain unchanged.
- Validation: TypeScript passed; all 62 unit/database tests passed. No Lua/Luau changed; Selene not applicable.

## Decisions — 2026-09-30

- User chose **US first** and **local demo + Supabase setup**.
- React Native / Expo with TypeScript; no existing project files needed preservation.
- Working brand: PantryCheck. Custom calm green/cream UI. Responsive layouts use flex and percentage widths; native text respects system font scaling. Roblox `Scale` / `TextScaled` properties do not exist in React Native.
- Real email auth and PostgreSQL persistence are prepared through Supabase; demo does not simulate successful signup or claim accounts are stored.
- Nine supported US major-allergen groups; no custom allergy text, celiac classification or severity recommendation in v0.1.
- Never label products “safe.” Incomplete or unsupported-language data remains uncertain. Structured positives override missing fields; traces remain distinct. Limited English synonym detection is conservative and may flag negated statements.
- Positive barcode results use live Open Food Facts; deterministic fictional samples are separate explicit actions. No fallback from failed real lookup to fake product.
- Native camera scanning, manual lookup on web. UPC-E is detected but requires full UPC entry; expansion deferred.
- Demo profiles and history memory-only. Connected cloud profile private through RLS. No scan history table, no uploaded camera media.
- Image recognition deferred to opt-in label OCR with user verification. No inference that appearance proves allergen absence.

## Validation record

Latest final results recorded after implementation below. See `tests/` for repeatable checks.

- TypeScript compilation passed.
- 47 domain/parser/barcode/network and PostgreSQL policy tests passed.
- Browser employer flow passed: four outcomes, zero-selection block, profile update, history recalculation, invalid barcode, session clearing.
- Browser mobile flow passed at 390 × 844: navigation, no-result response, fictional result.
- Real browser API lookup passed for `3017620422003`, returning Nutella and an allergen signal for default profile. A custom request-header CORS failure was found and fixed.
- Production web export and iOS/Android JavaScript/Hermes bundle exports passed; Expo Doctor passed 21/21 compatibility/config checks. Bundle exports are not signed native app builds or device tests.
- `npm audit` reported zero known vulnerabilities after scoped xcode/uuid override; xcode UUID generation smoke test passed.
- Selene ran with 0 errors/warnings; no Lua/Luau application files exist, so TypeScript/Vitest are meaningful app checks.
- Desktop/mobile screenshots inspected; clipped mobile heading fixed with flexible title container. Decorative package art hidden on narrow screens to prioritize scanning.
- No Supabase hosted project configured. RLS migration tests run on PGlite PostgreSQL with simulated Auth roles/UID, not hosted Supabase.
- No physical iOS/Android device camera run, native release build, app-store deployment, external security audit or medical-content validation performed.

## Next acceptance gates

1. Employer-owned Supabase connection and all hosted checks in [setup](../docs/SUPABASE-SETUP.md).
2. Physical device: permissions denied/granted, EAN-8/EAN-13/UPC-A, duplicate suppression, poor light, no network, background/foreground, secure session restore, font scaling and screen-reader QA.
3. Pilot reliability: password recovery, email changes, native identifiers/signing/assets, provider identification/v3 migration and expanded parsing tests.
4. Production: expert matching review, legal/privacy review, security assessment, abuse protection, retention/backup/restore controls and distribution.

## Handoff index

- [Employer briefing](../docs/EMPLOYER-BRIEF.md)
- [Demo script](../docs/DEMO-SCRIPT.md)
- [Database setup](../docs/SUPABASE-SETUP.md)
- [Security details](../docs/SECURITY.md)

## Hosted setup progress — 2026-09-30

- Private GitHub repository created: https://github.com/derelffz/AllergyApp. Local `origin` points there.
- GitHub Actions checks TypeScript, 47 domain/database tests, deterministic browser tests and web export. Workflow has read-only repository permission and needs no Supabase secrets.
- Local pre-upload validation: TypeScript passed; 47 tests passed; two browser tests passed; live provider test intentionally skipped; web export passed; Selene reported zero issues.
- Supabase organization `allergy app` exists on Free plan. PantryCheck creation form prepared for East US (North Virginia), Data API enabled, automatic table exposure disabled and automatic RLS enabled. Project creation awaits user credential submission; schema and app connection are not deployed yet.

## Connected Supabase — 2026-09-30

- Project: PantryCheck (`ebfhthdlioufhebdmvgl`), organization `allergy app`, Free plan, East US (North Virginia).
- Private repository: https://github.com/derelffz/AllergyApp, production branch `main`, working directory `.`. Supabase GitHub integration enabled with production deployment; paid preview branching remains disabled.
- GitHub deployed and recorded migration `202609300001_profiles`. Do not rerun its CREATE statements manually.
- Hosted database verification passed: profiles RLS enabled and forced, four owner policies, anonymous SELECT and deletion RPC denied. Anonymous REST requests return 401 with permission-denied errors.
- `supabase/verify-hosted-rls.sql` passed against hosted database: synthetic owner insert, cross-user read/update/delete blocked, self-account deletion preserves other owner. Entire fixture transaction rolled back. This simulates database JWT identity; it does not replace two real confirmed-user REST sessions.
- Email/password enabled, email confirmation required, anonymous sign-ins disabled. Minimum password length set to 12. Site URL saved as `http://localhost:8081` for local development.
- Local ignored `.env` contains only project URL and publishable key. No database password, secret key or service_role key stored in app/repository.
- Remaining release gates: confirm actual email delivery and full signup/sign-in/profile flow, production SMTP/domain, production HTTPS URL, password recovery, native-device session/camera QA, backup/restore and other release gates above. Free built-in email service is not a production SMTP setup.

## Allergy layout and navigation accessibility — 2026-09-30

- Main content now has a bounded flexible scroll area; switching pages mounts a fresh scroll view so previous page scroll positions cannot hide new headings.
- Replaced tall allergy tiles with compact, full-width rows on phones. Wider layouts use percentage columns; large native font scales switch to one column. Labels wrap without truncation or fixed row heights.
- Allergy Save controls remain outside scrolling content, above navigation. Selection count, unsaved status, Reset changes and save/error feedback remain reachable while browsing all nine choices. Reset restores saved selections; only successful Save changes assessment profile. Unsaved drafts survive navigation.
- Larger mobile navigation labels and padded targets; wrapping button labels/header; page heading semantics, live feedback and checkbox hints/disabled state. Explicit aria-checked fixes missing checked semantics in React Native Web while keeping native accessibilityState.
- Validation: TypeScript passed; all 47 domain/database tests passed; four deterministic Playwright flows passed, including 320 x 640 scrolling, last allergy reachability, persistent Save/feedback, reset, navigation scroll reset and 390 x 844 enlarged-label wrapping. Mobile screenshots inspected. Production web export passed.
- Browser enlarged-label fixture is not native font-scaling validation. Physical iOS/Android Dynamic Type, VoiceOver/TalkBack, keyboard and short-landscape acceptance remain pending. No Lua/Luau changed; Selene not applicable.

## Disputed barcode identity — 2026-09-30

- User reported Poland Spring bottle barcode `075720481279`. Direct Open Food Facts API lookup returned code `0075720481279`, brand `Hellmann's`, name `Light Mayonnaise`; zero prefix is equivalent GTIN representation, not a different product code. Physical package identity has not been independently verified.
- Quarantined this disputed GTIN, including equivalent 12/13/14-digit forms. Lookup now reports disputed identity with no assessment/history entry; no replacement ingredients or water record invented. Remove quarantine only after verifying package and corrected provider record.
- Live lookup requests provider `code` and rejects missing, invalid or conflicting returned codes. Matching code alone cannot guarantee accurate community product data.
- Camera/manual lookup now synchronizes scanned digits into barcode input for comparison with package.
- Validation: TypeScript passed, 55 unit/database tests passed, targeted browser regression passed (previous result cleared; disputed product absent from history). No Lua/Luau changes; Selene not applicable. Native camera still needs physical-device QA.

## Clear profile-save confirmation — 2026-09-30

- Save now displays a persistent green check panel titled `Profile saved` beside the pinned Save controls, with confirmation only after successful persistence. Demo text explicitly states that changes last for this session only; cloud success states that the profile was saved to the account.
- In-flight saves show a spinner and `Saving your allergy profile…`; errors remain visible in an amber panel. New edits/reset/navigation clear success feedback. Native success uses AccessibilityInfo announcement; web uses a live alert.
- Validation: TypeScript and all four deterministic browser flows passed, including visible success at 320 x 640, repeated Save and clearing confirmation on new edits. Native announcements and real signed-in network failure/latency still require device/hosted QA. No Lua/Luau changed.

## Barcode source accuracy — 2026-09-30

- User reported Open Food Facts inaccurate. Primary source now **USDA FoodData Central Branded Foods** (public domain; manufacturer-submitted label data via GS1 GDSN / Label Insight). Open Food Facts only when USDA has no exact GTIN match or USDA request fails. Result, history and About page name the source used.
- USDA search sends all equivalent GTIN spellings (14/13/12/8 digits); only records whose `gtinUpc` normalizes to the scanned GTIN are accepted (fuzzy search hits ignored). Newest `publishedDate` wins when several records share a GTIN.
- USDA has no structured allergen/trace fields. Assessment uses full manufacturer ingredient statement (usually includes FALCPA `Contains:` line). Empty ingredients → `allergensKnown: false` → “Not enough information”. Traces/cross-contact always shown unknown for USDA.
- USDA failure + Open Food Facts miss surfaces the USDA error, never “not found”.
- Key: `EXPO_PUBLIC_USDA_FDC_API_KEY` in `.env` (free signup). Falls back to `DEMO_KEY` (~10 req/hour/IP observed). api.data.gov keys are rate-limit IDs, not secrets, but ship in bundle; production should proxy via Supabase Edge Function.
- Poland Spring GTIN `075720481279` absent from USDA; quarantine kept.
- No free source is complete or guaranteed current (recipes change). Commercial options with broader coverage (Syndigo/1WorldSync, Nutritionix, GS1 Verified for identity only) need paid licenses; not integrated.
- Validation: TypeScript passed; 62 unit/database tests passed; 5 deterministic Playwright flows passed. Direct API check: Cheerios `016000275287` and Nutella `009800895007` returned exact manufacturer records. Live browser smoke (`RUN_LIVE=1`) exercised fallback because DEMO_KEY was throttled; USDA-in-browser path needs rerun with real key. No Lua/Luau changed; Selene not applicable.

## Restyle, haptics and interaction feedback — 2026-09-30

- User reported no sense that taps worked or lookups were processing. Added `expo-haptics` plus shared UI primitives in `src/ui/`: `theme.ts` (tokens, tones), `haptics.ts` (web no-op wrapper), `controls.tsx` (`Tap` spring-press + pressed tint + haptic, `Button` with loading spinner/variants, `Notice` tones, `Reveal` fade-in, `Skeleton`, animated `CheckMark`, `ToastProvider`). RN `Animated` only; no Reanimated.
- Haptic map: taps light; nav/toggles selection; Save/camera detection medium; save success = success; validation/not-found/traces/unknown = warning; contains/errors = error. **No-match results use a neutral light tap and info-blue styling, never success haptic or green check** — not a safety verdict.
- Lookup: button shows spinner + disabled; progress card with skeleton appears where result will land; screen auto-scrolls to progress/result. Scan-page errors render inline under Look up button (not top of page). Live barcode hint shows digit count and check-digit match before submit.
- Toasts: short transient confirmations (demo ready, result checked, history cleared, changes discarded, session cleared). `pointerEvents="none"`, no alert role, never duplicate on-page status text; native announces via AccessibilityInfo. Important outcomes always stay on screen.
- Result banner per kind: contains red, traces/unknown amber, no-match info blue; matched allergens as chips. History rows show kind icon/colour. Allergy save bar has selection progress meter.
- Layout stays flex/percentage; toast layer uses percentage insets; camera frame uses aspectRatio instead of fixed height.
- Validation: TypeScript passed; 62 unit/database tests passed; 6 deterministic Playwright flows passed (new `feedback.spec.ts`: progress state, disabled busy button, inline in-viewport outcome, toast, auto-scroll to result). Screenshots inspected at 1440, 390 and 320 widths plus enlarged-label fixture. Physical-device haptics, native animation feel and screen-reader toast announcements still need device QA. No Lua/Luau changed; Selene not applicable.

## Result evidence — 2026-10-08

- Results now show **Why this result**: one line per reason, grouped by allergen — a source allergen tag, a source trace tag, or the exact ingredient word that matched (for example `"whey" appears in the ingredients`). Matched words are highlighted in the ingredient text.
- Evidence comes from `explain()` and `highlightIngredients()` in `src/domain/allergens.ts`, which reuse the same tags, vocabulary and cocoa-butter exception as `assess()`; they explain a result and never change it. A unit test checks every allergen `assess()` reports has evidence. No-match results show no evidence block.
- Validation: TypeScript passed; 68 unit/database tests passed (6 new); 7 deterministic Playwright flows passed (new `evidence.spec.ts`), live test skipped. Screenshot `artifacts/evidence-mobile.png` inspected at 390 × 844. Screen-reader reading of highlighted words needs device QA. No Lua/Luau changed; Selene not applicable.

## Household profiles and Settings — 2026-10-14

- Account holder's allergies stay in `profiles`. New `household_members` table (migration `202610140001_household_members.sql`) stores up to 8 more people per account: name (1–40 chars) and 1–9 supported allergies. Owner-only RLS; `owner_id` comes from the caller JWT via column default and is not client-writable. Members are deleted with the account.
- `profiles` gains `display_name`, `default_everyone` and `default_member_id`. A composite foreign key keeps the default pointed at the caller's own member; removing that member resets the default to the account holder.
- Scan results: "Checking for" chips (Everyone or one person). Everyone shows a summary by the most serious outcome (contains > traces > unknown > no-match) plus one card per person with their reasons. One person shows the existing single result. Ingredient highlighting covers everyone being checked. History follows the current view. Never an all-clear wording; no-match cards keep the safe-to-eat caveat.
- New Settings tab: your name, add/edit/remove people (inline remove confirmation), default "Show results for". App details moved off the phone tab bar (five tabs fit 320 px) and opens from Settings; still in the desktop sidebar.
- Demo household: Alex (Peanuts, Tree nuts; account holder), Kha (Milk, Eggs), DFK (Sesame); default view Everyone. Demo changes stay in memory.
- Validation: TypeScript passed; 80 unit/database tests passed (7 new PGlite RLS tests: owner stamping, cross-user hiding, spoofed owner refused, validation, 8-member cap, default ownership and reset, cascade on account deletion, anon blocked). 9 Playwright flows passed (new `household.spec.ts`); existing flows updated for the household demo. Hosted Supabase migration, real signed-in add/edit/remove, and device/screen-reader QA still pending. No Lua/Luau changed; Selene not applicable.

## Apple HIG design pass — 2026-10-14

- Restyle checked against Apple's Human Interface Guidelines (typography, color, accessibility, tab bars, buttons, branding). Wording unchanged apart from removed decorative eyebrows; "label first, never say safe" copy kept.
- Type follows iOS Dynamic Type Large sizes via `type` in `src/ui/theme.ts`: body 17, subhead 15, footnote 13, large title 34. Placeholder text darkened to #606F67 (4.5:1+); muted text #56655D (5.5:1 on canvas).
- Capsule buttons: filled primary, tinted secondary, no automatic arrow. Close, Edit profile, Exit demo and text links reach 44 pt hit targets.
- Household pieces follow the same rules: "Checking for" chips, Settings edit/remove buttons and "Show results for" rows reach 44 pt; person cards use the 15 pt subhead verdict.
- Phones: logo/breadcrumb top bar removed (brand shown once on welcome, page title says where you are); floating capsule tab bar with tinted selected tab; allergies shown as an inset grouped list with round checkmarks. Cards drop borders and heavy shadows. Sample cards lose 01–04 numbering.
- Dark mode: follows the device or browser appearance (`useScheme()` in `src/ui/theme.ts`, `userInterfaceStyle: automatic` in app.json, status bar `auto`); no in-app switch, per Apple's guidance. Styles are built once per appearance with `bothSchemes()`. Dark palette checked: body text 14.2:1, secondary 7.6:1, placeholder 5.6:1, every tone colour 7:1 or better on its tinted background. The hero keeps its deep green in both, so its lime button keeps dark ink.
- Validation (on top of evidence + family profiles): TypeScript passed; 80 unit/database tests passed; 11 deterministic Playwright flows passed (new `appearance.spec.ts` checks light and dark canvases with no page errors), live test skipped. Every phone screen inspected in light and dark at 390 × 844, plus 1440 wide. No Lua/Luau changed; Selene not applicable.

## Languages — 2026-10-14

- App text lives in `src/i18n/` (`en.ts` is the source; `es`, `zh`, `bn`, `vi` must have the same keys and `{placeholders}`, enforced by `tests/i18n.test.ts`). `makeI18n(lang)` gives `t`, plurals (`_one`/`_other`), list joining, and locale dates, times and digits.
- Settings has a Language card (native names: English, Español, 中文（简体）, বাংলা, Tiếng Việt). The device language is used until someone picks one; signed-in choices save to `profiles.language` (migration `202610140002_profile_language.sql`, null = follow device). Demo choice stays in memory; sign-out returns to the device language.
- Not translated: product names, brands and ingredient lists (shown as the source wrote them) and ingredient matching, which stays English. Domain code still produces English titles; the UI translates from the result kind, reason codes and lookup error codes.
- Translations are machine-drafted and need native-speaker review before launch, especially allergen names (regional peanut/sesame words in es and vi, crustacean shellfish in bn and zh) and every "not a safe-to-eat guarantee" line.
- Validation: TypeScript passed; 91 unit/database tests passed (new translation checks and a language RLS test); 13 Playwright flows passed (new `language.spec.ts`: switch to Español in Settings, start in Vietnamese from a vi-VN browser). Screenshots inspected in all five languages at 390 × 844. Device and screen-reader QA pending. No Lua/Luau changed; Selene not applicable.

## Evidence highlighting removed - 2026-10-14

- Alex asked to remove evidence highlighting. Results no longer show **Why this result**, and the ingredient list is plain text with no highlighted words. Household person cards now show the outcome detail instead of per-word reasons.
- Removed `explain()`, `highlightIngredients()`, `unionAllergies()` and the `Evidence` type from `src/domain/allergens.ts`, the `evidence.*`, `result.why` and `result.matchesLabel` strings from all five dictionaries, `tests/e2e/evidence.spec.ts` and `artifacts/evidence-mobile.png`. `assess()` is unchanged, so outcomes are the same. To bring it back, revert this commit.
- Validation: TypeScript passed; 84 unit/database tests passed (7 evidence-only tests removed); 12 Playwright flows passed, live test skipped.
