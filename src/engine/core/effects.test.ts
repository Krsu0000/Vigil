import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createEffectRegistry, defineEffect, effectRegistry } from './effects.ts';
import type { EffectHandler } from './effects.ts';
import { createRng } from './rng.ts';
import type { GameState } from './state.ts';
import { ctx, deepFreeze, initialState, testEngine } from './test-fixtures.ts';
import type { TestEvent } from './test-fixtures.ts';

describe('효과 레지스트리', () => {
  it('제품의 빈 목록은 테스트용 효과를 포함하지 않는다', () => {
    expect(effectRegistry.validate({ type: 'test/emit', params: { label: '확인', roll: false } }))
      .toMatchObject({ ok: false, reason: 'unknown_effect' });
  });

  it('등록된 효과의 올바른 매개변수를 검증한다', () => {
    expect(testEngine().effects.validate({ type: 'test/emit', params: { label: '확인', roll: true } }))
      .toEqual({ ok: true });
  });

  it('미등록 효과는 검증 오류를 반환한다', () => {
    expect(testEngine().effects.validate({ type: 'test/missing', params: {} }))
      .toMatchObject({ ok: false, reason: 'unknown_effect', type: 'test/missing' });
  });

  it('프로토타입의 이름도 등록된 효과로 취급하지 않는다', () => {
    for (const type of ['toString', 'constructor', '__proto__']) {
      expect(testEngine().effects.validate({ type, params: {} }))
        .toMatchObject({ ok: false, reason: 'unknown_effect' });
    }
  });

  it('누락·잘못된 타입·잘못된 값·추가 필드는 매개변수 검증에서 실패한다', () => {
    const effects = testEngine().effects;
    for (const params of [null, undefined, [], {}, { label: '확인' }, { label: '', roll: true },
      { label: 123, roll: true }, { label: '확인', roll: 'true' }, { label: '확인', roll: false, extra: 1 }]) {
      const result = effects.validate({ type: 'test/emit', params });
      expect(result).toMatchObject({ ok: false, reason: 'invalid_effect_params', type: 'test/emit' });
      if (result.ok) throw new Error('잘못된 매개변수가 통과함');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('잘못된 매개변수는 적용 함수를 호출하거나 난수를 소비하기 전에 실패한다', () => {
    const apply = vi.fn(() => { throw new Error('실행되면 안 됨'); });
    const effects = createEffectRegistry({
      'test/checked': defineEffect({ params: z.strictObject({ amount: z.number().int() }), apply }),
    });
    const state = deepFreeze(initialState());
    const before = JSON.stringify(state);
    const rng = createRng(state.meta.rngState);
    const beforeRng = rng.getState();
    expect(() => effects.apply(state, { type: 'test/checked', params: { amount: '1' } }, ctx, rng))
      .toThrow('invalid_effect_params');
    expect(apply).not.toHaveBeenCalled();
    expect(rng.getState()).toEqual(beforeRng);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('미등록 효과를 직접 적용해도 실행 전에 실패한다', () => {
    const state = deepFreeze(initialState());
    const rng = createRng(state.meta.rngState);
    expect(() => testEngine().effects.apply(state, { type: 'test/missing', params: {} }, ctx, rng))
      .toThrow('unknown_effect');
    expect(rng.getState()).toEqual(state.meta.rngState);
  });

  it('효과 적용은 원본·매개변수·문맥을 수정하지 않고 사건을 반환한다', () => {
    const state = deepFreeze(initialState());
    const effect = deepFreeze({ type: 'test/emit', params: { label: '확인', roll: false } });
    const context = deepFreeze({ ...ctx, content: { ...ctx.content } });
    const result = testEngine().effects.apply(state, effect, context, createRng(state.meta.rngState));
    expect(result.state).toBe(state);
    expect(result.events).toEqual([{
      type: 'test/emitted', label: '확인', roll: null,
      now: ctx.now, contentVersion: ctx.content.contentVersion,
    }]);
  });

  it('Zod가 파싱한 값으로 적용하고 원시 매개변수를 그대로 넘기지 않는다', () => {
    const params = z.strictObject({ label: z.string().trim(), amount: z.number().int().default(5) });
    const apply = vi.fn((_state: GameState, value: z.infer<typeof params>) => {
      expect(value).toEqual({ label: '확인', amount: 5 });
      return { state: _state, events: [] };
    });
    const effects = createEffectRegistry({ 'test/defaults': defineEffect({ params, apply }) });
    const state = initialState();
    const raw = deepFreeze({ label: '  확인  ' });
    effects.apply(state, { type: 'test/defaults', params: raw }, ctx, createRng(state.meta.rngState));
    expect(apply).toHaveBeenCalledOnce();
    expect(raw).toEqual({ label: '  확인  ' });
  });

  it('타입이 다른 여러 효과를 각자의 스키마로 처리한다', () => {
    const numberParams = z.number().int();
    const textParams = z.string();
    const effects = createEffectRegistry<TestEvent>({
      'test/number': defineEffect<z.infer<typeof numberParams>, TestEvent>({
        params: numberParams,
        apply: (state, amount, context) => ({ state, events: [{ type: 'test/emitted', label: String(amount), roll: null, now: context.now, contentVersion: context.content.contentVersion }] }),
      }),
      'test/text': defineEffect<z.infer<typeof textParams>, TestEvent>({
        params: textParams,
        apply: (state, label, context) => ({
          state, events: [{ type: 'test/emitted', label, roll: null, now: context.now, contentVersion: context.content.contentVersion }],
        }),
      }),
    });
    expect(effects.validate({ type: 'test/number', params: 2 })).toEqual({ ok: true });
    expect(effects.validate({ type: 'test/number', params: '2' }).ok).toBe(false);
    expect(effects.validate({ type: 'test/text', params: '문자열' })).toEqual({ ok: true });
    const state = initialState();
    expect(effects.apply(state, { type: 'test/number', params: 2 }, ctx, createRng(state.meta.rngState)).events[0]).toMatchObject({ label: '2' });
    expect(effects.apply(state, { type: 'test/text', params: '문자열' }, ctx, createRng(state.meta.rngState)).events[0])
      .toMatchObject({ label: '문자열' });
  });

  it('정의 후 원본 스키마·적용 함수를 바꿔도 기존 정의는 유지된다', () => {
    const params = z.number();
    const handler: { params: EffectHandler<number>['params']; apply: EffectHandler<number>['apply'] } = {
      params, apply: (state) => ({ state, events: [] }),
    };
    const defined = defineEffect(handler);
    handler.params = z.number().min(10);
    handler.apply = () => { throw new Error('교체된 처리기'); };
    expect(defined.validate(1)).toEqual({ ok: true });
    const state = initialState();
    expect(defined.apply(state, 1, ctx, createRng(state.meta.rngState)).state).toBe(state);
  });

  it('시작 후 목록·정의가 변경돼도 고정된 레지스트리는 유지된다', () => {
    const definition = { ...defineEffect({ params: z.number(), apply: (state) => ({ state, events: [] }) }) };
    const handlers = { 'test/original': definition };
    const effects = createEffectRegistry(handlers);
    definition.apply = () => { throw new Error('교체된 정의'); };
    definition.validate = () => ({ ok: false, message: '교체된 검증' });
    delete (handlers as Partial<typeof handlers>)['test/original'];
    expect(effects.validate({ type: 'test/original', params: 1 })).toEqual({ ok: true });
    const state = initialState();
    expect(effects.apply(state, { type: 'test/original', params: 1 }, ctx, createRng(state.meta.rngState)).state).toBe(state);
  });

  it('효과 적용 중 코드 예외를 검증 오류로 숨기지 않는다', () => {
    const effects = createEffectRegistry({
      'test/crash': defineEffect({ params: z.null(), apply: () => { throw new Error('효과 결함'); } }),
    });
    const state = initialState();
    expect(() => effects.apply(state, { type: 'test/crash', params: null }, ctx, createRng(state.meta.rngState)))
      .toThrow('효과 결함');
  });
});
