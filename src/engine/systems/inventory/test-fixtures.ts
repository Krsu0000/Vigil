import { loadContent } from '../../../content/load.ts';
import { inventorySources } from '../../../content/test-fixtures.ts';
import { createDispatcher } from '../../core/dispatch.ts';
import { mapHandlers } from '../map/actions.ts';
import type { MapAction, MapEvent } from '../map/actions.ts';
import { startedState } from '../map/test-fixtures.ts';
import { inventoryHandlers } from './actions.ts';
import type { InventoryAction, InventoryEvent } from './actions.ts';
import { itemEffectRegistry } from './effects.ts';

export function inventoryContext() {
  const loaded = loadContent(inventorySources(), itemEffectRegistry.validate);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  return { content: loaded.content, now: 1_700_000_000_000 };
}
export const inventoryDispatch = createDispatcher<InventoryAction | MapAction, InventoryEvent | MapEvent>({ ...inventoryHandlers, ...mapHandlers });
export function lootedState() {
  const ctx = inventoryContext(); let state = startedState(ctx);
  for (const action of [ { type: 'move/step', direction: 'east' }, { type: 'move/step', direction: 'east' },
    { type: 'inventory/open_chest', chestId: 'chest.camp_supply' } ] as const) {
    const result = inventoryDispatch(state, action, ctx);
    if (!result.ok) throw new Error('상자 획득 준비 실패');
    state = result.state;
  }
  return { ctx, state };
}
