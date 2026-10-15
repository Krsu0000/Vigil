import { loadContent } from '../content/load.ts';
import type { ContentSources } from '../content/load.ts';
import type { ContentLoadResult } from '../content/types.ts';
import { itemEffectRegistry } from '../engine/systems/inventory/effects.ts';

const browserSources: ContentSources = Object.fromEntries(
  Object.entries(import.meta.glob('../content/**/*.json', { eager: true, import: 'default' }))
    .map(([path, data]) => [path.slice('../content/'.length), data]),
);

// 로더와 엔진의 효과 검증을 연결한다. 상태 보관은 store.ts가 맡고 시간 처리는 후속 단계다.
export function loadGameContent(sources: ContentSources = browserSources): ContentLoadResult {
  return loadContent(sources, itemEffectRegistry.validate);
}
