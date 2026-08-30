import { isDeepStrictEqual } from 'node:util';
import { createStore } from '../frontend/src/sync/storage.ts';
export const CODE = 'FCT-ABCD-2345';
export const OTHER = 'FCT-WXYZ-6789';
export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
export function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
export function locks() {
  const pending = new Map();
  return (name, fn) => {
    const result = (pending.get(name) ?? Promise.resolve()).then(fn);
    pending.set(name, result.catch(() => {}));
    return result;
  };
}
export function profile(code = CODE, id = A, storage = memory(), lock = locks()) {
  storage.setItem('factoodle-code', code); storage.setItem('factoodle-device-v2', id);
  return { storage, store: createStore(storage, lock), lock };
}
// SQL transport emulator, NOT a claim of live Neon verification.
// The real repository's SELECT/INSERT/compare-and-swap UPDATE logic runs against it.
export function memorySql() {
  const rows = new Map(), calls = [];
  const sql = async (parts, ...values) => {
    const statement = parts.join('?').replace(/\s+/g, ' ').trim();
    calls.push({ statement, values });
    if (statement.includes('LIMIT 0')) return [];
    if (statement.startsWith('SELECT')) return rows.has(values[0]) ? [{ progress: structuredClone(rows.get(values[0])) }] : [];
    if (statement.startsWith('INSERT')) {
      if (rows.has(values[0])) return [];
      rows.set(values[0], JSON.parse(values[1]));
      return [{ progress: structuredClone(rows.get(values[0])) }];
    }
    if (statement.startsWith('UPDATE')) {
      const [encoded, code, previous] = values;
      if (!isDeepStrictEqual(rows.get(code), JSON.parse(previous))) return [];
      rows.set(code, JSON.parse(encoded));
      return [{ progress: structuredClone(rows.get(code)) }];
    }
    throw new Error('Unexpected SQL');
  };
  return { sql, rows, calls };
}
