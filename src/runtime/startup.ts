import type { ContentDb } from '../content/types.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';
import { loadSaveSlots } from '../persistence/load-slots.ts';
import type { LoadedSave } from '../persistence/load-slots.ts';
import { createGameStore, createNewGameStore } from './store.ts';

export async function loadSavedGame(content: ContentDb, repository: SaveRepository | null,
  now: () => number, seed: () => readonly number[]) {
  const loaded: LoadedSave = repository ? loadSaveSlots(await repository.read(),content) :
    { save: null, source: 'empty', previousValid: null, generation: 0 };
  const store = loaded.save ? createGameStore(content, loaded.save.state, now) : createNewGameStore(content,seed(),now);
  return { store, loaded };
}
