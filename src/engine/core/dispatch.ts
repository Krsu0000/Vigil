import type { Action, ActionHandler, ActionHandlers, DispatchResult } from './actions.ts';
import type { EngineContext } from './context.ts';
import type { GameEvent } from './events.ts';
import { createRng } from './rng.ts';
import type { GameState } from './state.ts';

export type Dispatcher<A extends Action = Action, E extends GameEvent = GameEvent> = (
  state: GameState,
  action: A,
  ctx: EngineContext,
) => DispatchResult<E>;

// 연결부가 시작 시 목록을 전달한다. 원본 목록이나 처리기를 나중에 바꿔도 영향이 없다.
export function createDispatcher<A extends Action, E extends GameEvent = GameEvent>(
  handlers: ActionHandlers<A, E>,
): Dispatcher<A, E> {
  const entries: [string, ActionHandler<A, E>][] = [];
  for (const type of Object.keys(handlers)) {
    const handler = handlers[type as A['type']];
    if (handler !== undefined) {
      // 목록의 키와 action.type이 일치할 때만 호출한다. 타입의 대응은 ActionHandlers가 보장한다.
      entries.push([type, Object.freeze({ ...handler }) as ActionHandler<A, E>]);
    }
  }
  const fixedHandlers = Object.freeze(Object.fromEntries(entries));

  return (state, action, ctx) => {
    const handler = Object.hasOwn(fixedHandlers, action.type) ? fixedHandlers[action.type] : undefined;
    if (handler === undefined) {
      return { ok: false, state, reason: 'unknown_action' };
    }
    const reason = handler.validate(state, action, ctx);
    if (reason !== null) {
      return { ok: false, state, reason };
    }
    const rng = createRng(state.meta.rngState);
    const result = handler.execute(state, action, ctx, rng);
    return {
      ok: true,
      state: { ...result.state, meta: { ...result.state.meta, rngState: rng.getState() } },
      events: result.events,
    };
  };
}

// 아직 게임 시스템은 없다. S1부터 연결부가 처리기를 전달해 전용 dispatch를 만든다.
export const dispatch: Dispatcher = createDispatcher<Action>({});
