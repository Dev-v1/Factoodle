import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, OLDER_FACT_LEVELS, LARGE_LEVELS, OPERATIONS, CODE_PATTERN, makeCode, normalizeCode, parseDocument, parseProgress, emptyProgress, emptyDocument } from '../backend/src/model.ts';
import { makeQuestion } from '../frontend/src/domain/math.ts';

let seed = 872364;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (const operation of OPERATIONS) for (const limit of LEVELS) {
  test(`${operation} 0–${limit}: 1,002 questions, correct integer answers`, () => {
    for (let i = 0; i < 1002; i++) {
      const q = makeQuestion(operation, limit, i === 0 ? () => 0 : i === 1 ? () => 1 : random);
      const actual = operation === 'addition' ? q.left + q.right : operation === 'subtraction' ? q.left - q.right : operation === 'multiplication' ? q.left * q.right : q.left / q.right;
      assert.equal(q.answer, actual);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= limit);
      assert.ok(q.left >= 0 && q.right >= 0);
      if (operation === 'division') assert.ok(q.right > 0);
    }
  });
}
for (const operation of OPERATIONS) for (const limit of OLDER_FACT_LEVELS) {
  test(`${operation} older facts through ${limit} stay in range`, () => {
    for (let i = 0; i < 502; i++) {
      const q = makeQuestion(operation, limit, random);
      const actual = operation === 'addition' ? q.left + q.right : operation === 'subtraction' ? q.left - q.right : operation === 'multiplication' ? q.left * q.right : q.left / q.right;
      assert.equal(q.answer, actual);
      assert.ok(Number.isSafeInteger(q.answer) && q.answer >= 0 && q.answer <= limit);
    }
  });
}
for (const operation of OPERATIONS) for (const level of LARGE_LEVELS) {
  test(`${operation} ${level} creates exact large-number questions`, () => {
    const digits = Number(level.at(-1));
    for (const source of [() => 0, () => 1, random]) for (let i = 0; i < 334; i++) {
      const q = makeQuestion(operation, level, source);
      const actual = operation === 'addition' ? q.left + q.right : operation === 'subtraction' ? q.left - q.right : operation === 'multiplication' ? q.left * q.right : q.left / q.right;
      assert.equal(q.answer, actual);
      assert.ok(Number.isSafeInteger(q.answer) && q.answer >= 0 && q.answer <= 999 * 999);
      assert.ok(q.left >= 100 && q.left <= 999);
      assert.equal(String(q.right).length, digits);
      if (operation === 'division') assert.ok(q.right > 0 && Number.isInteger(q.left / q.right));
    }
  });
}
test('invalid operations and answer ranges are rejected', () => {
  assert.throws(() => makeQuestion('power', 10));
  assert.throws(() => makeQuestion('addition', 15));
});
test('codes are random, valid and normalized without changing existing codes', () => {
  const codes = new Set(Array.from({ length: 1000 }, makeCode));
  assert.equal(codes.size, 1000);
  for (const code of codes) assert.match(code, CODE_PATTERN);
  assert.equal(normalizeCode(' fct–abcd – 2345 '), 'FCT-ABCD-2345');
  assert.equal(normalizeCode('fctabcd2345'), 'FCT-ABCD-2345');
  assert.equal(normalizeCode('FCT-TEST-TEST'), 'FCT-TEST-TEST');
  assert.equal(CODE_PATTERN.test(normalizeCode('FCT-ABCD-1234')), false);
});
test('invalid or dangerous progress payloads are rejected', () => {
  for (const value of [null, [], {}, 'bad', { ...emptyProgress(), totalAnswered: -1 }, { ...emptyProgress(), totalCorrect: 1 }, { ...emptyProgress(), stars: 1 }, { ...emptyProgress(), sessions: Infinity }, { ...emptyProgress(), bestStreak: 1 }]) assert.throws(() => parseDocument(value));
  assert.throws(() => parseProgress({ ...emptyProgress(), byLevel: { 'addition-60': { correct: 0, answered: 0 } } }));
  assert.doesNotThrow(() => parseProgress({ ...emptyProgress(), byLevel: { 'multiplication-144': { correct: 1, answered: 1 }, 'division-3x2': { correct: 0, answered: 1 } } }));
  assert.throws(() => parseDocument({ ...emptyDocument(), schemaVersion: 3 }));
  assert.throws(() => parseDocument(JSON.parse('{"schemaVersion":2,"base":{},"devices":{"__proto__":{}}}')));
  assert.equal({}.polluted, undefined);
});
