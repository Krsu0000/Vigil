import { describe, expect, it, vi } from 'vitest';
import { mapSources } from '../content/test-fixtures.ts';
import { mapContext, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { createGameStore } from './store.ts';
import { createGameLoop } from './loop.ts';
import { createAutoSave } from './auto-save.ts';
import { loadSavedGame } from './startup.ts';
import { deserializeSave } from '../persistence/save-file.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';

function setup(chance = 0) {
  const sources = mapSources(); sources['time-rules.json'].ambush = { waitChancePerTick: chance, restChancePerTick: chance };
  const ctx = mapContext(sources); let wall = ctx.now; let mono = 0;
  const clock = { wallNow: () => wall, monotonicNow: () => mono };
  let count = 0; const tasks = new Map<number, () => void>();
  const scheduler = { schedule: (callback: () => void) => { tasks.set(++count, callback); return count; }, cancel: (id: unknown) => { tasks.delete(id as number); } };
  const base = walk(startedState(ctx), ['east','east','south','south','east'], ctx);
  const state = { ...base, character: { ...base.character!, stamina: { current: 120, max: 900 }, movedSinceLastTick: false } };
  const store = createGameStore(ctx.content, state, clock.wallNow); const loop = createGameLoop(store, clock, scheduler); loop.start();
  return { ctx, store, loop, clock, scheduler, jump: (ms: number) => { wall += ms; mono += ms; } };
}

describe('귀환과 실행 시간/저장', () => {
  it('도착 즉시 회복하지 않고 새 회복 주기부터 거점 회복량을 적용하며 전역 틱은 유지한다', () => {
    const t = setup(); t.jump(1_500); expect(t.loop.returnToCamp().ok).toBe(true);
    expect(t.store.getSnapshot().character!.stamina.current).toBe(120); expect(t.store.getSnapshot().meta.gameTime).toBe(0);
    t.jump(500); t.loop.synchronize(); expect(t.store.getSnapshot().meta.gameTime).toBe(1); expect(t.store.getSnapshot().character!.stamina.current).toBe(120);
    t.jump(1_499); t.loop.synchronize(); expect(t.store.getSnapshot().character!.stamina.current).toBe(120);
    t.jump(1); t.loop.synchronize(); expect(t.store.getSnapshot().character!.stamina.current).toBe(121); t.loop.stop();
  });

  it('휴식 중 귀환은 휴식을 끝내며 거점에서 휴식 회복량을 지급하지 않는다', () => {
    const t = setup(); expect(t.loop.setResting(true).ok).toBe(true); t.jump(1_000);
    expect(t.loop.returnToCamp().ok).toBe(true); expect(t.store.getSnapshot().character!.activity).toBe('waiting');
    t.jump(2_000); t.loop.synchronize(); expect(t.store.getSnapshot().character!.stamina.current).toBe(121); t.loop.stop();
  });

  it('일반 이동의 100ms 제한 안에서도 귀환할 수 있고 귀환 자체는 추가 이동 대기를 만들지 않는다', () => {
    const t = setup(); expect(t.loop.move('east').ok).toBe(true); const current = t.store.getSnapshot().character!.stamina.current;
    expect(t.loop.returnToCamp().ok).toBe(true); expect(t.store.getSnapshot().character!.stamina.current).toBe(current);
    t.jump(100); expect(t.loop.move('east').ok).toBe(true); t.loop.stop();
  });

  it.each(['pause', 'settings', 'gap', 'stop'])('%s 상태에서는 귀환하지 않으며 해제 후 동작한다', kind => {
    const t = setup();
    if (kind === 'pause') t.loop.setPaused(true);
    else if (kind === 'settings') t.loop.setSettingsOpen(true);
    else if (kind === 'gap') t.jump(120_001);
    else t.loop.stop();
    if (kind === 'gap') t.loop.synchronize();
    const before = t.store.getSnapshot(); expect(t.loop.returnToCamp()).toEqual({ ok: false, reason: 'paused' }); expect(t.store.getSnapshot()).toBe(before);
    if (kind === 'pause' || kind === 'gap') t.loop.setPaused(false);
    else if (kind === 'settings') t.loop.setSettingsOpen(false);
    else t.loop.start();
    expect(t.loop.returnToCamp().ok).toBe(true); t.loop.stop();
  });

  it('타이머보다 먼저 눌러도 마감 틱의 습격을 먼저 처리해 귀환으로 건너뛰지 못한다', () => {
    const t = setup(1); t.jump(2_000); expect(t.loop.returnToCamp()).toEqual({ ok: false, reason: 'paused' });
    expect(t.store.getSnapshot().expedition?.pendingAmbush).toBeTruthy(); expect(t.store.getSnapshot().character!.position!.x).toBe(4);
    expect(t.loop.resolveAmbush('escaped').ok).toBe(true); expect(t.loop.returnToCamp().ok).toBe(true); t.loop.stop();
  });

  it('거부된 귀환은 회복 대기를 다시 세지 않는다', () => {
    const t = setup(); expect(t.loop.returnToCamp().ok).toBe(true); t.jump(1_500);
    expect(t.loop.returnToCamp().ok).toBe(false); t.jump(500); t.loop.synchronize();
    expect(t.store.getSnapshot().character!.stamina.current).toBe(121); t.loop.stop();
  });

  it('귀환 상태를 기존 v4 자동 저장/파일로 보존하고 거점 오프라인 회복만 추가한다', async () => {
    const t = setup(); let primary: string | null = null; let backup: string | null = null; let generation = 0;
    const repository: SaveRepository = { read: async () => ({ primary, backup, generation }), close: vi.fn(), write: async (next, previous, expected) => {
      if (expected !== generation) throw new Error('충돌'); primary = next; backup = previous; return ++generation;
    } };
    const visibility = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const auto = createAutoSave(t.store, repository, { save: null, source: 'empty', previousValid: null, generation: 0 }, t.clock.wallNow, t.scheduler, visibility, () => t.store.getSnapshot().meta.campaignId, t.loop.synchronize, t.loop.resetAfterRestore);
    auto.start(); await auto.flush(); const exploration = t.store.getSnapshot().campaign.exploration;
    expect(t.loop.returnToCamp().ok).toBe(true); await auto.flush(); const saved = deserializeSave(primary!);
    expect(saved.schemaVersion).toBe(6); expect(saved.state.campaign.exploration).toEqual(exploration); expect(auto.exportSave().state).toEqual(saved.state);
    t.loop.stop(); auto.stop(); t.jump(10_000);
    const loaded = await loadSavedGame(t.ctx.content, repository, t.clock.wallNow, () => { throw new Error('새 캠페인 금지'); });
    expect(loaded.store.getSnapshot().character!.position).toEqual(saved.state.character!.position);
    expect(loaded.store.getSnapshot().character!.stamina.current).toBe(125); expect(loaded.store.getSnapshot().meta.gameTime).toBe(5);
  });
});
