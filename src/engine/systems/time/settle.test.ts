import { describe, expect, it } from 'vitest';
import { createDispatcher } from '../../core/dispatch.ts';
import { createRng } from '../../core/rng.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { createCampaign } from '../../core/campaign.ts';
import { mapContext, startedState, walk } from '../map/test-fixtures.ts';
import { mapSources } from '../../../content/test-fixtures.ts';
import { advanceTime } from './advance.ts';
import { staminaHandlers } from '../stamina/actions.ts';
import { settleHandlers } from './settle.ts';
import type { SettleAction, SettleEvent } from './settle.ts';

const dispatch = createDispatcher<SettleAction, SettleEvent | { type: `${string}/${string}` }>(settleHandlers);
function setup() {
  const ctx = mapContext();
  const base = startedState(ctx);
  const state = { ...base, character: { ...base.character!, stamina: { current: 800, max: 900 } } };
  return { ctx, state, from: ctx.now };
}

describe('오프라인 time/settle', () => {
  it('저장 전의 실시간 진행을 제외하고 안전 구역은 일반 시간/회복 경로와 같은 결과를 낸다', () => {
    const {ctx, state, from} = setup();
    const rng = createRng(state.meta.rngState);
    const live = advanceTime(state, 20, ctx, rng).state;
    const savedAt = from + 40_000;
    const result = dispatch(deepFreeze(live), { type: 'time/settle', from: savedAt, to: savedAt + 10_000 }, ctx);
    expect(result.ok).toBe(true);
    const expected = advanceTime(live, 5, ctx, rng).state;
    const recovered = staminaHandlers['stamina/recover']!.execute(expected, { type: 'stamina/recover', periods: 5 }, ctx, rng).state;
    expect(result.state).toEqual({ ...recovered, meta: { ...recovered.meta, settledUntil: savedAt + 10_000 } });
    expect(result.state.meta.gameTime).toBe(25);
    expect(result.state.character!.stamina.current).toBe(805);
    expect(result.state.meta.rngState).toEqual(state.meta.rngState);
  });

  it('같은 시각 및 이전 구간 재정산은 자원·시간·난수·기준 시각을 바꾸지 않는다', () => {
    const {ctx, state, from} = setup();
    const action = { type: 'time/settle' as const, from, to: from + 10_000 };
    const first = dispatch(state, action, ctx);
    for (const to of [action.to, action.to - 5_000, 0]) {
      const next = dispatch(first.state, { ...action, to }, ctx);
      expect(next.state).toEqual(first.state);
      if (next.ok) expect(next.events).toEqual([]);
    }
    const later = dispatch(first.state, { ...action, to: action.to + 2_000 }, ctx);
    expect(later.state.character!.stamina.current).toBe(806);
    expect(later.state.meta.gameTime).toBe(6);
  });

  it('저장 시각/기존 정산/마지막 실행보다 이른 기기 시각에는 변화가 없다', () => {
    const {ctx, state, from} = setup();
    for (const initial of [state, { ...state, meta: { ...state.meta, settledUntil: from + 20_000 } },
      { ...state, meta: { ...state.meta, lastActiveAt: from + 20_000 } }]) {
      const result = dispatch(initial, { type: 'time/settle', from: from + 10_000, to: from + 5_000 }, ctx);
      expect(result.state).toEqual(initial);
    }
  });

  it('24시간 상한을 초과한 구간도 to까지 소비하므로 같은 구간의 나머지를 재지급하지 않는다', () => {
    const {ctx, state, from} = setup();
    const to = from + 3 * 86_400_000;
    const first = dispatch(state, { type: 'time/settle', from, to }, ctx);
    expect(first.state.meta.gameTime).toBe(43_200);
    expect(first.state.character!.stamina.current).toBe(900);
    expect(first.state.meta.settledUntil).toBe(to);
    expect(dispatch(first.state, { type: 'time/settle', from, to }, ctx).state).toEqual(first.state);
    expect(dispatch(first.state, { type: 'time/settle', from, to: to + 2_000 }, ctx).state.meta.gameTime).toBe(43_201);
  });

  it('전역 틱과 회복 간격은 각각 정수 횟수로 계산하며 부분 시간은 이월하지 않는다', () => {
    const sources = mapSources(); sources['time-rules.json'].tickMs = 3_000;
    const ctx = mapContext(sources); const {state, from} = setup();
    const result = dispatch(state, { type: 'time/settle', from, to: from + 5_999 }, ctx);
    expect(result.state.meta.gameTime).toBe(1);
    expect(result.state.character!.stamina.current).toBe(802);
    expect(dispatch(result.state, { type: 'time/settle', from, to: from + 6_000 }, ctx).state.character!.stamina.current).toBe(802);
  });

  it.each(['waiting', 'resting', 'pending'] as const)('위험지대 %s의 닫힌 시간에는 회복·시간·습격·난수 진행이 없다', kind => {
    const {ctx, from} = setup();
    const base = walk(startedState(ctx), ['east','east','south','south','east'], ctx);
    const state = { ...base, character: { ...base.character!, activity: kind === 'resting' ? 'resting' as const : 'waiting' as const },
      expedition: kind === 'pending' ? { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'resting' as const } } : null };
    const result = dispatch(deepFreeze(state), { type: 'time/settle', from, to: from + 86_400_000 }, ctx);
    expect(result.state).toEqual({ ...state, meta: { ...state.meta, settledUntil: from + 86_400_000 } });
    if (result.ok) expect(result.events).toEqual([expect.objectContaining({ type: 'time/settled', ticks: 0, periods: 0 })]);
  });

  it('미배치 구버전 상태는 정산 기준만 갱신한다', () => {
    const {ctx, from} = setup(); const state = createCampaign(ctx.content, [1,2,3,4], from);
    const result = dispatch(state, { type: 'time/settle', from, to: from + 10_000 }, ctx);
    expect(result.state.character).toBeNull(); expect(result.state.meta.gameTime).toBe(0);
    expect(result.state.meta.settledUntil).toBe(from + 10_000);
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('잘못된 정산 시각 %s는 변경 없이 거부한다', value => {
    const {ctx, state, from} = setup();
    for (const action of [{ type: 'time/settle' as const, from: value, to: from }, { type: 'time/settle' as const, from, to: value }]) {
      expect(dispatch(state, action, ctx)).toEqual({ ok: false, state, reason: 'invalid_action' });
    }
  });

  it('게임 시간의 정수 상한 초과는 부분 지급 없이 거부한다', () => {
    const {ctx, state, from} = setup(); const initial = { ...state, meta: { ...state.meta, gameTime: Number.MAX_SAFE_INTEGER } };
    expect(dispatch(initial, { type: 'time/settle', from, to: from + 2_000 }, ctx)).toEqual({ ok: false, state: initial, reason: 'invalid_action' });
  });
});
