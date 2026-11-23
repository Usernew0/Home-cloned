# Staged rollout plan (nothing here has been executed)

Principle: ship every step in an order where the old client and the new client both keep working, and only then tighten. Rules before a compatible signed-in client would break live Firestore features (chat, memories, letters, dates, music, presence).

## Stage 0: read-only grounding and backups (no data change)
1. Save the currently deployed Firestore rules (console copy) and the Supabase policies: this is the rollback source.
2. Export Firestore and take a Supabase backup before any write step.
3. Counts (counts only, no document bodies):
   - Firestore: per collection, docs with no `coupleId`, and docs where `coupleId == 'couple_default'`.
   - Supabase: `select lower(username), count(*) from user_accounts group by 1 having count(*) > 1;` (case collisions), accounts with NULL or 'couple_default' couple_id (`supabase_hardening.sql` has read-only count queries), and rows with a plaintext password.
4. Confirm the Vercel project's current env var NAMES and the Git branch that auto-deploys.

## Stage 1: configuration (additive, no behavior change until code ships)
- Vercel env: `SERVER_SESSION_SECRET` (32+ random chars), Supabase URL and service-role key under the names `server/supabase*.ts` reads, `FIREBASE_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`, optionally `FIREBASE_ALLOW_DEFAULT_TENANT=true` only if Stage 0 shows users legitimately in the shared tenant. Values go through the host secret store; never in chat.
- Firebase console: enable Authentication (required for custom-token sign-in). Create a service account with token-minting rights only.
- `ENABLE_PASSWORD_REHASH` stays unset (off) for the first release.

## Stage 2: indexes (additive)
Deploy `firestore.indexes.json` and wait until all indexes show as built. Old clients ignore them.

## Stage 3: code (compatible with the OLD open rules)
Ship the patch. The new client signs in to Firebase and runs scoped queries; the still-open rules accept both. Login now requires `SERVER_SESSION_SECRET`, so Stage 1 must be done first. Prefer a Vercel preview deployment, then production. Verify: `/api/health`, login (user, partner, admin, a 2FA account), `/api/proxy` no longer 404, own-profile edit, password change, 2FA enable/disable with reauth, chat in couple/DM/global/group, presence between partners.
Rollback: redeploy the previous Vercel deployment (instant).

## Stage 4: data fix, only if Stage 0 found docs without `coupleId` (needs owner approval of the mapping)
Add-only script, run by an authorized person: set `coupleId` on docs lacking it, from a reviewed mapping (e.g. from `sender`/`createdBy` to the user's couple). Dry-run first and review the counts. It never deletes or overwrites existing fields. Rollback: restore from the Stage 0 export.

## Stage 5: rules (the tightening step)
Preconditions: Stage 3 verified in production and the Firebase sign-in works for each role. Deploy `firestore.rules` in a low-use window. Browser tabs still running the old client lose Firestore until they reload (the app falls back to Supabase and local storage). Rollback: redeploy the saved Stage 0 rules.

## Stage 6: Supabase hardening (after Stage 3 is confirmed)
Review then apply `supabase_hardening.sql` in a transaction-sized chunks. Confirm that no client path still writes `user_accounts` or `profiles` directly with the anon key. Rollback SQL is the saved policy list from Stage 0.

## Known not verified
Real Firebase project behavior (Auth, custom tokens, deployed rules), real data shape, the Vercel Hobby 12-function cap in production, Telegram `setWebhook` re-registration with the same secret token.
