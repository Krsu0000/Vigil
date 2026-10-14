import type { EngineContext } from './context.ts';
import type { GameEvent } from './events.ts';
import type { Rng } from './rng.ts';
import type { GameState } from './state.ts';

// 구체적인 행동은 시스템별 유니온으로 정의하고 createDispatcher의 타입 인수로 전달한다.
export type Action = Readonly<{ type: `${string}/${string}` }>;

export type RejectReason =
  | 'unknown_action'
  | 'invalid_action'
  | 'condition_not_met'
  | 'insufficient_resources';

export type ExecutionResult<E extends GameEvent = GameEvent> = {
  state: GameState;
  events: E[];
};

export type DispatchResult<E extends GameEvent = GameEvent> =
  | ({ ok: true } & ExecutionResult<E>)
  | { ok: false; state: GameState; reason: RejectReason };

export type ActionHandler<A extends Action, E extends GameEvent = GameEvent> = Readonly<{
  validate: (state: GameState, action: A, ctx: EngineContext) => RejectReason | null;
  execute: (state: GameState, action: A, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;

export type ActionHandlers<A extends Action, E extends GameEvent = GameEvent> = {
  readonly [Type in A['type']]?: ActionHandler<Extract<A, { type: Type }>, E>;
};
