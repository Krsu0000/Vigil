import { describe, expect, it, vi } from 'vitest';
import type { Action, ActionHandler, ActionHandlers } from './actions.ts';
import { createDispatcher, dispatch } from './dispatch.ts';
import { createRng } from './rng.ts';
import type { GameState } from './state.ts';
import { ctx, deepFreeze, initialState, rollAction, testEngine } from './test-fixtures.ts';
import type { TestAction, TestEvent } from './test-fixtures.ts';

describe('행동 처리', () => {
  it('제품의 빈 목록은 테스트 행동을 등록하지 않는다', () => {
    const state = initialState();
    expect(dispatch(state, rollAction, ctx)).toEqual({ ok: false, state, reason: 'unknown_action' });
  });

  it('미등록 행동은 같은 상태 참조를 반환하고 난수 상태를 바꾸지 않는다 (INV-02)', () => {
    const engine = testEngine();
    const state = deepFreeze(initialState());
    const before = JSON.stringify(state);
    const result = engine.dispatch(state, { type: 'test/missing' }, ctx);
    expect(result).toEqual({ ok: false, state, reason: 'unknown_action' });
    expect(result.state).toBe(state);
    expect(result.state.meta.rngState).toBe(state.meta.rngState);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('미등록 행동은 난수 생성 전에 거부한다', () => {
    const state = { ...initialState(), meta: { ...initialState().meta, rngState: [] } };
    expect(dispatch(state, { type: 'test/unknown' }, ctx).ok).toBe(false);
  });

  it('조건 불충족은 execute를 호출하지 않고 원본과 난수 상태를 보존한다 (INV-02)', () => {
    const execute = vi.fn(() => { throw new Error('실행되면 안 됨'); });
    const run = createDispatcher<TestAction>({
      'test/check': { validate: () => 'condition_not_met', execute },
    });
    const state = deepFreeze(initialState());
    const before = JSON.stringify(state);
    const result = run(state, { type: 'test/check', allowed: false }, ctx);
    expect(result).toEqual({ ok: false, state, reason: 'condition_not_met' });
    expect(result.state).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
    expect(execute).not.toHaveBeenCalled();
  });

  it('조건 검증도 난수 생성보다 먼저 진행한다', () => {
    const state = { ...initialState(), meta: { ...initialState().meta, rngState: [] } };
    expect(testEngine().dispatch(state, { type: 'test/check', allowed: false }, ctx).ok).toBe(false);
  });

  it('정상 행동은 효과·문맥·사건과 최종 난수 상태를 연결한다', () => {
    const engine = testEngine();
    const state = deepFreeze(initialState());
    const before = JSON.stringify(state);
    const expectedRng = createRng(state.meta.rngState);
    const expectedRoll = expectedRng.nextInt(0, 100);
    const result = engine.dispatch(state, rollAction, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('테스트 행동 실패');
    expect(result.events).toEqual([{
      type: 'test/emitted', label: '연결 확인', roll: expectedRoll,
      now: ctx.now, contentVersion: ctx.content.contentVersion,
    }]);
    expect(result.state).not.toBe(state);
    expect(result.state.meta.rngState).toEqual(expectedRng.getState());
    expect(result.state.meta.rngState).not.toEqual(state.meta.rngState);
    expect(result.state.campaign).toBe(state.campaign);
    expect(result.state.meta.gameTime).toBe(state.meta.gameTime);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('같은 입력을 반복 실행하면 상태·사건·난수 상태가 같다 (INV-04)', () => {
    const state = deepFreeze(initialState());
    const action = deepFreeze(rollAction);
    expect(testEngine().dispatch(state, action, ctx)).toEqual(testEngine().dispatch(state, action, ctx));
  });

  it('연속된 행동은 이전 행동의 난수 상태를 이어 쓴다', () => {
    const engine = testEngine();
    const initial = initialState();
    const rng = createRng(initial.meta.rngState);
    const first = engine.dispatch(initial, rollAction, ctx);
    if (!first.ok) throw new Error('테스트 행동 실패');
    const second = engine.dispatch(first.state, rollAction, ctx);
    if (!second.ok) throw new Error('테스트 행동 실패');
    expect(first.events[0]).toMatchObject({ roll: rng.nextInt(0, 100) });
    expect(second.events[0]).toMatchObject({ roll: rng.nextInt(0, 100) });
    expect(second.state.meta.rngState).toEqual(rng.getState());
  });

  it('난수를 사용하지 않는 성공 행동은 난수 값을 보존한다', () => {
    const state = deepFreeze(initialState());
    const result = testEngine().dispatch(state, { type: 'test/check', allowed: true }, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.meta.rngState).toEqual(state.meta.rngState);
  });

  it('처리기의 상태·사건은 유지하되 난수 상태는 실제 생성기의 상태로 기록한다', () => {
    const state = deepFreeze(initialState());
    const nextCampaign = { exploration: {} };
    const events: TestEvent[] = [{ type: 'test/plain' }];
    const run = createDispatcher<TestAction, TestEvent>({
      'test/check': {
        validate: () => null,
        execute: (input, _action, _context, rng) => {
          rng.nextUint32();
          return { state: { ...input, campaign: nextCampaign, meta: { ...input.meta, rngState: [0, 0, 0, 0] } }, events };
        },
      },
    });
    const expected = createRng(state.meta.rngState);
    expected.nextUint32();
    const result = run(state, { type: 'test/check', allowed: true }, ctx);
    if (!result.ok) throw new Error('테스트 행동 실패');
    expect(result.state.campaign).toBe(nextCampaign);
    expect(result.events).toBe(events);
    expect(result.state.meta.rngState).toEqual(expected.getState());
  });

  it('시작 후 원본 목록이나 처리기를 바꿔도 등록 내용은 고정된다', () => {
    const execute = vi.fn((state: GameState) => ({ state, events: [] }));
    const handler: { validate: ActionHandler<Action>['validate']; execute: ActionHandler<Action>['execute'] } = {
      validate: () => null, execute,
    };
    const handlers: { [type: string]: ActionHandler<Action> } = { 'test/original': handler };
    const run = createDispatcher<Action>(handlers);
    handler.execute = () => { throw new Error('교체된 처리기'); };
    delete handlers['test/original'];
    handlers['test/added'] = handler;
    expect(run(initialState(), { type: 'test/original' }, ctx).ok).toBe(true);
    expect(run(initialState(), { type: 'test/added' }, ctx).ok).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('목록의 프로토타입에서 물려받은 처리기는 실행하지 않는다', () => {
    const handler = testEngine().handlers['test/check'];
    const handlers: ActionHandlers<TestAction> = Object.create({ 'test/check': handler });
    const run = createDispatcher<TestAction>(handlers);
    expect(run(initialState(), { type: 'test/check', allowed: true }, ctx).ok).toBe(false);
  });

  it('효과 검증 실패는 실행 전에 거부하고 원본을 보존한다', () => {
    const state = deepFreeze(initialState());
    const action: TestAction = { type: 'test/emit', effect: { type: 'test/emit', params: { label: '', roll: true } } };
    const result = testEngine().dispatch(state, action, ctx);
    expect(result).toEqual({ ok: false, state, reason: 'invalid_action' });
    expect(result.state).toBe(state);
  });

  it('실행 중 코드 예외는 일반 행동 거부로 변환하지 않으며 원본은 보존한다', () => {
    const state = deepFreeze(initialState());
    const before = JSON.stringify(state);
    const run = createDispatcher<TestAction>({
      'test/check': {
        validate: () => null,
        execute: (_state, _action, _context, rng) => { rng.nextUint32(); throw new Error('처리기 결함'); },
      },
    });
    expect(() => run(state, { type: 'test/check', allowed: true }, ctx)).toThrow('처리기 결함');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('검증 중 코드 예외도 그대로 전달하고 실행하지 않는다', () => {
    const execute = vi.fn(() => { throw new Error('실행되면 안 됨'); });
    const run = createDispatcher<TestAction>({
      'test/check': { validate: () => { throw new Error('검증기 결함'); }, execute },
    });
    expect(() => run(initialState(), { type: 'test/check', allowed: true }, ctx)).toThrow('검증기 결함');
    expect(execute).not.toHaveBeenCalled();
  });
});
