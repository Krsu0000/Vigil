import { useState } from 'react';
import type { ContentDb } from '../content/types.ts';
import type { GameState } from '../engine/core/state.ts';
import type { InventoryAction } from '../engine/systems/inventory/actions.ts';
import { findItem, inventoryWeight } from '../engine/systems/inventory/selectors.ts';
import { movementCosts } from '../engine/systems/stamina/stamina.ts';
export function InventoryPanel({state,content,enabled,onAction,details=true}:{state:GameState;content:ContentDb;enabled:boolean;onAction:(action:InventoryAction)=>void;details?:boolean}){
  const inventory=state.character!.inventory;const ids=Object.keys(inventory.stacks);const [selected,setSelected]=useState<string>();
  const id=selected&&inventory.stacks[selected]?selected:ids[0];const item=id?findItem(content,id):undefined;
  const costs=movementCosts(state,content);
  return <section className="inventory-panel" aria-label="소지품">
    <h2 className="section-title">소지품 <span className="n" data-testid="inventory-weight">{inventoryWeight(inventory,content)} g</span></h2>
    <div className="inventory-grid">{Array.from({length:Math.max(12,ids.length)},(_,index)=>{
      const key=ids[index];const definition=key?findItem(content,key):undefined;
      return definition?<button type="button" className={key===id?'selected':''} key={key} aria-label={`${definition.name} ${inventory.stacks[key!]}개`} onClick={()=>setSelected(key)}>
        {definition.name.slice(0,2)}<span className="n">{inventory.stacks[key!]}</span></button>:<span className="inventory-empty-slot" key={`empty-${index}`}/>;
    })}</div>
    {item&&id?<div className="item-detail" data-item-id={id}><h3>{item.name} ×{inventory.stacks[id]}</h3><p>{item.description}</p>
      <small>{item.weightGrams} g / 개 {inventory.equipment.feet===id?'· 장착 중':''}</small>
      {item.category==='food'?<button disabled={!enabled||state.character!.stamina.current===state.character!.stamina.max} onClick={()=>onAction({type:'inventory/use',itemId:id})}>먹기</button>:
        <button disabled={!enabled} onClick={()=>onAction(inventory.equipment.feet===id?{type:'inventory/unequip',slot:'feet'}:{type:'inventory/equip',itemId:id})}>{inventory.equipment.feet===id?'해제':'장착'}</button>}
    </div>:<p className="empty-note">상자에서 물품을 얻으면 여기에 표시됩니다.</p>}
    {details&&<dl className="inventory-costs"><div><dt>이동 비용</dt><dd className="n" data-testid="inventory-move-cost">미탐사 {costs.unexplored} · 탐사 경로 {costs.explored} · 안전 {costs.safe}</dd></div></dl>}
  </section>;
}
