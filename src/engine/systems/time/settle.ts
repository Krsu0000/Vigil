import type { ActionHandlers, ExecutionResult } from '../../core/actions.ts';
import type { EngineContext } from '../../core/context.ts';
import type { GameState } from '../../core/state.ts';
import type { Rng } from '../../core/rng.ts';
import { currentLocation, findCell, requireZone } from '../map/selectors.ts';
import { staminaHandlers } from '../stamina/actions.ts';
import type { StaminaEvent } from '../stamina/actions.ts';
import { advanceTime } from './advance.ts';
import type { TimeEvent } from './advance.ts';
import type { AmbushEvent } from '../ambush/actions.ts';

// from은 호출부가 보장하는 마지막 상태 스냅샷/실행 시각이다. settledUntil만 쓰면 실시간을 재지급한다.
export type SettleAction = Readonly<{ type: 'time/settle'; from: number; to: number }>;
export type SettleEvent = Readonly<{
  type: 'time/settled'; from: number; to: number; elapsedMs: number; ticks: number; periods: number;
}>;
type Events = SettleEvent | TimeEvent | StaminaEvent | AmbushEvent;

function interval(state: GameState, action: SettleAction, ctx: EngineContext) {
  const from = Math.max(action.from, state.meta.settledUntil, state.meta.lastActiveAt);
  const elapsedMs = Math.min(Math.max(0, action.to - from), ctx.content.timeRules.maxOfflineMs);
  const location = currentLocation(state, ctx.content);
  const safe = !!location && !state.expedition?.pendingAmbush && !state.expedition?.combat &&
    requireZone(ctx.content, findCell(location.map, location.position)!.zoneId).safety === 'safe';
  return { from, elapsedMs, ticks: safe ? Math.floor(elapsedMs / ctx.content.timeRules.tickMs) : 0,
    periods: safe ? Math.floor(elapsedMs / ctx.content.timeRules.stamina.recoveryIntervalMs) : 0 };
}

export function settleTime(state: GameState, action: SettleAction, ctx: EngineContext, rng: Rng): ExecutionResult<Events> {
  const { from, elapsedMs, ticks, periods } = interval(state, action, ctx);
  if (action.to <= from) return { state, events: [] };
  // 현재 안전 구역에는 중간 시각에 끝나는 효과가 없다. 전역 틱·회복은 각각 기존 계산을 재사용한다.
  const advanced = advanceTime(state, ticks, ctx, rng);
  const recovered = periods > 0 ? staminaHandlers['stamina/recover']!.execute(advanced.state,
    { type: 'stamina/recover', periods }, ctx, rng) : { state: advanced.state, events: [] };
  return {
    state: { ...recovered.state, meta: { ...recovered.state.meta, settledUntil: action.to } },
    events: [...advanced.events, ...recovered.events, { type: 'time/settled', from, to: action.to, elapsedMs, ticks, periods }],
  };
}

export const settleHandlers: ActionHandlers<SettleAction, Events> = {
  'time/settle': {
    validate(state, action, ctx) {
      if (![action.from, action.to].every(value => Number.isSafeInteger(value) && value >= 0)) return 'invalid_action';
      return interval(state, action, ctx).ticks > Number.MAX_SAFE_INTEGER - state.meta.gameTime ? 'invalid_action' : null;
    },
    execute: settleTime,
  },
};
