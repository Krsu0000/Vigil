import { v6ToV7 } from '../persistence/migrations/v6-to-v7.ts';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from './store.ts';
import { createGameLoop } from './loop.ts';
import { lootedState } from '../engine/systems/inventory/test-fixtures.ts';
import { createSaveFile, parseSave, restoreSave, serializeSave } from '../persistence/save-file.ts';
import { v3ToV4 } from '../persistence/migrations/v3-to-v4.ts';
import { v5ToV6 } from '../persistence/migrations/v5-to-v6.ts';
import { v4ToV5 } from '../persistence/migrations/v4-to-v5.ts';
import legacyV3 from '../persistence/fixtures/v3-explored.json' with { type: 'json' };
import { deepFreeze } from '../engine/core/test-fixtures.ts';
import { movementCosts } from '../engine/systems/stamina/stamina.ts';
import { SaveFileV4Schema } from '../persistence/schemas-v4.ts';

const metadata = { contentVersion: '0.3.0', saveId: '00112233-4455-4677-8899-aabbccddeeff', revision: 3, savedAt: 1_700_000_000_000 };
describe('아이템 저장과 런타임 연결', () => {
  it('v4의 모든 상태를 보존하면서 빈 소지품·상자 기록만 더하고 v6로 저장한다', () => {
    const old = deepFreeze(SaveFileV4Schema.parse(v3ToV4(legacyV3))); const before = structuredClone(old);
    const expected = v6ToV7(v5ToV6(v4ToV5(old))); const result = parseSave(old);
    expect(result).toEqual(expected); expect(old).toEqual(before);
    expect(result.state.meta).toEqual(old.state.meta);
    expect(result.state.campaign.exploration).toEqual(old.state.campaign.exploration);
    expect(result.state.character!.inventory).toEqual({ stacks: {}, equipment: { feet: null } });
    expect(result.state.campaign.openedChests).toEqual({});
    expect(restoreSave(serializeSave(result))).toEqual(result.state);
  });
  it('변환은 null 캐릭터를 생성하거나 미배치 캐릭터를 배치하지 않는다', () => {
    const old = SaveFileV4Schema.parse(v3ToV4(legacyV3));
    for (const character of [null, { ...old.state.character!, position: null }]) {
      const result = parseSave({ ...old, state: { ...old.state, character } });
      expect(result.state.character?.position ?? null).toBeNull();
      expect(result.state.character === null).toBe(character === null);
    }
  });
  it('획득·장착 후 왕복, 복원 후 음식 사용·이동·중복 상자 거부가 같은 결과를 낸다', () => {
    const { ctx, state } = lootedState();
    const a = createGameStore(ctx.content, state, () => ctx.now);
    a.dispatch({ type: 'inventory/equip', itemId: 'item.trail_boots' });
    for (const direction of ['south','south','east'] as const) a.dispatch({ type: 'move/step', direction });
    const save = createSaveFile(a.getSnapshot(), metadata);
    const b = createGameStore(ctx.content, restoreSave(serializeSave(save)), () => ctx.now);
    expect(b.getSnapshot()).toEqual(a.getSnapshot());
    expect(movementCosts(b.getSnapshot(),ctx.content)).toEqual({ safe:0, unexplored:4, explored:2 });
    for (const action of [ { type:'inventory/use',itemId:'item.travel_ration' }, {type:'move/step',direction:'east'},
      {type:'inventory/open_chest',chestId:'chest.ruins_supply'}, {type:'inventory/open_chest',chestId:'chest.ruins_supply'},
      {type:'map/return'}, {type:'inventory/unequip',slot:'feet'} ] as const) expect(b.dispatch(action)).toEqual(a.dispatch(action));
  });
  it('손상/없는 아이템·장비·상자 기록을 원자적으로 거부한다', () => {
    const { ctx, state } = lootedState(); const store=createGameStore(ctx.content,state,()=>ctx.now);
    const before=store.getSnapshot(), notify=vi.fn();store.subscribe(notify);
    const inventory=state.character!.inventory;
    const invalid: unknown[]=[
      { ...inventory, stacks:{'item.missing':1} }, { ...inventory, stacks:{'item.travel_ration':0} },
      { ...inventory, stacks:{'item.travel_ration':1.5} }, { ...inventory, equipment:{feet:'item.travel_ration'} },
      { ...inventory, equipment:{feet:'item.missing'} }, { ...inventory, stacks:{'item.trail_boots':Number.MAX_SAFE_INTEGER} },
    ];
    for(const inv of invalid) expect(()=>store.restore({...createSaveFile(state,metadata),state:{...state,character:{...state.character!,inventory:inv}}})).toThrow();
    expect(()=>store.restore({...createSaveFile(state,metadata),state:{...state,campaign:{...state.campaign,openedChests:{'chest.missing':true}}}})).toThrow();
    expect(store.getSnapshot()).toBe(before);expect(notify).not.toHaveBeenCalled();
  });
  it('일시정지에서는 조작을 막고 소지품 행동 전 마감된 습격을 먼저 처리한다', () => {
    const { ctx, state }=lootedState();
    // 100% 대기 습격을 주입하고 위험 구역으로 진입한다.
    const content={...ctx.content,timeRules:{...ctx.content.timeRules,ambush:{waitChancePerTick:1,restChancePerTick:1}}};
    const store=createGameStore(content,state,()=>ctx.now);
    for(const direction of ['south','south','east'] as const) store.dispatch({type:'move/step',direction});
    const base=store.getSnapshot();store.dispatch({type:'time/tick'}); // 이동한 틱을 비운다.
    let mono=0;
    const loop=createGameLoop(store,{wallNow:()=>ctx.now+mono,monotonicNow:()=>mono},{schedule:()=>0,cancel:()=>{}});
    loop.start();loop.setPaused(true);const paused=store.getSnapshot();
    expect(loop.inventoryAction({type:'inventory/equip',itemId:'item.trail_boots'}).ok).toBe(false);
    expect(store.getSnapshot()).toBe(paused);loop.setPaused(false);
    mono=2000;const result=loop.inventoryAction({type:'inventory/use',itemId:'item.travel_ration'});
    expect(result.ok).toBe(false);expect(store.getSnapshot().expedition?.pendingAmbush).toBeTruthy();
    expect(store.getSnapshot().character!.inventory).toEqual(base.character!.inventory);loop.stop();
  });
});
