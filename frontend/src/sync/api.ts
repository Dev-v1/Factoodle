import { CODE_PATTERN, parseDocument, type Document } from '../domain/model.ts';
export class ApiError extends Error {
  code: string; retryable: boolean;
  constructor(code: string, message: string, retryable = false) { super(message); this.code = code; this.retryable = retryable; }
}
export interface ProgressApi { get(code: string): Promise<Document>; put(code: string, doc: Document): Promise<Document> }
export function createApi(base: string | undefined, fetcher: typeof fetch = fetch, timeout = 20_000): ProgressApi {
  const url = base?.trim().replace(/\/+$/, '');
  async function call(code: string, document?: Document): Promise<Document> {
    if (!url) throw new ApiError('API_NOT_CONFIGURED', 'Online saving is not configured. Set VITE_API_BASE_URL in Vercel and redeploy.');
    if (!CODE_PATTERN.test(code)) throw new ApiError('INVALID_CODE', 'Check the progress code and try again.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(`${url}/api/v2/progress/${encodeURIComponent(code)}`, {
        method: document ? 'PUT' : 'GET', cache: 'no-store', signal: controller.signal,
        ...(document ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document) } : {}),
      });
      let body;
      try { body = await response.json(); } catch { throw new ApiError('INVALID_RESPONSE', 'The server returned an unexpected response. Check the backend deployment.', true); }
      if (!response.ok) {
        const messages: Record<string, string> = {
          DATABASE_NOT_CONFIGURED: 'Online saving is unavailable: Cloudflare needs its DATABASE_URL secret. Your progress is still on this device.',
          DATABASE_AUTH_FAILED: 'The database connection needs updating. Your progress is still on this device.',
          DATABASE_SCHEMA_MISSING: 'Online saving needs the database progress table. Ask a grown-up to check the setup.',
          CODE_NOT_FOUND: 'This code has not been saved online yet. On the original device, tap Save now and wait for Saved online.',
          SYNC_CONFLICT: 'This browser has a conflicting copy. Your local data is preserved. Please contact support.',
          UPDATE_REQUIRED: 'Refresh Factoodle to get the latest saving system.',
        };
        const errorCode = typeof body?.code === 'string' ? body.code : `HTTP_${response.status}`;
        throw new ApiError(errorCode, messages[errorCode] ?? `Online saving failed (${response.status}). Your local progress is preserved. Try Save now.`,
          body?.retryable === true || response.status === 429);
      }
      try { return parseDocument(body.document); }
      catch { throw new ApiError('INVALID_RESPONSE', 'The server sent invalid progress. Your local copy is preserved.', true); }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'The save is taking too long. Your progress is safe on this device; retrying is safe.', true);
      throw new ApiError('NETWORK', 'Cannot reach online saving. Check your connection; your progress is still on this device.', true);
    } finally { clearTimeout(timer); }
  }
  return { get: code => call(code), put: (code, doc) => call(code, doc) };
}
