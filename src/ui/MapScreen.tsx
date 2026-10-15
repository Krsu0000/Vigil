import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RecentRecord } from '../engine/core/state.ts';
import type { AutoSave } from '../runtime/auto-save.ts';
import type { GameStore } from '../runtime/store.ts';
import { initialMapId } from '../runtime/store.ts';
import { bindInteractionKeys, bindMovementKeys } from '../runtime/input.ts';
import { browserClock, browserScheduler } from '../runtime/clock.ts';
import { createGameLoop } from '../runtime/loop.ts';
import type { Direction } from '../engine/systems/map/actions.ts';
import type { InventoryAction } from '../engine/systems/inventory/actions.ts';
import type { CombatAction } from '../engine/systems/combat/actions.ts';
import { currentLocation, findCell, getReturnDestination, requireZone } from '../engine/systems/map/selectors.ts';
import { findFloor } from '../engine/systems/map/indexes.ts';
import { currentChest, findItem } from '../engine/systems/inventory/selectors.ts';
import { findEncounter } from '../engine/systems/combat/selectors.ts';
import { MapView } from './MapView.tsx';
import type { MapViewport } from './MapView.tsx';
import { MiniMap } from './MiniMap.tsx';
import { StatusPanel, Vitals } from './StatusPanel.tsx';
import { InventoryPanel } from './InventoryPanel.tsx';
import { CombatPanel } from './CombatPanel.tsx';
import { GameDialog } from './GameDialog.tsx';
import { SettingsDialog } from './SettingsDialog.tsx';
import { SaveStatus } from './SaveStatus.tsx';
import { formatRecordTime } from './record-time.ts';
import { strings } from './strings/index.ts';

