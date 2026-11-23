# Backend security and Vercel routing changes

## Required Vercel environment variables (production fails closed without them)
- SERVER_SESSION_SECRET: random, 32+ characters (login returns 500 and sessions are rejected without it)
- SUPABASE_URL (preferred; legacy VITE_SUPABASE_URL supported), SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY (public browser key)
- TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET (set the same value as secret_token in Telegram setWebhook)
- GEMINI_API_KEY (for /api/generate-date)
- ENABLE_PASSWORD_REHASH=true is OPTIONAL and OFF by default (see "Password migration")

## Routing (why /api/proxy returned 404)
Vercel only runs files in /api. The login, proxy and admin-settings routes lived only in the Express server.ts, so they 404ed. They are now shared handlers (server/handlers.ts) exposed as Vercel functions, and Express uses the same code.

Functions (11, within Vercel Hobby's 12-function limit): admin-settings, auth/verify-login, auth/change-password, health, proxy, generate-date, unsupported, telegram/send, telegram/test, telegram/updates, telegram/webhook.
Routes that need a long-lived server (audio upload to local disk, payments, Telegram sender capture/diagnostics/webhook management) answer 501 on Vercel via vercel.json rewrites to /api/unsupported. They still work under `npm run dev` / `npm start` (Express).

## Authorization
- Every /api route is deny-by-default on Express; public routes: health, verify-login, the Telegram webhook (secret).
- /api/proxy: table allowlist, guests read-only, tenant scoping by couple_id for non-admins, strict filters (unknown operators rejected), update/delete need an eq filter, caps, cross-couple upsert check, secrets stripped, admin credential rows hidden from non-admins.
- Own profile edits (gender, telegram username, display name, 2FA enrolment fields) still work for every user, restricted to their own row. Role, couple, and password cannot be changed from the browser.
- Password changes: POST /api/auth/change-password (verifies the old password server-side, minimum 8 characters).
- Two-factor is verified on the server (TOTP and single-use backup codes). The previous server login path skipped 2FA entirely.
- The browser-side credential fallback in Login.tsx is removed; the browser no longer receives password hashes or 2FA secrets (user_accounts is read through the proxy; admin credential rows are admin-only).
- Payments: the fake checkout returned "complete" for any request. It now returns 501 and the UI no longer activates a plan unless a real completed checkout comes back.

## Password migration (live write, opt-in)
Stored formats accepted: scrypt_v1 (new), sha256_v1 (legacy, static salt), plaintext (legacy). With ENABLE_PASSWORD_REHASH=true a successful login of a user_accounts row stored in a legacy format rewrites only that row's password column to scrypt_v1 (same password). Not migrated: adminAccounts / credentials in admin_settings, and passwords created in the admin UI (the browser still produces sha256_v1 for those). Before enabling: back up user_accounts, confirm all login variants on staging, and deploy this client (it no longer re-hashes scrypt_v1 values).

## Database (not executed by this patch)
- supabase_hardening.sql: review-only access-rule changes (user_accounts writes admin-only, secret column grants, profiles, storage upload/delete auth) plus read-only diagnostics instead of the original NULL couple_id backfill. Apply only after the new server is deployed.
- firestore.rules: userAccounts, adminSettings and coupleTenants are now closed to browsers. Other collections (letters, memories, chat, ...) are still readable and writable by anyone with the public Firebase config, because the app has no Firebase Auth. Fixing that needs Firebase custom tokens minted by the server. Deploy rules only after the client above.

## Known limits
- Login rate limit is per serverless instance memory.
- Promo-code usage is still counted before checkout and plan state is client-side.
- Password and 2FA changes made in the admin UI still hash with sha256_v1 in the browser.

## Round 3: credential exposure, 2FA reauthentication, Firestore path

- Browsers (admins included) no longer receive password hashes or 2FA secrets from `/api/proxy` or `/api/admin-settings`. Admin account lists come back redacted with `hasPassword`.
- Passwords are hashed on the server (`scrypt_v1`). AdminPanel sends plaintext over TLS for create/edit; a blank password on edit keeps the stored one. The browser no longer keeps plaintext in local storage or Firestore payloads.
- Admin account list saves are merged server-side: stored hashes and 2FA material are preserved and cannot be set from the browser.
- 2FA: `two_factor_*` columns are not writable through the proxy by anyone. `POST /api/auth/two-factor` enables or disables, and requires the current password (plus a current TOTP or backup code if the account already has 2FA). An account can enrol only itself; an admin can reset (disable) another account but not enrol one. The UI asks via `window.prompt`, a stopgap you may want to replace with a proper field. The 2FA modal can no longer show the stored secret or old backup codes (they are not sent to the browser).
- This adds a 12th Vercel function (`api/auth/two-factor`), the Hobby maximum.
- Firestore: `server/firebaseToken.ts` mints a custom token (claims coupleId, role, username) only when `FIREBASE_SERVICE_ACCOUNT_EMAIL` and `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` are set via the secret store; `/api/auth/verify-login` returns it as `firebaseToken`. NOT done: client `signInWithCustomToken`, coupleId-scoped queries, composite indexes. `firestore.rules.proposed` is an untested draft and is not deployed. `chatGroups` and `presence` have no coupleId, so they need a data decision. Until the client work lands, `firestore.rules` stays as-is (personal-account collections closed, the rest still open).

## Round 4: Firestore client scoping and identity (local, untested against live Firebase)

- Identity: the Firebase uid is the stable account id (`a:<user_accounts.id or admin account id>`), not the username. `claims`: coupleId, role, username. The token is not minted (Firestore stays closed) when the account id is missing, when a non-admin has no coupleId, or when the tenant is the shared `couple_default` unless `FIREBASE_ALLOW_DEFAULT_TENANT=true` is set deliberately.
- Login refuses ambiguous usernames (several accounts matching case-insensitively). Note `user_accounts.username` is UNIQUE but case-sensitive, so "Alice" and "alice" can coexist in the schema.
- Client: `src/lib/firebaseScope.ts` signs in with the custom token after login and signs out on logout. Firebase refreshes its own ID token, so no re-mint is needed. `firebaseService.ts` queries the nine couple collections with `where('coupleId','==',scope)` for non-admins. `chatGroups` uses `members` / `pendingMembers` `array-contains` queries. `presence` docs now carry `coupleId` so partners still see each other.
- Not verified: no emulator, no live Firebase. Rules in `firestore.rules.proposed` still need chatGroups/presence clauses, `firestore.indexes.json`, and emulator tests.
- Data risk to confirm before deploying rules: existing Firestore docs with no `coupleId` field (or `couple_id` only) will not match the scoped queries. A non-destructive proposal: a one-off, reviewed script run by an authorized person that only ADDS `coupleId` to docs that lack it, after a read-only count. It was not written or run.
- Group members/invitees are stored as typed usernames; the scope uses the canonical username from login. Case mismatches would hide a group. Check real data.

## Round 5: Firestore rules, indexes, emulator verification

- `firestore.rules` now enforces tenancy from the custom-token claims (coupleId, role, username): couple collections need `coupleId == claim`; guests are read-only; admins read all; `userAccounts`, `adminSettings`, `coupleTenants`, `typingStatus` and `notifications` are closed (no client code uses the last two). `chatMessages` also allows sender, receiver, the `global` lounge and groups the user belongs to. `chatGroups` is member/invitee only. `presence` is couple-scoped, own doc writable. `firestore.rules.proposed` was removed.
- Verified on the local Firestore emulator (firebase-tools 13.35.1, JDK 11, `@firebase/rules-unit-testing`): 9/9 tests in `tests/rules/firestore.rules.test.mjs` pass (unauthenticated denial, scoped vs unscoped list, cross-couple read/write/overwrite/delete, guest read-only, closed credential collections, chat query shapes, group membership via get(), presence). Run: `npx firebase emulators:exec --only firestore --project demo-home "node --test tests/rules/firestore.rules.test.mjs"` after `npm i -D firebase-tools@13.35.1 @firebase/rules-unit-testing` (not added to package.json so the lockfile is untouched).
- `firestore.indexes.json`: composite indexes for the scoped chat and activity-log queries. Deploy indexes BEFORE the rules, and wait for them to build.
- Behavior changes to be aware of: guests can no longer write to Firestore; docs lacking `coupleId` are unreadable to non-admins (admins still see them); the activity-log delete is admin-only. The `global` lounge is readable by any signed-in user (the client gates it by the user's setting; the rules cannot).
- Still unverified: end-to-end with a real Firebase project (custom token, Auth enabled, deployed rules), and the real data shape. Firebase Auth must be enabled, and the service-account email/key set via secret store, before deploying these rules, or the app's Firestore features stop working (Supabase and local fallback remain).

## Independent review correction (supersedes conflicting earlier round notes)

The original patch was NOT ready for production: raw admin passwords reached legacy local/Firestore mirrors, and redacted account lists could overwrite stored credential arrays through generic sync. The bounded correction routes credential writes only through the merge/hash endpoint, rejects generic admin_settings writes, disables Firestore credential/settings reads and mirrors and both directions of account/settings bulk sync, scrubs legacy browser credential caches, and reports server-save errors instead of caching an unconfirmed credential edit. Ordinary settings bulk-to-Supabase goes through the dedicated settings endpoint; Firestore account/settings sync is intentionally unavailable.

User-account saves/deletes use the authenticated server rather than closed Firestore paths. Profile save/cleanup failure after a confirmed account write is reported as partial success, not undone. Do not interpret this as a cross-table transaction. The generic proxy still permits record filters beyond id, and unrelated legacy migration/media/delete/sync hazards are not certified fixed.

The dependency lock was repaired without changing any previously locked package version. npm test adds synthetic credential workflow/cache tests and a generic-proxy overwrite denial regression. They do not test the production browser, Firebase project, Supabase RLS, media store or backup restoration. See DEPLOYMENT_PLAN.md for the release gates, especially tenant-field mapping BEFORE scoped reads and no open-rule credential stage.

When an authoritative admin_accounts list exists, login no longer falls back to the stale legacy credentials row. Otherwise an old password could still work after editing the listed admin. Legacy-only installations still use the legacy row. Account parity must be reviewed before this behavior is deployed.

## Environment naming and browser exposure (supersedes older environment advice)

- Set `SUPABASE_URL` in the host environment. Express, shared API handlers and the lazy Telegram client prefer it over `VITE_SUPABASE_URL`. The public URL is also read during the Vite build and mapped to the existing browser public config. A runtime-only change cannot update a prebuilt frontend.
- `VITE_SUPABASE_ANON_KEY` stays public and is needed during build for browser Auth/storage. There is no `SUPABASE_ANON_KEY` alias. Use the anon/public key, never the service-role key. Database/storage policies must protect data independently of public project configuration.
- `SUPABASE_SERVICE_ROLE_KEY` and `SERVER_SESSION_SECRET` remain server-only. The legacy `VITE_SUPABASE_SERVICE_ROLE_KEY` alias is no longer accepted. Missing server URL/key leaves the database service unavailable; missing production session secret rejects sign-in. Legacy anon-key fallback on the server is retained for compatibility, but it does not grant service-role privileges or guarantee protected routes work.
- Browser environment exposure is an explicit allowlist: project URL, anon key and optional `VITE_APP_USERNAME` display/reserved-name fallback. Arbitrary `VITE_` variables are no longer automatically exposed. No entire `process.env` object is injected.
- **Compatibility gate:** nonempty `VITE_*PASSWORD*` or `VITE_SUPABASE_SERVICE_ROLE_KEY` values refuse the build without logging their values. Older milestone/category passwords were read in browser code and therefore were not secrets. They are not migrated by renaming them. Affected installations must stop and agree a reviewed server-side replacement before removing those values and releasing; simply deleting them can remove the old UI prompt. Existing card/record passcodes and universal UI bypasses remain legacy UI behavior, not secure access controls. This change does not certify those paths safe.
- Firebase browser configuration still comes from `firebase-applet-config.json`. Firestore custom tokens need the matching `FIREBASE_SERVICE_ACCOUNT_EMAIL` and `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` at runtime; PEM newlines or escaped backslash-n are supported. Firebase Auth, tenant mapping and release gates still apply.
- Optional runtime features use `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and `GEMINI_API_KEY`. Do not prefix secrets with `VITE_`. Leave password rehash and default-tenant opt-ins disabled unless separately reviewed.
- On Vercel, configure the intended Production/Preview environment scope yourself and perform a reviewed rebuild/redeploy after the code and configuration are ready. No Vercel configuration, deployment or database action is performed by this patch. Do not send secret values in chat. See `.env.example` for names only.
- Environment naming does not make GitHub Pages execute backend APIs. Pages remains static-only. Never publish this project's entire `dist` folder as static output: the current build also places backend bundles and sourcemaps there.
