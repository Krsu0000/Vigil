import type { ContentDb } from '../../../content/types.ts';
import type { MapDefinition } from '../../../content/schemas.ts';
import type { DeepReadonly } from '../../../content/types.ts';
import type { GameState, MapPosition, MapExploration } from '../../core/state.ts';
import { coordinateKey, currentLocation, findCell, findMap, requireTile } from './selectors.ts';

export type TileVisibility = 'unexplored' | 'explored' | 'visible';

const NEIGHBORS = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

// 밟은 칸의 인접 벽은 이미 본 벽이다. 별도 저장 기록 없이 길 기록에서 계산한다.
export function getTileVisibility(state: GameState, target: MapPosition, content: ContentDb): TileVisibility {
  const map = findMap(content, target.mapId);
  const cell = map && findCell(map, target);
  if (!map || !cell) throw new Error('시야 조회 대상 칸이 없다');
  const memory = state.campaign.exploration[target.mapId];
  if (memory && memory.mapVersion !== map.version) throw new Error(`맵 버전이 일치하지 않는다: ${target.mapId}`);
  return createVisibilityQuery(map, currentLocation(state, content)?.position ?? null, memory, content)(target);
}

// 화면의 한 번의 계산에서는 현재 위치와 탐사 기록을 재사용한다.
export function createVisibilityQuery(map: DeepReadonly<MapDefinition>, active: MapPosition | null,
  memory: MapExploration | undefined, content: ContentDb): (target: MapPosition) => TileVisibility {
  if (memory && memory.mapVersion !== map.version) throw new Error(`맵 버전이 일치하지 않는다: ${map.id}`);
  return target => {
    const cell = target.mapId === map.id && findCell(map, target);
    if (!cell) throw new Error('시야 조회 대상 칸이 없다');
    if (active && active.mapId === target.mapId && active.floor === target.floor &&
      Math.abs(active.x - target.x) + Math.abs(active.y - target.y) <= 1) return 'visible';
    if (memory?.visited[coordinateKey(target)] === true) return 'explored';
    if (memory && !requireTile(content, cell.tileId).walkable && NEIGHBORS.some(([dx, dy]) =>
      memory.visited[coordinateKey({ floor: target.floor, x: target.x + dx, y: target.y + dy })] === true,
    )) return 'explored';
    return 'unexplored';
  };
}
