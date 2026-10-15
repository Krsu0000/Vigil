import { describe, expect, it } from 'vitest';
import { loadContent } from './load.ts';
import { inventorySources, testSources } from './test-fixtures.ts';
import { itemEffectRegistry } from '../engine/systems/inventory/effects.ts';

const load = (sources = inventorySources()) => loadContent(sources, itemEffectRegistry.validate);
describe('제품 아이템·상자 검증', () => {
  it('실제 식량·장비·상자 배치를 검증하고 깊게 고정한다', () => {
    const result = load(); expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('제품 콘텐츠 실패');
    expect(Object.isFrozen(result.content.byId['item.travel_ration'])).toBe(true);
    expect(result.content.byId['chest.camp_supply']).toMatchObject({ kind: 'chest', loot: [{ itemId: 'item.travel_ration', quantity: 3 }, { itemId: 'item.trail_boots', quantity: 1 }] });
  });
  it.each([0, -1, 1.5, '120', null])('음식 효과의 잘못된 회복량 %s를 로딩 전에 거부한다', amount => {
    const sources = inventorySources();
    const effects = sources['items.json'][0]!.effects!;
    (effects[0]!.params as { amount: unknown }).amount = amount;
    const result = load(sources); expect(result.ok).toBe(false);
    if (result.ok) throw new Error('잘못된 효과 통과');
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'invalid_effect_params' }));
  });
  it('제품에 등록되지 않은 효과를 거부한다', () => {
    const sources = inventorySources(); sources['items.json'][0]!.effects![0]!.type = 'unknown/effect';
    const result = load(sources); expect(result.ok).toBe(false);
    if (result.ok) throw new Error('미등록 효과 통과');
    expect(result.errors[0]?.code).toBe('unknown_effect');
  });
  it.each(['missing_item', 'wrong_kind', 'duplicate_chest', 'missing_chest', 'wall', 'zero_quantity'] as const)('상자 참조·배치 오류 %s를 거부한다', kind => {
    const sources = inventorySources();
    const map = sources['maps/s1-test.json'][0]!;
    const cell = map.floors[0]!.cells.find(c => c.x === 3 && c.y === 1)!;
    if (kind === 'missing_item') sources['chests.json'][0]!.loot[0]!.itemId = 'item.missing';
    if (kind === 'wrong_kind') sources['chests.json'][0]!.loot[0]!.itemId = 'tile.floor';
    if (kind === 'duplicate_chest') cell.chestId = 'chest.ruins_supply';
    if (kind === 'missing_chest') cell.chestId = 'chest.missing';
    if (kind === 'wall') cell.tileId = 'tile.wall';
    if (kind === 'zero_quantity') sources['chests.json'][0]!.loot[0]!.quantity = 0;
    expect(load(sources).ok).toBe(false);
  });
  it('구체적인 스키마 없이 item·chest ID 외피로 우회할 수 없다', () => {
    for (const id of ['item.bypass','chest.bypass']) expect(loadContent(testSources([{ id }]), itemEffectRegistry.validate).ok).toBe(false);
  });
});
