import { describe, expect, it } from 'vitest';
import { mapSources } from '../../../content/test-fixtures.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import { ambushHandlers } from '../ambush/actions.ts';
import type { AmbushAction, AmbushEvent } from '../ambush/actions.ts';
import { mapHandlers } from './actions.ts';
import type { MapAction, MapEvent } from './actions.ts';
import { getReturnDestination, validateMapState } from './selectors.ts';
import { mapContext, mapDispatch, startedState, walk } from './test-fixtures.ts';

const ctx = mapContext();
const danger = () => walk(startedState(ctx), ['east','east','south','south','east'], ctx);

describe('거점 즉시 귀환', () => {
  it.each([0, 365, 900])('스태미나 %i에서도 비용/즉시 회복 없이 자원·시간·난수·탐사를 유지한다', current => {
    const base = danger(); const before = deepFreeze({ ...base, character: { ...base.character!, stamina: { current, max: 900 } } });
    const result = mapDispatch(before, { type: 'map/return' }, ctx);
    expect(result.ok).toBe(true); expect(result.state.character!.position).toEqual({ mapId: 'map.s1_test', floor: 0, x: 1, y: 1 });
    expect(result.state.character!.stamina).toBe(before.character.stamina); expect(result.state.meta).toEqual(before.meta);
    expect(result.state.campaign).toBe(before.campaign); expect(result.state.expedition).toBe(before.expedition);
    if (!result.ok) throw new Error('귀환 실패');
    expect(result.events).toEqual([{ type: 'map/returned', from: before.character.position, to: result.state.character!.position }]);
  });

  it('휴식은 끝내고 칸 이동 표시를 남긴다', () => {
    const base = danger(); const before = { ...base, character: { ...base.character!, activity: 'resting' as const, movedSinceLastTick: false } };
    const result = mapDispatch(before, { type: 'map/return' }, ctx);
    expect(result.ok).toBe(true); expect(result.state.character!.activity).toBe('waiting');
    expect(result.state.character!.movedSinceLastTick).toBe(true);
    expect(result.state.character!.stamina).toEqual(before.character.stamina);
  });

  it('안전 구역·미배치·미처리 습격은 거부하며 원본을 유지한다', () => {
    const base = danger();
    const cases = [startedState(ctx), { ...base, character: null }, { ...base, character: { ...base.character!, position: null } },
      { ...base, expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'waiting' as const } } }];
    for (const before of cases) {
      const result = mapDispatch(deepFreeze(before), { type: 'map/return' }, ctx);
      expect(result.ok).toBe(false); expect(result.state).toBe(before); expect(getReturnDestination(before, ctx.content)).toBeNull();
    }
  });

  it.each(['defeated', 'escaped'] as const)('임시 습격 %s 처리 후에는 즉시 귀환할 수 있다', outcome => {
    const base = danger(); const pending = { ...base, expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'waiting' as const } } };
    const dispatch = createDispatcher<MapAction | AmbushAction, MapEvent | AmbushEvent>({ ...mapHandlers, ...ambushHandlers });
    expect(dispatch(pending, { type: 'map/return' }, ctx).ok).toBe(false);
    const resolved = dispatch(pending, { type: 'ambush/resolve', result: outcome }, ctx);
    expect(resolved.ok).toBe(true); expect(dispatch(resolved.state, { type: 'map/return' }, ctx).ok).toBe(true);
  });

  it('콘텐츠의 시작 칸을 사용하며 좌표를 하드코딩하지 않는다', () => {
    const sources = mapSources(); sources['maps/s1-test.json'][0]!.start = { floor: 0, x: 2, y: 1 };
    const other = mapContext(sources); const state = walk(startedState(other), ['east','south','south','east'], other);
    const result = mapDispatch(state, { type: 'map/return' }, other);
    expect(result.ok).toBe(true); expect(result.state.character!.position).toEqual({ mapId: 'map.s1_test', floor: 0, x: 2, y: 1 });
  });

  it('위험한 시작점 또는 여러 맵의 귀환 목적지를 임의로 선택하지 않는다', () => {
    const unsafe = mapSources(); unsafe['maps/s1-test.json'][0]!.start = { floor: 0, x: 5, y: 1 };
    const unsafeCtx = mapContext(unsafe); expect(mapDispatch(startedState(unsafeCtx), { type: 'map/return' }, unsafeCtx).ok).toBe(false);
    const multiple = mapSources(); multiple['maps/s1-test.json'].push({ ...structuredClone(multiple['maps/s1-test.json'][0]!), id: 'map.second' });
    const multiCtx = mapContext(multiple); const state = walk(startedState(multiCtx), ['east','east','south','south','east'], multiCtx);
    expect(mapDispatch(state, { type: 'map/return' }, multiCtx).ok).toBe(false);
  });

  it('거점 기록이 빠진 유효 상태는 도착 칸만 추가하고 중간 경로를 공개하지 않는다', () => {
    const base = danger(); const memory = base.campaign.exploration['map.s1_test']!;
    const visited = { ...memory.visited }; delete visited['0:1:1'];
    const before = { ...base, campaign: { ...base.campaign, exploration: { 'map.s1_test': { ...memory, visited } } } };
    validateMapState(before, ctx.content);
    const result = mapDispatch(before, { type: 'map/return' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.campaign.exploration['map.s1_test']!.visited).toEqual({ ...visited, '0:1:1': true });
    expect(() => validateMapState(result.state, ctx.content)).not.toThrow();
  });
});
