// 수치 수정치 계산 (D-007, architecture 7.2절). 모든 수치 계산은 computeValue를 거친다.

export type Modifier = {
  target: string; // 예: 'move_cost', 'stamina_regen_rest'
  op: 'add' | 'mul';
  value: number;
  source: string; // 출처 ID (장비, 상태이상, 시설, 지형 등)
};

export type ValueRule = {
  round: 'none' | 'floor' | 'round' | 'ceil';
  min?: number;
  max?: number;
};

const ROUNDERS: Record<ValueRule['round'], (value: number) => number> = {
  none: (value) => value,
  floor: Math.floor,
  round: Math.round, // 0.5는 올린다 (임시값, progress.md)
  ceil: Math.ceil,
};

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`computeValue: ${label}이 유한한 수가 아니다 (${value})`);
  }
}

// 호출자는 같은 target의 수정치만 모아서 넘긴다 (수정치를 모으는 함수는 시스템별로 둔다).
// 계산 순서: 기본값 → add 합산 → mul 곱셈 → 반올림 → min·max 제한.
// 소수 덧셈·곱셈은 순서에 따라 결과가 미세하게 달라지므로, 값을 정렬한 뒤 계산해
// 수정치 목록의 순서와 상관없이 같은 결과를 낸다 (INV-18).
export function computeValue(base: number, mods: readonly Modifier[], rule: ValueRule): number {
  assertFinite(base, '기본값');
  for (const mod of mods) {
    assertFinite(mod.value, `수정치 값(${mod.source})`);
  }
  if (rule.min !== undefined) assertFinite(rule.min, 'min');
  if (rule.max !== undefined) assertFinite(rule.max, 'max');
  if (rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) {
    throw new Error(`computeValue: min이 max보다 크다 (${rule.min}, ${rule.max})`);
  }

  const byValue = (x: number, y: number) => x - y;
  const adds = mods.filter((mod) => mod.op === 'add').map((mod) => mod.value).sort(byValue);
  const muls = mods.filter((mod) => mod.op === 'mul').map((mod) => mod.value).sort(byValue);

  let value = adds.reduce((sum, add) => sum + add, base);
  value = muls.reduce((product, mul) => product * mul, value);
  value = ROUNDERS[rule.round](value);
  if (rule.min !== undefined) value = Math.max(value, rule.min);
  if (rule.max !== undefined) value = Math.min(value, rule.max);

  assertFinite(value, '결과');
  return value + 0; // -0을 0으로 맞춘다
}
