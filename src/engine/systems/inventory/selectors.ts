import type { ItemDefinition, ChestDefinition } from '../../../content/schemas.ts';
import type { ContentDb, DeepReadonly } from '../../../content/types.ts';
import type { Modifier } from '../../core/modifiers.ts';
import type { GameState, InventoryState } from '../../core/state.ts';
import { currentLocation, findCell } from '../map/selectors.ts';

export function findItem(content: ContentDb, id: string): DeepReadonly<ItemDefinition> | undefined {
  const entry = content.byId[id];
  return entry && 'kind' in entry && entry.kind === 'item' ? entry : undefined;
}
export function findChest(content: ContentDb, id: string): DeepReadonly<ChestDefinition> | undefined {
  const entry = content.byId[id];
  return entry && 'kind' in entry && entry.kind === 'chest' ? entry : undefined;
}
export function currentChest(state: GameState, content: ContentDb) {
  const location = currentLocation(state, content);
  const id = location && findCell(location.map, location.position)?.chestId;
  return id ? findChest(content, id) : undefined;
}
export function inventoryWeight(inventory: InventoryState, content: ContentDb): number {
  let weight = 0;
  for (const [id, count] of Object.entries(inventory.stacks)) {
    const item = findItem(content, id);
    if (!item || !Number.isSafeInteger(count) || count <= 0) throw new Error(`유효하지 않은 소지품: ${id}`);
    weight += item.weightGrams * count;
    if (!Number.isSafeInteger(weight)) throw new Error('소지 중량이 안전한 정수 범위를 벗어났다');
  }
  return weight;
}
export function equipmentModifiers(state: GameState, content: ContentDb, target: string): Modifier[] {
  const id = state.character?.inventory.equipment.feet;
  if (!id) return [];
  const item = findItem(content, id);
  if (!item || item.category !== 'equipment' || item.slot !== 'feet' || !state.character!.inventory.stacks[id]) {
    throw new Error('장착 장비가 유효하지 않다');
  }
  return item.modifiers.filter(mod => mod.target === target).map(mod => ({ ...mod, source: id }));
}
export function validateInventoryState(state: GameState, content: ContentDb): void {
  for (const id of Object.keys(state.campaign.openedChests)) {
    if (!findChest(content, id)) throw new Error(`열린 상자 정의가 없다: ${id}`);
  }
  if (!state.character) return;
  inventoryWeight(state.character.inventory, content);
  equipmentModifiers(state, content, 'move_cost');
}
