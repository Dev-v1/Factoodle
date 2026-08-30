import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../frontend/src/sync/engine.ts';
import { ApiError } from '../frontend/src/sync/api.ts';
import { emptyDocument, mergeDocuments, answerDocument, totals } from '../frontend/src/domain/model.ts';
import { A, B, CODE, OTHER, deferred, tick, profile } from './helpers.mjs';

function server() {
  const rows = new Map();
  const api = {
    async get(code) { if (!rows.has(code)) throw new ApiError('CODE_NOT_FOUND', 'Not found'); return structuredClone(rows.get(code)); },
    async put(code, doc) { const merged = mergeDocuments(rows.get(code) ?? emptyDocument(), doc); rows.set(code, merged); return structuredClone(merged); },
  };
  return { api, rows };
}
async function start(t, api, p = profile()) {
  const engine = new SyncEngine(p.store, api); t.after(() => engine.stop()); engine.start(); await engine.sync();
  return { ...p, engine };
}
const answer = engine => engine.answer('addition', 10, true, 1, false);

test('an empty newly-created profile is saved before any answers', async t => {
  const s = server(), { engine } = await start(t, s.api);
  assert.ok(s.rows.has(CODE)); assert.equal(engine.getSnapshot().state, 'saved');
});
test('answers during a slow request are queued, never aborted or lost', async t => {
  const s = server(), gate = deferred(); let hold = false, active = 0, maximum = 0;
  const api = { ...s.api, async put(code, doc) { active++; maximum = Math.max(active, maximum); try { if (hold) { hold = false; await gate.promise; } return await s.api.put(code, doc); } finally { active--; } } };
  const { engine } = await start(t, api);
  hold = true;
  await answer(engine);
  await Promise.all(Array.from({ length: 19 }, () => answer(engine)));
  assert.equal(totals(engine.getSnapshot().document).totalCorrect, 20);
  assert.equal(engine.getSnapshot().state, 'saving');
  gate.resolve(); await engine.sync();
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 20);
  assert.equal(maximum, 1); assert.equal(engine.getSnapshot().state, 'saved');
});
test('a save committed before a lost response is retried exactly once in totals', async t => {
  const s = server(); let lose = false;
  const api = { ...s.api, async put(code, doc) { const result = await s.api.put(code, doc); if (lose) { lose = false; throw new ApiError('NETWORK', 'Lost response', true); } return result; } };
  const { engine } = await start(t, api);
  lose = true; await answer(engine); await tick();
  assert.equal(engine.getSnapshot().state, 'offline');
  await engine.sync();
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 1); assert.equal(engine.getSnapshot().state, 'saved');
});
test('permanent configuration error keeps progress local and is not not-found', async t => {
  const api = { get: async () => emptyDocument(), put: async () => { throw new ApiError('DATABASE_NOT_CONFIGURED', 'Cloudflare needs DATABASE_URL'); } };
  const { engine, store } = await start(t, api);
  await answer(engine); await engine.sync();
  assert.equal(totals(store.read(CODE)).totalCorrect, 1);
  assert.equal(engine.getSnapshot().state, 'error'); assert.match(engine.getSnapshot().message, /DATABASE_URL/);
});
test('reload recovers a locally saved answer after browser closure during network save', async t => {
  const s = server(), p = profile(), gate = deferred(); let hold = false;
  const api = { ...s.api, async put(code, doc) { if (hold) { hold = false; await gate.promise; } return s.api.put(code, doc); } };
  const first = await start(t, api, p);
  hold = true; await answer(first.engine); first.engine.stop();
  const second = await start(t, s.api, p);
  assert.equal(totals(second.engine.getSnapshot().document).totalCorrect, 1);
  gate.resolve(); await tick();
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 1);
});
test('restore always reads server even when a stale local copy exists', async t => {
  const s = server(), p = profile(OTHER, B);
  p.storage.setItem('factoodle-v2:' + CODE, JSON.stringify(emptyDocument()));
  s.rows.set(CODE, answerDocument(emptyDocument(), A, 'addition', 10, true, 1, false));
  const { engine } = await start(t, s.api, p);
  await engine.restore(' fct abcd 2345 ');
  assert.equal(engine.getSnapshot().code, CODE); assert.equal(totals(engine.getSnapshot().document).stars, 1);
  assert.equal(p.storage.getItem('factoodle-code'), CODE);
});
test('failed restore preserves current profile and never creates the mistyped code', async t => {
  const s = server(), { engine, store } = await start(t, s.api);
  await answer(engine); await engine.sync();
  const before = store.read(CODE);
  await assert.rejects(engine.restore(OTHER), { code: 'CODE_NOT_FOUND' });
  assert.equal(engine.getSnapshot().code, CODE); assert.deepEqual(store.read(CODE), before);
  assert.equal(s.rows.has(OTHER), false); assert.equal(engine.getSnapshot().restoring, false);
});
test('an old in-flight save cannot switch the restored profile back', async t => {
  const s = server(), gate = deferred(); let hold = false;
  const api = { ...s.api, async put(code, doc) { if (hold && code === CODE) { hold = false; await gate.promise; } return s.api.put(code, doc); } };
  const { engine } = await start(t, api);
  s.rows.set(OTHER, emptyDocument()); hold = true; await answer(engine);
  await engine.restore(OTHER); gate.resolve(); await tick();
  assert.equal(engine.getSnapshot().code, OTHER); assert.equal(totals(engine.getSnapshot().document).totalCorrect, 0);
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 1);
});
test('cross-tab changes at save completion trigger another drain', async t => {
  const s = server(), p = profile(); let inject = false;
  const originalUpdate = p.store.update;
  p.store.update = async (...args) => {
    const result = await originalUpdate(...args);
    if (inject) { inject = false; await originalUpdate(CODE, doc => answerDocument(doc, A, 'addition', 10, true, 1, false)); }
    return result;
  };
  const { engine } = await start(t, s.api, p);
  inject = true; await engine.sync();
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 1);
  assert.equal(engine.getSnapshot().state, 'saved');
});
test('storage failures never acknowledge unsaved answers or delete prior data', async t => {
  const s = server(), p = profile(), { engine } = await start(t, s.api, p);
  const before = p.store.read(CODE);
  p.storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(answer(engine));
  assert.deepEqual(p.store.read(CODE), before); assert.equal(engine.getSnapshot().state, 'error');
});
test('concurrent tabs sharing a code/device keep all answers in one revision stream', async t => {
  const s = server(), p = profile();
  const first = await start(t, s.api, p), second = await start(t, s.api, p);
  await Promise.all([answer(first.engine), answer(second.engine), answer(first.engine), answer(second.engine)]);
  await Promise.all([first.engine.sync(), second.engine.sync()]);
  assert.equal(totals(s.rows.get(CODE)).totalCorrect, 4);
  assert.equal(s.rows.get(CODE).devices[A].revision, 4);
});
