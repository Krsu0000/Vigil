import { useMemo } from 'react';
import type { GameState } from '../engine/core/state.ts';
import { strings } from './strings/index.ts';
export function Vitals({state}:{state:GameState}){
  const character=state.character;
  const values=[{label:'체력',value:character?.health,test:'health'},{label:strings.stamina,value:character?.stamina,test:'stamina'},
    {label:'정신력',value:undefined,test:'sanity'},{label:'오염도',value:undefined,test:'corruption'}];
  return <div className="vitals">{values.map(({label,value,test})=><div className="vital" key={test}>
    <div><span>{label}</span><span className="n" data-testid={test}>{value?`${value.current} / ${value.max}`:'—'}</span></div>
    <div className="stat-track" aria-hidden="true"><i style={{width:value?`${100*value.current/value.max}%`:'0%'}} /></div>
  </div>)}</div>;
}
export function StatusPanel({state,onCharacter}:{state:GameState;onCharacter:()=>void}){
  const explored=useMemo(()=>Object.values(state.campaign.exploration).reduce((n,m)=>n+Object.keys(m.visited).length,0),[state.campaign.exploration]);
  return <aside className="character-column" aria-label="캐릭터 상태">
    <button className="identity" onClick={onCharacter}><span className="portrait">초상</span><span><strong>이름 없는 감시자</strong><small>회색감시자</small></span></button>
    <Vitals state={state}/>
    <section className="desktop-detail"><h2 className="section-title">상태</h2><p>{state.character?.activity==='resting'?'휴식 중':'대기 중'}</p>
      <h2 className="section-title">장비</h2><p>{state.character?.inventory.equipment.feet?'탐험용 장화':'장착한 장비 없음'}</p>
      <h2 className="section-title">이번 여정</h2><dl><div><dt>탐사</dt><dd className="n">{explored}칸</dd></div>
      <div><dt>게임 시간</dt><dd className="n" data-testid="game-time">{state.meta.gameTime}틱</dd></div></dl></section>
  </aside>;
}
