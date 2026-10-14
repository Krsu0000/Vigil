import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapSources } from '../../../content/test-fixtures.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import * as modifiers from '../../core/modifiers.ts';
import { mapContext, mapDispatch, startedState, walk } from '../map/test-fixtures.ts';
import { consumeStamina, getMoveCost, recoverStamina } from './stamina.ts';

const at = (x: number, y: number) => ({ mapId: 'map.s1_test', floor: 0, x, y });
const edge = (ctx = mapContext()) => walk(startedState(ctx), ['east', 'east', 'south', 'south'], ctx);
afterEach(() => vi.restoreAllMocks());

describe('이동 비용과 스태미나', () => {
  it('새 게임의 최대치·현재치는 실제 콘텐츠 값에서 읽는다', () => {
    const sources = mapSources();
    sources['time-rules.json'].stamina.max = 35;
    expect(startedState(mapContext(sources)).character).toMatchObject({
      stamina: { current: 35, max: 35 }, movedSinceLastTick: false,
    });
  });

  it('안전→위험 첫 이동은 6, 이미 밟은 길 복귀는 3, 안전 구역 이동은 0이다', () => {
    const ctx = deepFreeze(mapContext());
    const initial = deepFreeze(edge(ctx));
    expect(initial.character?.stamina.current).toBe(900);
    expect(getMoveCost(initial, at(4, 3), ctx.content)).toBe(6);
    const danger = walk(initial, ['east'], ctx);
    expect(danger.character?.stamina.current).toBe(894);
    expect(danger.meta).toEqual(initial.meta);
    expect(danger.character?.movedSinceLastTick).toBe(true);
    const further = walk(danger, ['east'], ctx);
    expect(further.character?.stamina.current).toBe(888);
    expect(getMoveCost(further, at(4, 3), ctx.content)).toBe(3);
    const returning = walk(further, ['west'], ctx);
    expect(returning.character?.stamina.current).toBe(885);
    const safe = walk(returning, ['west'], ctx);
    expect(safe.character?.stamina.current).toBe(885);
    expect(getMoveCost(safe, at(4, 3), ctx.content)).toBe(3);
    expect(walk(safe, ['east'], ctx).character?.stamina.current).toBe(882);
    expect(initial.character?.stamina.current).toBe(900);
  });

  it.each([0, 5, 6])('첫 위험 이동 직전 스태미나 %s의 경계값을 지킨다', (current) => {
    const ctx = mapContext(); const initial = edge(ctx);
    const state = deepFreeze({ ...initial, character: {
      ...initial.character!, stamina: { current, max: 900 }, movedSinceLastTick: false,
    } });
    const result = mapDispatch(state, { type: 'move/step', direction: 'east' }, ctx);
    if (current < 6) {
      expect(result).toEqual({ ok: false, state, reason: 'insufficient_resources' });
      expect(result.state).toBe(state);
      expect(result.state.campaign).toBe(state.campaign);
      expect(result.state.meta.rngState).toBe(state.meta.rngState);
      expect(result.state.character?.movedSinceLastTick).toBe(false);
    } else {
      expect(result.ok).toBe(true);
      expect(result.state.character?.stamina.current).toBe(0);
      expect(result.state.character?.position).toEqual(at(4, 3));
    }
  });

  it('스태미나 0에서도 안전 구역으로 돌아올 수 있고 벽 거부는 이동 표시를 바꾸지 않는다', () => {
    const ctx = mapContext();
    const initial = walk(edge(ctx), ['east'], ctx);
    const state = deepFreeze({ ...initial, character: {
      ...initial.character!, stamina: { current: 0, max: 900 }, movedSinceLastTick: false,
    } });
    const wall = mapDispatch(state, { type: 'move/step', direction: 'north' }, ctx);
    expect(wall).toEqual({ ok: false, state, reason: 'condition_not_met' });
    expect(wall.state).toBe(state);
    const safe = mapDispatch(state, { type: 'move/step', direction: 'west' }, ctx);
    expect(safe.ok).toBe(true);
    expect(safe.state.character?.stamina.current).toBe(0);
    expect(safe.state.character?.movedSinceLastTick).toBe(true);
  });

  it('콘텐츠 비용 변경과 비용 0인 경우에도 계산 경로를 유지한다', () => {
    const sources = mapSources();
    Object.assign(sources['time-rules.json'].stamina, { unexploredMoveCost: 10, exploredMoveCost: 4, safeMoveCost: 2 });
    const ctx = mapContext(sources);
    const state = edge(ctx);
    expect(getMoveCost(state, at(4, 3), ctx.content)).toBe(10);
    expect(getMoveCost(state, at(2, 3), ctx.content)).toBe(2);
    const further = walk(state, ['east', 'east'], ctx);
    expect(getMoveCost(further, at(4, 3), ctx.content)).toBe(4);
    sources['time-rules.json'].stamina.unexploredMoveCost = 0;
    const zeroCtx = mapContext(sources);
    const zero = walk(edge(zeroCtx), ['east', 'east'], zeroCtx);
    expect(getMoveCost(zero, at(6, 3), zeroCtx.content)).toBe(0);
    expect(getMoveCost(zero, at(4, 3), zeroCtx.content)).toBe(4);
  });

  it('실제 이동 비용은 공통 computeValue 결과를 사용한다', () => {
    const ctx = mapContext(); const state = edge(ctx);
    const compute = vi.spyOn(modifiers, 'computeValue').mockReturnValueOnce(17);
    expect(getMoveCost(state, at(4, 3), ctx.content)).toBe(17);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('보기만 한 바닥과 확인한 벽은 탐사 경로 감면에 포함하지 않는다', () => {
    const ctx = mapContext(); const state = walk(edge(ctx), ['east'], ctx);
    expect(state.campaign.exploration['map.s1_test']!.visited['0:5:3']).toBeUndefined();
    expect(getMoveCost(state, at(5, 3), ctx.content)).toBe(6);
  });

  it('스태미나 입력 손상을 소모 과정에서 조용히 보정하지 않는다', () => {
    for (const current of [-1, 901, 1.5, NaN, Infinity]) {
      expect(() => consumeStamina({ current, max: 900 }, 0)).toThrow();
    }
    expect(() => consumeStamina({ current: 5, max: 900 }, 6)).toThrow();
    expect(() => consumeStamina({ current: 5, max: 900 }, -1)).toThrow();
    expect(() => getMoveCost(startedState(), at(99, 1), mapContext().content)).toThrow();
  });
});

describe('회복 정수와 상한', () => {
  it.each([[0, 1, 1, 1], [899, 1, 5, 900], [900, 100, 1, 900], [5, 0, 1, 5], [5, 1, 0, 5]])(
    '현재 %s·%s틱·틱당 %s → %s', (current, ticks, regen, expected) => {
      const stamina = deepFreeze({ current, max: 900 });
      const result = recoverStamina(stamina, ticks, regen);
      expect(result.current).toBe(expected);
      expect(Number.isSafeInteger(result.current)).toBe(true);
      expect(stamina.current).toBe(current);
    },
  );
  it('최대 안전 정수의 틱·회복량도 최대치에서 멈춘다', () => {
    expect(recoverStamina({ current: 1, max: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      .toEqual({ current: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
  });
  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('잘못된 회복 인수 %s를 거부한다', (value) => {
    expect(() => recoverStamina({ current: 0, max: 900 }, value, 1)).toThrow();
    expect(() => recoverStamina({ current: 0, max: 900 }, 1, value)).toThrow();
  });
});
