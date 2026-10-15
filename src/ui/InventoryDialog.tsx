import { useEffect, useRef } from 'react';
import type { ContentDb } from '../content/types.ts';
import type { GameState } from '../engine/core/state.ts';
import type { InventoryAction } from '../engine/systems/inventory/actions.ts';
import { findItem, inventoryWeight } from '../engine/systems/inventory/selectors.ts';
import { movementCosts } from '../engine/systems/stamina/stamina.ts';
import { strings } from './strings/index.ts';

export function InventoryDialog({ state, content, enabled, onAction, onClose, message }: {
  state: GameState; content: ContentDb; enabled: boolean; onAction: (action: InventoryAction) => void;
  onClose: () => void; message: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  const inventory = state.character!.inventory;
  const costs = movementCosts(state, content);
  return <dialog ref={ref} className="settings-dialog inventory-dialog" aria-labelledby="inventory-heading"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="inventory-heading"><h2 id="inventory-heading">{strings.inventory}</h2>
      <button type="button" onClick={onClose} autoFocus>{strings.closeInventory}</button></div>
    <p className="time-note">{enabled ? strings.inventoryTimeRuns : strings.inventoryBlocked}</p>
    <dl className="inventory-summary">
      <div><dt>{strings.stamina}</dt><dd data-testid="inventory-stamina">{state.character!.stamina.current} / {state.character!.stamina.max}</dd></div>
      <div><dt>{strings.carryWeight}</dt><dd data-testid="inventory-weight">{inventoryWeight(inventory, content)} g</dd></div>
      <div><dt>{strings.moveCost}</dt><dd data-testid="inventory-move-cost">{strings.newRoute} {costs.unexplored} · {strings.knownRoute} {costs.explored} · {strings.safe} {costs.safe}</dd></div>
    </dl>
    <p>{strings.weightDisplayOnly}</p>
    {Object.keys(inventory.stacks).length === 0 ? <p>{strings.inventoryEmpty}</p> :
      <ul className="inventory-list">{Object.entries(inventory.stacks).map(([id, count]) => {
        const item = findItem(content, id)!;
        const equipped = inventory.equipment.feet === id;
        return <li className="inventory-item" key={id} data-item-id={id}>
          <div><h3>{item.name} <span>×{count}</span> {equipped && <small>{strings.equipped}</small>}</h3>
            <p>{item.description}</p><p>{item.weightGrams} g{strings.perItem} · {item.category === 'food' ? strings.foodCategory : strings.equipmentCategory}</p></div>
          {item.category === 'food' ? <button type="button" disabled={!enabled || state.character!.stamina.current === state.character!.stamina.max}
            onClick={() => onAction({ type: 'inventory/use', itemId: id })}>{strings.eat}</button> :
            <button type="button" disabled={!enabled} onClick={() => onAction(equipped
              ? { type: 'inventory/unequip', slot: 'feet' } : { type: 'inventory/equip', itemId: id })}>{equipped ? strings.unequip : strings.equip}</button>}
        </li>;
      })}</ul>}
    <p role="status">{message}</p>
  </dialog>;
}
