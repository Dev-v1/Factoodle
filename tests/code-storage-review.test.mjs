import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../frontend/src/sync/storage.ts';
import { CODE_PATTERN, normalizeCode, makeCode, emptyDocument } from '../frontend/src/domain/model.ts';
import { CODE, OTHER, memory, locks } from './helpers.mjs';

test('review 1: saved code and device identity remain stable across store recreation', () => {
  const storage = memory(), lock = locks();
  const first = createStore(storage, lock), code = first.active(), device = first.device();
  const reopened = createStore(storage, lock);
  assert.equal(reopened.active(), code); assert.equal(reopened.device(), device);
  assert.match(code, CODE_PATTERN);
  reopened.activate(OTHER);
  assert.equal(createStore(storage, lock).active(), OTHER);
});
test('review 1: all generated codes round-trip through pasted formatting', () => {
  for (let i = 0; i < 500; i++) {
    const code = makeCode();
    assert.equal(normalizeCode(' \t' + code.toLowerCase().replaceAll('-', ' — ') + '\n'), code);
    assert.equal(normalizeCode(code.replaceAll('-', '')), code);
  }
});
for (const key of [`factoodle-v2:${CODE}`, `factoodle-progress:${CODE}`]) {
  test(`review 1: empty corrupted ${key.split(':')[0]} must not silently become a fresh profile`, async () => {
    const storage = memory({ 'factoodle-code': CODE, [key]: '' });
    const store = createStore(storage, locks());
    assert.throws(() => store.read(CODE));
    await assert.rejects(store.update(CODE, () => emptyDocument()));
    assert.equal(storage.getItem(key), '');
    assert.equal(store.active(), CODE);
  });
}
