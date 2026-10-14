import { strings } from './strings/index.ts';
import type { ContentError } from '../content/types.ts';

export function App({ contentErrors = [] }: { contentErrors?: readonly ContentError[] }) {
  return (
    <main>
      <h1>{strings.gameTitle}</h1>
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
    </main>
  );
}
