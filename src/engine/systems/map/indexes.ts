import type { MapDefinition } from '../../../content/schemas.ts';
import type { DeepReadonly } from '../../../content/types.ts';

type MapData = DeepReadonly<MapDefinition>;
type Floor = MapData['floors'][number];
type Cell = Floor['cells'][number];
type FloorIndex = Readonly<{ floor: Floor; cells: readonly Cell[] }>;

// JSON/세이브와 분리한 파생 조회표다. 같은 ID라도 콘텐츠 객체가 바뀌면 재사용하지 않는다.
// 고정된 제품 콘텐츠만 캐시한다. 가변 제작/테스트 데이터는 변경 전 인덱스를 재사용하지 않는다.
const indexes = new WeakMap<MapData, ReadonlyMap<number, FloorIndex>>();

function getIndex(map: MapData): ReadonlyMap<number, FloorIndex> {
  const cached = indexes.get(map);
  if (cached) return cached;
  const floors = new Map(map.floors.map(floor => {
    const cells: Cell[] = new Array<Cell>(floor.width * floor.height);
    for (const cell of floor.cells) cells[cell.y * floor.width + cell.x] = cell;
    return [floor.floor, { floor, cells }] as const;
  }));
  if (Object.isFrozen(map) && Object.isFrozen(map.floors) && map.floors.every(floor =>
    Object.isFrozen(floor) && Object.isFrozen(floor.cells) && floor.cells.every(Object.isFrozen))) indexes.set(map, floors);
  return floors;
}

export function findFloor(map: MapData, floor: number): Floor | undefined {
  return Object.isFrozen(map) ? getIndex(map).get(floor)?.floor : map.floors.find(entry => entry.floor === floor);
}

export function indexedCell(map: MapData, position: Readonly<{ floor: number; x: number; y: number }>): Cell | undefined {
  if (!Object.isFrozen(map)) {
    const floor = findFloor(map, position.floor);
    return floor?.cells.find(cell => cell.x === position.x && cell.y === position.y);
  }
  const index = getIndex(map).get(position.floor);
  if (!index || !Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y) ||
    position.x < 0 || position.y < 0 || position.x >= index.floor.width || position.y >= index.floor.height) return undefined;
  return index.cells[position.y * index.floor.width + position.x];
}
