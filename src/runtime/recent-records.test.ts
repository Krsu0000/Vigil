import { describe, expect, it, vi } from 'vitest';
import { lootedState } from '../engine/systems/inventory/test-fixtures.ts';
import { createGameStore } from './store.ts';
import { createSaveFile, parseSave, restoreSave, serializeSave } from '../persistence/save-file.ts';
import { v6ToV7 } from '../persistence/migrations/v6-to-v7.ts';
import { deepFreeze } from '../engine/core/test-fixtures.ts';
import { recordEvents } from './recent-records.ts';

const metadata = { contentVersion: '0.4.0', saveId: '00112233-4455-4677-8899-aabbccddeeff', revision: 1, savedAt: 1_700_000_000_000 };
function setup() {
  const { ctx, state } = lootedState(); let now = metadata.savedAt;
  const store = createGameStore(ctx.content, state, () => now);
  return { store, ctx, now: (at: number) => { now = at; } };
}

describe('최근 기록의 사건·시각·저장', () => {
  it('이동·거부된 이동·틱·자동 회복은 기록하지 않는다', () => {
    const { store } = setup();
    for (const action of [{ type: 'move/step', direction: 'west' }, { type: 'move/step', direction: 'north' },
      { type: 'time/tick' }, { type: 'stamina/recover', periods: 1 }] as const) store.dispatch(action);
    expect(store.getSnapshot().campaign.recentRecords).toBeUndefined();
  });
  it('상자 물품의 이름·수량과 주입된 현실 시각을 한 번 저장한다', () => {
    const { store } = setup();
    // lootedState는 엔진만 사용해 첫 상자를 준비하므로 별도 지도 상자를 연다.
    for (const direction of ['south', 'south', 'east', 'east'] as const) store.dispatch({ type: 'move/step', direction });
    const result = store.dispatch({ type: 'inventory/open_chest', chestId: 'chest.ruins_supply' });
    expect(result.ok).toBe(true); expect(result.state).toBe(store.getSnapshot());
    expect(store.getSnapshot().campaign.recentRecords).toEqual([{ at: metadata.savedAt, text: '폐허의 상자에서 물품을 획득했습니다. 여행 식량 ×2' }]);
    const before = store.getSnapshot(); expect(store.dispatch({ type: 'inventory/open_chest', chestId: 'chest.ruins_supply' }).ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
  });
  it('사용·장착·해제는 기록하고 저장 뒤 복원해도 같은 시각과 순서다', () => {
    const { store, ctx, now } = setup();
    store.dispatch({ type: 'inventory/equip', itemId: 'item.trail_boots' }); now(metadata.savedAt + 61_000);
    store.dispatch({ type: 'inventory/unequip', slot: 'feet' });
    const state = store.getSnapshot(); const save = createSaveFile(state, metadata);
    const resumed = createGameStore(ctx.content, restoreSave(serializeSave(save)), () => metadata.savedAt + 120_000);
    expect(resumed.getSnapshot()).toEqual(state);
    expect(state.campaign.recentRecords?.map(entry => entry.at)).toEqual([metadata.savedAt, metadata.savedAt + 61_000]);
    resumed.dispatch({ type: 'inventory/equip', itemId: 'item.trail_boots' }); expect(resumed.getSnapshot().campaign.recentRecords).toHaveLength(3);
  });
  it('100개를 넘으면 가장 오래된 기록만 지우며 시계가 역행해도 사건 순서를 지킨다', () => {
    const { store, now } = setup();
    for (let i = 0; i < 105; i++) { now(metadata.savedAt - i * 1000); store.dispatch(i % 2 === 0 ? { type: 'inventory/equip', itemId: 'item.trail_boots' } : { type: 'inventory/unequip', slot: 'feet' }); }
    const records = store.getSnapshot().campaign.recentRecords!;
    expect(records).toHaveLength(100); expect(records[0]!.at).toBe(metadata.savedAt - 5000); expect(records[99]!.at).toBe(metadata.savedAt - 104000);
    expect(restoreSave(serializeSave(createSaveFile(store.getSnapshot(), metadata))).campaign.recentRecords).toEqual(records);
  });
  it('미처리 습격은 화면을 다시 열거나 복원해도 중복되지 않는다', () => {
    const { store, ctx } = setup();
    const recorded = recordEvents(store.getSnapshot(), [{ type: 'ambush/triggered', triggeredAt: 0, activityAtTrigger: 'waiting' }], ctx.content, metadata.savedAt);
    const restored = createGameStore(ctx.content, restoreSave(serializeSave(createSaveFile(recorded, metadata))), () => metadata.savedAt);
    expect(restored.getSnapshot().campaign.recentRecords).toHaveLength(1);
  });
  it('v6는 입력·기존 전투·자원을 보존하며 기록 없는 v7로 변환한다', () => {
    const { store } = setup(); const current = createSaveFile(store.getSnapshot(), metadata);
    const old = deepFreeze({ ...current, schemaVersion: 6 }); const before = structuredClone(old);
    expect(v6ToV7(old)).toEqual({ ...old, schemaVersion: 7 }); expect(old).toEqual(before);
    expect(parseSave(old).state).toEqual(current.state);
  });
  it.each([
    Array.from({ length: 101 }, () => ({ at: 0, text: '기록' })),
    [{ at: -1, text: '기록' }], [{ at: 1.5, text: '기록' }], [{ at: 8640000000000001, text: '기록' }],
    [{ at: 0, text: '' }], [{ at: 0, text: '기록', extra: true }],
  ].map(records => ({ records })))('손상되거나 상한을 넘은 기록은 현재 탐험을 바꾸지 않는다', ({ records }) => {
    const { store } = setup(); const before = store.getSnapshot(); const listener = vi.fn(); store.subscribe(listener);
    expect(() => store.restore({ ...createSaveFile(before, metadata), state: { ...before, campaign: { ...before.campaign, recentRecords: records } } })).toThrow();
    expect(store.getSnapshot()).toBe(before); expect(listener).not.toHaveBeenCalled();
  });
});
