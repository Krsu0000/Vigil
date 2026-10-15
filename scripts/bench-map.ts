// npm run bench:map — 시간값은 관측용이며 기기 성능에 의존하는 통과 기준으로 쓰지 않는다.
import { performance } from 'node:perf_hooks';
import { loadContent } from '../src/content/load.ts';
import { mapSources, rejectEffects } from '../src/content/test-fixtures.ts';
import { findCell, findMap, validateMapState } from '../src/engine/systems/map/selectors.ts';
import { createVisibilityQuery } from '../src/engine/systems/map/visibility.ts';
import { createNewGameStore } from '../src/runtime/store.ts';
import { mapWindow } from '../src/ui/map-window.ts';

for (const size of [32, 128, 512]) {
  const sources = mapSources(), definition = sources['maps/s1-test.json'][0]!;
  definition.floors = [{ floor: 0, width: size, height: size, cells: Array.from({ length: size * size }, (_, i) => ({
    x: i % size, y: Math.floor(i / size), tileId: 'tile.floor', zoneId: 'zone.camp',
  })) }];
  const start = performance.now();
  const loaded = loadContent(sources, rejectEffects);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  const loadMs = performance.now() - start;
  const map = findMap(loaded.content, definition.id)!;
  const indexAt = performance.now();
  findCell(map, map.start);
  const indexMs = performance.now() - indexAt;
  const lookupAt = performance.now();
  for (let i = 0; i < 100_000; i += 1) findCell(map, { floor: 0, x: i % size, y: Math.floor(i / size) % size });
  const lookupMs = performance.now() - lookupAt;
  const state = createNewGameStore(loaded.content, [1, 2, 3, 4], () => 1_700_000_000_000).getSnapshot();
  const memory = { mapVersion: map.version, visited: Object.fromEntries(map.floors[0]!.cells.map(cell => [`0:${cell.x}:${cell.y}`, true as const])) };
  const explored = { ...state, campaign: { exploration: { [map.id]: memory } } };
  const validateAt = performance.now(); validateMapState(explored, loaded.content);
  const validateMs = performance.now() - validateAt;
  const visible = createVisibilityQuery(map, state.character!.position, memory, loaded.content);
  const bounds = mapWindow(size, size, 100, 100, 600, 284, 24);
  const viewAt = performance.now();
  for (let repeat = 0; repeat < 100; repeat += 1) for (let y = bounds.y0; y < bounds.y1; y += 1) for (let x = bounds.x0; x < bounds.x1; x += 1) visible({ mapId: map.id, floor: 0, x, y });
  console.log(JSON.stringify({ size, cells: size * size, loadMs: +loadMs.toFixed(2), indexMs: +indexMs.toFixed(2),
    lookups100kMs: +lookupMs.toFixed(2), validateAllVisitedMs: +validateMs.toFixed(2),
    viewportCells: (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0), viewportMs: +((performance.now() - viewAt) / 100).toFixed(3) }));
}
