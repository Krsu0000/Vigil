import { describe, expect, it } from 'vitest';
import { createCampaign } from '../../core/campaign.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import { createRng } from '../../core/rng.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import type { GameState } from '../../core/state.ts';
import { mapSources } from '../../../content/test-fixtures.ts';
import { mapHandlers } from '../map/actions.ts';
import type { MapAction, MapEvent } from '../map/actions.ts';
import { mapContext as originalMapContext, startedState, walk } from '../map/test-fixtures.ts';
import { staminaHandlers } from '../stamina/actions.ts';
import type { StaminaAction, StaminaEvent } from '../stamina/actions.ts';
import { timeHandlers } from './actions.ts';
import type { TimeAction } from './actions.ts';
import { advanceTime } from './advance.ts';
import type { TimeEvent } from './advance.ts';
import type { AmbushEvent } from '../ambush/actions.ts';

function mapContext(sources = mapSources()) {
  sources['time-rules.json'].ambush = { waitChancePerTick: 0, restChancePerTick: 0 };
  return originalMapContext(sources);
}

const dispatch = createDispatcher<MapAction | TimeAction | StaminaAction, MapEvent | TimeEvent | StaminaEvent | AmbushEvent>({ ...mapHandlers, ...timeHandlers, ...staminaHandlers });

