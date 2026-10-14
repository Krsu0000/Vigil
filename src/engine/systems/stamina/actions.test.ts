import { describe, expect, it } from 'vitest';
import { createCampaign } from '../../core/campaign.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { mapContext, startedState } from '../map/test-fixtures.ts';
import { mapSources } from '../../../content/test-fixtures.ts';
import { staminaHandlers } from './actions.ts';
import type { StaminaAction, StaminaEvent } from './actions.ts';

const dispatch = createDispatcher<StaminaAction, StaminaEvent>(staminaHandlers);

describe('독립 스태미나 회복 행동', () => {
  it.each([false, true])('이동 표시 %s와 무관하게 회복하고 시간·난수·원본은 유지한다', (movedSinceLastTick) => {
    const ctx = mapContext(); const initial = startedState(ctx);
    const state = deepFreeze({ ...initial, character: { ...initial.character!,
      stamina: { current: 899, max: 900 }, movedSinceLastTick,
    } });
    const result = dispatch(state, { type: 'stamina/recover', periods: 1 }, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.meta).toEqual(state.meta);
    expect(result.state.campaign).toBe(state.campaign);
    expect(result.state.character?.stamina.current).toBe(900);
    expect(result.state.character?.movedSinceLastTick).toBe(movedSinceLastTick);
    expect(state.character.stamina.current).toBe(899);
    if (!result.ok) throw new Error('회복 실패');
    expect(result.events).toEqual([{ type: 'stamina/recovered', periods: 1, recovered: 1 }]);
    expect(result).toEqual(dispatch(state, { type: 'stamina/recover', periods: 1 }, ctx));
  });

  it('여러 회복 주기의 일괄 처리와 한 주기씩 처리가 같은 상태를 만든다', () => {
    const ctx = mapContext(); const initial = startedState(ctx);
    const state = { ...initial, character: { ...initial.character!, stamina: { current: 895, max: 900 } } };
    let single = state;
    for (let i = 0; i < 10; i += 1) single = dispatch(single, { type: 'stamina/recover', periods: 1 }, ctx).state as typeof state;
    const batch = dispatch(state, { type: 'stamina/recover', periods: 10 }, ctx);
    expect(batch.state).toEqual(single);
    expect(batch.state.character?.stamina.current).toBe(900);
    expect(batch.state.meta).toEqual(state.meta);
    if (!batch.ok) throw new Error('일괄 회복 실패');
    expect(batch.events).toEqual([{ type: 'stamina/recovered', periods: 10, recovered: 5 }]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('잘못된 회복 횟수 %s는 같은 참조로 거부한다', (periods) => {
    const ctx = mapContext(); const state = deepFreeze(startedState(ctx));
    expect(dispatch(state, { type: 'stamina/recover', periods }, ctx)).toEqual({ ok: false, state, reason: 'invalid_action' });
  });

  it.each([false, true])('캐릭터 없음/미배치 %s는 회복을 거부한다', (unplaced) => {
    const ctx = mapContext(); const initial = createCampaign(ctx.content, [1,2,3,4], ctx.now);
    const state = unplaced ? { ...initial, character: { position: null,
      stamina: { current: 0, max: 900 }, movedSinceLastTick: false,
    } } : initial;
    expect(dispatch(state, { type: 'stamina/recover', periods: 1 }, ctx)).toEqual({ ok: false, state, reason: 'condition_not_met' });
  });

  it('회복량 0 또는 최대치에는 자원이 변하지 않는다', () => {
    const sources = mapSources(); sources['time-rules.json'].stamina.safeRegenPerTick = 0;
    for (const ctx of [mapContext(sources), mapContext()]) {
      const state = startedState(ctx);
      const result = dispatch(state, { type: 'stamina/recover', periods: Number.MAX_SAFE_INTEGER }, ctx);
      expect(result.state.character?.stamina).toBe(state.character?.stamina);
      expect(result.state.meta).toEqual(state.meta);
      if (!result.ok) throw new Error('회복 실패');
      expect(result.events[0]?.recovered).toBe(0);
    }
  });
});
