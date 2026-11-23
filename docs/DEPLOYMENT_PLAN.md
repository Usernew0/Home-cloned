# Release gate: NOT production-ready from repository tests alone

No production deployment, database migration, policy publication or backup has been performed by this change. A GitHub push is not a database backup or a live acceptance test. Do not run bulk sync, migration, cleanup or the all-in-one SQL setup as part of release preparation.

## 0. Inventory and recoverable backup, before any changed client
- Record deployed code version, Firestore rules/indexes, database schema, functions, table/column grants and policies. Save a supported rollback route.
- Export Firestore and back up Supabase, including Auth and media ownership metadata where supported. Verify a restore on an isolated copy. Do not regard local browser storage or bidirectional sync as a backup.
- Use owner-approved read-only counts, not production document bodies: per-collection/table totals; missing camelCase coupleId; snake_case-only couple_id; default-tenant accounts; username case collisions; canonical chat sender/receiver/group membership case.
- Verify every account/admin setting needed for login exists in Supabase. Firestore/local-only credentials are no longer read, mirrored, or bulk-synced. If there are discrepancies, stop and agree a separate reviewed migration. Do not silently discard or copy credentials through the browser.
- Compare media accessibility and historic upload ownership on the staging copy.

## 1. Approved tenant mapping BEFORE scoped reads
- Queries filter by camelCase coupleId before normalization. A snake_case-only or missing field record will disappear from a non-admin's query without being deleted remotely.
- On the isolated copy, prepare a reviewed mapping and dry-run counts. Add only missing fields; never overwrite existing tenant fields or assign every orphan to couple_default. Stop on conflicts and identity ambiguity.
- Any production mapping is a separate owner-approved data write after backup, before the scoped client is made available. No mapping script is run by this repository.

## 2. Configuration and indexes on isolated staging
- SERVER_SESSION_SECRET: at least 32 random characters. Supabase URL, anon key and service-role key under the server's documented environment names.
- Firebase Auth enabled, FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY for the correct Firebase project/database. Default-tenant non-admin token minting requires an explicit reviewed FIREBASE_ALLOW_DEFAULT_TENANT choice, not a blanket workaround.
- Leave ENABLE_PASSWORD_REHASH unset for the initial release.
- Deploy and wait for composite indexes to build. Verify host function limits and routes. Nothing here authorizes changes to an owner's hosting account.

## 3. Staging acceptance with synthetic fixtures and a restored copy
- npm ci, npm test, npm run lint, npm run build must pass on a clean checkout. The nine optional Firestore emulator tests are separate and their environment must be provisioned explicitly; do not count them as npm test coverage.
- Login/logout/reload: partner, admin, guest and 2FA, missing config, invalid Firebase token, failed Supabase Auth session. Check server failure cannot masquerade as a successful data save.
- Per-role before/after counts and visibility: milestones, memories, letters, dates, questions, activity, chat couple/DM/global/group, presence and music. Verify legacy data stays visible to its intended owner and no other tenant.
- Add/edit/reload user and admin account, blank password preserves stored hash, password change, 2FA enable/disable and failed-save handling. Confirm no password/hash/2FA secret is cached or written to Firestore. Legacy browser caches are scrubbed on access; this does not erase historic remote copies.
- Credential/account and settings bulk sync is deliberately disabled. Ordinary settings edits use the server endpoint. Validate these behavior changes with the owner.
- Test media read/upload/delete on old and new fixtures. Verify deletion failure never gets mistaken for success. Existing unrelated media/sync hazards are not certified fixed by this release.

## 4. Coordinated production cutover, only after acceptance
- Agree a low-use/maintenance window, prevent old tabs from continuing insecure credential edits, and retain rollback snapshots. Do NOT use a phase where raw credentials are mirrored to open Firestore rules.
- Publish only the reviewed code/config/rules combination proven on staging. Old clients are not guaranteed compatible with closed rules. Plan reload/sign-in behavior explicitly.
- Check health, authentication, data counts/visibility and representative save/reload/media flows immediately. Stop on mismatch; roll back code/rules/config and investigate. A code rollback does not restore overwritten database rows or grants.
- Apply supabase_hardening.sql only after a separate review against the actual schema, saved grants/policies and tested rollback. It changes access, and adding a missing defaulted tenant column can label existing rows. Run controlled transaction-sized steps, not the old all-in-one setup script.

## Remaining limits
No production end-to-end result, live inventory/count comparison, data mapping, backup restore, Firebase/Auth/rules deployment or hosting configuration has been verified here. Existing manual migration may purge Firestore logs after copying and existing sync uses overwriting writes; these are not repaired or endorsed by this bounded credential correction.
