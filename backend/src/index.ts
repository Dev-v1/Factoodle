import { neon } from "@neondatabase/serverless";

interface Env {
  DATABASE_URL: string;
  FRONTEND_URL: string;
}

interface Progress {
  totalCorrect: number;
  totalAnswered: number;
  bestStreak: number;
  stars: number;
  sessions: number;
  byLevel: Record<string, { correct: number; answered: number }>;
}

const CODE_PATTERN = /^FCT-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const OPERATIONS = new Set(["addition", "subtraction", "multiplication", "division"]);
const LEVELS = new Set([10, 20, 30, 40, 50]);

function validInteger(value: unknown, max = 1_000_000): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max;
}

function cleanProgress(value: unknown): Progress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const numericKeys = ["totalCorrect", "totalAnswered", "bestStreak", "stars", "sessions"];
  if (!numericKeys.every((key) => validInteger(body[key]))) return null;
  if (Number(body.totalCorrect) > Number(body.totalAnswered)) return null;
  if (!body.byLevel || typeof body.byLevel !== "object" || Array.isArray(body.byLevel)) return null;

  const byLevel: Progress["byLevel"] = {};
  for (const [key, rawStats] of Object.entries(body.byLevel as Record<string, unknown>)) {
    const [operation, rawLevel] = key.split("-");
    const level = Number(rawLevel);
    if (!OPERATIONS.has(operation) || !LEVELS.has(level) || !rawStats || typeof rawStats !== "object" || Array.isArray(rawStats)) return null;
    const stats = rawStats as Record<string, unknown>;
    if (!validInteger(stats.correct) || !validInteger(stats.answered) || stats.correct > stats.answered) return null;
    byLevel[key] = { correct: stats.correct, answered: stats.answered };
  }

  return {
    totalCorrect: body.totalCorrect as number,
    totalAnswered: body.totalAnswered as number,
    bestStreak: body.bestStreak as number,
    stars: body.stars as number,
    sessions: body.sessions as number,
    byLevel,
  };
}

function allowedOrigin(request: Request, env: Env): string | null | false {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.FRONTEND_URL || "").split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : false;
}

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (origin === false) return json({ error: "Origin is not allowed" }, 403, null);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "factoodle-api" }, 200, origin);
    }

    const match = url.pathname.match(/^\/api\/progress\/([^/]+)$/);
    if (!match) return json({ error: "Not found" }, 404, origin);

    const code = decodeURIComponent(match[1]).toUpperCase();
    if (!CODE_PATTERN.test(code)) return json({ error: "Invalid progress code" }, 400, origin);
    if (!env.DATABASE_URL) return json({ error: "Database is not configured" }, 503, origin);

    try {
      const sql = neon(env.DATABASE_URL);

      if (request.method === "GET") {
        const rows = await sql`SELECT progress FROM learner_progress WHERE progress_code = ${code} LIMIT 1`;
        if (!rows.length) return json({ error: "Progress code not found" }, 404, origin);
        return json(rows[0].progress, 200, origin);
      }

      if (request.method === "PUT") {
        const declaredLength = Number(request.headers.get("Content-Length") || 0);
        if (declaredLength > 50_000) return json({ error: "Request is too large" }, 413, origin);

        const rawBody = await request.text();
        if (rawBody.length > 50_000) return json({ error: "Request is too large" }, 413, origin);

        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          return json({ error: "Request body must be valid JSON" }, 400, origin);
        }

        const progress = cleanProgress(parsedBody);
        if (!progress) return json({ error: "Invalid progress data" }, 400, origin);
        await sql`
          INSERT INTO learner_progress (progress_code, progress)
          VALUES (${code}, ${JSON.stringify(progress)}::jsonb)
          ON CONFLICT (progress_code)
          DO UPDATE SET progress = EXCLUDED.progress, updated_at = NOW()
        `;
        return json({ ok: true }, 200, origin);
      }

      return json({ error: "Method not allowed" }, 405, origin);
    } catch (error) {
      console.error("Factoodle API error", error);
      return json({ error: "Something went wrong" }, 500, origin);
    }
  },
};
