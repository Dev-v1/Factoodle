# Existing accounts: no-command-line deployment and recovery

Keep your existing GitHub repository, Cloudflare Worker, Neon database, and Vercel project. Do not reset tables, clear browser storage, or change paid plans.

## 1. Confirm the new code deployed

Your existing Git integrations deploy `Dev-v1/Factoodle`, branch `main`:

- Cloudflare → Workers & Pages → `factoodle-api` → Builds/Deployments. Keep root `backend` and the existing deploy command. Wait for success.
- Vercel → existing Factoodle project → Deployments. Keep root `frontend`, framework Vite, build command `npm run build`, output `dist`. Wait for Ready.

Do not deploy `tests/serve-fixture.mjs`: it is only a local in-memory test server.

## 2. Fix the missing production database connection

In Neon, open the existing project containing `learner_progress` (ID `polished-frog-72166179`). Choose the existing production branch and `neondb` database. Open **Connect**, select the existing role, enable pooling, and copy the **complete current connection string**. Since you reset the password, use the updated string.

In Cloudflare:

1. Open **Workers & Pages → factoodle-api → Settings → Variables and Secrets** (runtime, not build variables).
2. Add/edit **`DATABASE_URL`**, type **Secret**.
3. Paste the entire current Neon connection string, without surrounding quotes. A password alone is insufficient.
4. Save and deploy/apply the secret to the **production Worker**.
5. Keep **`FRONTEND_URL`** as `http://localhost:5173,https://factoodle.vercel.app`; do not repeat `https://`.

Never put the connection string in GitHub, Vercel frontend variables, chat, or screenshots. No table replacement is needed. [Cloudflare secret setup](https://developers.cloudflare.com/workers/configuration/secrets/).

## 3. Check the API before testing recovery

- Open https://factoodle-api.voltageviking.workers.dev/health — expect `version: 2` and `databaseConfigured: true`.
- Open https://factoodle-api.voltageviking.workers.dev/ready — expect `{"ok":true,"database":"ready","version":2}`.

`/health` checks configuration presence only; `/ready` actually checks the connection and table.

| Error | Fix |
| --- | --- |
| `DATABASE_NOT_CONFIGURED` | Add the production runtime secret. |
| `DATABASE_AUTH_FAILED` | Replace it with the entire current connection string after password reset. |
| `DATABASE_SCHEMA_MISSING` | Confirm the connection points to the existing database/branch containing `learner_progress`. |
| `DATABASE_UNAVAILABLE` | Check the connection string and Neon availability, then retry. |
| `ORIGIN_NOT_ALLOWED` | Correct `FRONTEND_URL` and redeploy. |

Do not continue until `/ready` succeeds.

## 4. Check Vercel's API URL

In the existing Vercel project → Settings → Environment Variables, keep:

- Name: `VITE_API_BASE_URL`
- Value: `https://factoodle-api.voltageviking.workers.dev`
- Environment: Production

If you change this value, redeploy the frontend: Vite embeds it at build time.
Preview domains need their own explicitly allowed origins if you use them.

## 5. Recover original progress and test Shift

1. In the **original browser**, open https://factoodle.vercel.app and refresh to load Factoodle 2. Use that exact domain, not a deployment-preview domain.
2. Open the grown-ups area (chart button). Existing local progress and the old code should remain. Do not clear site data.
3. Tap **Save now** if needed. Wait for **Saved online ✓**; a visible code alone is not proof of a save.
4. Note the code and progress counts. Keep the code private.
5. Open the same website in **Shift**, open the grown-ups area, paste the code, and tap **Restore**.
6. Check matching stars, accuracy, best streak, and games finished. Play one question in Shift and wait for Saved online. Refresh the original browser and confirm the added progress.
7. Reload both browsers and confirm progress remains.

If this fails, report the visible error, without passwords or connection strings.
A code never uploaded needs the original browser to save it first.
