import type { ContentDefinition } from './schemas.ts';
import type { ContentError } from './types.ts';
import { reachableCells } from './map-reachability.ts';

type LocatedDefinition = { file: string; index: number; definition: ContentDefinition };

// 배치 필드의 실제 ID를 검증한다. 제작자가 references에도 중복 기재할 필요는 없다.
export function validateMaps(definitions: readonly LocatedDefinition[]): ContentError[] {
  const errors: ContentError[] = [];
  const byId = new Map(definitions.map(({ definition }) => [definition.id, definition]));
  for (const { file, index, definition: map } of definitions) {
    if (!('kind' in map) || map.kind !== 'map') continue;
    const report = (path: string, code: string, message: string) => {
      errors.push({ file, path: `${index}.${path}`, code, message });
    };
    const floors = new Set<number>();
    map.floors.forEach((floor, floorIndex) => {
      const path = `floors.${floorIndex}`;
      const errorCount = errors.length;
      if (floors.has(floor.floor)) report(`${path}.floor`, 'duplicate_floor', `중복된 층: ${floor.floor}`);
      floors.add(floor.floor);
      const expectedCells = floor.width * floor.height;
      if (!Number.isSafeInteger(expectedCells)) {
        report(path, 'invalid_dimensions', '맵 칸 수가 안전한 정수 범위를 벗어난다');
      }
      const positions = new Set<string>();
      floor.cells.forEach((cell, cellIndex) => {
        const cellPath = `${path}.cells.${cellIndex}`;
        if (cell.x >= floor.width || cell.y >= floor.height) {
          report(cellPath, 'out_of_bounds', `층 범위 밖 좌표: (${cell.x}, ${cell.y})`);
        } else {
          const key = `${cell.x},${cell.y}`;
          if (positions.has(key)) report(cellPath, 'duplicate_position', `중복 좌표: (${cell.x}, ${cell.y})`);
          positions.add(key);
        }
        for (const [field, kind] of [['tileId', 'tile'], ['zoneId', 'zone']] as const) {
          const target = byId.get(cell[field]);
          if (!target) report(`${cellPath}.${field}`, 'missing_reference', `존재하지 않는 참조: ${cell[field]}`);
          else if (!('kind' in target) || target.kind !== kind) {
            report(`${cellPath}.${field}`, 'wrong_reference_kind', `${cell[field]}는 ${kind} 정의가 아니다`);
          }
        }
      });
      if (Number.isSafeInteger(expectedCells) && positions.size !== expectedCells) {
        report(`${path}.cells`, 'incomplete_floor', `모든 좌표를 한 번씩 배치해야 한다 (필요 ${expectedCells}, 배치 ${positions.size})`);
      }
      // 잘못된 치수/좌표/참조를 먼저 보고한 뒤에만 밀집 연결 검사를 수행한다.
      if (errors.length !== errorCount) return;
      const walkable = new Uint8Array(expectedCells);
      for (const cell of floor.cells) {
        const tile = byId.get(cell.tileId);
        if (tile?.kind === 'tile' && tile.walkable) walkable[cell.y * floor.width + cell.x] = 1;
      }
      const start = floor.floor === map.start.floor
        ? map.start.y * floor.width + map.start.x : walkable.indexOf(1);
      if ((map.start.x >= floor.width && floor.floor === map.start.floor) || !walkable[start]) return;
      const seen = reachableCells(floor.width, floor.height, walkable, start);
      let count = 0, first = -1;
      for (let i = 0; i < walkable.length; i++) if (walkable[i] && !seen[i]) { count++; if (first < 0) first = i; }
      if (count) report(`${path}.cells`, 'unreachable_cells', `도달할 수 없는 이동 가능 칸 ${count}개 (첫 좌표: ${first % floor.width}, ${Math.floor(first / floor.width)})`);
    });

    const floor = map.floors.find((candidate) => candidate.floor === map.start.floor);
    if (!floor) {
      report('start.floor', 'invalid_start', '시작 위치의 층이 없다');
      continue;
    }
    const cell = floor.cells.find((candidate) => candidate.x === map.start.x && candidate.y === map.start.y);
    if (map.start.x >= floor.width || map.start.y >= floor.height || !cell) {
      report('start', 'invalid_start', '시작 위치가 유효한 배치에 없다');
      continue;
    }
    const tile = byId.get(cell.tileId);
    if (tile && 'kind' in tile && tile.kind === 'tile' && !tile.walkable) {
      report('start', 'invalid_start', '시작 위치의 타일로 이동할 수 없다');
    }
  }
  return errors;
}
