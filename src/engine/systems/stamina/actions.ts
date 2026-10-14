import type { ActionHandlers } from '../../core/actions.ts';
import { currentLocation, findCell, requireZone } from '../map/selectors.ts';
import { recoverStamina } from './stamina.ts';

export type StaminaAction = Readonly<{ type: 'stamina/recover'; periods: number }>;
export type StaminaEvent = Readonly<{ type: 'stamina/recovered'; periods: number; recovered: number }>;

// 대기 시간의 측정·정지는 runtime의 책임이다. 엔진은 주입된 회복 횟수만 계산한다.
export const staminaHandlers: ActionHandlers<StaminaAction, StaminaEvent> = {
  'stamina/recover': {
    validate(state, action, ctx) {
      if (!Number.isSafeInteger(action.periods) || action.periods < 1) return 'invalid_action';
      return !state.expedition?.pendingAmbush && currentLocation(state, ctx.content) ? null : 'condition_not_met';
    },
    execute(state, action, ctx) {
      const location = currentLocation(state, ctx.content)!;
      const safe = requireZone(ctx.content, findCell(location.map, location.position)!.zoneId).safety === 'safe';
      const rules = ctx.content.timeRules.stamina;
      const character = state.character!;
      const stamina = recoverStamina(character.stamina, action.periods, safe ? rules.safeRegenPerTick : character.activity === 'resting' ? rules.restRegenPerTick : rules.waitRegenPerTick);
      return {
        state: { ...state, character: { ...character, stamina, activity: stamina.current === stamina.max ? 'waiting' : character.activity } },
        events: [{ type: 'stamina/recovered', periods: action.periods, recovered: stamina.current - character.stamina.current }],
      };
    },
  },
};
