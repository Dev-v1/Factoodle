import { useEffect, useState, useSyncExternalStore } from 'react';
import { createApi } from './api.ts';
import { createStore } from './storage.ts';
import { SyncEngine } from './engine.ts';

export function useProgress() {
  const [engine] = useState(() => new SyncEngine(createStore({
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }, async (name, fn) => {
    if (!navigator.locks) throw new Error('Use a current browser over HTTPS to save safely across tabs.');
    return navigator.locks.request(name, fn);
  }), createApi(import.meta.env.VITE_API_BASE_URL)));
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    engine.start();
    const visible = () => { if (document.visibilityState === 'visible') engine.refresh(); };
    const changed = (event: StorageEvent) => { if (event.key?.startsWith('factoodle-v2:')) engine.refresh(); };
    window.addEventListener('online', engine.refresh);
    window.addEventListener('focus', engine.refresh);
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', visible);
    return () => {
      engine.stop();
      window.removeEventListener('online', engine.refresh);
      window.removeEventListener('focus', engine.refresh);
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [engine]);
  return { engine, ...snapshot };
}
