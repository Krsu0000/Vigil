import type { SaveRepository } from '../persistence/browser-repository.ts';
import type { LoadedSave } from '../persistence/load-slots.ts';
import { createSaveFile, parseSave, serializeSave } from '../persistence/save-file.ts';
import type { SaveFile } from '../persistence/save-file.ts';
import { createGameStore } from './store.ts';
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
  exportSave: () => SaveFile; importSave: (save: SaveFile) => Promise<boolean>;
}>;

// 저장 형식·게임 난수는 바꾸지 않는다. UI는 이 연결부의 상태만 구독한다.
export function createAutoSave(store: GameStore, repository: SaveRepository | null, loaded: LoadedSave,
  now: () => number, scheduler: Scheduler, visibility: VisibilitySource, newSaveId: () => string, beforeSnapshot: () => void = () => {}, afterRestore: () => void = () => {}): AutoSave {
  let saveId = loaded.save?.saveId ?? newSaveId();
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
  let importing = false;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<SaveStatus>) => {
    status = Object.freeze({ ...status, ...patch });
    for (const listener of [...listeners]) listener();
  };
  const cancel = () => { epoch += 1; if (timer !== undefined) scheduler.cancel(timer); timer = undefined; };
  const save = async (): Promise<boolean> => {
    if (importing) return false;
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
    if (!active || importing || !repository || status.phase === 'error') return;
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
    exportSave() {
      if (importing) throw new Error('파일을 적용하는 동안 내보낼 수 없다');
      beforeSnapshot();
      // 파일의 savedAt은 지금 캡처한 상태의 시각이다. 브라우저 쓰기 revision은 올리지 않는다.
      return createSaveFile(store.getSnapshot(), { saveId, revision, savedAt: now(), contentVersion: store.content.contentVersion });
    },
    async importSave(raw) {
      if (importing) return false;
      importing = true;
      cancel();
      try {
        // 기존 쓰기를 끝낸 뒤 그 결과의 세대로 교체한다. 숨김/디바운스 저장은 교체 중 쓰지 않는다.
        if (pending) await pending;
        const incoming = parseSave(raw);
        if (incoming.revision === Number.MAX_SAFE_INTEGER) throw new Error('세이브 revision 상한');
        const candidate = createGameStore(store.content, incoming.state, now);
        const importedAt = now();
        const settled = candidate.dispatch({ type: 'time/settle', from: incoming.savedAt, to: importedAt });
        if (!settled.ok) throw new Error('가져온 세이브의 시간 정산 실패');
        const snapshot = createSaveFile(candidate.getSnapshot(), {
          saveId: incoming.saveId, revision: incoming.revision + 1, savedAt: importedAt, contentVersion: store.content.contentVersion,
        });
        beforeSnapshot();
        // 저장하지 못한 현재 진행도 검증된 백업에 담는다. 원문/메타데이터는 실패 시 유지한다.
        const backup = serializeSave(createSaveFile(store.getSnapshot(), {
          saveId, revision, savedAt: importedAt, contentVersion: store.content.contentVersion,
        }));
        const json = serializeSave(snapshot);
        publish({ phase: repository ? 'saving' : 'unavailable' });
        const nextGeneration = repository ? await repository.write(json, backup, generation) : generation;
        // 검증/정산/원자적 쓰기가 모두 성공한 뒤에만 활성 상태와 저장 메타데이터를 교체한다.
        saveId = snapshot.saveId;
        revision = snapshot.revision;
        generation = nextGeneration;
        previousValid = json;
        store.restore(snapshot);
        afterRestore();
        dirty = false;
        publish({ phase: repository ? 'saved' : 'unavailable', savedAt: importedAt, recovered: false });
        return true;
      } catch {
        dirty = true;
        publish({ phase: repository ? 'error' : 'unavailable' });
        return false;
      } finally { importing = false; }
    },
  });
}
