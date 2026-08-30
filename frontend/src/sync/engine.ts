import { answerDocument, emptyDocument, CODE_PATTERN, normalizeCode, type Document, type Operation } from '../domain/model.ts';
import { ApiError, type ProgressApi } from './api.ts';
import { mergeIntoStore, type ProfileStore } from './storage.ts';
export type SyncState = 'loading' | 'saving' | 'saved' | 'offline' | 'error';
export type Snapshot = { code: string; document: Document; state: SyncState; message: string; restoring: boolean };
export class SyncEngine {
  private store: ProfileStore; private api: ProgressApi;
  private state: Snapshot = { code: '', document: emptyDocument(), state: 'loading', message: '', restoring: false };
  private listeners = new Set<() => void>();
  private running = new Map<string, Promise<void>>();
  private requested = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0; private stopped = true; private device = '';
  constructor(store: ProfileStore, api: ProgressApi) { this.store = store; this.api = api; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private set(patch: Partial<Snapshot>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()); }
  start = () => {
    this.stopped = false;
    try {
      const code = this.store.active(); this.device = this.store.device();
      this.set({ code, document: this.store.read(code), state: 'saving' });
      void this.sync();
    } catch { this.set({ state: 'error', message: 'Browser storage could not be read. Existing data has not been deleted. Keep this tab open and ask a grown-up for help.' }); }
  };
  stop = () => { this.stopped = true; clearTimeout(this.timer); }; // Do not abort an in-flight save.
  refresh = () => { if (!this.stopped) void this.sync(); };
  async answer(operation: Operation, level: number, correct: boolean, streak: number, finished: boolean) {
    const code = this.state.code;
    if (!code) throw new Error('Progress is not ready.');
    try {
      const document = await this.store.update(code, doc => answerDocument(doc, this.device, operation, level, correct, streak, finished));
      if (this.state.code === code) this.set({ document, state: 'saving', message: '' });
      void this.sync(code);
    } catch {
      this.set({ state: 'error', message: 'This answer could not be stored in your browser. Free some browser storage and try again. Existing progress is preserved.' });
      throw new Error('Local save failed');
    }
  }
  sync = (code = this.state.code): Promise<void> => {
    if (!code || this.stopped) return Promise.resolve();
    clearTimeout(this.timer);
    const existing = this.running.get(code);
    if (existing) { this.requested.add(code); return existing; }
    const work = (async () => {
      try {
        do {
          this.requested.delete(code);
          await this.doSync(code);
        } while (this.requested.has(code) && !this.stopped);
      } finally { this.running.delete(code); }
    })();
    this.running.set(code, work);
    return work;
  };
  private async doSync(code: string) {
    if (this.state.code === code) this.set({ state: 'saving', message: '' });
    try {
      // Drain changes made during a slow request; requests are serialized, never cancelled by answers.
      for (let round = 0; round < 8; round++) {
        const sent = this.store.read(code);
        const remote = await this.api.put(code, sent);
        await mergeIntoStore(this.store, code, remote);
        // Another tab may have written after the lock was released.
        const merged = this.store.read(code);
        const complete = JSON.stringify(merged) === JSON.stringify(remote);
        if (this.state.code === code) this.set({ document: merged, state: complete ? 'saved' : 'saving', message: '' });
        if (complete) { this.attempts = 0; return; }
      }
      this.retry(code, 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Saving failed. Your local progress is preserved.';
      if (this.state.code === code) this.set({ state: err instanceof ApiError && err.retryable ? 'offline' : 'error', message });
      if (err instanceof ApiError && err.retryable) this.retry(code, Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)));
    }
  }
  private retry(code: string, delay: number) {
    if (!this.stopped && this.state.code === code) this.timer = setTimeout(() => { void this.sync(code); }, delay);
  }
  async restore(input: string) {
    const code = normalizeCode(input);
    if (!CODE_PATTERN.test(code)) throw new Error('Check the code. It looks like FCT-ABCD-2345.');
    if (this.state.restoring) throw new Error('A restore is already in progress.');
    this.set({ restoring: true });
    try {
      // Always use the server, not a potentially stale local shortcut.
      const remote = await this.api.get(code);
      const merged = await mergeIntoStore(this.store, code, remote);
      this.store.activate(code);
      this.set({ code, document: merged, state: 'saving', message: '' });
      await this.sync(code);
    } finally { this.set({ restoring: false }); }
  }
}
