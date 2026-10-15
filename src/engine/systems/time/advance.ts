import type { EngineContext } from '../../core/context.ts';
import type { ExecutionResult } from '../../core/actions.ts';
import type { Rng } from '../../core/rng.ts';
import type { GameState } from '../../core/state.ts';
import { currentLocation, findCell, requireZone } from '../map/selectors.ts';
import { rollAmbush } from '../ambush/roll.ts';
import type { AmbushEvent } from '../ambush/actions.ts';

export type TimeEvent = Readonly<{ type: 'time/advanced'; from: number; to: number; ticks: number; recovered: number }>;

// 게임 시간을 진행하는 단일 경로다. 위험 구역은 각 틱을 순서대로 판정한다.
export function advanceTime(state: GameState, ticks: number, ctx: EngineContext, rng: Rng): ExecutionResult<TimeEvent | AmbushEvent> {
  if (!Number.isSafeInteger(state.meta.gameTime) || state.meta.gameTime < 0 ||
    !Number.isSafeInteger(ticks) || ticks < 0 || ticks > Number.MAX_SAFE_INTEGER - state.meta.gameTime) {
    throw new Error('시간은 0 이상의 안전한 정수이며 게임 시간 상한을 넘을 수 없다');
  }
  if (ticks === 0) return { state, events: [] };
  const location = currentLocation(state, ctx.content);
  if (!location) throw new Error('시간 진행에는 배치된 캐릭터가 필요하다');
  if (state.expedition?.combat) throw new Error('전투 중 실시간은 진행하지 않는다');
  if (state.expedition?.pendingAmbush) throw new Error('미처리 습격 중에는 시간을 진행할 수 없다');
  const character = state.character!;
  const safety = requireZone(ctx.content, findCell(location.map, location.position)!.zoneId).safety;
  let elapsed = ticks;
  let pending: NonNullable<GameState['expedition']>['pendingAmbush'] = null;
  if (safety === 'danger') {
    for (let i = 0; i < ticks; i += 1) {
      const activity = character.activity === 'resting' ? 'resting' : i === 0 && character.movedSinceLastTick ? 'moving' : 'waiting';
      if (rollAmbush(safety, activity, ctx.content.timeRules.ambush, rng)) {
        elapsed = i + 1;
        pending = { triggeredAt: state.meta.gameTime + elapsed, activityAtTrigger: character.activity };
        break;
      }
    }
  }
  const gameTime = state.meta.gameTime + elapsed;
  const events: (TimeEvent | AmbushEvent)[] = [{ type: 'time/advanced', from: state.meta.gameTime, to: gameTime, ticks: elapsed, recovered: 0 }];
  if (pending) events.push({ type: 'ambush/triggered', ...pending });
  return {
    state: { ...state, meta: { ...state.meta, gameTime, rngState: rng.getState() },
      character: { ...character, movedSinceLastTick: false, activity: pending ? 'waiting' : character.activity },
      expedition: pending ? { ...state.expedition, pendingAmbush: pending } : state.expedition,
    },
    events,
  };
}

// 전투 종료 정산은 회복·추가 습격을 실행하지 않는다. 시간 쓰기 경로는 이 모듈에 모은다.
export function advanceCombatTime(state: GameState, ticks: number): GameState {
  if(!Number.isSafeInteger(ticks)||ticks<0||ticks>Number.MAX_SAFE_INTEGER-state.meta.gameTime)throw new Error('전투 시간 정산 범위가 유효하지 않다');
  return {...state,meta:{...state.meta,gameTime:state.meta.gameTime+ticks}};
}
