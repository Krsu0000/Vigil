import type { ContentDb } from '../../../content/types.ts';
import type { MapDefinition } from '../../../content/schemas.ts';
import type { DeepReadonly } from '../../../content/types.ts';
import type { GameState, MapPosition, MapExploration } from '../../core/state.ts';
import { coordinateKey, currentLocation, findCell, findMap, requireTile } from './selectors.ts';

export type TileVisibility = 'unexplored' | 'explored' | 'visible';


// 밟은 바닥은 남기고, 확인한 길 주위의 실제 벽을 1칸 두께 경계로 표시한다.
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
  const inSight = (target: MapPosition) => !!active && active.mapId === target.mapId && active.floor === target.floor &&
    Math.abs(active.x - target.x) + Math.abs(active.y - target.y) <= 1;
  return target => {
    const cell = target.mapId === map.id && findCell(map, target);
    if (!cell) throw new Error('시야 조회 대상 칸이 없다');
    if (inSight(target)) return 'visible';
    if (memory?.visited[coordinateKey(target)] === true) return 'explored';
    if (!requireTile(content, cell.tileId).walkable) {
      // 대각선도 포함해 모서리를 닫는다. 실제 벽만 표시하며 벽 뒤의 바닥은 열지 않는다.
      // 한 칸당 인접 8칸만 조회하므로 전체 지도/탐사 기록을 순회하지 않는다.
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = { ...target, x: target.x + dx, y: target.y + dy };
        const neighborCell = findCell(map, neighbor);
        if (neighborCell && requireTile(content, neighborCell.tileId).walkable &&
          (memory?.visited[coordinateKey(neighbor)] === true || inSight(neighbor))) return 'explored';
      }
    }
    return 'unexplored';
  };
}
