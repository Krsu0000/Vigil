import type { ContentDb } from '../../../content/types.ts';
import { computeValue } from '../../core/modifiers.ts';
import type { GameState, MapPosition, StaminaState } from '../../core/state.ts';
import { coordinateKey, findCell, findMap, requireZone } from '../map/selectors.ts';

export function createStamina(content: ContentDb): StaminaState {
  const max = content.timeRules.stamina.max;
  return { current: max, max };
}

export function assertStamina(stamina: StaminaState): void {
  if (!Number.isSafeInteger(stamina.max) || stamina.max <= 0 ||
    !Number.isSafeInteger(stamina.current) || stamina.current < 0 || stamina.current > stamina.max) {
    throw new Error('스태미나는 정수이고 0 이상 최대치 이하여야 한다');
  }
}

export function getMoveCost(state: GameState, to: MapPosition, content: ContentDb): number {
  const map = findMap(content, to.mapId);
  const cell = map && findCell(map, to);
  if (!cell) throw new Error('이동 비용 대상 칸이 없다');
  const rules = content.timeRules.stamina;
  const safe = requireZone(content, cell.zoneId).safety === 'safe';
  const explored = state.campaign.exploration[to.mapId]?.visited[coordinateKey(to)] === true;
  const base = safe ? rules.safeMoveCost : rules.unexploredMoveCost;
  // 기존 경로 가격도 콘텐츠 값이다. 기본 비용이 0이면 배율 대신 고정 증감을 쓴다.
  const mods = safe || !explored ? [] : [{
    target: 'move_cost', source: to.mapId,
    op: base === 0 ? 'add' as const : 'mul' as const,
    value: base === 0 ? rules.exploredMoveCost : rules.exploredMoveCost / base,
  }];
  const cost = computeValue(base, mods, { round: 'round', min: 0 });
  if (!Number.isSafeInteger(cost)) throw new Error('이동 비용은 0 이상의 안전한 정수여야 한다');
  return cost;
}

export function consumeStamina(stamina: StaminaState, cost: number): StaminaState {
  assertStamina(stamina);
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > stamina.current) throw new Error('소모할 스태미나가 유효하지 않다');
  return { ...stamina, current: computeValue(stamina.current, [
    { target: 'stamina', op: 'add', value: -cost, source: 'move/step' },
  ], { round: 'round', min: 0, max: stamina.max }) };
}

export function recoverStamina(stamina: StaminaState, ticks: number, perTick: number): StaminaState {
  assertStamina(stamina);
  if (!Number.isSafeInteger(ticks) || ticks < 0 || !Number.isSafeInteger(perTick) || perTick < 0) {
    throw new Error('회복 틱과 회복량은 0 이상의 안전한 정수여야 한다');
  }
  if (ticks === 0 || perTick === 0 || stamina.current === stamina.max) return stamina;
  // 최대치까지 필요한 양만 더해 많은 틱에서도 정수 정밀도를 보존한다.
  const amount = Math.min(stamina.max - stamina.current, ticks * perTick);
  return { ...stamina, current: computeValue(stamina.current, [
    { target: 'stamina', op: 'add', value: amount, source: 'stamina/recover' },
  ], { round: 'round', min: 0, max: stamina.max }) };
}