describe('기본 시간 엔진', () => {
  it('지연된 실시간 틱의 일괄 행동은 한 틱씩 처리와 같은 최종 상태를 만든다', () => {
    const ctx = mapContext(); const initial = walk(startedState(ctx), ['east','east','south','south','east'], ctx);
    const batch = dispatch(initial, { type: 'time/tick', ticks: 6 }, ctx);
    let single = initial;
    for (let i = 0; i < 6; i += 1) single = dispatch(single, { type: 'time/tick' }, ctx).state;
    expect(batch.state).toEqual(single);
    expect(batch.state.meta.gameTime).toBe(6);
    expect(batch.state.character?.stamina.current).toBe(894);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('잘못된 틱 행동 %s는 같은 참조로 거부한다', (ticks) => {
    const ctx = mapContext(); const state = startedState(ctx);
    expect(dispatch(state, { type: 'time/tick', ticks }, ctx)).toEqual({ ok: false, state, reason: 'invalid_action' });
  });

  it('하트비트는 기존 메타데이터만 갱신하고 게임 시간·자원·난수를 진행하지 않는다', () => {
    const ctx = mapContext(); const state = deepFreeze(startedState(ctx));
    const result = dispatch(state, { type: 'time/heartbeat' }, { ...ctx, now: ctx.now + 15_000 });
    expect(result.state.meta).toEqual({ ...state.meta, lastActiveAt: ctx.now + 15_000 });
    expect(result.state.character).toBe(state.character);
    expect(result.state.campaign).toBe(state.campaign);
    expect(dispatch(result.state, { type: 'time/heartbeat' }, { ...ctx, now: ctx.now - 1 }).state).toEqual(result.state);
  });

  it.each([-1, NaN, Infinity, 1.5])('잘못된 시각 %s의 하트비트는 거부한다', (now) => {
    const ctx = mapContext(); const state = startedState(ctx);
    expect(dispatch(state, { type: 'time/heartbeat' }, { ...ctx, now })).toEqual({ ok: false, state, reason: 'invalid_action' });
  });
  it('전역 틱은 시간만 한 번 진행하며 회복은 별도 행동에서만 적용한다', () => {
    const ctx = deepFreeze(mapContext()); const initial = startedState(ctx);
    const state = deepFreeze({ ...initial, character: { ...initial.character!, stamina: { current: 899, max: 900 } } });
    const result = dispatch(state, { type: 'time/tick' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.meta).toEqual({ ...state.meta, gameTime: 1 });
    expect(result.state.character?.stamina.current).toBe(899);
    expect(result.state.character?.stamina).toBe(state.character?.stamina);
    const recovered = dispatch(result.state, { type: 'stamina/recover', periods: 1 }, ctx);
    expect(recovered.state.character?.stamina.current).toBe(900);
    expect(recovered.state.meta).toEqual(result.state.meta);
    expect(result.state.campaign).toBe(state.campaign);
    if (!result.ok) throw new Error('시간 진행 실패');
    expect(result.events).toEqual([{ type: 'time/advanced', from: 0, to: 1, ticks: 1, recovered: 0 }]);
    expect(state.character?.stamina.current).toBe(899);
    expect(result).toEqual(dispatch(state, { type: 'time/tick' }, ctx));
  });

  it('같은 틱의 여러 이동은 비용만 소모하고 전역 틱 자체는 회복하지 않는다', () => {
    const ctx = mapContext();
    const moved = deepFreeze(walk(startedState(ctx), ['east', 'east', 'south', 'south', 'east', 'east'], ctx));
    expect(moved.meta.gameTime).toBe(0);
    expect(moved.character?.stamina.current).toBe(888);
    const first = dispatch(moved, { type: 'time/tick' }, ctx).state;
    expect(first.meta.gameTime).toBe(1);
    expect(first.character?.stamina.current).toBe(888);
    expect(first.character?.movedSinceLastTick).toBe(false);
    const second = dispatch(first, { type: 'time/tick' }, ctx).state;
    expect(second.meta.gameTime).toBe(2);
    expect(second.character?.stamina.current).toBe(888);
    expect(dispatch(second, { type: 'stamina/recover', periods: 1 }, ctx).state.character?.stamina.current).toBe(889);
  });

  it('실패한 이동은 별도로 주입한 대기 회복을 막지 않는다', () => {
    const ctx = mapContext(); const initial = startedState(ctx);
    const state = { ...initial, character: { ...initial.character!, stamina: { current: 0, max: 900 } } };
    const refused = dispatch(state, { type: 'move/step', direction: 'north' }, ctx);
    expect(refused.state).toBe(state);
    const next = dispatch(refused.state, { type: 'stamina/recover', periods: 1 }, ctx).state;
    expect(next.character?.stamina.current).toBe(1);
  });

  it('별도 회복 행동이 안전/위험 구역의 회복량을 콘텐츠에서 읽는다', () => {
    const sources = mapSources();
    Object.assign(sources['time-rules.json'].stamina, { safeRegenPerTick: 2, waitRegenPerTick: 3 });
    const ctx = mapContext(sources);
    for (const [base, expected] of [[startedState(ctx), 2], [walk(startedState(ctx), ['east','east','south','south','east'],ctx), 3]] as const) {
      const state = { ...base, character: { ...base.character!, stamina: { current: 0, max: 900 }, movedSinceLastTick: false } };
      expect(dispatch(state, { type: 'stamina/recover', periods: 1 }, ctx).state.character?.stamina.current).toBe(expected);
    }
  });

  it.each([false, true])('한꺼번에 여러 틱과 한 틱씩 처리가 같은 상태를 만든다 (이동 표시 %s)', (movedSinceLastTick) => {
    const ctx = deepFreeze(mapContext()); const initial = startedState(ctx);
    const state = deepFreeze({ ...initial, character: { ...initial.character!, stamina: { current: 895, max: 900 }, movedSinceLastTick } });
    const rng = createRng(state.meta.rngState);
    const batch = advanceTime(state, 10, ctx, rng);
    let sequential: GameState = state;
    for (let i = 0; i < 10; i += 1) sequential = dispatch(sequential, { type: 'time/tick' }, ctx).state;
    expect(batch.state).toEqual(sequential);
    expect(rng.getState()).toEqual(state.meta.rngState);
    expect(batch.events).toEqual([{ type: 'time/advanced', from: 0, to: 10, ticks: 10, recovered: 0 }]);
  });

  it('0틱은 같은 참조를 반환하고 이동 표시를 소비하지 않는다', () => {
    const ctx = mapContext(); const state = walk(startedState(ctx), ['east'], ctx);
    const result = advanceTime(deepFreeze(state), 0, ctx, createRng(state.meta.rngState));
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.state.character?.movedSinceLastTick).toBe(true);
  });

  it('미배치·캐릭터 없음은 틱을 거부하며 아무 상태도 변경하지 않는다', () => {
    const ctx = mapContext(); const initial = createCampaign(ctx.content, [1,2,3,4],ctx.now);
    for (const state of [initial, { ...initial, character: { position: null, stamina: { current: 0, max: 900 }, movedSinceLastTick: false, activity: 'waiting' as const } }]) {
      expect(dispatch(deepFreeze(state), { type: 'time/tick' }, ctx)).toEqual({ ok: false, state, reason: 'condition_not_met' });
      expect(() => advanceTime(state, 1, ctx, createRng(state.meta.rngState))).toThrow('배치');
    }
  });

  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('유효하지 않은 틱 수 %s는 거부한다', (ticks) => {
    const ctx = mapContext(); const state = deepFreeze(startedState(ctx));
    expect(() => advanceTime(state, ticks, ctx, createRng(state.meta.rngState))).toThrow();
    expect(state.meta.gameTime).toBe(0);
  });

  it('게임 시간 정수 상한을 초과하는 틱은 원본을 변경하지 않고 오류를 보고한다', () => {
    const ctx = mapContext(); const state = deepFreeze({ ...startedState(ctx), meta: {
      ...startedState(ctx).meta, gameTime: Number.MAX_SAFE_INTEGER,
    } });
    expect(() => dispatch(state, { type: 'time/tick' }, ctx)).toThrow('상한');
    expect(state.meta.gameTime).toBe(Number.MAX_SAFE_INTEGER);
  });
});
