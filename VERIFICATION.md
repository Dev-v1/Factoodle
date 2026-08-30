# Factoodle 2 verification — 2026-08-30

Story: answer a math question → store it locally → upload through the existing
Cloudflare API → merge into the existing Neon table → restore on another browser.

## Six implementation and regression passes

The accumulated regression suite was rerun as each pass expanded coverage.

| Pass | Coverage | Result |
| --- | --- | --- |
| 1 | All 20 operation/range combinations, 20,040 generated questions, code normalization, invalid input | 23 tests passed. |
| 2 | Legacy migration, idempotent/ordered merges, browser locks, SQL compare-and-swap races | 34 accumulated tests passed. |
| 3 | API contract, CORS, request limits, missing configuration/table, errors, client timeout | 50 accumulated tests passed. |
| 4 | Slow saves, lost responses, reloads, restore failures, late old-profile responses, multi-tab races | 61 accumulated tests passed. |
| 5 | Client/handler/SQL-repository integration with isolated browser stores; 100 concurrent answers | 65 accumulated tests passed; frontend build and backend typecheck passed. |
| 6 | Production configuration, credential boundaries, non-destructive schema, complete regression rerun | All 68 accumulated tests passed; frontend production build, backend typecheck, and `git diff --check` passed. |

## Fixes covered by regressions

- Original save errors were swallowed, so missing database configuration looked like a bad recovery code. Errors now remain distinct and visible.
- Original answer changes aborted saves after a debounce. A serialized queue now drains new changes without canceling an active request.
- Original aggregate writes could overwrite another browser's totals. Device revisions and database compare-and-swap preserve concurrent updates.
- Review found a completion-window race in the rewritten queue. Pending sync requests now trigger another drain, and the engine rereads storage after releasing the merge lock.
- Malformed browser device IDs are now replaced with valid UUIDs.
- Stale local restore shortcuts, silent corrupt-data deletion, and unconfirmed copied-code messaging were removed.

## Limits and live checks

- Repository concurrency tests execute the real repository logic against an **in-memory SQL transport emulator**, not live Neon.
- The connected test browser could not open the local preview (`ERR_BLOCKED_BY_CLIENT`). This is not a passing visual/browser test.
- A local Wrangler dry-run did not complete because its network approval was cancelled. No direct CLI deployment was performed.
- Before the rebuild, the live Worker returned `Database is not configured`, and the connected Neon table had zero rows. No database rows were changed or deleted during diagnosis.
- The existing Cloudflare Worker needs its production runtime `DATABASE_URL` secret before a live save/restore can succeed. `/health` must show version 2 and configuration present; `/ready` must return 200.
- The final GitHub/Vercel/Worker deployment result must be checked after committing; a successful build is not proof of a working database connection.
- After `/ready` succeeds, use the original browser and Shift exactly as described in `DEPLOYMENT.md`.

Tests reduce regression risk; neither six passes nor a successful build can guarantee that no bugs remain.

## Five additional review passes

The follow-up began from commit `dcc16dc356fc9a91ec07d5a1f119f442f12ec380`.
Each reproduced failure was tested before its fix; the complete regression suite
was rerun after each production-code patch.

| Pass | Additional coverage and fixes | Accumulated result |
| --- | --- | --- |
| 1 | Stable code/device identity, 500 pasted-code round trips, empty corrupt v1/v2 storage. Fixed silent fallback to a fresh document for empty corrupt values. | 72 tests passed. |
| 2 | Offline multi-tab progress visibility, overlapping restore clicks, connection loss during restore. Fixed stale local totals when another tab saves offline. | 75 tests passed. |
| 3 | Unmarked HTTP 408/5xx failures, HTML gateway/access-denied responses, response-body timeouts, permanent configuration errors. Fixed retry and timeout classification. | 85 tests passed. |
| 4 | Eight devices, 24 shuffled/duplicate save orderings, failed profile activation, duplicate timers, retry cancellation across profiles. Fixed timer replacement and profile isolation. | 89 tests passed. |
| 5 | Real local HTTP requests using production client/handler/repository modules: create code, save through an outage, retry, restore into an isolated store, simultaneous answers, reject unknown code, reload. | All 90 tests passed; frontend build, backend typecheck, and whitespace checks passed. |

The HTTP integration test uses an in-memory SQL transport. It is not a live Neon
or a real Edge-to-Shift browser test. No production database data, credentials,
infrastructure resources, or paid plans were changed.

The live `/ready` check still returned HTTP 503 `DATABASE_NOT_CONFIGURED` during
this follow-up. Cloudflare management tools were not exposed, and plugin discovery
returned no Cloudflare integration. The production runtime secret still requires
owner action through the existing Cloudflare dashboard. The app is **not yet
verified end-to-end in production**. See `DEPLOYMENT.md`, steps 2–5.
