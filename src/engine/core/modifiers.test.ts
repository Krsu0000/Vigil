import { describe, expect, it } from 'vitest';
import { computeValue, type Modifier } from './modifiers.ts';

function mod(op: Modifier['op'], value: number, source = 'test'): Modifier {
  return { target: 'move_cost', op, value, source };
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('computeValue', () => {
  it('roadmap S0 예시: 6, add -1, add +1, mul 0.5 → 3', () => {
    const mods = [mod('add', -1), mod('add', 1), mod('mul', 0.5)];
    expect(computeValue(6, mods, { round: 'round', min: 0 })).toBe(3);
  });

  it('add를 모두 더한 뒤 mul을 곱한다', () => {
    // (10 + 2) × 0.5 = 6. 순서가 반대면 10 × 0.5 + 2 = 7
    expect(computeValue(10, [mod('mul', 0.5), mod('add', 2)], { round: 'none' })).toBe(6);
  });

  it('mul이 겹치면 곱해진다: 0.5 두 개는 0.25', () => {
    expect(computeValue(8, [mod('mul', 0.5), mod('mul', 0.5)], { round: 'none' })).toBe(2);
  });

  it('수정치가 없으면 기본값에 반올림과 제한만 적용한다', () => {
    expect(computeValue(4.6, [], { round: 'floor' })).toBe(4);
    expect(computeValue(4.6, [], { round: 'none', max: 3 })).toBe(3);
  });

  it('반올림 모드 4가지', () => {
    expect(computeValue(2.5, [], { round: 'none' })).toBe(2.5);
    expect(computeValue(2.5, [], { round: 'floor' })).toBe(2);
    expect(computeValue(2.5, [], { round: 'round' })).toBe(3);
    expect(computeValue(2.4, [], { round: 'ceil' })).toBe(3);
  });

  it('반올림한 뒤 min·max로 자른다', () => {
    expect(computeValue(2, [mod('add', -5)], { round: 'round', min: 0 })).toBe(0);
    expect(computeValue(2, [mod('mul', 10)], { round: 'round', max: 9 })).toBe(9);
    // 반올림을 먼저 한다: 0.6 → 1 → max 0.5 = 0.5. 제한을 먼저 하면 0.5 → 1이 된다
    expect(computeValue(0.6, [], { round: 'round', max: 0.5 })).toBe(0.5);
  });

  it('-0은 0으로 돌려준다', () => {
    expect(Object.is(computeValue(-0.4, [], { round: 'round' }), 0)).toBe(true);
  });

  it('INV-18: 수정치 순서와 상관없이 결과가 같다 (소수 포함)', () => {
    // 정렬 없이 들어온 순서대로 계산하면 이 값들은 순서에 따라 결과가 3가지로 갈린다
    const mods = [
      mod('add', 0.1), mod('add', 0.2), mod('add', 0.3),
      mod('mul', 1.1), mod('mul', 0.7), mod('mul', 0.3),
    ];
    const results = new Set(
      permutations(mods).map((order) => computeValue(0, order, { round: 'none' })),
    );
    expect(results.size).toBe(1);
  });

  it('입력 수정치 배열을 바꾸지 않는다', () => {
    const mods = [mod('add', 3), mod('add', 1)];
    const copy = mods.map((item) => ({ ...item }));
    computeValue(0, mods, { round: 'none' });
    expect(mods).toEqual(copy);
  });

  it('유한하지 않은 값과 잘못된 규칙은 거부한다', () => {
    expect(() => computeValue(Number.NaN, [], { round: 'none' })).toThrow();
    expect(() => computeValue(1, [mod('add', Number.POSITIVE_INFINITY)], { round: 'none' })).toThrow();
    expect(() => computeValue(1, [mod('mul', Number.NaN)], { round: 'none' })).toThrow();
    expect(() => computeValue(1, [], { round: 'none', min: 5, max: 2 })).toThrow();
    expect(() => computeValue(1e308, [mod('mul', 10)], { round: 'none' })).toThrow();
  });
});
