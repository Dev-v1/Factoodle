// Canonical sync model. scripts/check-model.mjs verifies the frontend copy.
export type Operation = 'addition' | 'subtraction' | 'multiplication' | 'division';
export const YOUNG_LEVELS = [10, 20, 30, 40, 50] as const;
export const OLDER_FACT_LEVELS = [10, 20, 30, 40, 50, 100, 144] as const;
export const LARGE_LEVELS = ['3x1', '3x2', '3x3'] as const;
export const LEVELS = YOUNG_LEVELS; // Kept for older clients and imports.
export type PracticeLevel = typeof OLDER_FACT_LEVELS[number] | typeof LARGE_LEVELS[number];
export const ALL_LEVELS: readonly PracticeLevel[] = [...OLDER_FACT_LEVELS, ...LARGE_LEVELS];
export const OPERATIONS: Operation[] = ['addition', 'subtraction', 'multiplication', 'division'];
export type Progress = {
  totalCorrect: number; totalAnswered: number; bestStreak: number;
  stars: number; sessions: number;
  byLevel: Record<string, { correct: number; answered: number }>;
};
export type Device = { revision: number; progress: Progress };
export type Document = { schemaVersion: 2; base: Progress; devices: Record<string, Device> };
export const CODE_PATTERN = /^FCT-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const DEVICE_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fields = ['totalCorrect', 'totalAnswered', 'bestStreak', 'stars', 'sessions'] as const;
export function emptyProgress(): Progress {
  return { totalCorrect: 0, totalAnswered: 0, bestStreak: 0, stars: 0, sessions: 0, byLevel: {} };
}
export function emptyDocument(base = emptyProgress()): Document {
  return { schemaVersion: 2, base, devices: {} };
}
function record(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}
function integer(x: unknown): x is number {
  return Number.isSafeInteger(x) && Number(x) >= 0 && Number(x) <= 1_000_000_000;
}
export function parseProgress(x: unknown): Progress {
  if (!record(x) || !fields.every(k => integer(x[k])) || !record(x.byLevel)) throw new Error('Invalid progress');
  const p = emptyProgress();
  for (const k of fields) p[k] = x[k] as number;
  if (p.totalCorrect > p.totalAnswered || p.bestStreak > p.totalCorrect || p.stars > p.totalCorrect) throw new Error('Invalid totals');
  for (const key of Object.keys(x.byLevel).sort()) {
    const v = x.byLevel[key];
    if (!/^(addition|subtraction|multiplication|division)-(10|20|30|40|50|100|144|3x1|3x2|3x3)$/.test(key) || !record(v) ||
        !integer(v.correct) || !integer(v.answered) || v.correct > v.answered) throw new Error('Invalid level');
    p.byLevel[key] = { correct: v.correct, answered: v.answered };
  }
  return p;
}
export function parseDocument(x: unknown): Document {
  if (!record(x)) throw new Error('Invalid progress document');
  if (x.schemaVersion === undefined) return emptyDocument(parseProgress(x)); // v1 migration, no data deletion.
  if (x.schemaVersion !== 2 || !record(x.devices) || Object.keys(x.devices).length > 256) throw new Error('Invalid sync version/devices');
  const doc = emptyDocument(parseProgress(x.base));
  for (const id of Object.keys(x.devices).sort()) {
    const device = x.devices[id];
    if (!DEVICE_PATTERN.test(id) || !record(device) || !integer(device.revision)) throw new Error('Invalid device');
    doc.devices[id] = { revision: device.revision, progress: parseProgress(device.progress) };
  }
  return doc;
}
function maximum(a: Progress, b: Progress): Progress {
  const p = emptyProgress();
  for (const k of fields) p[k] = Math.max(a[k], b[k]);
  for (const k of [...new Set([...Object.keys(a.byLevel), ...Object.keys(b.byLevel)])].sort()) {
    p.byLevel[k] = { correct: Math.max(a.byLevel[k]?.correct ?? 0, b.byLevel[k]?.correct ?? 0),
      answered: Math.max(a.byLevel[k]?.answered ?? 0, b.byLevel[k]?.answered ?? 0) };
  }
  return p;
}
export function mergeDocuments(a: Document, b: Document): Document {
  const result = emptyDocument(maximum(a.base, b.base));
  for (const id of [...new Set([...Object.keys(a.devices), ...Object.keys(b.devices)])].sort()) {
    const x = a.devices[id], y = b.devices[id];
    if (!x || !y) { result.devices[id] = x ?? y; continue; }
    if (x.revision === y.revision && JSON.stringify(x.progress) !== JSON.stringify(y.progress)) throw new Error('Device revision conflict');
    const newest = x.revision >= y.revision ? x : y;
    const oldest = newest === x ? y : x;
    if (JSON.stringify(maximum(newest.progress, oldest.progress)) !== JSON.stringify(newest.progress)) throw new Error('Progress cannot decrease');
    result.devices[id] = newest;
  }
  return parseDocument(result);
}
export function totals(doc: Document): Progress {
  const p = structuredClone(doc.base);
  for (const { progress: d } of Object.values(doc.devices)) {
    for (const k of fields) p[k] = k === 'bestStreak' ? Math.max(p[k], d[k]) : p[k] + d[k];
    for (const [k, v] of Object.entries(d.byLevel)) {
      const old = p.byLevel[k] ?? { correct: 0, answered: 0 };
      p.byLevel[k] = { correct: old.correct + v.correct, answered: old.answered + v.answered };
    }
  }
  return p;
}
export function answerDocument(doc: Document, deviceId: string, operation: Operation, level: PracticeLevel,
  correct: boolean, streak: number, finished: boolean): Document {
  if (!OPERATIONS.includes(operation) || !ALL_LEVELS.includes(level) || !integer(streak)) throw new Error('Invalid answer');
  const next = structuredClone(doc);
  const device = next.devices[deviceId] ?? { revision: 0, progress: emptyProgress() };
  const p = device.progress;
  p.totalAnswered += 1;
  p.totalCorrect += Number(correct);
  p.stars += Number(correct);
  p.bestStreak = Math.max(p.bestStreak, streak);
  p.sessions += Number(finished);
  const key = `${operation}-${level}`;
  const stats = p.byLevel[key] ?? { correct: 0, answered: 0 };
  p.byLevel[key] = { correct: stats.correct + Number(correct), answered: stats.answered + 1 };
  next.devices[deviceId] = { revision: device.revision + 1, progress: p };
  return parseDocument(next);
}
export function normalizeCode(input: string): string {
  const compact = input.toUpperCase().replace(/[\s\u2010-\u2015-]/g, '');
  return /^FCT[A-Z2-9]{8}$/.test(compact) ? `FCT-${compact.slice(3, 7)}-${compact.slice(7)}` : input.trim().toUpperCase();
}
export function makeCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let text = '';
  while (text.length < 8) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < Math.floor(256 / alphabet.length) * alphabet.length && text.length < 8) text += alphabet[b % alphabet.length];
    }
  }
  return `FCT-${text.slice(0, 4)}-${text.slice(4)}`;
}
