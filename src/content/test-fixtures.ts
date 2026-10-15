import manifest from './manifest.json' with { type: 'json' };
import timeRules from './time-rules.json' with { type: 'json' };
import tiles from './tiles.json' with { type: 'json' };
import zones from './zones.json' with { type: 'json' };
import maps from './maps/s1-test.json' with { type: 'json' };
import items from './items.json' with { type: 'json' };
import chests from './chests.json' with { type: 'json' };
import type { EffectValidator } from './types.ts';

export const rejectEffects: EffectValidator = () => ({
  ok: false, reason: 'unknown_effect', message: '등록되지 않은 테스트 효과',
});

export function testSources(definitions?: unknown[]) {
  const manifestData = { ...structuredClone(manifest), definitionFiles: [] as string[] };
  const sources: {
    'manifest.json': typeof manifestData;
    'time-rules.json': typeof timeRules;
    [file: string]: unknown;
  } = { 'manifest.json': manifestData, 'time-rules.json': structuredClone(timeRules) };
  if (definitions !== undefined) {
    manifestData.definitionFiles.push('definitions.json');
    sources['definitions.json'] = definitions;
  }
  return sources;
}

export function mapSources() {
  const sources = testSources();
  sources['manifest.json'].definitionFiles = ['tiles.json', 'zones.json', 'maps/s1-test.json'];
  const testMaps = structuredClone(maps);
  for (const map of testMaps) for (const floor of map.floors) for (const cell of floor.cells) delete (cell as { chestId?: string }).chestId;
  return {
    ...sources,
    'tiles.json': structuredClone(tiles),
    'zones.json': structuredClone(zones),
    'maps/s1-test.json': testMaps,
  };
}

// S4 회귀는 제품 상자 배치와 효과를 포함한 실제 콘텐츠를 사용한다.
export function inventorySources() {
  const sources = mapSources();
  sources['manifest.json'].definitionFiles = [...manifest.definitionFiles];
  return { ...sources, 'maps/s1-test.json': structuredClone(maps),
    'items.json': structuredClone(items), 'chests.json': structuredClone(chests) };
}
