import { describe, expect, it } from 'vitest';
import type { GameState } from './state.ts';
import { ctx, deepFreeze, initialState, rollAction, testEngine } from './test-fixtures.ts';

describe('GameState JSON 왕복 (INV-05)', () => {
  it('생성된 상태가 JSON 왕복 후 동일하고 콘텐츠·실행 문맥을 포함하지 않는다', () => {
    const state = initialState();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(Object.keys(state).sort()).toEqual(['campaign', 'character', 'expedition', 'meta']);
    expect(JSON.stringify(state)).not.toContain('contentVersion');
  });

  it('행동 실행 후 상태가 JSON 왕복 후 동일하고 후속 행동 결과도 같다', () => {
    const engine = testEngine();
    const first = engine.dispatch(deepFreeze(initialState()), deepFreeze(rollAction), ctx);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('테스트 행동 실패');
    const restored: GameState = JSON.parse(JSON.stringify(first.state));
    expect(restored).toEqual(first.state);
    expect(engine.dispatch(restored, rollAction, ctx))
      .toEqual(engine.dispatch(first.state, rollAction, ctx));
  });

  it('캐릭터·원정의 빈 객체와 null을 모두 보존한다', () => {
    const state: GameState = { ...initialState(), character: {}, expedition: {} };
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
