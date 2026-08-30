import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, MAX_BYTES } from '../backend/src/handler.ts';
import { repositoryFromQuery } from '../backend/src/repository.ts';
import { emptyDocument } from '../backend/src/model.ts';
import { createApi } from '../frontend/src/sync/api.ts';
import { CODE, memorySql } from './helpers.mjs';
const origin = 'https://factoodle.vercel.app';
const env = { DATABASE_URL: 'test-only-not-a-credential', FRONTEND_URL: origin };
const path = `/api/v2/progress/${CODE}`;
function setup() { const db = memorySql(); return { db, handler: createHandler(() => repositoryFromQuery(db.sql)) }; }
const request = (url = path, method = 'GET', body, extra = {}) => new Request('https://api.example' + url, { method, headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });

test('health reports configuration; readiness checks the actual repository', async () => {
  const { handler, db } = setup();
  const health = await handler(request('/health'), {});
  assert.equal((await health.json()).databaseConfigured, false);
  const ready = await handler(request('/ready'), env);
  assert.equal(ready.status, 200); assert.equal(db.calls.length, 1);
});
test('production CORS and preflight succeed, foreign/malformed origins fail', async () => {
  const { handler } = setup();
  const preflight = await handler(request(path, 'OPTIONS'), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(preflight.headers.get('Cache-Control'), 'no-store');
  assert.equal((await handler(request(path, 'GET', undefined, { Origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handler(request(path), { ...env, FRONTEND_URL: 'https://https://factoodle.vercel.app' })).status, 403);
});
test('database misconfiguration cannot be reported as an unknown code', async () => {
  const { handler, db } = setup();
  const response = await handler(request(), { FRONTEND_URL: origin });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'DATABASE_NOT_CONFIGURED');
  assert.equal(db.calls.length, 0);
});
test('valid save can immediately be retrieved with no cached response', async () => {
  const { handler } = setup();
  assert.equal((await handler(request(path, 'PUT', emptyDocument()), env)).status, 200);
  const response = await handler(request(), env);
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).document, emptyDocument());
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('only a real absence returns CODE_NOT_FOUND', async () => {
  const response = await setup().handler(request(), env);
  assert.equal(response.status, 404); assert.equal((await response.json()).code, 'CODE_NOT_FOUND');
});
test('legacy reads stay compatible but stale-client writes cannot overwrite v2', async () => {
  const { handler } = setup();
  await handler(request(path, 'PUT', emptyDocument()), env);
  const oldPath = path.replace('/v2', '');
  const read = await handler(request(oldPath), env);
  assert.equal((await read.json()).totalCorrect, 0);
  const write = await handler(request(oldPath, 'PUT', emptyDocument()), env);
  assert.equal(write.status, 409); assert.equal((await write.json()).code, 'UPDATE_REQUIRED');
});
test('invalid codes, malformed URLs and methods do not touch SQL', async () => {
  const { handler, db } = setup();
  assert.equal((await handler(request('/api/v2/progress/%E0%A4%A'), env)).status, 400);
  assert.equal((await handler(request('/api/v2/progress/invalid'), env)).status, 400);
  assert.equal((await handler(request(path, 'POST'), env)).status, 405);
  assert.equal((await handler(request('/heath'), env)).status, 404);
  assert.equal(db.calls.length, 0);
});
test('malformed JSON, untrusted types and declared/actual oversized bodies are rejected', async () => {
  const { handler, db } = setup();
  for (const body of ['{invalid', null, [], { schemaVersion: 999 }]) assert.equal((await handler(request(path, 'PUT', body), env)).status, 400);
  assert.equal((await handler(request(path, 'PUT', '{}', { 'Content-Type': 'text/plain' }), env)).status, 415);
  assert.equal((await handler(request(path, 'PUT', '{}', { 'Content-Length': String(MAX_BYTES + 1) }), env)).status, 413);
  assert.equal((await handler(request(path, 'PUT', ' '.repeat(MAX_BYTES + 1)), env)).status, 413);
  assert.equal(db.calls.length, 0);
});
test('chunked request size is bounded even without Content-Length', async () => {
  const { handler } = setup();
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 3; i++) controller.enqueue(new Uint8Array(50_000)); controller.close(); } });
  const req = new Request('https://api.example' + path, { method: 'PUT', body: stream, duplex: 'half', headers: { Origin: origin, 'Content-Type': 'application/json' } });
  assert.equal((await handler(req, env)).status, 413);
});
for (const [error, expected, retryable] of [[{ code: '42P01' }, 'DATABASE_SCHEMA_MISSING', false], [{ code: '28P01' }, 'DATABASE_AUTH_FAILED', false], [new Error('secret-canary-do-not-leak'), 'DATABASE_UNAVAILABLE', true], [Object.assign(new Error('busy'), { name: 'ConflictError' }), 'SYNC_BUSY', true]]) {
  test(`database error ${expected} is distinct and does not expose credentials`, async () => {
    const handler = createHandler(() => ({ get() { throw error; } }));
    const response = await handler(request(), env);
    const body = await response.json();
    assert.equal(body.code, expected); assert.equal(body.retryable, retryable);
    assert.ok(!JSON.stringify(body).includes('secret-canary'));
  });
}
test('client uses the versioned endpoint, JSON, no-store and parses server data', async () => {
  let call;
  const api = createApi('https://api.example/', async (url, init) => { call = { url, init }; return Response.json({ document: emptyDocument() }); });
  await api.put(CODE, emptyDocument());
  assert.equal(call.url, 'https://api.example' + path);
  assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.method, 'PUT');
  assert.deepEqual(JSON.parse(call.init.body), emptyDocument());
});
test('client distinguishes configuration, not-found, network and malformed responses', async () => {
  await assert.rejects(createApi('').get(CODE), { code: 'API_NOT_CONFIGURED' });
  await assert.rejects(createApi('https://api.example', async () => Response.json({ code: 'DATABASE_NOT_CONFIGURED' }, { status: 503 })).get(CODE), { code: 'DATABASE_NOT_CONFIGURED', retryable: false });
  await assert.rejects(createApi('https://api.example', async () => Response.json({ code: 'CODE_NOT_FOUND' }, { status: 404 })).get(CODE), { code: 'CODE_NOT_FOUND' });
  await assert.rejects(createApi('https://api.example', async () => { throw new TypeError('network'); }).get(CODE), { code: 'NETWORK', retryable: true });
  await assert.rejects(createApi('https://api.example', async () => new Response('<html>oops</html>')).get(CODE), { code: 'INVALID_RESPONSE' });
});
test('client times out a hung request and makes retries safe', async () => {
  const api = createApi('https://api.example', (_, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))), 5);
  await assert.rejects(api.get(CODE), { code: 'TIMEOUT', retryable: true });
});
