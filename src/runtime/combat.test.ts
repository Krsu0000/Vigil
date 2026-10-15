import { describe, expect, it, vi } from 'vitest';
import { loadContent } from '../content/load.ts';
import { inventorySources } from '../content/test-fixtures.ts';
import { itemEffectRegistry } from '../engine/systems/inventory/effects.ts';
import { startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { deepFreeze } from '../engine/core/test-fixtures.ts';
import { replayCombat } from '../engine/systems/combat/replay.ts';
import { createSaveFile, restoreSave, serializeSave } from '../persistence/save-file.ts';
import { SaveFileV5Schema } from '../persistence/schemas-v5.ts';
import { v5ToV6 } from '../persistence/migrations/v5-to-v6.ts';
import { createGameStore } from './store.ts';
import { createGameLoop } from './loop.ts';
import type { RuntimeAction } from './store.ts';

const metadata = { contentVersion: '0.4.0', saveId: '00112233-4455-4677-8899-aabbccddeeff', revision: 3, savedAt: 1_700_000_000_000 };
function setup(options: { hit?: number; escape?: number; health?: number; stamina?: number; damage?: number; gameTime?: number } = {}) {
  const sources = inventorySources();
  Object.assign(sources['time-rules.json'].combat, { hitChance: options.hit ?? 1, escapeChance: options.escape ?? 1, attackMin: options.damage ?? 10, attackMax: options.damage ?? 10 });
  for (const monster of sources['monsters.json']) Object.assign(monster, { hitChance: 1, damageMin: 8, damageMax: 8 });
  const result = loadContent(sources, itemEffectRegistry.validate);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const ctx = { content: result.content, now: metadata.savedAt };
  const base = walk(startedState(ctx), ['east', 'east', 'south', 'south', 'east', 'east', 'north', 'north'], ctx);
  const state = { ...base, meta: { ...base.meta, gameTime: options.gameTime ?? 0 }, character: { ...base.character!,
    stamina: { current: options.stamina ?? 100, max: 900 }, health: { current: options.health ?? 100, max: 100 },
    inventory: { stacks: { 'item.travel_ration': 3 }, equipment: { feet: null } } } };
  if (options.gameTime !== undefined) state.expedition = { ...base.expedition!, pendingAmbush: { ...base.expedition!.pendingAmbush!, triggeredAt: options.gameTime } };
  const store = createGameStore(ctx.content, state, () => ctx.now);
  return { ctx, state, store };
}
function start(options: Parameters<typeof setup>[0] = {}) {
  const result = setup(options); expect(result.store.dispatch({ type: 'combat/start' }).ok).toBe(true); return result;
}
const act = (store: ReturnType<typeof createGameStore>, choice: 'attack' | 'skill' | 'defend' | 'escape' | 'item') => store.dispatch({ type: 'combat/act', choice,
  ...(choice === 'attack' || choice === 'skill' ? { targetId: store.getSnapshot().expedition!.combat!.enemies.find(enemy => enemy.health > 0)!.id } : {}),
  ...(choice === 'item' ? { itemId: 'item.travel_ration' } : {}),
});
const combat = (store: ReturnType<typeof createGameStore>) => store.getSnapshot().expedition!.combat!;

describe('실제 지도 조우와 턴 전투', () => {
  it('적 칸에 닿으면 이전 칸을 기록하고 명시적으로 시작한다', () => {
    const { store } = setup(); const state = store.getSnapshot();
    expect(state.character!.position).toMatchObject({ x: 5, y: 1 });
    expect(state.expedition!.pendingAmbush).toMatchObject({ encounterId: 'encounter.wolf_pack', retreat: { x: 5, y: 2 } });
    expect(state.expedition!.combat).toBeUndefined();
    expect(store.dispatch({ type: 'ambush/resolve', result: 'defeated' }).ok).toBe(false);
    expect(store.dispatch({ type: 'combat/start' }).ok).toBe(true);
    expect(combat(store).turn).toBe(1); expect(store.getSnapshot().meta).toEqual(state.meta);
    expect(store.dispatch({ type: 'combat/start' }).ok).toBe(false);
  });
  it('전열을 공격하고 살아 있는 전열만 반격한다', () => {
    const { store } = start(); expect(act(store, 'attack').ok).toBe(true);
    expect(combat(store).enemies.map(e => e.health)).toEqual([22, 18]);
    expect(store.getSnapshot().character!.health.current).toBe(92);
    expect(store.getSnapshot().character!.stamina.current).toBe(100);
    expect(store.getSnapshot().meta.gameTime).toBe(0);
  });
  it('공격 실패도 한 턴이며 난수와 반격을 소비한다', () => {
    const { store } = start({ hit: 0 }); const rng = store.getSnapshot().meta.rngState;
    act(store, 'attack'); expect(combat(store).enemies[0]!.health).toBe(32);
    expect(combat(store).actions).toHaveLength(1); expect(combat(store).history[0]!.text).toContain('빗나갔다');
    expect(store.getSnapshot().meta.rngState).not.toEqual(rng); expect(store.getSnapshot().character!.health.current).toBe(92);
  });
  it('방어는 반격 피해를 줄이며 스태미나 0에서도 공격·방어가 된다', () => {
    const { store } = start({ stamina: 0 }); act(store, 'defend');
    expect(store.getSnapshot().character!.health.current).toBe(96);
    expect(act(store, 'attack').ok).toBe(true); expect(store.getSnapshot().character!.stamina.current).toBe(0);
  });
  it('강타는 스태미나를 사용하고 피해 배율을 적용한다', () => {
    const { store } = start(); act(store, 'skill');
    expect(store.getSnapshot().character!.stamina.current).toBe(88); expect(combat(store).enemies[0]!.health).toBe(14);
  });
  it('아이템은 기존 음식 효과를 재사용하고 사용 후 적이 반격한다', () => {
    const { store } = start({ stamina: 850 }); act(store, 'item');
    expect(store.getSnapshot().character!.stamina.current).toBe(900); expect(store.getSnapshot().character!.inventory.stacks['item.travel_ration']).toBe(2);
    expect(store.getSnapshot().character!.health.current).toBe(92); expect(combat(store).actions).toHaveLength(1);
  });
  it.each<RuntimeAction>([
    { type: 'combat/act', choice: 'attack', targetId: 'missing' },
    { type: 'combat/act', choice: 'attack', targetId: 'encounter.wolf_pack:1' },
    { type: 'combat/act', choice: 'skill', targetId: 'encounter.wolf_pack:0' },
    { type: 'combat/act', choice: 'item', itemId: 'item.missing' },
    { type: 'combat/close' }, { type: 'move/step', direction: 'south' }, { type: 'map/return' },
    { type: 'rest/start' }, { type: 'inventory/use', itemId: 'item.travel_ration' }, { type: 'time/tick' }, { type: 'stamina/recover', periods: 10 },
  ])('불가능한 행동 %j는 상태·난수·자원을 전혀 바꾸지 않는다', action => {
    const { store } = start({ stamina: 0 }); const before = deepFreeze(store.getSnapshot()); const listener = vi.fn(); store.subscribe(listener);
    const result = store.dispatch(action); expect(result.ok).toBe(false); expect(store.getSnapshot()).toBe(before); expect(listener).not.toHaveBeenCalled();
  });
  it('도주 실패는 반격, 성공은 직전 칸 복귀이며 적은 남는다', () => {
    const failed = start({ escape: 0 }); act(failed.store, 'escape');
    expect(combat(failed.store).status).toBe('active'); expect(failed.store.getSnapshot().character!.health.current).toBe(92);
    const { store } = start(); act(store, 'defend'); act(store, 'escape');
    expect(combat(store).status).toBe('escaped'); expect(store.getSnapshot().character!.position).toMatchObject({ x: 5, y: 2 });
    expect(store.getSnapshot().meta.gameTime).toBe(2); expect(store.getSnapshot().character!.health.current).toBe(96);
    expect(store.getSnapshot().expedition!.defeatedEnemies).toBeUndefined(); expect(combat(store).loot).toEqual([]);
    store.dispatch({ type: 'combat/close' }); expect(store.dispatch({ type: 'move/step', direction: 'north' }).ok).toBe(true);
    expect(store.getSnapshot().expedition!.pendingAmbush?.encounterId).toBe('encounter.wolf_pack');
  });
  it('전열이 쓰러지면 후열을 공격하고 승리 때만 전리품·토벌·시간을 한 번 지급한다', () => {
    const { store } = start({ damage: 100 }); act(store, 'attack');
    expect(combat(store).enemies.map(e => e.health)).toEqual([0, 18]); expect(store.getSnapshot().character!.health.current).toBe(92);
    act(store, 'attack'); expect(combat(store).status).toBe('victory'); expect(store.getSnapshot().meta.gameTime).toBe(2);
    expect(store.getSnapshot().character!.inventory.stacks['item.travel_ration']).toBe(5);
    expect(store.getSnapshot().expedition!.defeatedEnemies).toEqual({ 'encounter.wolf_pack': true });
    const before = store.getSnapshot(); expect(act(store, 'defend').ok).toBe(false); expect(store.getSnapshot()).toBe(before);
    store.dispatch({ type: 'combat/close' }); store.dispatch({ type: 'move/step', direction: 'south' }); store.dispatch({ type: 'move/step', direction: 'north' });
    expect(store.getSnapshot().expedition!.pendingAmbush).toBeNull(); expect(store.getSnapshot().character!.inventory.stacks['item.travel_ration']).toBe(5);
  });
  it('체력 0은 패배로 확정하고 후속 조작·임의 회복을 막는다', () => {
    const { store } = start({ health: 4 }); const death = act(store, 'attack');
    expect(death.ok && death.events.some(event => event.type === 'character/died')).toBe(true);
    expect(combat(store).status).toBe('defeat'); expect(store.getSnapshot().character!.health.current).toBe(0); expect(store.getSnapshot().meta.gameTime).toBe(1);
    for (const action of [{ type: 'combat/close' }, { type: 'map/return' }, { type: 'stamina/recover', periods: 100 }] as const) expect(store.dispatch(action).ok).toBe(false);
  });
  it('종료 때 시간 상한을 넘는 행동을 원자적으로 거부한다', () => {
    const { store } = start({ gameTime: Number.MAX_SAFE_INTEGER }); const before = store.getSnapshot();
    expect(act(store, 'escape').ok).toBe(false); expect(store.getSnapshot()).toBe(before);
  });
});

describe('전투 재생·저장·런타임', () => {
  it.each(['active', 'victory', 'escaped', 'defeat'] as const)('%s 상태의 저장/복원과 시드 재생이 같다', status => {
    const { store, ctx } = start(status === 'defeat' ? { health: 4 } : { damage: 100 });
    if (status === 'active') { act(store, 'defend'); act(store, 'item'); }
    if (status === 'victory') { act(store, 'attack'); act(store, 'attack'); }
    if (status === 'escaped') act(store, 'escape');
    if (status === 'defeat') act(store, 'defend');
    const state = store.getSnapshot(); expect(combat(store).status).toBe(status);
    const replayed = replayCombat(deepFreeze(combat(store)), ctx.content);
    expect(replayed.character).toEqual(state.character); expect(replayed.expedition!.combat).toEqual(combat(store));
    expect(replayed.meta.rngState).toEqual(state.meta.rngState); expect(replayed.meta.gameTime).toBe(state.meta.gameTime);
    const restored = createGameStore(ctx.content, restoreSave(serializeSave(createSaveFile(state, metadata))), () => ctx.now);
    expect(restored.getSnapshot()).toEqual(state);
    if (status === 'active') expect(act(restored, 'attack')).toEqual(act(store, 'attack'));
  });
  it('v5 원본은 변경하지 않고 체력만 추가하며 v6로 왕복한다', () => {
    const { state, ctx } = setup(); const { health: _health, ...character } = state.character!;
    const old = deepFreeze(SaveFileV5Schema.parse({ ...metadata, format: 'last-vigil-save', schemaVersion: 5,
      state: { ...state, character, expedition: { pendingAmbush: null } } }));
    const before = structuredClone(old); const converted = v5ToV6(old);
    expect(old).toEqual(before); expect(converted).toEqual({ ...old, schemaVersion: 6, state: { ...old.state, character: { ...old.state.character!, health: { current: 100, max: 100 } } } });
    expect(createGameStore(ctx.content, restoreSave(JSON.stringify(old)), () => ctx.now).getSnapshot().character!.health).toEqual({ current: 100, max: 100 });
  });
  it('손상된 전투를 원자적으로 거부한다', () => {
    const { store } = start(); act(store, 'defend'); const state = store.getSnapshot(); const before = store.getSnapshot(); const listener = vi.fn(); store.subscribe(listener);
    const save = createSaveFile(state, metadata);
    const corruptions = [
      { ...state, character: { ...state.character!, health: { current: 100, max: 100 } } },
      { ...state, character: { ...state.character!, position: { ...state.character!.position!, x: 4, y: 3 } } },
      { ...state, meta: { ...state.meta, gameTime: 1 } },
      { ...state, meta: { ...state.meta, rngState: [1, 2, 3, 4] } },
      { ...state, expedition: { ...state.expedition!, combat: { ...combat(store), retreat: { ...combat(store).retreat, x: 1, y: 1 } } } },
      { ...state, expedition: { ...state.expedition!, combat: { ...combat(store), actions: [] } } },
      { ...state, expedition: { ...state.expedition!, combat: { ...combat(store), enemies: combat(store).enemies.map(e => ({ ...e, health: 1 })) } } },
    ];
    for (const broken of corruptions) expect(() => store.restore({ ...save, state: broken })).toThrow();
    expect(store.getSnapshot()).toBe(before); expect(listener).not.toHaveBeenCalled();
  });
  it('실시간·오프라인 회복·추가 습격을 멈추고 종료 턴만 시간에 더한다', () => {
    const { store, ctx } = start(); let mono = 0;
    const loop = createGameLoop(store, { wallNow: () => ctx.now + mono, monotonicNow: () => mono }, { schedule: () => 0, cancel: () => {} }); loop.start();
    const before = store.getSnapshot(); mono = 60000; loop.synchronize(); expect(store.getSnapshot()).toBe(before);
    store.dispatch({ type: 'time/settle', from: ctx.now, to: ctx.now + mono });
    expect(store.getSnapshot().character).toEqual(before.character); expect(store.getSnapshot().meta.gameTime).toBe(0);
    loop.setSettingsOpen(true); expect(loop.combatAction({ type: 'combat/act', choice: 'defend' }).ok).toBe(false); loop.setSettingsOpen(false);
    act(store, 'defend'); act(store, 'escape'); expect(store.getSnapshot().meta.gameTime).toBe(2);
    expect(store.getSnapshot().expedition!.pendingAmbush).toBeNull();
    loop.combatAction({ type: 'combat/close' }); expect(loop.getSnapshot().running).toBe(true);
    mono += 100; loop.synchronize(); expect(store.getSnapshot().meta.gameTime).toBe(2); loop.stop();
  });
  it('기존 대기/휴식 습격은 실제 적 전투로 시작한다', () => {
    const { store, state } = setup(); const position = state.expedition!.pendingAmbush!.retreat!;
    const ambushed = { ...state, character: { ...state.character!, position }, expedition: { pendingAmbush: { triggeredAt: state.meta.gameTime, activityAtTrigger: 'resting' as const } } };
    store.restore(createSaveFile(ambushed, metadata)); expect(store.dispatch({ type: 'combat/start' }).ok).toBe(true);
    expect(combat(store).origin).toBe('ambush'); expect(combat(store).retreat).toEqual(position);
    act(store, 'escape'); expect(store.getSnapshot().character!.position).toEqual(position); expect(store.getSnapshot().expedition!.defeatedEnemies).toBeUndefined();
  });
  it('귀환 후 안전 구역에서 체력을 회복한다', () => {
    const { store } = start(); act(store, 'defend'); act(store, 'escape'); store.dispatch({ type: 'combat/close' });
    store.dispatch({ type: 'map/return' }); store.dispatch({ type: 'stamina/recover', periods: 2 }); expect(store.getSnapshot().character!.health.current).toBe(98);
  });
});
