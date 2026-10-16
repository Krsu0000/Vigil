import type { ContentDb } from '../../../content/types.ts';
import type { GameState, MapPosition } from '../../core/state.ts';
import { coordinateKey, findCell, findMap, requireTile } from '../map/selectors.ts';
import { findEncounter, requireMonster } from './selectors.ts';
import { replayCombat } from './replay.ts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function validateCombatState(state: GameState, content: ContentDb): void {
  const placements = content.definitions.flatMap(entry => entry.kind === 'map'
    ? entry.floors.flatMap(floor => floor.cells.filter(cell => cell.encounterId).map(cell => cell.encounterId!)) : []);
  for (const id of Object.keys(state.expedition?.defeatedEnemies ?? {})) {
    if (!placements.includes(id)) throw new Error('토벌한 지도 조우 정의가 없다');
  }
  const validateRetreat = (retreat: MapPosition, from: MapPosition, origin: 'map' | 'ambush') => {
    const map = findMap(content, retreat.mapId);
    const cell = map && findCell(map, retreat);
    const distance = Math.abs(retreat.x - from.x) + Math.abs(retreat.y - from.y);
    if (!cell || !requireTile(content, cell.tileId).walkable || retreat.mapId !== from.mapId || retreat.floor !== from.floor ||
      distance !== (origin === 'map' ? 1 : 0) || state.campaign.exploration[retreat.mapId]?.visited[coordinateKey(retreat)] !== true) {
      throw new Error('도주 목적지가 조우 직전의 탐사한 이동 칸이 아니다');
    }
  };
  const pending = state.expedition?.pendingAmbush;
  if (pending?.encounterId) {
    const position = state.character!.position!;
    const map = findMap(content, position.mapId)!;
    if (!findEncounter(content, pending.encounterId) || findCell(map, position)?.encounterId !== pending.encounterId ||
      state.expedition?.defeatedEnemies?.[pending.encounterId] || !pending.retreat) throw new Error('미처리 지도 조우가 현재 위치와 다르다');
    validateRetreat(pending.retreat, position, 'map');
  } else if (pending?.retreat) {
    throw new Error('습격에 지도 도주 좌표가 있다');
  }
  const combat = state.expedition?.combat;
  if (!combat) return;
  const encounter = findEncounter(content, combat.encounterId);
  if (!encounter) throw new Error('전투 조우 정의가 없다');
  const initial = combat.initial;
  if (!initial.character.position || initial.character.activity !== 'waiting' || initial.character.health.current === 0) throw new Error('전투 초기 캐릭터가 유효하지 않다');
  validateRetreat(combat.retreat, initial.character.position, combat.origin);
  const map = findMap(content, initial.character.position.mapId)!;
  if (combat.origin === 'map' ? findCell(map, initial.character.position)?.encounterId !== combat.encounterId
    : combat.encounterId !== content.timeRules.combat.ambushEncounterId) throw new Error('전투 발생 위치/종류가 다르다');
  if (combat.origin === 'map' && !!state.expedition?.defeatedEnemies?.[combat.encounterId] !== (combat.status === 'victory')) throw new Error('전투 결과와 지도 토벌 기록이 다르다');
  if (initial.enemies.length !== encounter.enemies.length || initial.enemies.some((enemy, i) =>
    enemy.plan!==undefined || enemy.id !== `${encounter.id}:${i}` || enemy.monsterId !== encounter.enemies[i]!.monsterId || enemy.row !== encounter.enemies[i]!.row ||
    enemy.health !== requireMonster(content, enemy.monsterId).health || enemy.maxHealth !== enemy.health)) throw new Error('전투 초기 배치가 다르다');
  const replayed = replayCombat(combat, content);
  for (const [actual, expected] of [[state.character, replayed.character], [combat, replayed.expedition!.combat],
    [state.meta.rngState, replayed.meta.rngState], [state.meta.gameTime, replayed.meta.gameTime]]) {
    if (canonical(actual) !== canonical(expected)) throw new Error('전투 기록과 저장 상태가 다르다');
  }
}
