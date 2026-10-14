import type { ActionHandlers } from '../../core/actions.ts';
import { currentLocation } from '../map/selectors.ts';
import { advanceTime } from './advance.ts';
import type { TimeEvent } from './advance.ts';

export type TimeAction = Readonly<{ type: 'time/tick'; ticks?: number }> | Readonly<{ type: 'time/heartbeat' }>;
export const timeHandlers: ActionHandlers<TimeAction, TimeEvent> = {
  'time/tick': {
    validate: (state, action, ctx) => {
      const ticks = action.ticks ?? 1;
      if (!Number.isSafeInteger(ticks) || ticks < 1) return 'invalid_action';
      return currentLocation(state, ctx.content) ? null : 'condition_not_met';
    },
    execute: (state, action, ctx, rng) => advanceTime(state, action.ticks ?? 1, ctx, rng),
  },
  'time/heartbeat': {
    validate: (_state, _action, ctx) => Number.isSafeInteger(ctx.now) && ctx.now >= 0 ? null : 'invalid_action',
    execute: (state, _action, ctx) => ({
      state: { ...state, meta: { ...state.meta, lastActiveAt: Math.max(state.meta.lastActiveAt, ctx.now) } },
      events: [],
    }),
  },
};
