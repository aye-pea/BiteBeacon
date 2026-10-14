# Connect real accounts and database

Hosted project PantryCheck (`ebfhthdlioufhebdmvgl`) now exists in organization `allergy app`, East US (North Virginia), on Free plan. Private repository https://github.com/derelffz/AllergyApp is connected: pushes to `main` deploy new migrations. Migration `202609300001_profiles` is already applied. Local `.env` is configured and ignored by Git. Keep ownership and billing with the intended project owner.

## 1. Create and secure project

Create a Supabase project in an approved region. Store database password outside this repository. Restrict project membership; require MFA for project administrators. Keep administrative/service-role keys off devices and out of public environment variables.

Under Authentication, enable email/password and **Confirm email**. Set minimum password length to at least 12 to match client validation. Configure approved email templates, production SMTP and rate limits before opening signup to untrusted users. Assess CAPTCHA/abuse protection before public exposure; no CAPTCHA UI is included in the demo.

Set Site URL to the local demo URL for local verification (typically `http://localhost:8081`). Allow only the exact URLs you control. Hosted deployments need HTTPS URLs. Signup confirmation can open the configured website; users then return to the app and sign in. The app does not consume implicit tokens from browser URLs. Mobile deep-link verification and self-service password recovery are future pilot work, not completed flows.

## 2. Apply schema

Open Supabase SQL Editor in the intended project. Run the complete contents of:

`supabase/migrations/202609300001_profiles.sql`

Already deployed to PantryCheck through GitHub. Do not run again there. For a separate new project, run once. It is a versioned migration, not an idempotent repair script. It creates:

- `profiles`, keyed to `auth.users`, with allowed allergy IDs and consent version.
- Owner-only SELECT/INSERT/UPDATE/DELETE policies and restricted column grants.
- Automatic updated timestamp.
- Self-only `delete_my_account()` function with fixed search path.

Confirm RLS is enabled and no public/anonymous policies or grants were added by a dashboard wizard. Never disable RLS to fix a client error.

## 3. Configure app

Copy `.env.example` to `.env`. Fill only these public values from the project settings:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Expo embeds `EXPO_PUBLIC_` variables in the client. These values are visible to app users. Never put a service-role key, secret key, database password or SMTP credential there.

Restart with `npx expo start --clear`. Auth fields now appear. Create an account, confirm email, sign in and save allergies. Empty profiles are prompted to choose allergies before scanning.

## 4. Hosted acceptance checklist

Use synthetic test accounts and allergy selections, not real patient information.

- [ ] New account receives confirmation email; unconfirmed login rejected.
- [ ] Confirmed user signs in; invalid credentials fail without exposing private data.
- [ ] Password policy enforced server-side, not only in UI.
- [ ] Save profile, restart native app and verify restoration.
- [ ] Browser reload requires fresh sign-in by design.
- [ ] User B cannot read, overwrite or delete user A's profile through direct REST requests.
- [ ] Anonymous requests cannot access profiles or deletion RPC.
- [ ] Invalid allergen IDs/empty arrays rejected by database.
- [ ] Deleting B removes B's Auth row and profile, leaves A intact.
- [ ] Sign out clears visible profile and session history.
- [ ] Session expiry/network errors leave scanning locked when profile cannot load.
- [ ] Native SecureStore and background/foreground refresh work on both device platforms.

The local automated PostgreSQL policy tests validate migration behavior, but do not replace these hosted checks or a project-configuration audit.

## Troubleshooting

- Signup fields absent: environment values missing or development server needs restart.
- “Could not load your allergy profile”: verify migration, project URL, session and policies. Do not weaken ownership rules.
- Email missing: check Auth logs, email delivery configuration and rate limits.
- Camera unavailable in browser: expected; manual barcode works on web, camera flow is native-only.
- Network product lookup error: check connection/provider availability; never replace it with an unlabeled sample.

## Before public release

Complete password recovery, email change/reverification, abuse controls, hosted monitoring, backup restore drill, app privacy policy, retention policy and incident response. Review auth token lifetime/revocation behavior: account deletion removes rows, but already issued access tokens may remain valid until expiry; profile foreign keys and ownership policies still prevent deleted users recreating profiles. Provider backup retention is not instant erasure and needs a documented process.
