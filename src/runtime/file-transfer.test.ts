import { describe, expect, it, vi } from 'vitest';
import { mapContext, walk } from '../engine/systems/map/test-fixtures.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';
import { createSaveFile, deserializeSave, serializeSave } from '../persistence/save-file.ts';
import type { SaveFile } from '../persistence/save-file.ts';
import { createAutoSave } from './auto-save.ts';
import { createGameStore, createNewGameStore } from './store.ts';
import { loadSavedGame } from './startup.ts';
import { createGameLoop } from './loop.ts';

function setup(memory = false) {
  const ctx = mapContext(); let now = ctx.now;
  const store = createNewGameStore(ctx.content, [1,2,3,4], () => now);
  let primary: string | null = null; let backup: string | null = null; let generation = 0;
  const repository: SaveRepository = {
    read: async () => ({ primary, backup, generation }), close: vi.fn(),
    write: vi.fn(async (next, previous, expected) => {
      if (expected !== generation) throw new Error('다른 탭 저장');
      primary = next; backup = previous; return ++generation;
    }),
  };
  let taskId = 0; const tasks = new Map<number, () => void>();
  const scheduler = { schedule: (callback: () => void) => { tasks.set(++taskId, callback); return taskId; }, cancel: (id: unknown) => { tasks.delete(id as number); } };
  const visibility = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const loop = createGameLoop(store, { wallNow: () => now, monotonicNow: () => now - ctx.now }, scheduler);
  const auto = createAutoSave(store, memory ? null : repository, { save: null, source: 'empty', previousValid: null, generation: 0 }, () => now, scheduler, visibility, () => store.getSnapshot().meta.campaignId, loop.synchronize, loop.resetAfterRestore);
  const source = createNewGameStore(ctx.content, [9,8,7,6], () => ctx.now - 10_000);
  const state = source.getSnapshot();
  const incoming = createSaveFile({ ...state, meta: { ...state.meta, gameTime: 20 }, character: { ...state.character!, stamina: { current: 800, max: 900 } } }, {
    saveId: state.meta.campaignId, revision: 7, savedAt: ctx.now - 10_000, contentVersion: ctx.content.contentVersion,
  });
  return { ctx, store, auto, incoming, repository, visibility, scheduler, loop, tasks, slots: () => ({ primary, backup, generation }),
    jump: (ms: number) => { now += ms; }, conflict: () => { generation++; primary = '다른 탭 기록'; } };
}

