// 개발 검사 전용 진입점. 제품 빌드의 index.html에서는 참조하지 않는다.
import { createRoot } from 'react-dom/client';
import { App } from '../../src/ui/App.tsx';
import { createNewGameStore } from '../../src/runtime/store.ts';
import { createGameLoop } from '../../src/runtime/loop.ts';
import { browserClock, browserScheduler } from '../../src/runtime/clock.ts';
import { loadContent } from '../../src/content/load.ts';
import { mapSources, rejectEffects } from '../../src/content/test-fixtures.ts';

const size = Math.max(9, Math.min(512, Number(new URLSearchParams(location.search).get('size')) || 128));
const sources = mapSources();
const map = sources['maps/s1-test.json'][0]!;
map.start = { floor: 0, x: 1, y: 1 };
map.floors = [{ floor: 0, width: size, height: size, cells: Array.from({ length: size * size }, (_, index) => ({
  x: index % size, y: Math.floor(index / size), zoneId: 'zone.camp',
  tileId: index === 1 || index === 70 * size + 70 ? 'tile.wall' : 'tile.floor',
})) }];
const loaded = loadContent(sources, rejectEffects);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
let mapNameReads = 0;
const originalMap = loaded.content.byId[map.id]!;
if (!('kind' in originalMap) || originalMap.kind !== 'map') throw new Error('맵 정의 오류');
const measuredMap = Object.freeze({ ...originalMap, get name() { mapNameReads += 1; return originalMap.name; } });
const content = Object.freeze({ ...loaded.content,
  definitions: Object.freeze(loaded.content.definitions.map(entry => entry.id === map.id ? measuredMap : entry)),
  byId: Object.freeze({ ...loaded.content.byId, [map.id]: measuredMap }),
});
const store = createNewGameStore(content, [1, 2, 3, 4], browserClock.wallNow);
const loop = createGameLoop(store, browserClock, browserScheduler);
Object.assign(window, { __fixture: { store, loop, mapNameReads: () => mapNameReads } });
createRoot(document.getElementById('root')!).render(<App store={store} loop={loop} />);
