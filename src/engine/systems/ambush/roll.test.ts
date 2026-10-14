import { describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng.ts';
import { mapContext } from '../map/test-fixtures.ts';
import { rollAmbush } from './roll.ts';
import type { AmbushActivity } from './roll.ts';

const rules = Object.freeze({ waitChancePerTick: 0.02, restChancePerTick: 0.1 });

describe('독립 습격 판정', () => {
  it.each([
    ['safe','waiting'], ['safe','resting'], ['safe','moving'], ['danger','moving'],
  ] as const)('%s/%s에서는 판정하지 않고 난수를 보존한다', (safety, activity) => {
    const rng = createRng([1,2,3,4]); const before = rng.getState();
    expect(rollAmbush(safety, activity, rules, rng)).toBe(false);
    expect(rng.getState()).toEqual(before);
  });

  it.each([
    ['waiting',0.019999,true], ['waiting',0.02,false], ['resting',0.099999,true], ['resting',0.1,false],
  ] as const)('%s의 표본 %s에서 경계값을 처리한다', (activity, sample, expected) => {
    const rng = createRng([1,2,3,4]); const draw = vi.spyOn(rng, 'nextFloat').mockReturnValue(sample);
    expect(rollAmbush('danger', activity, rules, rng)).toBe(expected);
    expect(draw).toHaveBeenCalledOnce();
  });

  it.each([0,1])('확률 %s는 난수 없이 확정한다', (chance) => {
    const rng = createRng([1,2,3,4]); const before = rng.getState();
    expect(rollAmbush('danger', 'resting', { waitChancePerTick: chance, restChancePerTick: chance }, rng)).toBe(chance === 1);
    expect(rng.getState()).toEqual(before);
  });

  it('같은 시드·활동 순서에서 같은 판정과 최종 난수가 나온다', () => {
    const state = [1,2,3,4]; const first = createRng(state); const second = createRng(state);
    const activities: AmbushActivity[] = Array.from({ length: 64 }, (_, i) => i % 2 ? 'resting' : 'waiting');
    expect(activities.map((activity) => rollAmbush('danger', activity, rules, first)))
      .toEqual(activities.map((activity) => rollAmbush('danger', activity, rules, second)));
    expect(first.getState()).toEqual(second.getState());
    expect(first.getState()).not.toEqual(state);
    expect(state).toEqual([1,2,3,4]);
  });

  it.each([
    { waitChancePerTick: -0.01, restChancePerTick: 0.1 },
    { waitChancePerTick: 0.02, restChancePerTick: 1.01 },
    { waitChancePerTick: NaN, restChancePerTick: 0.1 },
    { waitChancePerTick: 0.02, restChancePerTick: Infinity },
    { waitChancePerTick: 0.1, restChancePerTick: 0.02 },
  ])('잘못된 확률은 난수 소비 전에 거부한다', (invalid) => {
    const rng = createRng([1,2,3,4]); const before = rng.getState();
    expect(() => rollAmbush('danger', 'waiting', invalid, rng)).toThrow();
    expect(rng.getState()).toEqual(before);
  });

  it('현재 콘텐츠의 임시 확률을 받아 판정하며 규칙을 변경하지 않는다', () => {
    const content = mapContext().content; const before = structuredClone(content.timeRules.ambush);
    const rng = createRng([1,2,3,4]); const draw = vi.spyOn(rng, 'nextFloat').mockReturnValue(0.05);
    expect(rollAmbush('danger', 'waiting', content.timeRules.ambush, rng)).toBe(false);
    expect(rollAmbush('danger', 'resting', content.timeRules.ambush, rng)).toBe(true);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(content.timeRules.ambush).toEqual(before);
  });
});
