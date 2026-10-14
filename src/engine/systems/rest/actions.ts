import type { ActionHandlers } from '../../core/actions.ts';
import type { GameState } from '../../core/state.ts';
import type { ContentDb } from '../../../content/types.ts';
import { currentLocation, findCell, requireZone } from '../map/selectors.ts';

export type RestAction = Readonly<{ type: 'rest/start' }> | Readonly<{ type: 'rest/stop' }>;
export type RestEvent = Readonly<{ type: 'rest/started' }> | Readonly<{ type: 'rest/stopped' }>;

export function isDanger(state: GameState, content: ContentDb): boolean {
  const location = currentLocation(state, content);
  return !!location && requireZone(content, findCell(location.map, location.position)!.zoneId).safety === 'danger';
}

// 실제 콘텐츠와의 대조는 구조 검증 뒤 Store 생성·복원에서 수행한다.
export function validateActivityState(state: GameState, content: ContentDb): void {
  if ((state.character?.activity === 'resting' || state.expedition?.pendingAmbush) && !isDanger(state, content)) {
    throw new Error('휴식과 미처리 습격은 배치된 위험 구역에서만 유효하다');
  }
}

export const restHandlers: ActionHandlers<RestAction, RestEvent> = {
  'rest/start': {
    validate: (state, _action, ctx) => {
      const character = state.character;
      return !state.expedition?.pendingAmbush && character?.activity === 'waiting' &&
        character.stamina.current < character.stamina.max && isDanger(state, ctx.content) ? null : 'condition_not_met';
    },
    execute: (state) => ({ state: { ...state, character: { ...state.character!, activity: 'resting' } }, events: [{ type: 'rest/started' }] }),
  },
  'rest/stop': {
    validate: (state) => state.character?.activity === 'resting' ? null : 'condition_not_met',
    execute: (state) => ({ state: { ...state, character: { ...state.character!, activity: 'waiting' } }, events: [{ type: 'rest/stopped' }] }),
  },
};
