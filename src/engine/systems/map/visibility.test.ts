import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../core/test-fixtures.ts';
import { mapSources } from '../../../content/test-fixtures.ts';
import { getTileVisibility } from './visibility.ts';
import { mapContext, startedState, walk } from './test-fixtures.ts';

const at = (x: number, y: number) => ({ mapId: 'map.s1_test', floor: 0, x, y });

describe('A안 전장의 안개', () => {
  it.each([[1, 1], [0, 1], [2, 1], [1, 0], [1, 2]])('현재·인접 칸 (%s, %s)은 벽을 포함해 보인다', (x, y) => {
    const ctx = mapContext();
    expect(getTileVisibility(startedState(ctx), at(x, y), ctx.content)).toBe('visible');
  });

  it.each([[2, 2], [3, 1], [1, 3]])('대각선·먼 칸 (%s, %s)은 아직 가려진다', (x, y) => {
    const ctx = mapContext();
    expect(getTileVisibility(startedState(ctx), at(x, y), ctx.content)).toBe('unexplored');
  });

  it('밟은 칸은 시야 밖에서도 탐사 완료로 남는다', () => {
    const ctx = mapContext();
    const state = walk(startedState(ctx), ['east', 'east'], ctx);
    expect(getTileVisibility(state, at(1, 1), ctx.content)).toBe('explored');
    expect(getTileVisibility(state, at(2, 1), ctx.content)).toBe('visible');
  });

  it('보기만 한 칸은 시야를 벗어나면 다시 미탐사로 가려진다', () => {
    const ctx = mapContext();
    const initial = startedState(ctx);
    expect(getTileVisibility(initial, at(1, 2), ctx.content)).toBe('visible');
    const moved = walk(initial, ['east', 'east'], ctx);
    expect(getTileVisibility(moved, at(1, 2), ctx.content)).toBe('unexplored');
    expect(moved.campaign.exploration['map.s1_test']!.visited['0:1:2']).toBeUndefined();
  });

  it('벽은 현재 시야에서만 보이고 벽 너머를 노출하지 않는다', () => {
    const ctx = mapContext();
    const state = walk(startedState(ctx), ['east', 'east'], ctx);
    expect(getTileVisibility(state, at(4, 1), ctx.content)).toBe('visible');
    expect(getTileVisibility(state, at(5, 1), ctx.content)).toBe('unexplored');
    const moved = walk(state, ['west'], ctx);
    expect(getTileVisibility(moved, at(4, 1), ctx.content)).toBe('unexplored');
  });

  it('시야 조회는 상태·탐사 기록·시간·난수를 바꾸지 않는다', () => {
    const ctx = deepFreeze(mapContext());
    const state = deepFreeze(startedState(ctx));
    const before = structuredClone(state);
    for (let x = 0; x < 9; x += 1) for (let y = 0; y < 7; y += 1) getTileVisibility(state, at(x, y), ctx.content);
    expect(state).toEqual(before);
    expect(state.campaign.exploration['map.s1_test']!.visited).toEqual({ '0:1:1': true });
  });

  it('캐릭터가 없어지면 현재 시야만 사라지고 캠페인 탐사 기록은 남는다', () => {
    const ctx = mapContext();
    const state = { ...walk(startedState(ctx), ['east'], ctx), character: null };
    expect(getTileVisibility(state, at(1, 1), ctx.content)).toBe('explored');
    expect(getTileVisibility(state, at(2, 1), ctx.content)).toBe('explored');
    expect(getTileVisibility(state, at(3, 1), ctx.content)).toBe('unexplored');
  });

  it('없는 칸의 조회는 코드 오류로 보고한다', () => {
    const ctx = mapContext();
    expect(() => getTileVisibility(startedState(ctx), at(9, 1), ctx.content)).toThrow('대상 칸');
  });

  it('다른 맵의 같은 좌표를 현재 시야로 노출하지 않는다', () => {
    const sources = mapSources();
    sources['maps/s1-test.json'].push({ ...structuredClone(sources['maps/s1-test.json'][0]!), id: 'map.other' });
    const ctx = mapContext(sources);
    const state = startedState(ctx);
    const target = { ...at(1, 1), mapId: 'map.other' };
    expect(getTileVisibility(state, target, ctx.content)).toBe('unexplored');
    const remembered = { ...state, campaign: { exploration: {
      ...state.campaign.exploration, 'map.other': { mapVersion: 1, visited: { '0:1:1': true as const } },
    } } };
    expect(getTileVisibility(remembered, target, ctx.content)).toBe('explored');
  });
});
