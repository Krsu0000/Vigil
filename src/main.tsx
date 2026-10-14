import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { loadGameContent } from './runtime/content.ts';
import { createNewGameStore } from './runtime/store.ts';
import type { GameStore } from './runtime/store.ts';
import { browserClock } from './runtime/clock.ts';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root 요소가 없다');
}

const contentResult = loadGameContent();
let store: GameStore | undefined;
let startupError = false;
if (contentResult.ok) {
  try {
    const seed = [...crypto.getRandomValues(new Uint32Array(4))];
    store = createNewGameStore(contentResult.content, seed, browserClock.wallNow);
  } catch (error) {
    console.error(error);
    startupError = true;
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <App contentErrors={contentResult.ok ? [] : contentResult.errors} store={store} startupError={startupError} />
  </StrictMode>,
);
