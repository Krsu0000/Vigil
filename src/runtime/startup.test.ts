import { describe, expect, it, vi } from 'vitest';
import { mapContext, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { createGameLoop } from './loop.ts';
import { createAutoSave } from './auto-save.ts';
import { loadSavedGame } from './startup.ts';
import { createSaveFile, deserializeSave, serializeSave } from '../persistence/save-file.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';

const ctx = mapContext();
function setup(danger = false) {
  let wall = ctx.now;
  let mono = 0;
  const clock = { wallNow: () => wall, monotonicNow: () => mono };
  const scheduler = { schedule: vi.fn(() => 1), cancel: vi.fn() };
  const visibility = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const base = danger ? walk(startedState(ctx), ['east','east','south','south','east'], ctx) : startedState(ctx);
  const initial = { ...base, meta: { ...base.meta, gameTime: 20 }, character: { ...base.character!, stamina: { current: 800, max: 900 } } };
  const metadata = { contentVersion: ctx.content.contentVersion, saveId: initial.meta.campaignId, revision: 7, savedAt: ctx.now + 40_000 };
  let primary = serializeSave(createSaveFile(initial, metadata));
  let backup: string | null = null;
  let generation = 7;
  wall = metadata.savedAt;
  const repository: SaveRepository = {
    read: async () => ({ primary, backup, generation }),
    write: vi.fn(async (next, previous, expected) => {
      if (expected !== generation) throw new Error('충돌');
      primary = next; backup = previous; return ++generation;
    }), close: vi.fn(),
  };
  const seed = vi.fn(() => [9,8,7,6]);
  const load = () => loadSavedGame(ctx.content, repository, clock.wallNow, seed);
  return { clock, scheduler, visibility, repository, initial, load, seed, slots: () => ({ primary, backup, generation }),
    jump: (ms: number) => { wall += ms; mono += ms; }, wall: (value: number) => { wall = value; } };
}

describe('저장 → 복원 → 정산 → 저장 → 루프', () => {
  it('저장 전 실시간을 재지급하지 않으며 정산 결과를 루프 시작 전에 기록하고 즉시 재접속해도 중복 지급하지 않는다', async () => {
    const t = setup(); t.jump(10_000); const before = t.slots();
    const {store, loaded} = await t.load();
    expect(loaded.save!.state).toEqual(t.initial);
    expect(store.getSnapshot().meta.gameTime).toBe(25);
    expect(store.getSnapshot().character!.stamina.current).toBe(805);
    expect(t.repository.write).not.toHaveBeenCalled();
    const loop = createGameLoop(store,t.clock,t.scheduler);
    const auto = createAutoSave(store,t.repository,loaded,t.clock.wallNow,t.scheduler,t.visibility,()=>{throw new Error('기존 ID를 사용해야 한다');},loop.synchronize);
    expect(loop.getSnapshot().running).toBe(false);
    expect(await auto.flush()).toBe(true);
    const saved = deserializeSave(t.slots().primary);
    expect(saved.state).toEqual(store.getSnapshot()); expect(saved.revision).toBe(8);
    expect(saved.saveId).toBe(loaded.save!.saveId); expect(t.slots().backup).toBe(before.primary);
    expect((await t.load()).store.getSnapshot()).toEqual(saved.state);
    auto.start(); loop.start(); t.jump(2_000); loop.synchronize();
    expect(store.getSnapshot().meta.gameTime).toBe(26); expect(store.getSnapshot().character!.stamina.current).toBe(806);
    await auto.flush(); expect((await t.load()).store.getSnapshot()).toEqual(store.getSnapshot());
    expect(t.seed).not.toHaveBeenCalled(); loop.stop(); auto.stop();
  });

  it('정산 결과 저장 실패는 기존 슬롯을 보존하며 재시도에서도 보상은 한 번만 계산한다', async () => {
    const t = setup(); t.jump(10_000); const slots = t.slots(); const {store, loaded} = await t.load();
    const auto = createAutoSave(store,t.repository,loaded,t.clock.wallNow,t.scheduler,t.visibility,()=> 'unused');
    vi.mocked(t.repository.write).mockRejectedValueOnce(new Error('용량 오류'));
    const settled = store.getSnapshot(); expect(await auto.flush()).toBe(false);
    expect(t.slots()).toEqual(slots); expect(auto.getSnapshot().phase).toBe('error');
    expect(await auto.flush()).toBe(true); expect(store.getSnapshot()).toBe(settled);
    expect(deserializeSave(t.slots().primary).revision).toBe(8);
    expect((await t.load()).store.getSnapshot()).toEqual(settled);
  });

  it('역행한 기기 시각으로 저장하더라도 마지막 실행 시각 이전 구간을 다시 지급하지 않는다', async () => {
    const t = setup(); t.wall(ctx.now - 10_000);
    const {store, loaded} = await t.load(); expect(store.getSnapshot()).toEqual(t.initial);
    const auto = createAutoSave(store,t.repository,loaded,t.clock.wallNow,t.scheduler,t.visibility,()=> 'unused');
    auto.start(); store.dispatch({type:'time/heartbeat'}); await auto.flush(); auto.stop();
    expect(deserializeSave(t.slots().primary).savedAt).toBe(ctx.now-10_000);
    t.wall(ctx.now); const restored = await t.load();
    expect(restored.store.getSnapshot()).toEqual(store.getSnapshot());
  });

  it('위험지대는 복원 정산 후에도 활동·자원·난수를 보존하고 첫 회복은 새 간격 뒤에만 지급한다', async () => {
    const t = setup(true); t.jump(86_400_000); const {store} = await t.load();
    expect(store.getSnapshot().character).toEqual(t.initial.character);
    expect(store.getSnapshot().meta.gameTime).toBe(20);
    const loop = createGameLoop(store,t.clock,t.scheduler); loop.start();
    t.jump(1_999); loop.synchronize(); expect(store.getSnapshot().character!.stamina.current).toBe(800);
    t.jump(1); loop.synchronize(); expect(store.getSnapshot().character!.stamina.current).toBe(801); loop.stop();
  });

  it('숨김 저장은 루프보다 먼저 요청돼도 실행 공백을 먼저 정산한 상태와 시각을 함께 저장한다', async () => {
    const t = setup(); const {store, loaded} = await t.load();
    const loop = createGameLoop(store,t.clock,t.scheduler);
    const auto = createAutoSave(store,t.repository,loaded,t.clock.wallNow,t.scheduler,t.visibility,()=> 'unused',loop.synchronize);
    auto.start(); loop.start(); t.jump(180_000);
    t.visibility.hidden = true; const hidden = t.visibility.addEventListener.mock.calls[0]![1] as () => void;
    hidden(); await auto.flush();
    const saved = deserializeSave(t.slots().primary);
    expect(saved.state.meta.gameTime).toBe(110); expect(saved.state.character!.stamina.current).toBe(890);
    expect(saved.savedAt).toBe(t.clock.wallNow());
    expect((await t.load()).store.getSnapshot()).toEqual(saved.state); loop.stop(); auto.stop();
  });
});

describe('숨김 시각 체크포인트', () => {
  it('정지 중 상태 변경이 없어도 숨김 시각을 저장해 열린 정지 구간을 오프라인 회복으로 재지급하지 않는다', async () => {
    const t = setup(); const {store,loaded} = await t.load();
    const loop = createGameLoop(store,t.clock,t.scheduler);
    const auto = createAutoSave(store,t.repository,loaded,t.clock.wallNow,t.scheduler,t.visibility,()=> 'unused',loop.synchronize);
    auto.start(); loop.start(); loop.setPaused(true); await auto.flush();
    const before = store.getSnapshot(); const revision = deserializeSave(t.slots().primary).revision;
    t.jump(3_600_000); t.visibility.hidden = true;
    (t.visibility.addEventListener.mock.calls[0]![1] as () => void)(); await auto.flush();
    const saved = deserializeSave(t.slots().primary);
    expect(saved.savedAt).toBe(t.clock.wallNow()); expect(saved.revision).toBe(revision+1);
    expect(saved.state).toEqual(before); expect((await t.load()).store.getSnapshot().meta.gameTime).toBe(before.meta.gameTime);
    expect((await t.load()).store.getSnapshot().character!.stamina).toEqual(before.character!.stamina);
    loop.stop(); auto.stop();
  });
});
