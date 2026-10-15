import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { createRng } from '../../core/rng.ts';
import { inventoryContext, inventoryDispatch as run, lootedState } from './test-fixtures.ts';
import type { InventoryAction } from './actions.ts';
import { startedState } from '../map/test-fixtures.ts';
import { getMoveCost, movementCosts } from '../stamina/stamina.ts';
import { inventoryWeight } from './selectors.ts';
import { itemEffectRegistry } from './effects.ts';

const boots = 'item.trail_boots', food = 'item.travel_ration';
const equip = { type: 'inventory/equip', itemId: boots } as const;
describe('상자·음식·장비 최소 순환', () => {
  it('같은 칸에서만 상자를 열고 모든 물품과 열린 기록을 한 번에 반영한다', () => {
    const ctx = inventoryContext(); const before = deepFreeze(startedState(ctx));
    expect(run(before, { type: 'inventory/open_chest', chestId: 'chest.camp_supply' }, ctx)).toMatchObject({ ok: false, state: before });
    const { state } = lootedState();
    expect(state.character!.inventory).toEqual({ stacks: { [food]: 3, [boots]: 1 }, equipment: { feet: null } });
    expect(state.campaign.openedChests).toEqual({ 'chest.camp_supply': true });
    const duplicate = run(deepFreeze(state), { type: 'inventory/open_chest', chestId: 'chest.camp_supply' }, ctx);
    expect(duplicate.ok).toBe(false); expect(duplicate.state).toBe(state);
    expect(inventoryWeight(state.character!.inventory, ctx.content)).toBe(1550);
    expect(state.meta).toEqual(before.meta);
  });
  it('음식 한 개로 즉시 회복하고 최대치에서 소비하지 않으며 마지막 수량을 삭제한다', () => {
    const { ctx, state } = lootedState();
    const full = run(state, { type: 'inventory/use', itemId: food }, ctx);
    expect(full.ok).toBe(false); expect(full.state).toBe(state);
    const low = deepFreeze({ ...state, character: { ...state.character!, stamina: { current: 850, max: 900 }, activity: 'resting' as const } });
    const used = run(low, { type: 'inventory/use', itemId: food }, ctx);
    expect(used.ok).toBe(true); if (!used.ok) throw new Error('음식 사용 실패'); expect(used.state.character!.stamina.current).toBe(900);
    expect(used.state.character!.activity).toBe('waiting');
    expect(used.state.character!.inventory.stacks[food]).toBe(2);
    expect(used.state.meta).toEqual(state.meta);
    expect(used.events).toEqual([{ type: 'inventory/used', itemId: food, recovered: 50 }]);
    const last = { ...state, character: { ...state.character!, stamina: { current: 0, max: 900 }, inventory: { ...state.character!.inventory, stacks: { [food]: 1 } } } };
    const empty = run(last, { type: 'inventory/use', itemId: food }, ctx).state;
    expect(empty.character!.inventory.stacks[food]).toBeUndefined();
    expect(empty.character!.stamina.current).toBe(120);
    expect(run(empty, { type: 'inventory/use', itemId: food }, ctx).ok).toBe(false);
  });
  it('음식의 제품 효과가 공통 레지스트리에서 최대치 제한과 함께 실행된다', () => {
    const { ctx, state } = lootedState();
    const low = { ...state, character: { ...state.character!, stamina: { current: 880, max: 900 } } };
    const result = itemEffectRegistry.apply(low, { type: 'stamina/restore', params: { amount: 120 } }, ctx, createRng(state.meta.rngState));
    expect(result.state.character!.stamina.current).toBe(900);
    expect(itemEffectRegistry.validate({ type: 'stamina/restore', params: { amount: -1 } }).ok).toBe(false);
  });
  it('장착·해제는 수량/중량을 보존하며 add 다음 탐사 배율과 실제 이동 차감에 반영된다', () => {
    const { ctx, state } = lootedState(); const before = deepFreeze(state);
    expect(movementCosts(before, ctx.content)).toEqual({ safe: 0, unexplored: 6, explored: 3 });
    const wearing = run(before, equip, ctx).state;
    expect(movementCosts(wearing, ctx.content)).toEqual({ safe: 0, unexplored: 4, explored: 2 });
    expect(wearing.character!.inventory.stacks).toBe(state.character!.inventory.stacks);
    expect(inventoryWeight(wearing.character!.inventory, ctx.content)).toBe(1550);
    expect(run(wearing, equip, ctx).state).toBe(wearing);
    // 안전 구역 두 칸을 지나 (4,3) 위험 구역에 진입한다.
    let moved = wearing;
    for (const direction of ['south', 'south', 'east'] as const) {
      const result = run(moved, { type: 'move/step', direction }, ctx);
      if (!result.ok) throw new Error('이동 실패');
      moved = result.state;
    }
    expect(moved.character!.stamina.current).toBe(896);
    const unwear = run(moved, { type: 'inventory/unequip', slot: 'feet' }, ctx).state;
    expect(getMoveCost(unwear, moved.character!.position!, ctx.content)).toBe(3);
    expect(getMoveCost(moved, moved.character!.position!, ctx.content)).toBe(2);
    expect(movementCosts(unwear, ctx.content)).toEqual({ safe: 0, unexplored: 6, explored: 3 });
  });
  it.each<InventoryAction>([
    { type: 'inventory/use', itemId: 'item.missing' }, { type: 'inventory/use', itemId: boots },
    { type: 'inventory/equip', itemId: food }, { type: 'inventory/equip', itemId: 'item.missing' },
    { type: 'inventory/unequip', slot: 'feet' }, { type: 'inventory/open_chest', chestId: 'chest.ruins_supply' },
  ])('잘못된/불가능한 행동은 상태와 난수를 그대로 둔다: %j', action => {
    const { ctx, state } = lootedState(); const result = run(deepFreeze(state), action, ctx);
    expect(result.ok).toBe(false); expect(result.state).toBe(state); expect('events' in result).toBe(false);
  });
  it.each<InventoryAction>([equip, { type: 'inventory/use', itemId: food }, { type: 'inventory/unequip', slot: 'feet' },
    { type: 'inventory/open_chest', chestId: 'chest.camp_supply' }])('미처리 습격은 소지품 행동을 차단한다: %j', action => {
    const { ctx, state } = lootedState();
    const pending = deepFreeze({ ...state, expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'waiting' as const } } });
    expect(run(pending, action, ctx).state).toBe(pending);
    expect(run(pending, action, ctx).ok).toBe(false);
  });
  it('수량 합산이 안전한 정수를 넘으면 상자와 인벤토리를 함께 보존한다', () => {
    const { ctx, state } = lootedState();
    const before = deepFreeze({ ...state, campaign: { ...state.campaign, openedChests: {} }, character: { ...state.character!, inventory: { ...state.character!.inventory, stacks: { [food]: Number.MAX_SAFE_INTEGER } } } });
    const result = run(before, { type: 'inventory/open_chest', chestId: 'chest.camp_supply' }, ctx);
    expect(result.ok).toBe(false); expect(result.state).toBe(before);
  });
});
