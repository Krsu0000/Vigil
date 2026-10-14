import { describe, expect, it } from 'vitest';
import { createRng, seedRngState } from './rng.ts';

// 참조값: PractRand 원본 C 식(tmp = a + b + counter++)을 별도로 구현해 계산한 출력
describe('sfc32 참조값', () => {
  it('상태 [0, 0, 0, 1]의 출력과 다음 상태가 일치한다', () => {
    const rng = createRng([0, 0, 0, 1]);
    const outputs = Array.from({ length: 5 }, () => rng.nextUint32());
    expect(outputs).toEqual([1, 2, 12, 18874399, 56669315]);
    expect(rng.getState()).toEqual([37815422, 2543864087, 122751108, 6]);
  });

  it('큰 값의 상태에서도 출력과 다음 상태가 일치한다', () => {
    const rng = createRng([0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef]);
    const outputs = Array.from({ length: 5 }, () => rng.nextUint32());
    expect(outputs).toEqual([2703532848, 2043089055, 2396455607, 2786637307, 2270195708]);
    expect(rng.getState()).toEqual([441318697, 2153885159, 3577770327, 3735928564]);
  });

  it('seedRngState는 처음 출력 15개를 버린 상태를 돌려준다', () => {
    expect(seedRngState([1, 2, 3, 4])).toEqual([463155196, 337368826, 1017454828, 19]);
  });
});

describe('createRng', () => {
  const seed = seedRngState([11, 22, 33, 44]);

  it('같은 상태에서 같은 수열이 나온다', () => {
    const first = createRng(seed);
    const second = createRng(seed);
    for (let i = 0; i < 100; i += 1) {
      expect(first.nextUint32()).toBe(second.nextUint32());
    }
  });

  it('상태를 JSON으로 저장·복원하면 같은 수열이 이어진다', () => {
    const original = createRng(seed);
    for (let i = 0; i < 10; i += 1) original.nextUint32();

    const restored = createRng(JSON.parse(JSON.stringify(original.getState())) as number[]);
    for (let i = 0; i < 50; i += 1) {
      expect(restored.nextUint32()).toBe(original.nextUint32());
    }
  });

  it('입력 상태 배열을 바꾸지 않는다', () => {
    const state = [...seed];
    const rng = createRng(state);
    rng.nextUint32();
    expect(state).toEqual(seed);
  });

  it('상태 값은 항상 32비트 부호 없는 정수다', () => {
    const rng = createRng([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff]);
    for (let i = 0; i < 1000; i += 1) {
      rng.nextUint32();
      for (const value of rng.getState()) {
        expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true);
      }
    }
  });

  it('잘못된 상태는 거부한다', () => {
    expect(() => createRng([1, 2, 3])).toThrow();
    expect(() => createRng([1, 2, 3, -1])).toThrow();
    expect(() => createRng([1, 2, 3, 2 ** 32])).toThrow();
    expect(() => createRng([1, 2, 3, 0.5])).toThrow();
    expect(() => seedRngState([1, 2, 3, Number.NaN])).toThrow();
  });
});

describe('nextFloat', () => {
  it('0 이상 1 미만이다', () => {
    const rng = createRng(seedRngState([5, 6, 7, 8]));
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.nextFloat();
      expect(value >= 0 && value < 1).toBe(true);
    }
  });
});

describe('nextInt', () => {
  it('범위를 벗어나지 않고 양끝 값이 모두 나온다', () => {
    const rng = createRng(seedRngState([9, 8, 7, 6]));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.nextInt(-2, 3);
      expect(value >= -2 && value <= 3).toBe(true);
      seen.add(value);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it('min과 max가 같으면 그 값이다', () => {
    const rng = createRng(seedRngState([1, 1, 1, 1]));
    expect(rng.nextInt(7, 7)).toBe(7);
  });

  it('잘못된 범위는 거부한다', () => {
    const rng = createRng(seedRngState([1, 1, 1, 1]));
    expect(() => rng.nextInt(3, 2)).toThrow();
    expect(() => rng.nextInt(0, 1.5)).toThrow();
    expect(() => rng.nextInt(0, 2 ** 32)).toThrow();
  });
});
