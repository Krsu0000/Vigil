import type { ActionHandlers } from '../../core/actions.ts';
import type { GameState, InventoryState } from '../../core/state.ts';
import { currentChest, findItem, inventoryWeight } from './selectors.ts';
import { itemEffectRegistry } from './effects.ts';

export type InventoryAction =
  | Readonly<{ type: 'inventory/open_chest'; chestId: string }>
  | Readonly<{ type: 'inventory/use'; itemId: string }>
  | Readonly<{ type: 'inventory/equip'; itemId: string }>
  | Readonly<{ type: 'inventory/unequip'; slot: 'feet' }>;
export type InventoryEvent =
  | Readonly<{ type: 'inventory/looted'; chestId: string }>
  | Readonly<{ type: 'inventory/used'; itemId: string; recovered: number }>
  | Readonly<{ type: 'inventory/equipped'; itemId: string }>
  | Readonly<{ type: 'inventory/unequipped'; itemId: string }>;

function addLoot(inventory: InventoryState, loot: readonly Readonly<{ itemId: string; quantity: number }>[]): InventoryState | null {
  const stacks = { ...inventory.stacks };
  for (const entry of loot) {
    const quantity = (stacks[entry.itemId] ?? 0) + entry.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
    stacks[entry.itemId] = quantity;
  }
  return { ...inventory, stacks };
}
export const inventoryHandlers: ActionHandlers<InventoryAction, InventoryEvent> = {
  'inventory/open_chest': {
    validate: (state, action, ctx) => {
      if (typeof action.chestId !== 'string') return 'invalid_action';
      if (!state.character?.position || state.expedition?.pendingAmbush) return 'condition_not_met';
      const chest = currentChest(state, ctx.content);
      if (!chest || chest.id !== action.chestId || state.campaign.openedChests[chest.id]) return 'condition_not_met';
      const inventory = addLoot(state.character.inventory, chest.loot);
      if (!inventory) return 'insufficient_resources';
      try { inventoryWeight(inventory, ctx.content); } catch { return 'insufficient_resources'; }
      return null;
    },
    execute: (state, action, ctx) => ({
      state: { ...state,
        campaign: { ...state.campaign, openedChests: { ...state.campaign.openedChests, [action.chestId]: true } },
        character: { ...state.character!, inventory: addLoot(state.character!.inventory, currentChest(state, ctx.content)!.loot)! },
      }, events: [{ type: 'inventory/looted', chestId: action.chestId }],
    }),
  },
  'inventory/use': {
    validate: (state, action, ctx) => {
      if (typeof action.itemId !== 'string') return 'invalid_action';
      if (!state.character?.position || state.expedition?.pendingAmbush) return 'condition_not_met';
      const item = findItem(ctx.content, action.itemId);
      if (!item || item.category !== 'food') return 'invalid_action';
      if (!state.character.inventory.stacks[item.id]) return 'insufficient_resources';
      if (item.effects.some(effect => !itemEffectRegistry.validate(effect).ok)) return 'invalid_action';
      return state.character.stamina.current === state.character.stamina.max ? 'condition_not_met' : null;
    },
    execute: (state, action, ctx, rng) => {
      const item = findItem(ctx.content, action.itemId)!;
      const stacks = { ...state.character!.inventory.stacks };
      const remaining = stacks[item.id]! - 1;
      if (remaining === 0) delete stacks[item.id]; else stacks[item.id] = remaining;
      let next: GameState = { ...state, character: { ...state.character!, inventory: { ...state.character!.inventory, stacks } } };
      for (const effect of item.effects) next = itemEffectRegistry.apply(next, effect, ctx, rng).state;
      return { state: next, events: [{ type: 'inventory/used', itemId: item.id,
        recovered: next.character!.stamina.current - state.character!.stamina.current,
      }] };
    },
  },
  'inventory/equip': {
    validate: (state, action, ctx) => {
      if (typeof action.itemId !== 'string') return 'invalid_action';
      if (!state.character?.position || state.expedition?.pendingAmbush) return 'condition_not_met';
      const item = findItem(ctx.content, action.itemId);
      if (!item || item.category !== 'equipment' || item.slot !== 'feet') return 'invalid_action';
      if (!state.character.inventory.stacks[item.id]) return 'insufficient_resources';
      return state.character.inventory.equipment.feet === item.id ? 'condition_not_met' : null;
    },
    execute: (state, action) => ({ state: { ...state, character: { ...state.character!, inventory: {
      ...state.character!.inventory, equipment: { feet: action.itemId },
    } } }, events: [{ type: 'inventory/equipped', itemId: action.itemId }] }),
  },
  'inventory/unequip': {
    validate: (state, action) => {
      if (action.slot !== 'feet') return 'invalid_action';
      return !state.character?.position || state.expedition?.pendingAmbush || !state.character.inventory.equipment.feet ? 'condition_not_met' : null;
    },
    execute: (state) => ({ state: { ...state, character: { ...state.character!, inventory: {
      ...state.character!.inventory, equipment: { feet: null },
    } } }, events: [{ type: 'inventory/unequipped', itemId: state.character!.inventory.equipment.feet! }] }),
  },
};
