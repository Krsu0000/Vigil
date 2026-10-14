import { loadContent } from '../../../content/load.ts';
import { mapSources, rejectEffects } from '../../../content/test-fixtures.ts';
import { createCampaign } from '../../core/campaign.ts';
import type { EngineContext } from '../../core/context.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import type { GameState } from '../../core/state.ts';
import { mapHandlers } from './actions.ts';
import type { Direction, MapAction, MapEvent } from './actions.ts';

export const mapDispatch = createDispatcher<MapAction, MapEvent>(mapHandlers);

export function mapContext(sources = mapSources()): EngineContext {
  const loaded = loadContent(sources, rejectEffects);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  return { content: loaded.content, now: 1_700_000_000_000 };
}

export function startedState(ctx = mapContext()): GameState {
  const empty = createCampaign(ctx.content, [1, 2, 3, 4], ctx.now);
  const result = mapDispatch(empty, { type: 'map/start', mapId: 'map.s1_test' }, ctx);
  if (!result.ok) throw new Error('테스트 맵 배치 실패');
  return result.state;
}

export function walk(state: GameState, directions: readonly Direction[], ctx = mapContext()): GameState {
  let current = state;
  for (const direction of directions) {
    const result = mapDispatch(current, { type: 'move/step', direction }, ctx);
    if (!result.ok) throw new Error(`테스트 이동 실패: ${direction}`);
    current = result.state;
  }
  return current;
}
