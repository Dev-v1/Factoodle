import type { SyncState } from '../sync/engine.ts';
export function SyncStatus({ state, onClick }: { state: SyncState; onClick: () => void }) {
  const text = { loading: 'Opening…', saving: 'Saving…', saved: 'Saved online', offline: 'Saved on device', error: 'Check saving' }[state];
  return <button className={`sync-status ${state}`} onClick={onClick} aria-label={`Progress saving: ${text}. Open grown-ups area.`}>
    <span aria-hidden="true">{state === 'saved' ? '✓' : state === 'saving' ? '↻' : '!'}</span> {text}
  </button>;
}
