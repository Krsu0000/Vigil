import { describe, expect, it } from 'vitest';
import { mapSources } from '../../../content/test-fixtures.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { createRng } from '../../core/rng.ts';
import type { GameState } from '../../core/state.ts';
import { mapContext, startedState, walk } from '../map/test-fixtures.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import type { EngineContext } from '../../core/context.ts';
import { mapHandlers } from '../map/actions.ts';
import { timeHandlers } from '../time/actions.ts';
import { staminaHandlers } from '../stamina/actions.ts';
import { restHandlers } from '../rest/actions.ts';
import { ambushHandlers } from './actions.ts';
import type { MapAction, MapEvent } from '../map/actions.ts';
import type { TimeAction } from '../time/actions.ts';
import type { TimeEvent } from '../time/advance.ts';
import type { StaminaAction, StaminaEvent } from '../stamina/actions.ts';
import type { RestAction, RestEvent } from '../rest/actions.ts';
import type { AmbushAction, AmbushEvent } from './actions.ts';

type TestAction = MapAction | TimeAction | StaminaAction | RestAction | AmbushAction;
type TestEvent = MapEvent | TimeEvent | StaminaEvent | RestEvent | AmbushEvent;
function testEngine(initial: GameState, ctx: EngineContext) {
  let state = initial;
  const run = createDispatcher<TestAction, TestEvent>({ ...mapHandlers, ...timeHandlers, ...staminaHandlers, ...restHandlers, ...ambushHandlers });
  return { getSnapshot: () => state, dispatch(action: TestAction) {
    const result = run(state,action,ctx);
    if (result.ok) state = result.state;
    return result;
  } };
}
import { advanceTime } from '../time/advance.ts';

function setup(wait = 0, rest = 0, danger = true) {
  const sources = mapSources();
  sources['time-rules.json'].ambush = { waitChancePerTick: wait, restChancePerTick: rest };
  const ctx = mapContext(sources);
  const base = danger ? walk(startedState(ctx), ['east','east','south','south','east'], ctx) : startedState(ctx);
  const initial = deepFreeze({ ...base, character: { ...base.character!, stamina: { current: 880, max: 900 }, movedSinceLastTick: false } });
  const store = testEngine(initial, ctx);
  return { ctx, store, initial };
}

