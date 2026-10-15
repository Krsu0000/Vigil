import type { ContentDb } from '../content/types.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';
import { loadSaveSlots } from './load-slots.ts';
import type { LoadedSave } from './load-slots.ts';
import { createGameStore, createNewGameStore } from './store.ts';

export async function loadSavedGame(content: ContentDb, repository: SaveRepository | null,
  now: () => number, seed: () => readonly number[]) {
  const loaded: LoadedSave = repository ? loadSaveSlots(await repository.read(),content) :
    { save: null, source: 'empty', previousValid: null, generation: 0 };
  const store = loaded.save ? createGameStore(content, loaded.save.state, now) : createNewGameStore(content,seed(),now);
  if (loaded.save) {
    // 복원 자체와 정산을 구분한다. 루프/저장 구독이 시작되기 전에 단 한 번 실행한다.
    const result = store.dispatch({ type: 'time/settle', from: loaded.save.savedAt, to: now() });
    if (!result.ok) throw new Error('저장한 시간 구간을 정산할 수 없다');
  }
  return { store, loaded };
}
