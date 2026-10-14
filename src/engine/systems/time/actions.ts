import type { ActionHandlers } from '../../core/actions.ts';
import { currentLocation } from '../map/selectors.ts';
import { advanceTime } from './advance.ts';
import type { TimeEvent } from './advance.ts';

export type TimeAction = Readonly<{ type: 'time/tick' }>;
export const timeHandlers: ActionHandlers<TimeAction, TimeEvent> = {
  'time/tick': {
    validate: (state, _action, ctx) => currentLocation(state, ctx.content) ? null : 'condition_not_met',
    execute: (state, _action, ctx, rng) => advanceTime(state, 1, ctx, rng),
  },
};
