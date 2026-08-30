import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../backend/src/handler.ts';
import { repositoryFromQuery } from '../backend/src/repository.ts';
import { createApi } from '../frontend/src/sync/api.ts';
import { SyncEngine } from '../frontend/src/sync/engine.ts';
import { emptyProgress, totals } from '../frontend/src/domain/model.ts';
import { A, B, CODE, OTHER, memorySql, profile, tick } from './helpers.mjs';
const origin = 'https://factoodle.vercel.app';
const environment = { FRONTEND_URL: origin, DATABASE_URL: 'test-transport-only' };
function stack(t, env = environment) {
  const db = memorySql();
  const handler = createHandler(() => repositoryFromQuery(db.sql));
  const api = createApi('https://factoodle-api.example', (url, init) => handler(new Request(url, { ...init, headers: { ...init.headers, Origin: origin } }), env));
  function browser(code, id) {
    const p = profile(code, id), engine = new SyncEngine(p.store, api);
    t.after(() => engine.stop());
    return { ...p, engine };
  }
  return { db, api, browser };
}
test('full client → handler → SQL repository → response → second browser restore flow', async t => {
  const { db, browser, api } = stack(t), first = browser(CODE, A), second = browser(OTHER, B);
  first.engine.start(); await first.engine.sync();
  for (let i = 0; i < 10; i++) await first.engine.answer('addition', 10, i < 7, i < 7 ? i + 1 : 0, i === 9);
  await first.engine.sync();
  assert.equal(first.engine.getSnapshot().state, 'saved');
  second.engine.start(); await second.engine.sync(); await second.engine.restore(CODE);
  assert.equal(totals(second.engine.getSnapshot().document).totalCorrect, 7);
  assert.equal(totals(second.engine.getSnapshot().document).sessions, 1);
  await Promise.all([first.engine.answer('division', 20, true, 1, false), second.engine.answer('subtraction', 30, true, 1, false)]);
  await Promise.all([first.engine.sync(), second.engine.sync()]);
  await first.engine.sync(); await second.engine.sync();
  assert.deepEqual(totals(first.engine.getSnapshot().document), totals(second.engine.getSnapshot().document));
  assert.equal(totals(db.rows.get(CODE)).totalAnswered, 12);
  assert.equal(totals(db.rows.get(CODE)).totalCorrect, 9);
  first.engine.stop();
  const reloaded = new SyncEngine(first.store, api);
  t.after(() => reloaded.stop()); reloaded.start(); await reloaded.sync();
  assert.equal(totals(reloaded.getSnapshot().document).totalCorrect, 9);
});
test('old local progress uploads on reopening and restores in another isolated store', async t => {
  const { browser } = stack(t), first = browser(CODE, A), second = browser(OTHER, B);
  const old = { ...emptyProgress(), totalAnswered: 40, totalCorrect: 30, stars: 30, bestStreak: 8, sessions: 4 };
  first.storage.setItem('factoodle-progress:' + CODE, JSON.stringify(old));
  first.engine.start(); await first.engine.sync();
  second.engine.start(); await second.engine.sync(); await second.engine.restore(CODE);
  assert.deepEqual(totals(second.engine.getSnapshot().document), old);
  assert.equal(first.storage.getItem('factoodle-progress:' + CODE), JSON.stringify(old));
});
test('missing production-style secret displays configuration failure and preserves local answers', async t => {
  const { browser, db } = stack(t, { FRONTEND_URL: origin });
  const first = browser(CODE, A), second = browser(OTHER, B);
  first.engine.start(); await first.engine.sync();
  await first.engine.answer('addition', 10, true, 1, false); await first.engine.sync();
  assert.equal(first.engine.getSnapshot().state, 'error');
  assert.match(first.engine.getSnapshot().message, /DATABASE_URL/);
  second.engine.start(); await second.engine.sync();
  await assert.rejects(second.engine.restore(CODE), { code: 'DATABASE_NOT_CONFIGURED' });
  assert.equal(totals(first.store.read(CODE)).totalCorrect, 1); assert.equal(db.rows.size, 0);
});
test('concurrent multi-device stress: 100 answers converge without duplicates', async t => {
  const { browser, db } = stack(t), first = browser(CODE, A), second = browser(CODE, B);
  first.engine.start(); second.engine.start(); await Promise.all([first.engine.sync(), second.engine.sync()]);
  for (let i = 0; i < 50; i++) await Promise.all([first.engine.answer('multiplication', 50, true, 1, i === 49), second.engine.answer('division', 50, true, 1, i === 49)]);
  await Promise.all([first.engine.sync(), second.engine.sync()]);
  await tick(); await first.engine.sync(); await second.engine.sync();
  assert.equal(totals(db.rows.get(CODE)).totalAnswered, 100);
  assert.equal(totals(db.rows.get(CODE)).sessions, 2);
  assert.equal(first.engine.getSnapshot().state, 'saved'); assert.equal(second.engine.getSnapshot().state, 'saved');
});
