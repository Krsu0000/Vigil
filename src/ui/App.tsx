import { strings } from './strings/index.ts';
import type { ContentError } from '../content/types.ts';
import type { GameStore } from '../runtime/store.ts';
import { MapScreen } from './MapScreen.tsx';
import './styles.css';

export function App({ contentErrors = [], store, startupError = false }: {
  contentErrors?: readonly ContentError[]; store?: GameStore; startupError?: boolean;
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
      {contentErrors.length === 0 && startupError && (
        <section className="error-panel" role="alert"><h2>{strings.startupFailed}</h2><p>{strings.startupHelp}</p></section>
      )}
      {contentErrors.length === 0 && !startupError && store && <MapScreen store={store} />}
    </main>
  );
}
