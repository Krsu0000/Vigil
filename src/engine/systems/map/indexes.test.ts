import { describe, expect, it } from 'vitest';
import { loadContent } from '../../../content/load.ts';
import { mapSources, rejectEffects } from '../../../content/test-fixtures.ts';
import { findMap, findCell } from './selectors.ts';
import { findFloor } from './indexes.ts';

describe('맵 좌표 인덱스', () => {
  it('칸 배열 순서와 층 번호에 의존하지 않고 찾으며 범위 밖/소수 좌표를 거부한다', () => {
    const sources = mapSources();
    const map = sources['maps/s1-test.json'][0]!;
    map.floors[0]!.cells.reverse();
    map.floors.push({ ...structuredClone(map.floors[0]!), floor: -3 });
    const loaded = loadContent(sources, rejectEffects);
    if (!loaded.ok) throw new Error('콘텐츠 오류');
    const definition = findMap(loaded.content, map.id)!;
    expect(findCell(definition, { floor: 0, x: 1, y: 1 })).toMatchObject({ x: 1, y: 1 });
    expect(findCell(definition, { floor: -3, x: 1, y: 1 })).toMatchObject({ x: 1, y: 1 });
    expect(findFloor(definition, -3)?.floor).toBe(-3);
    for (const p of [{ floor: 1, x: 1, y: 1 }, { floor: 0, x: -1, y: 0 },
      { floor: 0, x: 9, y: 0 }, { floor: 0, x: 1.5, y: 1 }, { floor: 0, x: 0, y: 7 }]) {
      expect(findCell(definition, p)).toBeUndefined();
    }
  });

  it('같은 맵 ID의 새 콘텐츠와 가변 제작 데이터에 이전 조회표를 사용하지 않는다', () => {
    const get = () => {
      const result = loadContent(mapSources(), rejectEffects);
      if (!result.ok) throw new Error('콘텐츠 오류');
      return findMap(result.content, 'map.s1_test')!;
    };
    const first = get(), second = get();
    const position = { floor: 0, x: 1, y: 1 };
    expect(findCell(first, position)).not.toBe(findCell(second, position));
    const mutable = structuredClone(first);
    expect(findCell(mutable, position)!.tileId).toBe('tile.floor');
    const changed = mutable.floors[0]!.cells.find(cell => cell.x === 1 && cell.y === 1)!;
    Object.assign(changed, { tileId: 'tile.wall' });
    expect(findCell(mutable, position)!.tileId).toBe('tile.wall');
  });
});
