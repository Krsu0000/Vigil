import manifest from './manifest.json' with { type: 'json' };
import timeRules from './time-rules.json' with { type: 'json' };
import tiles from './tiles.json' with { type: 'json' };
import zones from './zones.json' with { type: 'json' };
import maps from './maps/s1-test.json' with { type: 'json' };
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
  sources['manifest.json'].definitionFiles = [...manifest.definitionFiles];
  return {
    ...sources,
    'tiles.json': structuredClone(tiles),
    'zones.json': structuredClone(zones),
    'maps/s1-test.json': structuredClone(maps),
  };
}
