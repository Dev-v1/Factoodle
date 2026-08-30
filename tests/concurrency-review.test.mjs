import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDocument, answerDocument, mergeDocuments, totals } from '../frontend/src/domain/model.ts';
import { SyncEngine } from '../frontend/src/sync/engine.ts';
import { ApiError } from '../frontend/src/sync/api.ts';
import { CODE, OTHER, profile, deferred } from './helpers.mjs';

test('review 4: shuffled and duplicated saves converge across 8 devices and 24 orderings', () => {
  const history = []; let expected = emptyDocument();
  for (let device = 1; device <= 8; device++) {
    const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(device).padStart(12, '0')}`;
    let doc = emptyDocument();
    for (let i = 1; i <= 30; i++) {
      doc = answerDocument(doc, id, i % 2 ? 'addition' : 'division', i % 2 ? 10 : 50, i % 3 !== 0, i % 3 !== 0 ? 1 : 0, i % 10 === 0);
      if (i % 5 === 0) history.push(doc);
    }
    expected = mergeDocuments(expected, doc);
  }
  for (let seed = 1; seed <= 24; seed++) {
    let random = seed, docs = [...history, ...history.slice(0, 10)];
    for (let i = docs.length - 1; i > 0; i--) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const j = random % (i + 1); [docs[i], docs[j]] = [docs[j], docs[i]];
    }
    const merged = docs.reduce(mergeDocuments, emptyDocument());
    assert.deepEqual(merged, expected);
    assert.equal(totals(merged).totalAnswered, 240); assert.equal(totals(merged).totalCorrect, 160);
    assert.equal(totals(merged).sessions, 24);
  }
});
test('review 4: queued failures leave only one retry timer and stopping cancels it', async t => {
  const pending = new Map(); let nextId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++nextId; pending.set(id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => { pending.delete(id); });
  const api = { async get() { return emptyDocument(); }, async put() { throw new ApiError('NETWORK', 'Offline', true); } };
  const engine = new SyncEngine(profile().store, api); t.after(() => engine.stop());
  engine.start();
  await engine.sync(); // Queue another drain while the first request is pending.
  assert.equal(pending.size, 1);
  assert.ok([...pending.values()][0].delay <= 30_000);
  engine.stop(); assert.equal(pending.size, 0);
});
test('review 4: a failed profile activation preserves the original code and progress', async t => {
  const p = profile(), api = { async get() { return emptyDocument(); }, async put(code, doc) { return doc; } };
  const engine = new SyncEngine(p.store, api); t.after(() => engine.stop());
  engine.start(); await engine.sync();
  await engine.answer('subtraction', 20, true, 1, false); await engine.sync();
  const before = p.store.read(CODE), original = p.storage.setItem;
  p.storage.setItem = (key, value) => { if (key === 'factoodle-code') throw new Error('Storage denied'); return original(key, value); };
  await assert.rejects(engine.restore(OTHER), /Storage denied/);
  assert.equal(engine.getSnapshot().code, CODE); assert.equal(p.store.active(), CODE);
  assert.deepEqual(p.store.read(CODE), before); assert.equal(engine.getSnapshot().restoring, false);
});
test('review 4: an old profile save cannot cancel the restored profile retry', async t => {
  const pending = new Map(); let nextId = 0, hold = false;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++nextId; pending.set(id, { callback, delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => { pending.delete(id); });
  const gate = deferred();
  const api = { async get() { return emptyDocument(); }, async put(code, doc) {
    if (code === OTHER) throw new ApiError('NETWORK', 'Offline', true);
    if (hold) { hold = false; await gate.promise; }
    return doc;
  } };
  const engine = new SyncEngine(profile().store, api); t.after(() => engine.stop());
  engine.start(); await engine.sync();
  hold = true; await engine.answer('addition', 10, true, 1, false);
  await engine.restore(OTHER);
  assert.equal(pending.size, 1);
  const oldSave = engine.sync(CODE);
  assert.equal(pending.size, 1);
  gate.resolve(); await oldSave;
  assert.equal(engine.getSnapshot().code, OTHER); assert.equal(pending.size, 1);
  engine.stop(); assert.equal(pending.size, 0);
});
