import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../frontend/src/sync/engine.ts';
import { ApiError } from '../frontend/src/sync/api.ts';
import { emptyDocument, mergeDocuments, totals } from '../frontend/src/domain/model.ts';
import { CODE, OTHER, profile, deferred } from './helpers.mjs';

test('review 2: another tab sees locally saved progress even while the network is down', async t => {
  const p = profile(); let online = true, remote = emptyDocument();
  const api = { async get() { return remote; }, async put(code, doc) {
    if (!online) throw new ApiError('NETWORK', 'Offline', true);
    remote = mergeDocuments(remote, doc); return remote;
  } };
  const first = new SyncEngine(p.store, api), second = new SyncEngine(p.store, api);
  t.after(() => { first.stop(); second.stop(); });
  first.start(); second.start(); await Promise.all([first.sync(), second.sync()]);
  online = false;
  await first.answer('addition', 10, true, 1, false); await first.sync();
  await second.sync();
  assert.equal(second.getSnapshot().state, 'offline');
  assert.equal(totals(second.getSnapshot().document).totalCorrect, 1);
  online = true; await second.sync(); await first.sync();
  assert.equal(totals(remote).totalCorrect, 1);
  assert.equal(first.getSnapshot().state, 'saved');
});
test('review 2: two simultaneous restore clicks cannot mix profiles', async t => {
  const p = profile(), gate = deferred(); let reads = 0;
  const api = { async put(code, doc) { return doc; }, async get() { reads++; return gate.promise; } };
  const engine = new SyncEngine(p.store, api); t.after(() => engine.stop());
  engine.start(); await engine.sync();
  const restore = engine.restore(OTHER);
  await assert.rejects(engine.restore(CODE), /already in progress/);
  assert.equal(reads, 1); assert.equal(engine.getSnapshot().code, CODE);
  gate.resolve(emptyDocument()); await restore;
  assert.equal(engine.getSnapshot().code, OTHER);
  assert.equal(p.store.active(), OTHER);
});
test('review 2: losing connection during restore preserves the active code and counters', async t => {
  const p = profile();
  const api = { async put(code, doc) { return doc; }, async get() { throw new ApiError('NETWORK', 'Offline', true); } };
  const engine = new SyncEngine(p.store, api); t.after(() => engine.stop());
  engine.start(); await engine.sync();
  await engine.answer('division', 30, true, 1, true); await engine.sync();
  const before = p.store.read(CODE);
  await assert.rejects(engine.restore(OTHER), { code: 'NETWORK' });
  assert.equal(p.store.active(), CODE); assert.deepEqual(p.store.read(CODE), before);
  assert.equal(engine.getSnapshot().restoring, false);
});
