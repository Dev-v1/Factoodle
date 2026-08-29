# Factoodle

Factoodle is a cheerful, math-themed facts practice app designed so a five-year-old can use it without help. It has no login, no ads, and no child profile.

Children can practice:

- addition, subtraction, multiplication, or division
- answers from 0-10, 0-20, 0-30, 0-40, or 0-50
- ten-question rounds with a large on-screen number pad
- stars, streaks, accuracy, and operation-by-operation progress

Progress is saved in the browser first and then synced to Neon using a random recovery code such as `FCT-ABCD-1234`. A grown-up can copy that code to restore progress on another device.

## Project structure

```text
factoodle-full-stack/
├── frontend/                 # React + Vite app for Vercel
│   ├── public/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── backend/                  # Cloudflare Worker API
│   ├── src/index.ts
│   ├── .dev.vars.example
│   ├── package.json
│   ├── schema.sql
│   └── wrangler.jsonc
├── app/                      # Source for the existing Sites preview
└── DEPLOYMENT.md             # Complete deployment walkthrough
```

The production deployment uses three services that all have free entry tiers:

| Part | Service | Purpose |
|---|---|---|
| Frontend | Vercel | Hosts the static React app from `frontend/` |
| API | Cloudflare Workers | Validates requests and safely talks to Neon |
| Database | Neon Postgres | Stores anonymous progress by recovery code |

Cloudflare Workers is used instead of a traditional always-running Render server because this API is small and request-driven. See [DEPLOYMENT.md](./DEPLOYMENT.md) for exact setup instructions.

## Run locally

You need Node.js 20 or newer and a Neon database.

### 1. Start the backend

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars
# Put your Neon pooled connection string in .dev.vars
npm run dev
```

### 2. Start the frontend

In another terminal:

```bash
cd frontend
npm install
cp .env.example .env
# For local development, set VITE_API_BASE_URL=http://localhost:8787
npm run dev
```

Open the local URL printed by Vite.

## Privacy and security notes

- The browser recovery code is not an account or a password. Anyone who knows it can retrieve that progress record.
- No name, email address, date of birth, password, or advertising identifier is requested.
- The Neon connection string is stored only as a Cloudflare Worker secret.
- The frontend never receives database credentials.
- The API validates operation totals, rejects malformed codes, and limits request body size.

## Deploy

Follow [DEPLOYMENT.md](./DEPLOYMENT.md) to create the Neon table, deploy `backend/` to Cloudflare Workers, and deploy `frontend/` to Vercel.
