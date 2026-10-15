import type { ContentDb } from '../../../content/types.ts';
import type { CombatState } from '../../core/combat-log.ts';
import type { GameState } from '../../core/state.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import { coordinateKey, findMap } from '../map/selectors.ts';
import { combatHandlers } from './actions.ts';
import type { CombatAction, CombatEvent } from './actions.ts';
export function replayCombat(record: CombatState, content: ContentDb): GameState {
  if(record.initial.contentVersion!==content.contentVersion)throw new Error('전투 기록의 콘텐츠 버전이 다르다');
  const initial=record.initial;const position=initial.character.position!;const map=findMap(content,position.mapId)!;
  let state:GameState={meta:{campaignId:'00000000-0000-4000-8000-000000000001',gameTime:initial.gameTime,rngState:initial.rngState,lastActiveAt:0,settledUntil:0},
    campaign:{openedChests:{},exploration:{[position.mapId]:{mapVersion:map.version,visited:{[coordinateKey(position)]:true,[coordinateKey(record.retreat)]:true}}}},
    character:initial.character,expedition:{pendingAmbush:null,combat:{...record,enemies:initial.enemies,status:'active',turn:1,actions:[],history:[],loot:[]}}};
  const dispatch=createDispatcher<CombatAction,CombatEvent>(combatHandlers);
  for(const action of record.actions){const result=dispatch(state,action,{content,now:0});if(!result.ok)throw new Error('재생할 수 없는 전투 행동');state=result.state;}
  return state;
}
