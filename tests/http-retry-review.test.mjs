import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../frontend/src/sync/api.ts';
import { CODE } from './helpers.mjs';

for (const status of [408, 500, 502, 503, 504]) {
  test(`review 3: temporary HTTP ${status} remains retryable without a server retryable flag`, async () => {
    const api = createApi('https://api.example', async () => Response.json({ error: 'Temporary upstream failure' }, { status }));
    await assert.rejects(api.get(CODE), { code: `HTTP_${status}`, retryable: true });
  });
}
test('review 3: an HTML access-denied page must not cause endless automatic retries', async () => {
  const api = createApi('https://api.example', async () => new Response('<html>Forbidden</html>', { status: 403 }));
  await assert.rejects(api.get(CODE), { code: 'HTTP_403', retryable: false });
});
test('review 3: gateway HTML errors retain their HTTP status and remain retryable', async () => {
  const api = createApi('https://api.example', async () => new Response('<html>Bad gateway</html>', { status: 502 }));
  await assert.rejects(api.get(CODE), { code: 'HTTP_502', retryable: true });
});
test('review 3: missing database configuration stays permanent even with HTTP 503', async () => {
  for (const code of ['DATABASE_NOT_CONFIGURED', 'DATABASE_AUTH_FAILED', 'DATABASE_SCHEMA_MISSING']) {
    const api = createApi('https://api.example', async () => Response.json({ code }, { status: 503 }));
    await assert.rejects(api.get(CODE), { code, retryable: false });
  }
});
test('review 3: timeout during response-body streaming reports TIMEOUT, not bad JSON', async () => {
  const api = createApi('https://api.example', async (_, init) => ({
    ok: true, status: 200,
    json: () => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
  }), 5);
  await assert.rejects(api.get(CODE), { code: 'TIMEOUT', retryable: true });
});
test('review 3: busy saves retry but an unknown recovery code does not', async () => {
  await assert.rejects(createApi('https://api.example', async () => Response.json({ code: 'SYNC_BUSY', retryable: true }, { status: 409 })).get(CODE), { code: 'SYNC_BUSY', retryable: true });
  await assert.rejects(createApi('https://api.example', async () => Response.json({ code: 'CODE_NOT_FOUND', retryable: false }, { status: 404 })).get(CODE), { code: 'CODE_NOT_FOUND', retryable: false });
});
