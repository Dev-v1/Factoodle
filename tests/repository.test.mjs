import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryFromQuery } from '../backend/src/repository.ts';
import { answerDocument, emptyDocument, emptyProgress, totals } from '../backend/src/model.ts';
import { A, B, CODE, memorySql } from './helpers.mjs';
const answer = id => answerDocument(emptyDocument(), id, 'addition', 10, true, 1, false);
test('concurrent first inserts retain both browsers', async () => {
  const db = memorySql(), repo = repositoryFromQuery(db.sql);
  await Promise.all([repo.sync(CODE, answer(A)), repo.sync(CODE, answer(B))]);
  assert.equal(totals(await repo.get(CODE)).totalCorrect, 2);
  assert.equal(db.calls.filter(c => c.statement.startsWith('INSERT')).length, 2);
});
test('concurrent updates use CAS retry and are idempotent', async () => {
  const db = memorySql(), repo = repositoryFromQuery(db.sql);
  await repo.sync(CODE, emptyDocument());
  await Promise.all([repo.sync(CODE, answer(A)), repo.sync(CODE, answer(B))]);
  await repo.sync(CODE, answer(A));
  assert.equal(totals(await repo.get(CODE)).totalCorrect, 2);
  assert.ok(db.calls.some(c => c.statement.includes('AND progress = ?::jsonb')));
});
test('legacy database rows migrate in place without a schema migration', async () => {
  const db = memorySql(), repo = repositoryFromQuery(db.sql);
  db.rows.set(CODE, { ...emptyProgress(), totalAnswered: 4, totalCorrect: 3, stars: 3 });
  const migrated = await repo.get(CODE);
  assert.equal(migrated.base.totalCorrect, 3);
  await repo.sync(CODE, answerDocument(migrated, A, 'subtraction', 10, true, 1, false));
  assert.equal(totals(await repo.get(CODE)).totalCorrect, 4);
  assert.equal(db.rows.size, 1);
});
test('bounded CAS contention returns retryable conflict instead of overwriting', async () => {
  let updates = 0;
  const repo = repositoryFromQuery(async parts => {
    if (parts.join('').startsWith('SELECT')) return [{ progress: emptyDocument() }];
    updates++; return [];
  });
  await assert.rejects(repo.sync(CODE, answer(A)), { name: 'ConflictError' });
  assert.equal(updates, 6);
});
