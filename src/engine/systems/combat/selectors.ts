import type { EncounterDefinition, MonsterDefinition } from '../../../content/schemas.ts';
import type { ContentDb, DeepReadonly } from '../../../content/types.ts';
import type { GameState, MapPosition } from '../../core/state.ts';
import type { CombatEnemyState } from '../../core/combat-log.ts';
import { findMap, findCell } from '../map/selectors.ts';
export function findEncounter(content: ContentDb, id: string): DeepReadonly<EncounterDefinition> | undefined {
  const entry=content.byId[id]; return entry && 'kind' in entry && entry.kind==='encounter' ? entry : undefined;
}
export function requireMonster(content: ContentDb, id: string): DeepReadonly<MonsterDefinition> {
  const entry=content.byId[id]; if(!entry || !('kind' in entry) || entry.kind!=='monster') throw new Error(`적 정의가 없다: ${id}`);return entry;
}
export function monsterBehavior(monster:DeepReadonly<MonsterDefinition>,turn:number) {
  return turn>0 && monster.behavior ? monster.behavior[(turn-1)%monster.behavior.length] : undefined;
}
export function livingFront(enemies: readonly CombatEnemyState[]) {
  const alive=enemies.filter(enemy=>enemy.health>0);
  return alive.some(enemy=>enemy.row==='front') ? alive.filter(enemy=>enemy.row==='front') : alive;
}
export function encounterAt(state: GameState, position: MapPosition, content: ContentDb) {
  const map=findMap(content,position.mapId);const id=map && findCell(map,position)?.encounterId;
  return id && !state.expedition?.defeatedEnemies?.[id] ? findEncounter(content,id) : undefined;
}
// 지도 접촉은 미처리 조우로 전환하고, 실제 전투는 사용자의 시작 선택에서 만든다.
export function triggerEncounter(state: GameState, from: MapPosition, content: ContentDb): GameState {
  const to=state.character!.position!;const encounter=encounterAt(state,to,content);
  if(!encounter) return state;
  return {...state, character:{...state.character!,activity:'waiting'},expedition:{...state.expedition,
    pendingAmbush:{triggeredAt:state.meta.gameTime,activityAtTrigger:'waiting',encounterId:encounter.id,retreat:from},
  }};
}
