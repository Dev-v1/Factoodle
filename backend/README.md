# Factoodle Worker

Keep Worker `factoodle-api` and production entrypoint `src/index.ts`. The same
Neon `learner_progress` table stores migrated v1 and v2 JSON documents.

Runtime settings:

- `DATABASE_URL`: encrypted Cloudflare runtime secret containing the entire current Neon pooled connection string, not just the password.
- `FRONTEND_URL`: comma-separated allowed origins, currently `http://localhost:5173,https://factoodle.vercel.app`.

Build variables and Vercel variables do not configure Worker runtime secrets.

| Endpoint | Meaning |
| --- | --- |
| `GET /health` | Version and configuration presence; does not query Neon. |
| `GET /ready` | Queries the actual progress table. |
| `GET /api/v2/progress/:code` | Returns `{document, progress}`; true absence returns `CODE_NOT_FOUND`. |
| `PUT /api/v2/progress/:code` | Validates and durably merges progress before acknowledging. |
| `GET /api/progress/:code` | Legacy aggregate read. |
| `PUT /api/progress/:code` | `UPDATE_REQUIRED` prevents stale-client overwrites. |

Responses are `no-store`; driver errors are not exposed. The health path is
`/health`, not `/heath`. See [the dashboard-only guide](../DEPLOYMENT.md).
