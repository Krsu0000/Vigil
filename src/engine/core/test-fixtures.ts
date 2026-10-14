// S0 검증용 데이터. 제품의 처리기와 효과 목록에는 연결하지 않는다.
import { z } from 'zod';
import type { ActionHandlers } from './actions.ts';
import { createCampaign } from './campaign.ts';
import type { EngineContext } from './context.ts';
import { createDispatcher } from './dispatch.ts';
import { createEffectRegistry, defineEffect } from './effects.ts';
import type { EffectInstance } from './effects.ts';
import type { GameState } from './state.ts';

export const seed = [1, 2, 3, 4] as const;
export const content = Object.freeze({ contentVersion: 'test.s0' });
export const ctx: EngineContext = Object.freeze({ content, now: 1_700_000_000_000 });

export function initialState(): GameState {
  return createCampaign(content, seed, ctx.now);
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export type TestEvent =
  | { type: 'test/emitted'; label: string; roll: number | null; now: number; contentVersion: string }
  | { type: 'test/plain' };

export type TestAction =
  | { type: 'test/emit'; effect: EffectInstance }
  | { type: 'test/check'; allowed: boolean }
  | { type: 'test/missing' };

const emitParams = z.strictObject({ label: z.string().min(1), roll: z.boolean() });

export function testEngine() {
  const effects = createEffectRegistry<TestEvent>({
    'test/emit': defineEffect<z.infer<typeof emitParams>, TestEvent>({
      params: emitParams,
      apply: (state, params, context, rng) => ({
        state,
        events: [{
          type: 'test/emitted',
          label: params.label,
          roll: params.roll ? rng.nextInt(0, 100) : null,
          now: context.now,
          contentVersion: context.content.contentVersion,
        }],
      }),
    }),
  });
  const handlers: ActionHandlers<TestAction, TestEvent> = {
    'test/emit': {
      validate: (_state, action) => effects.validate(action.effect).ok ? null : 'invalid_action',
      execute: (state, action, context, rng) => effects.apply(state, action.effect, context, rng),
    },
    'test/check': {
      validate: (_state, action) => action.allowed ? null : 'condition_not_met',
      execute: (state) => ({ state, events: [{ type: 'test/plain' }] }),
    },
  };
  return { effects, handlers, dispatch: createDispatcher<TestAction, TestEvent>(handlers) };
}

export const rollAction: TestAction = {
  type: 'test/emit',
  effect: { type: 'test/emit', params: { label: '연결 확인', roll: true } },
};
