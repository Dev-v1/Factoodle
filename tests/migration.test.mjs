import test from 'node:test';
import assert from 'node:assert/strict';
import { answerDocument, emptyDocument, emptyProgress, parseDocument, mergeDocuments, totals } from '../backend/src/model.ts';
import { createStore } from '../frontend/src/sync/storage.ts';
import { A, B, C, CODE, memory, locks, profile } from './helpers.mjs';
const answered = (doc, id, count) => {
  for (let i = 0; i < count; i++) doc = answerDocument(doc, id, 'addition', 10, true, i + 1, (i + 1) % 10 === 0);
  return doc;
};
test('legacy browser code and progress migrate without deleting or double counting', async () => {
  const old = { ...emptyProgress(), totalAnswered: 9, totalCorrect: 7, stars: 7, bestStreak: 4, byLevel: { 'addition-10': { answered: 9, correct: 7 } } };
  const storage = memory({ 'factoodle-code': CODE, ['factoodle-progress:' + CODE]: JSON.stringify(old) });
  const store = createStore(storage, locks());
  assert.equal(store.active(), CODE);
  const migrated = store.read(CODE);
  assert.deepEqual(totals(migrated), old);
  const remote = parseDocument(old);
  await store.update(CODE, doc => mergeDocuments(doc, remote));
  assert.deepEqual(totals(store.read(CODE)), old);
  assert.equal(storage.getItem('factoodle-progress:' + CODE), JSON.stringify(old));
  await store.update(CODE, doc => answered(doc, A, 1));
  assert.equal(totals(store.read(CODE)).totalCorrect, 8);
});
test('repeated, delayed and out-of-order saves never duplicate or roll back totals', () => {
  const old = answered(emptyDocument(), A, 1);
  const latest = answered(emptyDocument(), A, 10);
  assert.deepEqual(mergeDocuments(latest, old), latest);
  assert.deepEqual(mergeDocuments(latest, latest), latest);
  assert.deepEqual(mergeDocuments(old, latest), latest);
  assert.equal(totals(latest).sessions, 1);
});
test('independent browser progress merges commutatively and associatively', () => {
  const a = answered(emptyDocument(), A, 10), b = answered(emptyDocument(), B, 7), c = answered(emptyDocument(), C, 3);
  assert.deepEqual(mergeDocuments(a, b), mergeDocuments(b, a));
  assert.deepEqual(mergeDocuments(mergeDocuments(a, b), c), mergeDocuments(a, mergeDocuments(b, c)));
  const total = totals(mergeDocuments(mergeDocuments(a, b), c));
  assert.equal(total.totalCorrect, 20); assert.equal(total.stars, 20); assert.equal(total.bestStreak, 10);
  assert.deepEqual(total.byLevel['addition-10'], { correct: 20, answered: 20 });
});
test('conflicting revisions and counter decreases fail without overwriting', () => {
  const a = answered(emptyDocument(), A, 2), conflict = structuredClone(a);
  conflict.devices[A].progress.stars--;
  assert.throws(() => mergeDocuments(a, conflict), /revision conflict/);
  conflict.devices[A].revision++;
  assert.throws(() => mergeDocuments(a, conflict), /cannot decrease/);
  assert.equal(totals(a).stars, 2);
});
test('local writes from two tabs sharing one device are serialized', async () => {
  const { store } = profile();
  await Promise.all(Array.from({ length: 50 }, () => store.update(CODE, doc => answerDocument(doc, A, 'division', 20, true, 1, false))));
  assert.equal(totals(store.read(CODE)).totalAnswered, 50);
  assert.equal(store.read(CODE).devices[A].revision, 50);
});
test('corrupt local progress remains intact and errors instead of silently resetting', () => {
  const { store, storage } = profile();
  storage.setItem('factoodle-v2:' + CODE, '{broken');
  assert.throws(() => store.read(CODE));
  assert.equal(storage.getItem('factoodle-v2:' + CODE), '{broken');
});
test('malformed device IDs are replaced with valid IDs', () => {
  const { store, storage } = profile();
  storage.setItem('factoodle-device-v2', '-'.repeat(36));
  assert.match(store.device(), /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
});
