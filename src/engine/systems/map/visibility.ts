import type { ContentDb } from '../../../content/types.ts';
import type { GameState, MapPosition } from '../../core/state.ts';
import { coordinateKey, currentLocation, findCell, findMap } from './selectors.ts';

export type TileVisibility = 'unexplored' | 'explored' | 'visible';

// A안: 현재 칸·인접 네 칸은 일시 시야다. 영구 기록은 실제 밟은 칸만 사용한다.
export function getTileVisibility(state: GameState, target: MapPosition, content: ContentDb): TileVisibility {
  const map = findMap(content, target.mapId);
  if (!map || !findCell(map, target)) throw new Error('시야 조회 대상 칸이 없다');
  const memory = state.campaign.exploration[target.mapId];
  if (memory && memory.mapVersion !== map.version) throw new Error(`맵 버전이 일치하지 않는다: ${target.mapId}`);
  const active = currentLocation(state, content)?.position;
  if (active && active.mapId === target.mapId && active.floor === target.floor &&
    Math.abs(active.x - target.x) + Math.abs(active.y - target.y) <= 1) return 'visible';
  return memory?.visited[coordinateKey(target)] === true ? 'explored' : 'unexplored';
}
