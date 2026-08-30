import { CODE_PATTERN, makeCode, emptyDocument, parseDocument, mergeDocuments, type Document } from '../domain/model.ts';
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface ProfileStore {
  active(): string;
  activate(code: string): void;
  read(code: string): Document;
  update(code: string, apply: (doc: Document) => Document): Promise<Document>;
  device(): string;
}
export function createStore(storage: StorageLike, lock: <T>(name: string, fn: () => T) => Promise<T>): ProfileStore {
  function read(code: string) {
    const v2 = storage.getItem(`factoodle-v2:${code}`);
    if (v2 !== null) return parseDocument(JSON.parse(v2));
    const legacy = storage.getItem(`factoodle-progress:${code}`);
    return legacy !== null ? parseDocument(JSON.parse(legacy)) : emptyDocument();
  }
  return {
    active() {
      const existing = storage.getItem('factoodle-code');
      if (existing && CODE_PATTERN.test(existing)) return existing;
      const code = makeCode(); storage.setItem('factoodle-code', code); return code;
    },
    activate(code) { storage.setItem('factoodle-code', code); },
    read,
    async update(code, apply) {
      return lock(`factoodle:${code}`, () => {
        const current = read(code);
        const updated = parseDocument(apply(current));
        storage.setItem(`factoodle-v2:${code}`, JSON.stringify(updated));
        return updated;
      });
    },
    device() {
      const key = 'factoodle-device-v2';
      const existing = storage.getItem(key);
      if (existing && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(existing)) return existing;
      const id = crypto.randomUUID(); storage.setItem(key, id); return id;
    },
  };
}
export function mergeIntoStore(store: ProfileStore, code: string, doc: Document) {
  return store.update(code, current => mergeDocuments(current, doc));
}
