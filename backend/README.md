# Factoodle backend

This folder is a Cloudflare Worker that stores anonymous progress records in Neon PostgreSQL.

## Local development

1. Run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and add your Neon pooled connection string.
3. Run `npm run dev`.

## Deploy to Cloudflare Workers

1. Create a free Cloudflare account and run `npx wrangler login`.
2. Replace `https://YOUR-PROJECT.vercel.app` in `wrangler.jsonc` with the frontend URL.
3. Run `npx wrangler secret put DATABASE_URL` and paste the Neon pooled connection string.
4. Run `npm run deploy`.
5. Copy the resulting `workers.dev` URL into `frontend/.env` as `VITE_API_BASE_URL`.

The database password stays in a Cloudflare secret. Never put it in the frontend.
