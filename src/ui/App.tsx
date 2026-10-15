import { strings } from './strings/index.ts';
import type { ContentError } from '../content/types.ts';
import type { GameStore } from '../runtime/store.ts';
import type { AutoSave } from '../runtime/auto-save.ts';
import { SaveStatus } from './SaveStatus.tsx';
import { MapScreen } from './MapScreen.tsx';
import './styles.css';

export function App({ contentErrors = [], store, autoSave, persistent = false, loading = false, saveLoadError = false, startupError = false }: {
  contentErrors?: readonly ContentError[]; store?: GameStore; autoSave?: AutoSave; persistent?: boolean; loading?: boolean; saveLoadError?: boolean; startupError?: boolean;
}) {
  return (
    <main>
      <header className="app-header"><h1>{strings.gameTitle}</h1><span>{strings.exploration}</span></header>
      {contentErrors.length > 0 && (
        <section role="alert">
          <h2>{strings.contentLoadFailed}</h2>
          <p>{strings.contentLoadHelp}</p>
          <ul>
            {contentErrors.map((error, index) => (
              <li key={index}>{error.file}{error.path ? ` (${error.path})` : ''}: {error.message}</li>
            ))}
          </ul>
        </section>
      )}
      {loading && <p role="status">{strings.loadingSave}</p>}
      {saveLoadError && <section role="alert" className="error-panel"><h2>{strings.saveLoadFailed}</h2><p>{strings.saveLoadHelp}</p></section>}
      {contentErrors.length === 0 && startupError && (
        <section className="error-panel" role="alert"><h2>{strings.startupFailed}</h2><p>{strings.startupHelp}</p></section>
      )}
      {contentErrors.length === 0 && !startupError && !saveLoadError && store && <>
        {autoSave && <SaveStatus autoSave={autoSave} />}
        <MapScreen store={store} persistent={persistent} />
      </>}
    </main>
  );
}
