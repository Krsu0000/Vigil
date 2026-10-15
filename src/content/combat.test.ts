import { describe, expect, it } from 'vitest';
import { loadContent } from './load.ts';
import { inventorySources } from './test-fixtures.ts';
import { itemEffectRegistry } from '../engine/systems/inventory/effects.ts';

describe('전투 콘텐츠 경계', () => {
  it('제품 몬스터·조우·전리품·배치를 고정한다', () => {
    const loaded = loadContent(inventorySources(), itemEffectRegistry.validate);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.content.contentVersion).toBe('0.4.0');
      expect(loaded.content.definitions.filter(d => d.kind === 'monster')).toHaveLength(3);
      expect(loaded.content.definitions.filter(d => d.kind === 'encounter')).toHaveLength(3);
      expect(Object.isFrozen(loaded.content.byId['encounter.wolf_pack'])).toBe(true);
    }
  });
  it.each(['monster', 'loot', 'encounter', 'duplicate', 'wall', 'safe', 'ambush', 'front', 'damage', 'chance'] as const)('%s 오류를 제품 로더에서 거부한다', kind => {
    const sources = inventorySources(); const cells = sources['maps/s1-test.json'][0]!.floors[0]!.cells;
    const enemyCell = cells.find(c => 'encounterId' in c)!;
    if (kind === 'monster') sources['encounters.json'][0]!.enemies[0]!.monsterId = 'monster.missing';
    if (kind === 'loot') sources['monsters.json'][0]!.loot[0]!.itemId = 'item.missing';
    if (kind === 'encounter') Object.assign(enemyCell, { encounterId: 'encounter.missing' });
    if (kind === 'duplicate') Object.assign(cells.find(c => c.x === 4 && c.y === 3)!, { encounterId: 'encounter.wolf_pack' });
    if (kind === 'wall') enemyCell.tileId = 'tile.wall';
    if (kind === 'safe') enemyCell.zoneId = 'zone.camp';
    if (kind === 'ambush') sources['time-rules.json'].combat.ambushEncounterId = 'encounter.missing';
    if (kind === 'front') sources['encounters.json'][0]!.enemies.forEach(e => e.row = 'back');
    if (kind === 'damage') sources['monsters.json'][0]!.damageMin = 999;
    if (kind === 'chance') sources['time-rules.json'].combat.escapeChance = 1.1;
    expect(loadContent(sources, itemEffectRegistry.validate).ok).toBe(false);
  });
});
