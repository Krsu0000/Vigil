import { useEffect, useRef, useState } from 'react';
import type { ContentDb } from '../content/types.ts';
import type { GameState } from '../engine/core/state.ts';
import type { CombatAction } from '../engine/systems/combat/actions.ts';
import { livingFront, requireMonster, monsterBehavior } from '../engine/systems/combat/selectors.ts';
import {groupedIntent} from '../engine/systems/combat/tactics.ts';
import { findItem } from '../engine/systems/inventory/selectors.ts';
import { Vitals } from './StatusPanel.tsx';
export function CombatPanel({state,content,enabled,onAction}:{state:GameState;content:ContentDb;enabled:boolean;onAction:(action:CombatAction)=>void}){
  const combat=state.expedition!.combat!;const front=livingFront(combat.enemies);const [selected,setSelected]=useState<string>();
  const target=front.find(e=>e.id===selected)??front[0];const [itemsOpen,setItemsOpen]=useState(false);const rules=content.timeRules.combat;
  const panel=useRef<HTMLElement>(null);const history=useRef<HTMLDivElement>(null);
  useEffect(()=>{panel.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{if(history.current)history.current.scrollTop=history.current.scrollHeight;},[combat.history.length]);
  const active=combat.status==='active';const monster=target?requireMonster(content,target.monsterId):undefined;
  return <section ref={panel} tabIndex={-1} className="combat-panel" aria-label="전투" data-testid="combat-panel">
    <div className="sheet-handle"/><header><h2>전투</h2><span className="n">{active?combat.turn:combat.actions.length}턴</span></header>
    {monster&&target&&<><div className="enemy-header"><span className="enemy-portrait">{monster.glyph}</span><div><h3>{monster.name}<small>{monster.level}레벨</small></h3>
      <div className="enemy-health"><span>체력</span><span className="n" data-testid="enemy-health">{target.health} / {target.maxHealth}</span></div><div className="stat-track"><i style={{width:`${100*target.health/target.maxHealth}%`}}/></div>
      <p>{monster.description}</p><p>의도 — {monster.groups?groupedIntent(monster,target):monsterBehavior(monster,combat.turn)?.text??monster.intent} · 기본 피해 <span className="n">{monster.damageMin}~{monster.damageMax}</span></p></div></div>
      <div className="enemy-roster">{combat.enemies.filter(e=>e.health>0).map(enemy=><button key={enemy.id} className={target.id===enemy.id?'selected':''} disabled={!active||!front.includes(enemy)} onClick={()=>setSelected(enemy.id)}>
        <span>{enemy.row==='front'?'전열':'후열'} · {requireMonster(content,enemy.monsterId).name}</span><span className="n">{enemy.health}/{enemy.maxHealth}</span></button>)}</div></>}
    <div ref={history} className="combat-history" role="log" aria-label="전투 기록">{combat.history.length?combat.history.map((line,index)=><p key={index}><span className="n">{line.turn}턴</span>{line.text}</p>):<p>적이 자세를 낮춘다. 어떻게 하겠는가?</p>}</div>
    {active&&<div className="action-preview">공격 → {monster?.name} <span className="n">피해 {rules.attackMin}~{rules.attackMax} · 명중 {Math.round(rules.hitChance*100)}%</span></div>}
    <Vitals state={state}/>
    {active?<><div className="combat-primary"><button disabled={!enabled||!target} onClick={()=>onAction({type:'combat/act',choice:'attack',targetId:target!.id})}>공격</button>
      <button disabled={!enabled} onClick={()=>onAction({type:'combat/act',choice:'defend'})}>방어</button>
      <button title="강타" disabled={!enabled||!target||state.character!.stamina.current<rules.skillCost} onClick={()=>onAction({type:'combat/act',choice:'skill',targetId:target!.id})}>기술</button></div>
      <div className="combat-secondary"><button disabled={!enabled} onClick={()=>setItemsOpen(!itemsOpen)}>아이템</button><button disabled={!enabled} onClick={()=>onAction({type:'combat/act',choice:'escape'})}>도주 {Math.round(rules.escapeChance*100)}%</button></div>
      {itemsOpen&&<div className="combat-items">{Object.entries(state.character!.inventory.stacks).filter(([id])=>findItem(content,id)?.category==='food').map(([id,count])=><button key={id} disabled={!enabled||state.character!.stamina.current===state.character!.stamina.max} onClick={()=>{onAction({type:'combat/act',choice:'item',itemId:id});setItemsOpen(false);}}>{findItem(content,id)!.name} ×{count}</button>)}<p>아이템을 사용하면 한 턴이 진행됩니다.</p></div>}
    </>:<div className="combat-result" role="status"><h3>{combat.status==='victory'?'승리':combat.status==='escaped'?'도주 성공':'감시자의 여정이 끝났습니다'}</h3>
      {combat.loot.map((entry,index)=><p key={index}>{findItem(content,entry.itemId)!.name} ×{entry.quantity}</p>)}
      {combat.status!=='defeat'?<button onClick={()=>onAction({type:'combat/close'})}>계속 탐험</button>:<p>사망과 새 감시자의 계승은 다음 단계에서 연결합니다.</p>}</div>}
  </section>;
}
