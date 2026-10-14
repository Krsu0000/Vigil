import { describe, expect, it, vi } from 'vitest';
import { loadContent } from './load.ts';
import { mapSources, rejectEffects, testSources } from './test-fixtures.ts';
import { MapDefinitionSchema, TileDefinitionSchema, ZoneDefinitionSchema } from './schemas.ts';
import type { ContentLoadResult } from './types.ts';

type MapSources = ReturnType<typeof mapSources>;

function expectError(result: ContentLoadResult, code: string, path?: string): void {
  expect(result.ok).toBe(false);
  expect('content' in result).toBe(false);
  if (result.ok) throw new Error('잘못된 맵이 통과함');
  expect(result.errors).toContainEqual(expect.objectContaining({ code, ...(path ? { path } : {}) }));
}

describe('맵·타일·구역 콘텐츠 계약', () => {
  it('실제 수동 맵과 타일·구역을 ID로 조회하고 모든 칸을 보존한다', () => {
    const result = loadContent(mapSources(), rejectEffects);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const map = MapDefinitionSchema.parse(result.content.byId['map.s1_test']);
    expect(map.version).toBe(1);
    expect(map.start).toEqual({ floor: 0, x: 1, y: 1 });
    expect(map.floors[0]).toMatchObject({ width: 9, height: 7 });
    expect(map.floors[0]!.cells).toHaveLength(63);
    expect(result.content.definitions).toHaveLength(5);
    expect(TileDefinitionSchema.parse(result.content.byId['tile.wall']).walkable).toBe(false);
    expect(TileDefinitionSchema.parse(result.content.byId['tile.floor']).walkable).toBe(true);
    expect(ZoneDefinitionSchema.parse(result.content.byId['zone.camp']).safety).toBe('safe');
    expect(ZoneDefinitionSchema.parse(result.content.byId['zone.ruins']).safety).toBe('danger');
  });

  it('테스트 맵은 시작점에서 안전·위험 구역 모두 걸어서 도달할 수 있다', () => {
    const result = loadContent(mapSources(), rejectEffects);
    if (!result.ok) throw new Error('테스트 맵 로딩 실패');
    const map = MapDefinitionSchema.parse(result.content.byId['map.s1_test']);
    const floor = map.floors[0]!;
    const cells = new Map(floor.cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
    const queue = [map.start];
    const visited = new Set<string>();
    const reachedZones = new Set<string>();
    for (let index = 0; index < queue.length; index += 1) {
      const point = queue[index]!;
      const key = `${point.x},${point.y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const cell = cells.get(key);
      if (!cell || !TileDefinitionSchema.parse(result.content.byId[cell.tileId]).walkable) continue;
      reachedZones.add(cell.zoneId);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        queue.push({ floor: 0, x: point.x + dx!, y: point.y + dy! });
      }
    }
    expect(reachedZones).toEqual(new Set(['zone.camp', 'zone.ruins']));
    expect(visited.has('7,5')).toBe(true);
  });

  it('파일·칸 배열의 순서와 관계없이 실제 좌표와 참조를 검증한다', () => {
    const sources = mapSources();
    sources['manifest.json'].definitionFiles.reverse();
    sources['maps/s1-test.json'][0]!.floors[0]!.cells.reverse();
    sources['tiles.json'].reverse();
    expect(loadContent(sources, rejectEffects).ok).toBe(true);
  });

  it('다른 맵과 다른 층에서 같은 x·y 좌표를 사용할 수 있다', () => {
    const sources = mapSources();
    const map = sources['maps/s1-test.json'][0]!;
    const basement = structuredClone(map.floors[0]!);
    basement.floor = -1;
    map.floors.push(basement);
    map.start.floor = -1;
    sources['maps/s1-test.json'].push({ ...structuredClone(map), id: 'map.other' });
    expect(loadContent(sources, rejectEffects).ok).toBe(true);
  });

  it('시야 차단과 이동 가능 여부는 서로 독립적인 타일 속성이다', () => {
    const sources = mapSources();
    const wall = sources['tiles.json'][0]!;
    wall.blocksSight = false;
    expect(loadContent(sources, rejectEffects).ok).toBe(true);
    expect(wall.walkable).toBe(false);
  });

  it('맵과 중첩 칸은 입력과 분리하고 읽기 전용으로 고정한다', () => {
    const sources = mapSources();
    const original = structuredClone(sources);
    const result = loadContent(sources, rejectEffects);
    if (!result.ok) throw new Error('테스트 맵 로딩 실패');
    const loaded = result.content.byId['map.s1_test'];
    if (!loaded || !('kind' in loaded) || loaded.kind !== 'map') throw new Error('맵 타입 불일치');
    expect(sources).toEqual(original);
    expect(Object.isFrozen(loaded.start)).toBe(true);
    expect(Object.isFrozen(loaded.floors[0]!.cells[0])).toBe(true);
    sources['maps/s1-test.json'][0]!.start.x = 2;
    sources['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.tileId = 'tile.missing';
    expect(loaded.start.x).toBe(1);
    expect(loaded.floors[0]!.cells[0]!.tileId).toBe('tile.wall');
    expect(Object.isFrozen(sources['maps/s1-test.json'][0]!.start)).toBe(false);
  });

  it('맵·타일·구역 효과도 기존 검증 경로를 사용하며 로딩 중 실행하지 않는다', () => {
    const sources = mapSources();
    Object.assign(sources['maps/s1-test.json'][0]!, { effects: [{ type: 'test/missing', params: {} }] });
    const validate = vi.fn(rejectEffects);
    expectError(loadContent(sources, validate), 'unknown_effect', '0.effects.0');
    expect(validate).toHaveBeenCalledOnce();
  });

  type InvalidCase = { name: string; change: (sources: MapSources) => void; code: string; path?: string };
  const invalid: InvalidCase[] = [
    { name: '미등록 타일', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.tileId = 'tile.missing'; }, code: 'missing_reference', path: '0.floors.0.cells.0.tileId' },
    { name: '미등록 구역', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.zoneId = 'zone.missing'; }, code: 'missing_reference', path: '0.floors.0.cells.0.zoneId' },
    { name: '타일 필드의 다른 종류 ID', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.tileId = 'zone.camp'; }, code: 'invalid_schema', path: '0.floors.0.cells.0.tileId' },
    { name: '중복 좌표', change: (s) => { const cells = s['maps/s1-test.json'][0]!.floors[0]!.cells; cells[1] = { ...cells[0]! }; }, code: 'duplicate_position', path: '0.floors.0.cells.1' },
    { name: '중복 층', change: (s) => { const floors = s['maps/s1-test.json'][0]!.floors; floors.push(structuredClone(floors[0]!)); }, code: 'duplicate_floor', path: '0.floors.1.floor' },
    { name: '누락된 배치 칸', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells.pop(); }, code: 'incomplete_floor', path: '0.floors.0.cells' },
    { name: '범위 밖 x', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.x = 9; }, code: 'out_of_bounds', path: '0.floors.0.cells.0' },
    { name: '범위 밖 y', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.y = 7; }, code: 'out_of_bounds' },
    { name: '벽 위 시작점', change: (s) => { s['maps/s1-test.json'][0]!.start = { floor: 0, x: 0, y: 1 }; }, code: 'invalid_start', path: '0.start' },
    { name: '없는 시작 층', change: (s) => { s['maps/s1-test.json'][0]!.start.floor = 2; }, code: 'invalid_start', path: '0.start.floor' },
    { name: '범위 밖 시작점', change: (s) => { s['maps/s1-test.json'][0]!.start.x = 9; }, code: 'invalid_start' },
    { name: '배치가 없는 시작점', change: (s) => { const map = s['maps/s1-test.json'][0]!; map.floors[0]!.cells = map.floors[0]!.cells.filter((c) => c.x !== 1 || c.y !== 1); }, code: 'invalid_start' },
    { name: '빈 층 목록', change: (s) => { s['maps/s1-test.json'][0]!.floors = []; }, code: 'invalid_schema' },
    { name: '빈 칸 목록', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells = []; }, code: 'invalid_schema' },
    { name: '음수 좌표', change: (s) => { s['maps/s1-test.json'][0]!.start.x = -1; }, code: 'invalid_schema' },
    { name: '소수 좌표', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.cells[0]!.x = 0.5; }, code: 'invalid_schema' },
    { name: '버전 0', change: (s) => { s['maps/s1-test.json'][0]!.version = 0; }, code: 'invalid_schema' },
    { name: '너비 0', change: (s) => { s['maps/s1-test.json'][0]!.floors[0]!.width = 0; }, code: 'invalid_schema' },
    { name: '빈 표시 기호', change: (s) => { s['tiles.json'][0]!.glyph = ' '; }, code: 'invalid_schema', path: '0.glyph' },
    { name: '알 수 없는 안전 구분', change: (s) => { s['zones.json'][0]!.safety = 'unknown'; }, code: 'invalid_schema' },
    { name: '타일 ID 종류 불일치', change: (s) => { s['tiles.json'][0]!.id = 'zone.wall'; }, code: 'invalid_schema' },
    { name: '정밀도를 잃는 맵 크기', change: (s) => { const f = s['maps/s1-test.json'][0]!.floors[0]!; f.width = Number.MAX_SAFE_INTEGER; f.height = 2; }, code: 'invalid_dimensions' },
  ];

  it.each(invalid)('$name은 파일·위치와 함께 거부하고 부분 DB를 반환하지 않는다', ({ change, code, path }) => {
    const sources = mapSources();
    change(sources);
    expectError(loadContent(sources, rejectEffects), code, path);
  });

  it.each(['map.fake', 'tile.fake', 'zone.fake'])('구체 정의 %s를 공통 외피만으로 등록해 검증을 우회할 수 없다', (id) => {
    expectError(loadContent(testSources([{ id }]), rejectEffects), 'invalid_schema');
  });

  it('층·칸·타일·구역의 미정의 필드를 제거하지 않고 거부한다', () => {
    for (const path of ['floor', 'cell', 'tile', 'zone']) {
      const sources = mapSources();
      const target = path === 'floor' ? sources['maps/s1-test.json'][0]!.floors[0]!
        : path === 'cell' ? sources['maps/s1-test.json'][0]!.floors[0]!.cells[0]!
        : path === 'tile' ? sources['tiles.json'][0]! : sources['zones.json'][0]!;
      Object.assign(target, { unknown: true });
      expectError(loadContent(sources, rejectEffects), 'invalid_schema');
    }
  });
});
