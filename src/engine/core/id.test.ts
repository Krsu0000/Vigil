import { describe, expect, it } from 'vitest';
import { createUuid } from './id.ts';
import { createRng, seedRngState } from './rng.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createUuid', () => {
  const seed = seedRngState([101, 202, 303, 404]);

  it('UUID v4 형식이다', () => {
    const rng = createRng(seed);
    for (let i = 0; i < 100; i += 1) {
      expect(createUuid(rng)).toMatch(UUID_V4);
    }
  });

  it('같은 난수 상태에서 같은 ID가 나온다', () => {
    expect(createUuid(createRng(seed))).toBe(createUuid(createRng(seed)));
  });

  it('연속으로 만든 ID는 서로 다르다', () => {
    const rng = createRng(seed);
    const ids = new Set(Array.from({ length: 1000 }, () => createUuid(rng)));
    expect(ids.size).toBe(1000);
  });

  it('난수를 4개 소비한다', () => {
    const viaUuid = createRng(seed);
    createUuid(viaUuid);
    const manual = createRng(seed);
    for (let i = 0; i < 4; i += 1) manual.nextUint32();
    expect(viaUuid.getState()).toEqual(manual.getState());
  });
});
