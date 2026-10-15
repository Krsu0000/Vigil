import type { ActionHandlers } from '../../core/actions.ts';

export type AmbushResult = 'defeated' | 'escaped';
export type AmbushAction = Readonly<{ type: 'ambush/resolve'; result: AmbushResult }>;
export type AmbushEvent =
  | Readonly<{ type: 'ambush/triggered'; triggeredAt: number; activityAtTrigger: 'waiting' | 'resting' }>
  | Readonly<{ type: 'ambush/resolved'; result: AmbushResult }>;

// 몬스터 없는 독립 S2 테스트 콘텐츠의 옛 계약이다. 제품에서는 아래에서 거부하고 combat/start를 사용한다.
export const ambushHandlers: ActionHandlers<AmbushAction, AmbushEvent> = {
  'ambush/resolve': {
    validate: (state, action, ctx) => {
      if (ctx.content.byId[ctx.content.timeRules.combat.ambushEncounterId]) return 'invalid_action';
      if (action.result !== 'defeated' && action.result !== 'escaped') return 'invalid_action';
      return state.expedition?.pendingAmbush ? null : 'condition_not_met';
    },
    execute: (state, action) => ({
      state: { ...state, expedition: { ...state.expedition!, pendingAmbush: null } },
      events: [{ type: 'ambush/resolved', result: action.result }],
    }),
  },
};
