import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { loadGameContent } from './runtime/content.ts';
import { browserClock, browserScheduler } from './runtime/clock.ts';
import { openSaveRepository } from './persistence/browser-repository.ts';
import type { SaveRepository } from './persistence/browser-repository.ts';
import { loadSavedGame } from './runtime/startup.ts';
import { createAutoSave } from './runtime/auto-save.ts';
import { createGameLoop } from './runtime/loop.ts';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root 요소가 없다');
const root = createRoot(rootElement);
const contentResult = loadGameContent();

if (!contentResult.ok) {
  root.render(<StrictMode><App contentErrors={contentResult.errors} /></StrictMode>);
} else {
  root.render(<StrictMode><App loading /></StrictMode>);
  void (async () => {
    let repository: SaveRepository | null = null;
    try { repository = await openSaveRepository(); }
    catch { /* 저장소를 사용할 수 없으면 UI에서 명시하고 메모리 플레이를 허용한다. */ }
    try {
      const { store, loaded } = await loadSavedGame(contentResult.content,repository,browserClock.wallNow,
        () => [...crypto.getRandomValues(new Uint32Array(4))]);
      const loop = createGameLoop(store,browserClock,browserScheduler);
      const autoSave = createAutoSave(store,repository,loaded,browserClock.wallNow,browserScheduler,document,() => crypto.randomUUID(),loop.synchronize,loop.resetAfterRestore);
      // 실제 루프를 시작하기 전에 새 게임/백업 복원/정산 결과의 저장을 시도한다. 저장 실패는 표시하고 플레이를 허용한다.
      await autoSave.flush();
      root.render(<StrictMode><App store={store} loop={loop} autoSave={autoSave} persistent={repository !== null} /></StrictMode>);
    } catch (error) {
      console.error(error);
      repository?.close();
      root.render(<StrictMode><App saveLoadError /></StrictMode>);
    }
  })();
}
