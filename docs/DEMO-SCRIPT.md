# Five-minute employer walkthrough

## Before meeting

- Run `npm run web`; open local URL in browser. Use a physical phone for native camera only after completing device checks.
- Leave Supabase environment values blank for a no-credentials presentation, or use a separately verified project.
- Have internet available for live lookup; fictional sample section works without provider access. Initial app loading still needs the local development server; this is not an offline-installed PWA.
- Read the current [validation record](../wiki/README.md). Do not claim untested camera or hosted flows have passed.

## 0:00 — Product story

Show welcome page. Explain: personal allergy profile + food barcode + transparent ingredient signals. Choose **Explore employer demo**. Point out Demo Mode and fictional samples.

## 0:45 — Personalization

Open **My allergies**. Milk and peanuts are selected by default in demo. Show supported US groups. Save milk and peanuts for the scripted examples. Explain private cloud profiles require Supabase connection; demo selections only last this session.

## 1:30 — Four outcomes

Open **Overview** or **Scan a product**, then choose these fictional samples:

| Sample | Expected result for milk + peanuts |
|---|---|
| Peanut crunch granola | Allergen signal found |
| Dark chocolate bites | May contain your allergen |
| Simply oat crackers | No selected allergens found, with explicit caveat |
| Mystery snack | Not enough information |

Point out ingredients, source labels and no “safe to eat” badge. Fictional names and fixture IDs are not real products or scannable packaging.

## 2:30 — Real barcode lookup

Open scanner, manually enter `3017620422003`, then choose **Look up product**. Live smoke test returned Nutella with milk/nuts/soy tags on September 30, 2026; provider records may change. Show **LIVE PRODUCT RESULT**, ingredients and source link. This barcode is an example record, not a promise of US-market formulation.

If provider fails, show the explicit failure message and use a labeled sample. Never describe a sample result as live. On physical mobile build, open camera and scan a real EAN-13 or UPC-A label. UPC-E expansion is not yet supported; use a full UPC or another product.

## 3:30 — Personal history and privacy

Open **Recent scans**. Change allergies and reopen a result to show recalculation. History is memory-only. Open **App details** to explain data source, account ownership and later label recognition.

## 4:30 — Architecture and next step

Explain Expo/React Native, Supabase Auth, PostgreSQL RLS and native SecureStore. Distinguish implemented controls from provider configuration and security certification. Next gate: connect employer-owned Supabase project, verify two accounts, and finish physical-device camera testing.

End by exiting demo. Re-enter and show cleared history if asked about demo retention.
