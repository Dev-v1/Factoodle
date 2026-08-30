import { CODE_PATTERN, parseDocument, totals } from './model.ts';
import type { Repository } from './repository.ts';

export interface Env { DATABASE_URL?: string; FRONTEND_URL?: string }
export const MAX_BYTES = 128_000;
const PRODUCTION = 'https://factoodle.vercel.app';
function allowedOrigins(env: Env) {
  const candidates = (env.FRONTEND_URL || PRODUCTION).split(',').map(x => x.trim());
  return candidates.filter(x => { try { return new URL(x).origin === x; } catch { return false; } });
}
async function readJson(request: Request) {
  if (!request.body) throw new Error('EMPTY_BODY');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(repository: (connection: string) => Repository) {
  return async function fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = !origin || allowedOrigins(env).includes(origin);
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', 'X-Factoodle-Version': '2' });
    if (origin && allowed) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '600');
    }
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const fail = (code: string, error: string, status: number, retryable = false) => json({ code, error, retryable }, status);
    if (!allowed) return fail('ORIGIN_NOT_ALLOWED', 'This website is not allowed to access Factoodle. Check FRONTEND_URL.', 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    const configured = Boolean(env.DATABASE_URL?.trim());
    if (path === '/health' && request.method === 'GET') return json({ ok: true, service: 'factoodle-api', version: 2, databaseConfigured: configured });
    const route = path.match(/^\/api\/(v2\/)?progress\/([^/]+)$/);
    if (!route && path !== '/ready') return fail('NOT_FOUND', 'Not found.', 404);
    if (request.method !== 'GET' && request.method !== 'PUT') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    if (path === '/ready' && request.method !== 'GET') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    let code = '';
    if (route) {
      try { code = decodeURIComponent(route[2]).toUpperCase(); } catch { return fail('INVALID_CODE', 'Check the progress code.', 400); }
      if (!CODE_PATTERN.test(code)) return fail('INVALID_CODE', 'Check the progress code.', 400);
      if (!route[1] && request.method === 'PUT') return fail('UPDATE_REQUIRED', 'Refresh Factoodle to use the new reliable saving system.', 409);
    }
    if (!configured) return fail('DATABASE_NOT_CONFIGURED', 'Online saving is unavailable: the Cloudflare Worker needs its DATABASE_URL secret. Your progress stays on this device.', 503);
    let incoming;
    if (request.method === 'PUT') {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return fail('UNSUPPORTED_MEDIA_TYPE', 'Send JSON data.', 415);
      if (Number(request.headers.get('Content-Length')) > MAX_BYTES) return fail('BODY_TOO_LARGE', 'Progress data is too large.', 413);
      try { incoming = parseDocument(await readJson(request)); }
      catch (err) {
        if (err instanceof Error && err.message === 'BODY_TOO_LARGE') return fail('BODY_TOO_LARGE', 'Progress data is too large.', 413);
        return fail('INVALID_PROGRESS', 'Progress data could not be validated. Your local copy has not been removed.', 400);
      }
    }
    try {
      const db = repository(env.DATABASE_URL!.trim());
      if (path === '/ready') { await db.ready(); return json({ ok: true, database: 'ready', version: 2 }); }
      const document = incoming ? await db.sync(code, incoming) : await db.get(code);
      if (!document) return fail('CODE_NOT_FOUND', 'That code has not been saved online yet. Open the original device and choose Save now.', 404);
      return route?.[1] ? json({ document, progress: totals(document) }) : json(totals(document));
    } catch (err) {
      // Never log the driver error object; it can contain credentials or SQL values.
      const sqlCode = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
      if (sqlCode === '42P01') return fail('DATABASE_SCHEMA_MISSING', 'Online saving needs the learner_progress table. Ask a grown-up to check the database setup.', 503);
      if (sqlCode === '28P01') return fail('DATABASE_AUTH_FAILED', 'The database connection needs updating. Your progress stays on this device.', 503);
      if (err instanceof Error && /revision conflict|cannot decrease/.test(err.message)) return fail('SYNC_CONFLICT', 'A browser copy conflicts with saved progress. Keep this tab open and contact support.', 409);
      if (err instanceof Error && err.name === 'ConflictError') return fail('SYNC_BUSY', 'Another device is saving. Retrying shortly.', 409, true);
      return fail('DATABASE_UNAVAILABLE', 'Online saving is temporarily unavailable. Your progress stays on this device; use Save now to retry.', 503, true);
    }
  };
}
