import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { createHandler } from '../backend/src/handler.ts';
import { repositoryFromQuery } from '../backend/src/repository.ts';
import { createApi } from '../frontend/src/sync/api.ts';
import { SyncEngine } from '../frontend/src/sync/engine.ts';
import { makeCode, totals } from '../frontend/src/domain/model.ts';
import { A, B, profile, memorySql } from './helpers.mjs';

test('review 5: real HTTP save/recovery flow with isolated browser stores and an upstream outage', async t => {
  // Real HTTP and production application modules; SQL transport is an in-memory fixture, NOT Neon.
  const db = memorySql(), handler = createHandler(() => repositoryFromQuery(db.sql));
  let unavailable = false;
  const server = createServer(async (req, res) => {
    try {
      if (unavailable) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Upstream unavailable' })); return; }
      const request = new Request('http://localhost' + req.url, {
        method: req.method, headers: req.headers,
        ...(['GET','HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }),
      });
      const response = await handler(request, { DATABASE_URL: 'test-transport-not-a-credential', FRONTEND_URL: 'https://factoodle.vercel.app' });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end('Test server failure'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(base, (url, init) => fetch(url, { ...init, headers: { ...init.headers, Origin: 'https://factoodle.vercel.app' } }));
  const firstProfile = profile(makeCode(), A), secondProfile = profile(makeCode(), B);
  const first = new SyncEngine(firstProfile.store, api), second = new SyncEngine(secondProfile.store, api);
  t.after(() => { first.stop(); second.stop(); });
  first.start(); await first.sync();
  const code = first.getSnapshot().code;
  assert.equal(first.getSnapshot().state, 'saved');
  assert.equal(totals(await api.get(code)).totalAnswered, 0);
  unavailable = true;
  for (let i = 0; i < 10; i++) await first.answer('addition', 10, true, i + 1, i === 9);
  await first.sync();
  assert.equal(first.getSnapshot().state, 'offline');
  assert.equal(totals(firstProfile.store.read(code)).totalCorrect, 10);
  assert.equal(totals(db.rows.get(code)).totalCorrect, 0);
  unavailable = false; await first.sync(); await first.sync();
  assert.equal(totals(await api.get(code)).totalCorrect, 10); // Retrying cannot duplicate stars.
  second.start(); await second.sync();
  await second.restore(' ' + code.toLowerCase().replaceAll('-', ' — ') + ' ');
  assert.equal(totals(second.getSnapshot().document).stars, 10);
  assert.equal(totals(second.getSnapshot().document).sessions, 1);
  await Promise.all([first.answer('division', 50, true, 1, false), second.answer('subtraction', 20, true, 1, false)]);
  await Promise.all([first.sync(), second.sync()]); await first.sync(); await second.sync();
  assert.equal(totals(await api.get(code)).stars, 12);
  const countBefore = db.rows.size;
  let missing = makeCode(); while (db.rows.has(missing)) missing = makeCode();
  await assert.rejects(second.restore(missing), { code: 'CODE_NOT_FOUND' });
  assert.equal(second.getSnapshot().code, code); assert.equal(db.rows.size, countBefore);
  const reloaded = new SyncEngine(firstProfile.store, api); t.after(() => reloaded.stop());
  reloaded.start(); await reloaded.sync();
  assert.equal(totals(reloaded.getSnapshot().document).stars, 12);
  assert.equal(reloaded.getSnapshot().code, code);
  assert.equal(reloaded.getSnapshot().state, 'saved');
});
