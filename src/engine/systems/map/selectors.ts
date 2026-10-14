import type { MapDefinition, TileDefinition, ZoneDefinition } from '../../../content/schemas.ts';
import type { ContentDb, DeepReadonly } from '../../../content/types.ts';
import type { GameState, MapPosition } from '../../core/state.ts';

export function coordinateKey(position: Pick<MapPosition, 'floor' | 'x' | 'y'>): string {
  return `${position.floor}:${position.x}:${position.y}`;
}

export function findMap(content: ContentDb, mapId: string): DeepReadonly<MapDefinition> | undefined {
  const entry = content.byId[mapId];
  return entry && 'kind' in entry && entry.kind === 'map' ? entry : undefined;
}

export function findCell(map: DeepReadonly<MapDefinition>, position: Pick<MapPosition, 'floor' | 'x' | 'y'>) {
  const floor = map.floors.find((candidate) => candidate.floor === position.floor);
  if (!floor || position.x < 0 || position.y < 0 || position.x >= floor.width || position.y >= floor.height) return undefined;
  return floor.cells.find((cell) => cell.x === position.x && cell.y === position.y);
}

export function requireTile(content: ContentDb, tileId: string): DeepReadonly<TileDefinition> {
  const entry = content.byId[tileId];
  if (!entry || !('kind' in entry) || entry.kind !== 'tile') throw new Error(`타일 정의가 없다: ${tileId}`);
  return entry;
}

export function requireZone(content: ContentDb, zoneId: string): DeepReadonly<ZoneDefinition> {
  const entry = content.byId[zoneId];
  if (!entry || !('kind' in entry) || entry.kind !== 'zone') throw new Error(`구역 정의가 없다: ${zoneId}`);
  return entry;
}

// 위치·기록·콘텐츠 불일치는 벽 충돌 같은 일반 행동 거부로 숨기지 않는다.
export function currentLocation(state: GameState, content: ContentDb) {
  const position = state.character?.position;
  if (!position) return null;
  const map = findMap(content, position.mapId);
  if (!map) throw new Error(`현재 맵 정의가 없다: ${position.mapId}`);
  const memory = state.campaign.exploration[position.mapId];
  if (!memory || memory.mapVersion !== map.version) throw new Error(`맵 버전과 탐사 기록이 일치하지 않는다: ${position.mapId}`);
  const cell = findCell(map, position);
  if (!cell || !requireTile(content, cell.tileId).walkable || memory.visited[coordinateKey(position)] !== true) {
    throw new Error('현재 위치가 이동 가능한 탐사 칸이 아니다');
  }
  return { map, position, memory };
}

// 복원 후 연결부가 실제 콘텐츠와 대조한다. 구조 변환이나 위치 재배치는 하지 않는다.
export function validateMapState(state: GameState, content: ContentDb): void {
  for (const [mapId, memory] of Object.entries(state.campaign.exploration)) {
    const map = findMap(content, mapId);
    if (!map || memory.mapVersion !== map.version) throw new Error(`저장된 맵 버전을 사용할 수 없다: ${mapId}`);
    for (const key of Object.keys(memory.visited)) {
      const [floor, x, y] = key.split(':').map(Number);
      if (floor === undefined || x === undefined || y === undefined ||
        ![floor, x, y].every(Number.isSafeInteger) || coordinateKey({ floor, x, y }) !== key) {
        throw new Error(`잘못된 탐사 좌표: ${key}`);
      }
      const cell = findCell(map, { floor, x, y });
      if (!cell || !requireTile(content, cell.tileId).walkable) throw new Error(`탐사 기록의 칸을 사용할 수 없다: ${key}`);
    }
  }
  currentLocation(state, content);
}
