import type { ActionHandlers } from '../../core/actions.ts';

export type AmbushResult = 'defeated' | 'escaped';
export type AmbushAction = Readonly<{ type: 'ambush/resolve'; result: AmbushResult }>;
export type AmbushEvent =
  | Readonly<{ type: 'ambush/triggered'; triggeredAt: number; activityAtTrigger: 'waiting' | 'resting' }>
  | Readonly<{ type: 'ambush/resolved'; result: AmbushResult }>;

// S2의 임시 처리다. 실제 전투·귀환·보상은 S5에서 구현한다.
export const ambushHandlers: ActionHandlers<AmbushAction, AmbushEvent> = {
  'ambush/resolve': {
    validate: (state, action) => {
      if (action.result !== 'defeated' && action.result !== 'escaped') return 'invalid_action';
      return state.expedition?.pendingAmbush ? null : 'condition_not_met';
    },
    execute: (state, action) => ({
      state: { ...state, expedition: { ...state.expedition!, pendingAmbush: null } },
      events: [{ type: 'ambush/resolved', result: action.result }],
    }),
  },
};