describe('휴식·습격 엔진 통합', () => {
  it('위험 구역 휴식은 5씩 회복하고 시간·난수·원본을 보존한다', () => {
    const { store, initial } = setup();
    expect(store.dispatch({ type: 'rest/start' })).toMatchObject({ ok: true, events: [{ type: 'rest/started' }] });
    const before = store.getSnapshot();
    const result = store.dispatch({ type: 'stamina/recover', periods: 2 });
    expect(result).toMatchObject({ ok: true, events: [{ type: 'stamina/recovered', periods: 2, recovered: 10 }] });
    expect(result.state.character!.stamina.current).toBe(890);
    expect(result.state.meta).toEqual(before.meta);
    expect(initial.character!.activity).toBe('waiting');
  });

  it('수동 중지·성공 이동·최대치 도달은 휴식을 끝내고 최대치를 넘지 않는다', () => {
    for (const end of ['stop','move','full']) {
      const { store } = setup(); store.dispatch({ type: 'rest/start' });
      if (end === 'stop') expect(store.dispatch({ type: 'rest/stop' }).ok).toBe(true);
      if (end === 'move') expect(store.dispatch({ type: 'move/step', direction: 'east' }).ok).toBe(true);
      if (end === 'full') expect(store.dispatch({ type: 'stamina/recover', periods: 100 }).ok).toBe(true);
      expect(store.getSnapshot().character!.activity).toBe('waiting');
      expect(store.getSnapshot().character!.stamina.current).toBeLessThanOrEqual(900);
    }
  });

  it('벽 충돌과 자원 부족은 휴식·자원·난수를 같은 상태 참조로 유지한다', () => {
    const { store, ctx } = setup(); store.dispatch({ type: 'rest/start' });
    const before = store.getSnapshot();
    expect(store.dispatch({ type: 'move/step', direction: 'north' })).toEqual({ ok: false, state: before, reason: 'condition_not_met' });
    const low = testEngine({ ...before, character: { ...before.character!, stamina: { current: 0, max: 900 } } }, ctx);
    const snapshot = low.getSnapshot();
    expect(low.dispatch({ type: 'move/step', direction: 'east' })).toEqual({ ok: false, state: snapshot, reason: 'insufficient_resources' });
  });

  it('안전 구역·최대치·미배치에서는 휴식을 거부하고 중복 시작/중지도 상태를 보존한다', () => {
    const safe = setup(0,0,false); const danger = setup();
    const cases = [safe.store, testEngine({ ...danger.initial, character: { ...danger.initial.character!, stamina: { current: 900, max: 900 } } }, danger.ctx),
      testEngine({ ...danger.initial, character: null }, danger.ctx)];
    for (const store of cases) {
      const before = store.getSnapshot(); expect(store.dispatch({ type: 'rest/start' })).toMatchObject({ ok: false, state: before });
      expect(store.getSnapshot()).toBe(before);
    }
    danger.store.dispatch({ type: 'rest/start' }); const resting = danger.store.getSnapshot();
    expect(danger.store.dispatch({ type: 'rest/start' }).state).toBe(resting);
    danger.store.dispatch({ type: 'rest/stop' }); const waiting = danger.store.getSnapshot();
    expect(danger.store.dispatch({ type: 'rest/stop' }).state).toBe(waiting);
  });

  it.each(['waiting','resting'] as const)('%s 중 습격은 발생 틱에서 휴식을 중지하고 처리 전 모든 진행 행동을 거부한다', (activity) => {
    const { store } = setup(1,1);
    if (activity === 'resting') store.dispatch({ type: 'rest/start' });
    const rng = store.getSnapshot().meta.rngState;
    const result = store.dispatch({ type: 'time/tick', ticks: 100 });
    expect(result).toMatchObject({ ok: true, events: [
      { type: 'time/advanced', from: 0, to: 1, ticks: 1, recovered: 0 },
      { type: 'ambush/triggered', triggeredAt: 1, activityAtTrigger: activity },
    ] });
    const before = store.getSnapshot();
    expect(before.character!.activity).toBe('waiting');
    expect(before.character!.stamina.current).toBe(880);
    expect(before.meta.rngState).toEqual(rng);
    for (const action of [{ type: 'move/step', direction: 'east' }, { type: 'rest/start' },
      { type: 'stamina/recover', periods: 1 }, { type: 'time/tick' }] as const) {
      expect(store.dispatch(action)).toEqual({ ok: false, state: before, reason: 'condition_not_met' });
    }
  });

  it('안전 구역·이동 틱은 습격과 난수 소비가 없고 다음 대기 틱부터 판정한다', () => {
    const safe = setup(1,1,false); const safeRng = safe.store.getSnapshot().meta.rngState;
    safe.store.dispatch({ type: 'time/tick', ticks: 10 });
    expect(safe.store.getSnapshot().expedition).toBeNull();
    expect(safe.store.getSnapshot().meta.rngState).toEqual(safeRng);
    const danger = setup(1,1); danger.store.dispatch({ type: 'move/step', direction: 'east' });
    const rng = danger.store.getSnapshot().meta.rngState;
    danger.store.dispatch({ type: 'time/tick' });
    expect(danger.store.getSnapshot().expedition).toBeNull();
    expect(danger.store.getSnapshot().meta.rngState).toEqual(rng);
    danger.store.dispatch({ type: 'time/tick' });
    expect(danger.store.getSnapshot().expedition!.pendingAmbush!.triggeredAt).toBe(2);
  });

  it.each(['defeated','escaped'] as const)('임시 결과 %s는 미처리 상태만 해제하고 위치·자원·시간·난수를 보존한다', (result) => {
    const { store } = setup(1,1); store.dispatch({ type: 'time/tick' });
    const before = store.getSnapshot();
    const resolved = store.dispatch({ type: 'ambush/resolve', result });
    expect(resolved).toMatchObject({ ok: true, events: [{ type: 'ambush/resolved', result }] });
    expect(resolved.state).toEqual({ ...before, expedition: { pendingAmbush: null } });
    const after = store.getSnapshot();
    expect(store.dispatch({ type: 'ambush/resolve', result }).state).toBe(after);
  });

  it('잘못된 결과는 진행 중 습격과 난수를 보존한다', () => {
    const { store } = setup(1,1); store.dispatch({ type: 'time/tick' }); const before = store.getSnapshot();
    expect(store.dispatch({ type: 'ambush/resolve', result: 'bad' as 'defeated' })).toEqual({ ok: false, state: before, reason: 'invalid_action' });
  });

  it.each([false,true])('분수 확률의 일괄/순차 판정과 같은 시드의 상태·사건·난수가 일치한다 (휴식 %s)', (resting) => {
    const { ctx, initial, store } = setup(.02,.1);
    if (resting) store.dispatch({ type: 'rest/start' });
    const state = deepFreeze(store.getSnapshot());
    const rng = createRng(state.meta.rngState);
    const batch = advanceTime(state, 100, ctx, rng);
    let sequential: GameState = state;
    while (sequential.meta.gameTime < 100 && !sequential.expedition?.pendingAmbush) {
      const result = advanceTime(sequential, 1, ctx, createRng(sequential.meta.rngState)); sequential = result.state;
    }
    expect(batch.state).toEqual(sequential);
    expect(batch).toEqual(advanceTime(state,100,ctx,createRng(state.meta.rngState)));
    expect(batch.state.meta.rngState).toEqual(rng.getState());
    expect(initial.meta.gameTime).toBe(0);
  });

  it('분수 확률은 대기 한 틱에 정확히 한 번 난수를 소비한다', () => {
    const { ctx, initial } = setup(.02,.1);
    const expected = createRng(initial.meta.rngState); expected.nextFloat();
    const result = advanceTime(initial,1,ctx,createRng(initial.meta.rngState));
    expect(result.state.meta.rngState).toEqual(expected.getState());
  });
});
