# Factoodle

Math practice for young children: no bees, login, ads, or child profiles.
Choose addition, subtraction, multiplication, or division, then answers from
0–10, 0–20, 0–30, 0–40, or 0–50. Ten-question rounds use large number buttons,
explicit Next buttons, stars, and gentle feedback.

## Same production services

- Frontend: https://factoodle.vercel.app — existing Vercel project, root `frontend`.
- API: https://factoodle-api.voltageviking.workers.dev — existing Cloudflare Worker `factoodle-api`, root `backend`.
- Data: existing Neon database and `learner_progress` table. No migration or reset required.
- Repository: `Dev-v1/Factoodle`, branch `main`.

No new infrastructure, subscriptions, or paid upgrades. Provider quotas still apply.

## Structure

- `frontend/src/App.tsx`: child-friendly screens and grown-ups recovery controls.
- `frontend/src/domain/`: math generation and the versioned progress model.
- `frontend/src/sync/`: browser storage, save queue, API client, React subscription.
- `backend/src/index.ts`: production Cloudflare entrypoint.
- `backend/src/handler.ts`: validation, CORS, versioned API, explicit errors.
- `backend/src/repository.ts`: parameterized Neon SQL and compare-and-swap writes.
- `backend/src/model.ts`: canonical progress model.
- `backend/schema.sql`: existing non-destructive initial schema.
- `tests/`: math, migration, API, concurrency, failure, and integration regressions.
- `scripts/check-model.mjs`: prevents frontend/backend model drift.
- `DEPLOYMENT.md`: no-command-line guide using your existing accounts.
- `VERIFICATION.md`: six-pass verification record and live limitations.

## Reliable progress

Every answer is saved to localStorage before the UI confirms it. A serialized
queue uploads immediately; new answers never cancel in-flight saves. Browser UUIDs
and revisioned counters make retries idempotent. Neon compare-and-swap writes
preserve simultaneous browser updates. **Saved online** requires a successful
server response and merge; **Saved on device** is not a cloud confirmation.

Restore always reads the server. Missing configuration, unknown codes, temporary
outages, and missing tables have distinct messages.

Existing `factoodle-code` and `factoodle-progress:<code>` keys remain supported.
Legacy progress becomes a retained base snapshot inside the same JSONB column;
the old local copy is not deleted. Old clients must refresh: v1 reads remain
available, but v1 writes return `UPDATE_REQUIRED` to prevent overwriting v2.

Two diverging legacy offline snapshots cannot be reconstructed into exact
individual answers; migration conservatively retains maxima. New v2 practice
uses separate device counters. Never clear browser data before confirming an
online save.

## Development

Use Node 22.18+ (Node 24 also works):

```sh
npm --prefix frontend ci
npm --prefix backend ci
npm run check
```

There are no root runtime dependencies. The checks verify the shared model, run
Node's built-in test runner, build the frontend, and typecheck the Worker.
For normal development, configure `backend/.dev.vars` and `frontend/.env` from
their example files, then run `npm run dev` in each folder. Never commit secrets.

For isolated testing only, `node tests/serve-fixture.mjs` starts an in-memory API
on port 8787. Point the frontend's `VITE_API_BASE_URL` to `http://localhost:8787`.
This fixture does not use Neon and must never be deployed as the real backend.

After changing the canonical model, run `node scripts/check-model.mjs --sync`,
then rerun all checks. Do not modify just one copy.

## Privacy and limits

- A recovery code is a bearer secret: anyone with it can read and update progress.
- No child's name, email, date of birth, or profile details are requested.
- Keep Neon credentials only in the Cloudflare runtime secret, never frontend variables or chat.
- Browser storage clearing, private browsing, and device loss can remove unsynced local data.
- HTTPS and Web Locks support are required for safe multi-tab local writes.
- Requests are limited to 128 KB; documents support at most 256 devices within that size limit.
- CORS is not authentication or a rate limiter. Provider abuse controls and quotas still matter.
- Tests reduce regression risk; they cannot prove there are no bugs or replace a live Neon recovery test.
