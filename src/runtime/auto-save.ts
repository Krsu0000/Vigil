import type { SaveRepository } from '../persistence/browser-repository.ts';
import type { LoadedSave } from '../persistence/load-slots.ts';
import { createSaveFile, serializeSave } from '../persistence/save-file.ts';
import type { GameStore } from './store.ts';
import type { Scheduler } from './clock.ts';

export type SaveStatus = Readonly<{
  phase: 'idle' | 'saving' | 'saved' | 'error' | 'unavailable'; savedAt: number | null; recovered: boolean;
}>;
export type VisibilitySource = Readonly<{
  hidden: boolean;
  addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
}>;
export type AutoSave = Readonly<{
  getSnapshot: () => SaveStatus; subscribe: (listener: () => void) => () => void;
  start: () => void; stop: () => void; flush: () => Promise<boolean>;
}>;

// 저장 형식·게임 난수는 바꾸지 않는다. UI는 이 연결부의 상태만 구독한다.
export function createAutoSave(store: GameStore, repository: SaveRepository | null, loaded: LoadedSave,
  now: () => number, scheduler: Scheduler, visibility: VisibilitySource, newSaveId: () => string, beforeSnapshot: () => void = () => {}): AutoSave {
  const saveId = loaded.save?.saveId ?? newSaveId();
  let revision = loaded.save?.revision ?? 0;
  let generation = loaded.generation;
  let previousValid = loaded.previousValid;
  let dirty = loaded.source === 'empty' || loaded.source === 'backup' ||
    loaded.save?.state.meta.settledUntil !== store.getSnapshot().meta.settledUntil;
  let status: SaveStatus = { phase: repository ? loaded.save ? 'saved' : 'idle' : 'unavailable', savedAt: loaded.save?.savedAt ?? null, recovered: loaded.source === 'backup' };
  let active = false;
  let unsubscribe: (() => void) | undefined;
  let timer: unknown;
  let pending: Promise<boolean> | undefined;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<SaveStatus>) => {
    status = Object.freeze({ ...status, ...patch });
    for (const listener of [...listeners]) listener();
  };
  const cancel = () => { epoch += 1; if (timer !== undefined) scheduler.cancel(timer); timer = undefined; };
  const save = async (): Promise<boolean> => {
    if (!repository) return false;
    if (pending) {
      const succeeded = await pending;
      // 실패하면 같은 손상/용량 오류를 무한 재시도하지 않는다.
      if (!succeeded) return false;
      return save();
    }
    try { beforeSnapshot(); }
    catch { dirty = true; publish({ phase: 'error' }); return false; }
    cancel();
    if (!dirty) return true;
    dirty = false;
    publish({ phase: 'saving' });
    pending = (async () => {
      try {
        if (revision === Number.MAX_SAFE_INTEGER) throw new Error('세이브 revision 상한');
        const savedAt = now();
        const snapshot = createSaveFile(store.getSnapshot(), {
          saveId, revision: revision + 1, savedAt, contentVersion: store.content.contentVersion,
        });
        const json = serializeSave(snapshot);
        generation = await repository.write(json, previousValid, generation);
        revision = snapshot.revision;
        previousValid = json;
        publish({ phase: 'saved', savedAt });
        return true;
      } catch {
        dirty = true;
        publish({ phase: 'error' });
        return false;
      }
    })();
    const result = await pending;
    pending = undefined;
    return result;
  };
  const changed = () => {
    dirty = true;
    cancel();
    if (!active || !repository || status.phase === 'error') return;
    if (status.phase !== 'saving') publish({ phase: 'idle' });
    const token = epoch;
    timer = scheduler.schedule(() => {
      if (!active || token !== epoch) return;
      timer = undefined;
      void save();
    }, 1_000);
  };
  const hidden = () => { if (visibility.hidden) { dirty = true; cancel(); void save(); } };
  return Object.freeze({
    getSnapshot: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (active) return;
      active = true;
      unsubscribe = store.subscribe(changed);
      visibility.addEventListener('visibilitychange', hidden);
      if (dirty) changed();
    },
    stop() {
      if (!active) return;
      active = false;
      unsubscribe?.(); unsubscribe = undefined;
      visibility.removeEventListener('visibilitychange', hidden);
      // React StrictMode의 효과 정리는 실제 페이지 종료가 아니다. 숨김 이벤트/명시적 flush가 저장한다.
      cancel();
    },
    flush() { cancel(); return save(); },
  });
}
