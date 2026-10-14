import type { ContentDb } from '../../../content/types.ts';
import type { Rng } from '../../core/rng.ts';

export type AmbushActivity = 'moving' | 'waiting' | 'resting';

// 상태 변경과 시간 진행은 호출부의 책임이다. 이 함수는 판정만 한다.
export function rollAmbush(
  safety: 'safe' | 'danger', activity: AmbushActivity,
  rules: ContentDb['timeRules']['ambush'], rng: Rng,
): boolean {
  if (!['safe', 'danger'].includes(safety) || !['moving', 'waiting', 'resting'].includes(activity)) {
    throw new Error('습격 판정의 구역/활동이 유효하지 않다');
  }
  const { waitChancePerTick, restChancePerTick } = rules;
  if (![waitChancePerTick, restChancePerTick].every((chance) => Number.isFinite(chance) && chance >= 0 && chance <= 1) ||
    restChancePerTick < waitChancePerTick) throw new Error('습격 확률은 0~1이며 휴식 확률은 대기 이상이어야 한다');
  if (safety === 'safe' || activity === 'moving') return false;
  const chance = activity === 'resting' ? restChancePerTick : waitChancePerTick;
  if (chance === 0) return false;
  if (chance === 1) return true;
  return rng.nextFloat() < chance;
}
