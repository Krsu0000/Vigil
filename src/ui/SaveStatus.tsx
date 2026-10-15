import { useEffect, useSyncExternalStore } from 'react';
import type { AutoSave } from '../runtime/auto-save.ts';
import { strings } from './strings/index.ts';

export function SaveStatus({ autoSave }: { autoSave: AutoSave }) {
  const status = useSyncExternalStore(autoSave.subscribe,autoSave.getSnapshot,autoSave.getSnapshot);
  useEffect(() => { autoSave.start(); return () => autoSave.stop(); }, [autoSave]);
  return (
    <section className={`save-status${status.phase === 'error' || status.phase === 'unavailable' || status.recovered ? ' has-warning' : ''}`} aria-label={strings.browserSave}>
      <p role="status" data-testid="save-status">{strings.savePhases[status.phase]}</p>
      {status.recovered && <p>{strings.backupRecovered}</p>}
      {status.phase === 'error' && <><p>{strings.saveErrorHelp}</p><button type="button" onClick={() => { void autoSave.flush(); }}>{strings.retrySave}</button></>}
    </section>
  );
}