const compactQuery='(max-width: 760px), (max-width: 1024px) and (max-height: 500px)';
const emptyRecords:readonly RecentRecord[]=[];
type Tab='explore'|'inventory'|'character'|'base'|'more';
const tabs:readonly {id:Tab;label:string;glyph:string}[]=[{id:'explore',label:'탐험',glyph:'♘'},{id:'inventory',label:'소지품',glyph:'▤'},{id:'character',label:'캐릭터',glyph:'◐'},{id:'base',label:'거점',glyph:'⌂'},{id:'more',label:'더보기',glyph:'⋯'}];
const controls:readonly {direction:Direction;glyph:string}[]=[{direction:'north',glyph:'▲'},{direction:'west',glyph:'◀'},{direction:'south',glyph:'▼'},{direction:'east',glyph:'▶'}];
export function MapScreen({store,loop:suppliedLoop,persistent=false,autoSave}:{store:GameStore;loop?:ReturnType<typeof createGameLoop>;persistent?:boolean;autoSave?:AutoSave}){
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  const loop=useMemo(()=>suppliedLoop??createGameLoop(store,browserClock,browserScheduler),[store,suppliedLoop]);
  const session=useSyncExternalStore(loop.subscribe,loop.getSnapshot,loop.getSnapshot);
  useEffect(()=>{loop.start();return()=>loop.stop();},[loop]);
  const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.matchMedia(compactQuery).matches);
  useEffect(()=>{const query=window.matchMedia(compactQuery);const update=()=>setCompact(query.matches);query.addEventListener('change',update);update();return()=>query.removeEventListener('change',update);},[]);
  const [mapViewport,setMapViewport]=useState<MapViewport>();
  const reportViewport=useCallback((value:MapViewport)=>setMapViewport(previous=>previous&&Object.keys(value).every(key=>previous[key as keyof MapViewport]===value[key as keyof MapViewport])?previous:value),[]);
  const [tab,setTab]=useState<Tab>('explore');const [characterTab,setCharacterTab]=useState('캐릭터');
  const [fullMap,setFullMap]=useState(false);const [ambushOpen,setAmbushOpen]=useState(false);
  const pending=state.expedition?.pendingAmbush;const combat=state.expedition?.combat;
  const [lootedChestId,setLootedChestId]=useState<string|null>(null);
  useEffect(()=>setLootedChestId(null),[state.character?.position]);
  const [message,setMessage]=useState<string>(strings.moveHelp);
  const logs=state.campaign.recentRecords??emptyRecords;
  const recordView=useRef<HTMLElement>(null);
  useEffect(()=>{if(recordView.current)recordView.current.scrollTop=recordView.current.scrollHeight;},[logs]);
  const note=useCallback((text:string)=>setMessage(text),[]);
  useEffect(()=>{if(pending){setAmbushOpen(true);setTab('explore');setFullMap(false);note(pending.encounterId?'앞을 가로막는 적과 마주쳤다.':'누군가 접근하는 기척이 느껴진다.');}},[pending]);
  useEffect(()=>{document.title=pending||combat?`전투 · ${strings.gameTitle}`:strings.gameTitle;},[pending,combat]);
  const move=useCallback((direction:Direction)=>{
    if(tab!=='explore'||fullMap||combat)return;
    const result=loop.move(direction);
    if(!result.ok){if(result.reason!=='cooldown')note(result.reason==='insufficient_resources'?strings.insufficientStamina:result.reason==='paused'?strings.pausedMove:strings.blocked);return;}
    setMessage('');
  },[loop,tab,fullMap,combat,note]);
  useEffect(()=>bindMovementKeys(window,move),[move]);
  const inventoryAction=useCallback((action:InventoryAction)=>{
    const result=loop.inventoryAction(action);if(!result.ok){note(strings.inventoryActionBlocked);return;}
    const event=result.events.find(e=>e.type.startsWith('inventory/'));
    if(event?.type==='inventory/looted')setLootedChestId(event.chestId);
    note(event?.type==='inventory/used'?strings.itemUsed+event.recovered:event?.type==='inventory/equipped'?strings.itemEquipped:event?.type==='inventory/unequipped'?strings.itemUnequipped:strings.lootReceived);
  },[loop,note]);
  const interact=useCallback(()=>{if(tab!=='explore'||fullMap||combat)return;const current=store.getSnapshot(),chest=currentChest(current,store.content);
    if(chest&&!current.campaign.openedChests[chest.id])inventoryAction({type:'inventory/open_chest',chestId:chest.id});},[store,inventoryAction,tab,fullMap,combat]);
  useEffect(()=>bindInteractionKeys(window,interact),[interact]);
  const rest=useCallback(()=>{const resting=store.getSnapshot().character?.activity==='resting';const result=loop.setResting(!resting);note(result.ok?resting?strings.restStopped:strings.restStarted:strings.restUnavailable);},[loop,store,note]);
  const returnHome=useCallback(()=>{const result=loop.returnToCamp();note(result.ok?strings.returnSucceeded:strings.returnUnavailable);},[loop,note]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(event.repeat||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.isComposing)return;
    if(event.target instanceof Element&&event.target.closest('dialog[open],input,textarea,select,button,a,[contenteditable="true"]'))return;
    const key=event.key.toLowerCase();if(key==='escape'){loop.setSettingsOpen(true);return;}
    if(combat)return;if(key==='i'){setTab('inventory');event.preventDefault();}else if(key==='c'){setTab('character');event.preventDefault();}
    else if(key==='m'){setFullMap(true);event.preventDefault();}else if(tab==='explore'&&key==='r'){rest();event.preventDefault();}else if(tab==='explore'&&key==='b'){returnHome();event.preventDefault();}};
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[loop,combat,tab,rest,returnHome]);
  const location=currentLocation(state,store.content);
  const memory=location?.memory;
  const mapName=useMemo(()=>location?.map.name,[location?.map]);
  const exploredCount=useMemo(()=>memory?Object.keys(memory.visited).length:0,[memory]);
  const combatAction=(action:CombatAction)=>{const result=loop.combatAction(action);if(!result.ok)note('지금은 이 행동을 할 수 없습니다.');else if(action.type==='combat/close')note('전투를 마쳤다.');};
  const closeSettings=()=>{if(loop.getSnapshot().gapPaused||loop.getSnapshot().paused)loop.setPaused(false);loop.setSettingsOpen(false);};
  const settings=session.settingsOpen&&<SettingsDialog persistent={persistent} autoSave={autoSave} content={store.content} onClose={closeSettings}/>;
  if(!location)return <div className="unplaced"><h1>{strings.gameTitle}</h1><p>{strings.unplaced}</p><button onClick={()=>store.dispatch({type:'map/start',mapId:initialMapId(store.content)})}>{strings.start}</button>{settings}</div>;
  const {map,position}=location;const floor=findFloor(map,position.floor)!;const cell=findCell(map,position)!;const zone=requireZone(store.content,cell.zoneId);
  const chest=currentChest(state,store.content),chestOpened=chest&&state.campaign.openedChests[chest.id];
  const resting=state.character!.activity==='resting';
  const miniMap=<MiniMap viewport={mapViewport} position={position} memory={location.memory} width={floor.width} height={floor.height} onOpen={()=>setFullMap(true)}/>;
  const mapView=<MapView overview={fullMap} onViewportChange={reportViewport} content={store.content} map={map} position={position} memory={location.memory} openedChests={state.campaign.openedChests} defeatedEnemies={state.expedition?.defeatedEnemies}/>;
  const inventory=<InventoryPanel state={state} content={store.content} enabled={session.running} onAction={inventoryAction}/>;
  const characterContent=<><div className="content-tabs">{['캐릭터','소지품','장비','기록'].map(label=><button className={characterTab===label?'selected':''} onClick={()=>setCharacterTab(label)} key={label}>{label}</button>)}</div>
    {characterTab==='소지품'?inventory:characterTab==='기록'?<div className="recent-log">{logs.map((entry,index)=><p key={index}><time className="n" dateTime={new Date(entry.at).toISOString()} data-testid="record-time">{formatRecordTime(entry.at)}</time>{entry.text}</p>)}</div>:<><h2 className="character-name">이름 없는 감시자</h2><p className="muted">회색감시자</p><Vitals state={state}/><h3 className="section-title">장비</h3><p>{state.character!.inventory.equipment.feet?findItem(store.content,state.character!.inventory.equipment.feet)!.name:'장착한 장비 없음'}</p><h3 className="section-title">스킬</h3><p>강타 · 집중한 공격</p></>}
  </>;
  const base=<><h2>{zone.safety==='safe'?zone.name:'거점'}</h2><p>{zone.safety==='safe'?'안전한 거점입니다. 회복하면서 소지품을 정리할 수 있습니다.':'거점으로 돌아오면 보급품을 정리할 수 있습니다.'}</p><Vitals state={state}/>{zone.safety!=='safe'&&<button disabled={!session.running} onClick={returnHome}>거점으로 귀환</button>}<button onClick={()=>setTab('inventory')}>소지품 정리</button></>;
  const more=<><h2>기록</h2><h3 className="section-title">퀘스트</h3><p className="muted">기록된 퀘스트가 없습니다.</p><h3 className="section-title">코덱스</h3><p className="muted">기록된 문서가 없습니다.</p><button onClick={()=>loop.setSettingsOpen(true)}>설정</button></>;
  const tabContent=tab==='inventory'?inventory:tab==='character'?characterContent:tab==='base'?base:more;
  return <div className={`game-shell${combat?' has-combat':''}`}>
    <header className="game-top"><h1 aria-label={strings.gameTitle}>VIGIL</h1><span data-testid="session-status">{combat?'전투':pending?'조우':session.running?'진행':'정지'}</span><span className="n" data-testid="clock">경과 {state.meta.gameTime}틱</span><span className="top-spacer"/>
      <span className="idle-summary">진행 중 <span className="muted">없음</span></span>{autoSave&&<SaveStatus autoSave={autoSave}/>}<button aria-label="설정" onClick={()=>loop.setSettingsOpen(true)}>설정</button></header>
    {session.gapPaused&&<p className="gap-notice" role="alert">실행 공백으로 탐험이 정지했습니다. 설정을 열고 닫으면 이어서 진행합니다.</p>}
    <div className="game-columns" inert={!!combat}>
      <StatusPanel state={state} onCharacter={()=>setTab('character')}/>
      <section className={`exploration-center${compact&&tab!=='explore'&&!combat?' tab-hidden':''}`} aria-label="탐험">
        <header className="region-header"><div><h2>{mapName}</h2><span className="muted">{position.floor}층 · {zone.name}</span></div><span className="region-meta">{zone.safety==='safe'?'안전지대':'위험지대'} · <span className="n" data-testid="visited">{exploredCount}</span>칸</span></header>
        <div className="map-stage">{mapView}{compact&&miniMap}</div>
        <div className="situation" role="status"><span className="situation-text">{compact&&message?message:chest?chestOpened?'물품을 모두 챙긴 상자입니다.':`${chest.name} · Z / Space로 열기`:zone.description}</span><span className="n" data-testid="position">({position.x}, {position.y})</span></div>
        {chest&&<section className="chest-controls"><button disabled={!session.running||!!chestOpened} aria-keyshortcuts="Z Space" onClick={interact}>{strings.openChest}</button>
          {chestOpened&&<div data-testid="chest-status" role="status">{lootedChestId===chest.id?<><p>{strings.chestLooted}</p><ul>{chest.loot.map((entry,index)=><li key={index}>{findItem(store.content,entry.itemId)!.name} ×{entry.quantity}</li>)}</ul></>:<p>{strings.chestEmpty}</p>}</div>}</section>}
        <div className="exploration-commands"><div className="movement-controls" role="group" aria-label={strings.move}>{controls.map(({direction,glyph})=><button type="button" className={`move-${direction}`} key={direction} aria-label={strings[direction]} disabled={!session.running}
          onPointerDown={event=>{if(event.isPrimary&&event.button===0)move(direction);}} onClick={event=>{if(event.detail===0)move(direction);}}>{glyph}</button>)}</div>
          <button className="command" disabled={!session.running||!resting&&(zone.safety!=='danger'||state.character!.stamina.current===state.character!.stamina.max)} onClick={rest}><b>{resting?'휴식 중지':'휴식'}</b><small>R · 회복↑ 습격↑</small></button>
          <button className="command" aria-label="귀환" disabled={!session.running||!getReturnDestination(state,store.content)} onClick={returnHome}><b>귀환</b><small>B · 즉시 · 거점</small></button></div>
        {message&&!compact&&<p className="action-feedback" role="status">{message}</p>}
        <section ref={recordView} className="recent-log" aria-label="최근 기록"><h2 className="section-title">최근 기록</h2>{logs.slice(compact?-2:-8).map((entry,index)=><p key={index}><time className="n" dateTime={new Date(entry.at).toISOString()} data-testid="record-time">{formatRecordTime(entry.at)}</time><span className="record-text">{entry.text}</span></p>)}</section>
        {pending&&!ambushOpen&&!combat&&<button className="pending-notice" onClick={()=>setAmbushOpen(true)}>미처리 조우 · 다시 열기</button>}
      </section>
      {!compact&&<aside className="right-column">{miniMap}{inventory}<section><h2 className="section-title">퀘스트</h2><p className="empty-note">기록된 퀘스트 없음</p></section><section><h2 className="section-title">코덱스</h2><p className="empty-note">기록된 문서 없음</p></section></aside>}
      {compact&&tab!=='explore'&&!combat&&<section className="tab-page" aria-label={tabs.find(t=>t.id===tab)!.label}>{tabContent}</section>}
    </div>
    <nav className="bottom-tabs" aria-label="주 메뉴">{tabs.map(({id,label,glyph})=><button key={id} className={tab===id?'selected':''} disabled={!!combat} onClick={()=>setTab(id)}><i aria-hidden="true">{glyph}</i>{label}</button>)}</nav>
    {!compact&&tab!=='explore'&&!combat&&<GameDialog title={tabs.find(t=>t.id===tab)!.label} onClose={()=>setTab('explore')}>{tabContent}</GameDialog>}
    {fullMap&&!combat&&<GameDialog title="전체 지도" className="full-map-dialog" onClose={()=>setFullMap(false)}>{mapView}</GameDialog>}
    {pending&&ambushOpen&&!combat&&!session.settingsOpen&&<GameDialog title={pending.encounterId?'적과 조우했습니다':'습격'} onClose={()=>setAmbushOpen(false)}><p>{findEncounter(store.content,pending.encounterId??store.content.timeRules.combat.ambushEncounterId)?.name??'정체를 알 수 없는 적'}</p><p>전투를 시작하거나 도주를 시도하세요.</p><div className="encounter-actions"><button onClick={()=>combatAction({type:'combat/start'})}>전투 시작</button><button onClick={()=>{const started=loop.combatAction({type:'combat/start'});if(started.ok)combatAction({type:'combat/act',choice:'escape'});}}>도주 시도</button></div></GameDialog>}
    {combat&&<><div className="combat-dim"/><CombatPanel state={state} content={store.content} enabled={!session.settingsOpen&&!session.paused&&!session.gapPaused} onAction={combatAction}/></>}
    {settings}
  </div>;
}
