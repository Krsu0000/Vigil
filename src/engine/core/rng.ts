// 시드 난수 sfc32 (D-008, architecture 5장). 의존성 없이 직접 구현한다.
// 내부 상태는 32비트 부호 없는 정수 4개 [a, b, c, counter]이며 meta.rngState에 그대로 저장한다.
// 출력식은 PractRand의 원본 sfc32와 같다: tmp = a + b + counter++.

export type Rng = {
  nextUint32(): number;
  nextFloat(): number; // 0 이상 1 미만
  nextInt(min: number, max: number): number; // min, max 포함
  getState(): number[];
};

const UINT32_RANGE = 2 ** 32;
const SEED_DISCARD_COUNT = 15;

function assertUint32List(values: readonly number[], label: string): void {
  if (values.length !== 4) {
    throw new Error(`${label}은 정수 4개여야 한다 (받은 개수: ${values.length})`);
  }
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new Error(`${label}의 값은 32비트 부호 없는 정수여야 한다 (받은 값: ${value})`);
    }
  }
}

// 시드 4개로 초기 상태를 만든다. 비슷한 시드의 출력이 닮지 않도록 처음 출력 15개를 버린다.
export function seedRngState(seed: readonly number[]): number[] {
  assertUint32List(seed, '시드');
  const rng = createRng(seed);
  for (let i = 0; i < SEED_DISCARD_COUNT; i += 1) {
    rng.nextUint32();
  }
  return rng.getState();
}

// 입력 배열은 바꾸지 않는다. 생성기의 새 상태는 getState()로 꺼낸다.
export function createRng(state: readonly number[]): Rng {
  assertUint32List(state, '난수 상태');
  let [a, b, c, counter] = state as [number, number, number, number];

  function nextUint32(): number {
    const tmp = (((a + b) | 0) + counter) | 0;
    counter = (counter + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (((c << 21) | (c >>> 11)) + tmp) | 0;
    return tmp >>> 0;
  }

  function nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new Error(`nextInt의 범위는 정수여야 한다 (${min}, ${max})`);
    }
    if (min > max) {
      throw new Error(`nextInt의 min이 max보다 크다 (${min}, ${max})`);
    }
    const range = max - min + 1;
    if (range > UINT32_RANGE) {
      throw new Error(`nextInt의 범위가 2^32를 넘는다 (${min}, ${max})`);
    }
    // 치우침을 없애기 위해 range의 배수 구간 밖의 값은 버리고 다시 뽑는다
    const limit = UINT32_RANGE - (UINT32_RANGE % range);
    let value = nextUint32();
    while (value >= limit) {
      value = nextUint32();
    }
    return min + (value % range);
  }

  return {
    nextUint32,
    nextFloat: () => nextUint32() / UINT32_RANGE,
    nextInt,
    getState: () => [a >>> 0, b >>> 0, c >>> 0, counter >>> 0],
  };
}
