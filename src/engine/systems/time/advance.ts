import type { EngineContext } from '../../core/context.ts';
import type { ExecutionResult } from '../../core/actions.ts';
import type { Rng } from '../../core/rng.ts';
import type { GameState } from '../../core/state.ts';
import { currentLocation, findCell, requireZone } from '../map/selectors.ts';
import { recoverStamina } from '../stamina/stamina.ts';

export type TimeEvent = Readonly<{ type: 'time/advanced'; from: number; to: number; ticks: number; recovered: number }>;

// 게임 시간을 진행하는 단일 경로다. 이후 런타임·오프라인 정산도 같은 함수를 쓴다.
export function advanceTime(state: GameState, ticks: number, ctx: EngineContext, _rng: Rng): ExecutionResult<TimeEvent> {
  if (!Number.isSafeInteger(state.meta.gameTime) || state.meta.gameTime < 0 ||
    !Number.isSafeInteger(ticks) || ticks < 0 || ticks > Number.MAX_SAFE_INTEGER - state.meta.gameTime) {
    throw new Error('시간은 0 이상의 안전한 정수이며 게임 시간 상한을 넘을 수 없다');
  }
  if (ticks === 0) return { state, events: [] };
  const location = currentLocation(state, ctx.content);
  if (!location) throw new Error('시간 진행에는 배치된 캐릭터가 필요하다');
  const cell = findCell(location.map, location.position)!;
  const safe = requireZone(ctx.content, cell.zoneId).safety === 'safe';
  const rules = ctx.content.timeRules.stamina;
  const character = state.character!;
  const recoveryTicks = ticks - (character.movedSinceLastTick ? 1 : 0);
  const stamina = recoverStamina(character.stamina, recoveryTicks, safe ? rules.safeRegenPerTick : rules.waitRegenPerTick);
  const gameTime = state.meta.gameTime + ticks;
  return {
    state: { ...state, meta: { ...state.meta, gameTime },
      character: { ...character, stamina, movedSinceLastTick: false },
    },
    events: [{ type: 'time/advanced', from: state.meta.gameTime, to: gameTime, ticks,
      recovered: stamina.current - character.stamina.current,
    }],
  };
}