describe('파일 내보내기·가져오기와 자동 저장', () => {
  it('내보내기는 미처리 실행분을 반영하고 현재 시각·ID/성공 revision을 쓰며 파일 생성만으로 쓰기/정산하지 않는다', async () => {
    const t = setup(); await t.auto.flush(); t.auto.start(); t.loop.start();
    t.jump(4_000); const exported = t.auto.exportSave();
    expect(exported.state.meta.gameTime).toBe(2); expect(exported.savedAt).toBe(t.ctx.now + 4_000);
    expect(exported.saveId).toBe(t.store.getSnapshot().meta.campaignId); expect(exported.revision).toBe(1);
    expect(t.repository.write).toHaveBeenCalledTimes(1);
    const before = t.store.getSnapshot(); t.auto.exportSave(); expect(t.store.getSnapshot()).toBe(before);
    t.loop.stop(); t.auto.stop();
  });

  it('후보만 정산하고 현재 미저장 진행을 백업한 뒤 교체하며 즉시 재접속/저장에 중복 지급하지 않는다', async () => {
    const t = setup(); await t.auto.flush(); t.auto.start();
    t.store.dispatch({ type: 'move/step', direction: 'east' });
    const previous = t.store.getSnapshot(); const rng = t.incoming.state.meta.rngState;
    expect(await t.auto.importSave(t.incoming)).toBe(true);
    const snapshot = deserializeSave(t.slots().primary!); const backup = deserializeSave(t.slots().backup!);
    expect(backup.state).toEqual(previous); expect(backup.saveId).toBe(previous.meta.campaignId);
    expect(snapshot.state.meta.gameTime).toBe(25); expect(snapshot.state.character!.stamina.current).toBe(805);
    expect(snapshot.state.meta.rngState).toEqual(rng); expect(snapshot.state).toEqual(t.store.getSnapshot());
    expect(snapshot.saveId).toBe(t.incoming.saveId); expect(snapshot.revision).toBe(8); expect(snapshot.savedAt).toBe(t.ctx.now);
    expect(t.auto.exportSave()).toEqual(snapshot); expect(await t.auto.flush()).toBe(true);
    const reload = await loadSavedGame(t.ctx.content, t.repository, () => t.ctx.now, () => { throw new Error('새 시드 금지'); });
    expect(reload.store.getSnapshot()).toEqual(snapshot.state);
    t.store.dispatch({ type: 'move/step', direction: 'east' }); await t.auto.flush();
    const next = deserializeSave(t.slots().primary!); expect(next.saveId).toBe(t.incoming.saveId); expect(next.revision).toBe(9);
    t.auto.stop();
  });

  it('쓰기 실패는 현재 상태·슬롯·메타데이터를 보존하고 가져오기 재시도는 한 번만 정산한다', async () => {
    const t = setup(); await t.auto.flush(); const before = t.store.getSnapshot(); const slots = t.slots(); const oldId = t.auto.exportSave().saveId;
    vi.mocked(t.repository.write).mockRejectedValueOnce(new Error('용량 오류'));
    expect(await t.auto.importSave(t.incoming)).toBe(false); expect(t.store.getSnapshot()).toBe(before); expect(t.slots()).toEqual(slots);
    expect(t.auto.exportSave().saveId).toBe(oldId); expect(t.auto.exportSave().revision).toBe(1);
    expect(await t.auto.importSave(t.incoming)).toBe(true); expect(t.store.getSnapshot().meta.gameTime).toBe(25);
  });

  it('가져오기 실패 뒤 일반 저장 재시도는 가져올 후보가 아닌 현재 탐험을 저장한다', async () => {
    const t = setup(); await t.auto.flush(); const before = t.store.getSnapshot();
    vi.mocked(t.repository.write).mockRejectedValueOnce(new Error('용량 오류'));
    await t.auto.importSave(t.incoming); expect(await t.auto.flush()).toBe(true);
    expect(deserializeSave(t.slots().primary!).state).toEqual(before); expect(t.auto.getSnapshot().phase).toBe('saved');
  });

  it('다른 탭이 저장했다면 그 슬롯과 현재 탐험을 유지한다', async () => {
    const t = setup(); await t.auto.flush(); t.conflict(); const slots = t.slots(); const before = t.store.getSnapshot();
    expect(await t.auto.importSave(t.incoming)).toBe(false); expect(t.slots()).toEqual(slots); expect(t.store.getSnapshot()).toBe(before);
  });

  it('이미 진행 중인 저장을 기다리고 그 다음 세대로 교체한다', async () => {
    const t = setup(); t.auto.start(); const write = vi.mocked(t.repository.write); const original = write.getMockImplementation()!;
    let release!: () => void;
    write.mockImplementationOnce(async (...args) => { await new Promise<void>(done => { release = done; }); return original(...args); });
    const oldSave = t.auto.flush(); const importing = t.auto.importSave(t.incoming);
    expect(write).toHaveBeenCalledTimes(1); release(); await oldSave;
    expect(await importing).toBe(true); expect(write).toHaveBeenCalledTimes(2); expect(write.mock.calls[1]![2]).toBe(1);
    expect(deserializeSave(t.slots().primary!).saveId).toBe(t.incoming.saveId); t.auto.stop();
  });

  it('가져오는 동안 숨김/중복 적용/내보내기가 기존 기록으로 덮어쓰지 못한다', async () => {
    const t = setup(); await t.auto.flush(); t.auto.start(); const write = vi.mocked(t.repository.write); const original = write.getMockImplementation()!;
    let release!: () => void;
    write.mockImplementationOnce(async (...args) => { await new Promise<void>(done => { release = done; }); return original(...args); });
    const importing = t.auto.importSave(t.incoming); await Promise.resolve();
    t.visibility.hidden = true; (t.visibility.addEventListener.mock.calls[0]![1] as () => void)();
    expect(await t.auto.flush()).toBe(false); expect(await t.auto.importSave(t.incoming)).toBe(false); expect(() => t.auto.exportSave()).toThrow();
    release(); expect(await importing).toBe(true); expect(write).toHaveBeenCalledTimes(2);
    expect(deserializeSave(t.slots().primary!).saveId).toBe(t.incoming.saveId); t.auto.stop();
  });

  it('저장소 불가 모드에서도 파일 내보내기·가져오기를 허용하되 저장 불가 상태를 유지한다', async () => {
    const t = setup(true); t.auto.start();
    expect(await t.auto.importSave(t.incoming)).toBe(true); expect(t.auto.getSnapshot().phase).toBe('unavailable');
    expect(t.auto.exportSave().state).toEqual(t.store.getSnapshot()); expect(t.repository.write).not.toHaveBeenCalled(); t.auto.stop();
  });

  it('가져오기 적용 후에도 설정 정지/수동 정지와 미처리 습격의 제한을 유지한다', async () => {
    const t = setup(); t.loop.start(); t.loop.setPaused(true); t.loop.setSettingsOpen(true);
    expect(await t.auto.importSave(t.incoming)).toBe(true); t.loop.setSettingsOpen(false);
    expect(t.loop.getSnapshot().paused).toBe(true); expect(t.loop.move('east')).toEqual({ ok: false, reason: 'paused' });
    t.loop.stop();
  });

  it.each(['resting', 'ambush'])('위험지대 %s 파일의 닫힌 시간은 회복/습격에서 제외하고 상태를 유지한다', async kind => {
    const t = setup();
    const state = walk(t.incoming.state, ['east','east','south','south','east'], t.ctx);
    const source = createGameStore(t.ctx.content, state, () => t.ctx.now - 10_000);
    source.dispatch({ type: 'rest/start' });
    const current = source.getSnapshot();
    const incoming = createSaveFile(kind === 'ambush' ? { ...current, character: { ...current.character!, activity: 'waiting' }, expedition: { pendingAmbush: { triggeredAt: current.meta.gameTime, activityAtTrigger: 'resting' } } } : current,
      { saveId: t.incoming.saveId, revision: 7, savedAt: t.ctx.now - 10_000, contentVersion: t.ctx.content.contentVersion });
    expect(await t.auto.importSave(incoming)).toBe(true);
    expect(t.store.getSnapshot().character).toEqual(incoming.state.character);
    expect(t.store.getSnapshot().expedition).toEqual(incoming.state.expedition);
    expect(t.store.getSnapshot().meta.gameTime).toBe(incoming.state.meta.gameTime);
    expect(t.store.getSnapshot().meta.rngState).toEqual(incoming.state.meta.rngState);
  });

  it('3일 전 파일은 최대 24시간만 정산하고 기기 시각 역행은 보상 없이 복원한다', async () => {
    const t = setup(); t.jump(3 * 86_400_000);
    expect(await t.auto.importSave(t.incoming)).toBe(true); expect(t.store.getSnapshot().meta.gameTime).toBe(43_220);
    const backwards = setup(); backwards.jump(-20_000);
    expect(await backwards.auto.importSave(backwards.incoming)).toBe(true);
    expect(backwards.store.getSnapshot()).toEqual(backwards.incoming.state);
  });

  it('다른 탐험의 미래 실행 완료 시각을 가져온 파일의 이후 정산에 재사용하지 않는다', async () => {
    const t = setup(); t.loop.start(); t.jump(86_400_000); t.loop.synchronize();
    t.loop.setSettingsOpen(true); t.jump(-86_400_000);
    expect(await t.auto.importSave(t.incoming)).toBe(true); expect(t.store.getSnapshot().meta.gameTime).toBe(25);
    t.loop.setSettingsOpen(false); t.jump(180_000); t.loop.synchronize();
    expect(t.store.getSnapshot().meta.gameTime).toBe(115); t.loop.stop();
  });

  it.each(['future', 'map', 'revision'])('적용 직전 %s 오류도 상태/슬롯 변경 전에 거부한다', async kind => {
    const t = setup(); await t.auto.flush(); const slots = t.slots(); const before = t.store.getSnapshot();
    const invalid = JSON.parse(serializeSave(t.incoming));
    if (kind === 'future') invalid.schemaVersion = 100;
    else if (kind === 'map') invalid.state.campaign.exploration['map.s1_test'].mapVersion = 100;
    else invalid.revision = Number.MAX_SAFE_INTEGER;
    expect(await t.auto.importSave(invalid as SaveFile)).toBe(false); expect(t.slots()).toEqual(slots); expect(t.store.getSnapshot()).toBe(before);
  });
});
