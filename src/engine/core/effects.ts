import type { z } from 'zod';
import type { ExecutionResult } from './actions.ts';
import type { EngineContext } from './context.ts';
import type { GameEvent } from './events.ts';
import type { Rng } from './rng.ts';
import type { GameState } from './state.ts';

export type EffectInstance = Readonly<{ type: string; params: unknown }>;
export type EffectHandler<P, E extends GameEvent = GameEvent> = Readonly<{
  params: z.ZodType<P>;
  apply: (state: GameState, params: P, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;

type ParamsResult = { ok: true } | { ok: false; message: string };

// 서로 다른 매개변수 타입을 한 목록에 담기 위해 검증과 실행을 묶은 함수로 감싼다.
// 원시 데이터를 P로 강제 변환하지 않고, 같은 스키마로 검증하고 파싱한다.
export type EffectDefinition<E extends GameEvent = GameEvent> = Readonly<{
  validate: (params: unknown) => ParamsResult;
  apply: (state: GameState, params: unknown, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;

export function defineEffect<P, E extends GameEvent = GameEvent>(
  handler: EffectHandler<P, E>,
): EffectDefinition<E> {
  const { params: schema, apply } = handler;
  return Object.freeze({
    validate(params: unknown): ParamsResult {
      const result = schema.safeParse(params);
      return result.success ? { ok: true } : { ok: false, message: result.error.message };
    },
    apply(state: GameState, params: unknown, ctx: EngineContext, rng: Rng): ExecutionResult<E> {
      return apply(state, schema.parse(params), ctx, rng);
    },
  });
}

export type EffectValidationResult =
  | { ok: true }
  | { ok: false; reason: 'unknown_effect' | 'invalid_effect_params'; type: string; message: string };

export type EffectRegistry<E extends GameEvent = GameEvent> = Readonly<{
  validate: (effect: EffectInstance) => EffectValidationResult;
  apply: (state: GameState, effect: EffectInstance, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;

export function createEffectRegistry<E extends GameEvent = GameEvent>(
  handlers: Readonly<Record<string, EffectDefinition<E>>>,
): EffectRegistry<E> {
  const entries: [string, EffectDefinition<E>][] = [];
  for (const type of Object.keys(handlers)) {
    const handler = handlers[type];
    if (handler !== undefined) entries.push([type, Object.freeze({ ...handler })]);
  }
  const fixedHandlers = Object.freeze(Object.fromEntries(entries));

  function validate(effect: EffectInstance): EffectValidationResult {
    const handler = Object.hasOwn(fixedHandlers, effect.type) ? fixedHandlers[effect.type] : undefined;
    if (handler === undefined) {
      return { ok: false, reason: 'unknown_effect', type: effect.type, message: '등록되지 않은 효과' };
    }
    const result = handler.validate(effect.params);
    return result.ok
      ? { ok: true }
      : { ok: false, reason: 'invalid_effect_params', type: effect.type, message: result.message };
  }

  return Object.freeze({
    validate,
    apply(state: GameState, effect: EffectInstance, ctx: EngineContext, rng: Rng): ExecutionResult<E> {
      const validation = validate(effect);
      if (!validation.ok) {
        throw new Error(`${validation.reason}: ${validation.type}: ${validation.message}`);
      }
      // validate에서 존재를 확인했다. 처리기 예외는 그대로 전달해 행동 거부와 구분한다.
      const handler = fixedHandlers[effect.type]!;
      return handler.apply(state, effect.params, ctx, rng);
    },
  });
}

// 테스트용 효과는 제품의 목록에 등록하지 않는다.
export const effectRegistry = createEffectRegistry({});
