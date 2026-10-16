import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {FormEvent,PointerEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {FileImport,readImportJson} from './file-import.tsx';
import {generateMap,GeneratorOptionsSchema,parseMapSeed} from './map-generator.ts';
import type {GeneratorOptions} from './map-generator.ts';
import {loadMakerWorld} from './map-content.ts';
import {cellAt,connect,disconnect,editCell,parseWorld,renameMap,worldFromContent} from './world-editor.ts';
import type {CellPosition,WorldBundle} from './world-editor.ts';
import type {MapDefinition} from '../src/content/schemas.ts';
import {createNewGameStore} from '../src/runtime/store.ts';
import type {GameStore} from '../src/runtime/store.ts';
import {loadGameContent} from '../src/runtime/content.ts';
import {bindInteractionKeys,bindMovementKeys} from '../src/runtime/input.ts';
import type {Direction} from '../src/engine/systems/map/actions.ts';
import {currentExit,currentLocation} from '../src/engine/systems/map/selectors.ts';
import {MapView} from '../src/ui/MapView.tsx';
import {App} from '../src/ui/App.tsx';
import {preparePreview} from './map-preview.ts';
import {monsterCatalog,encounterCatalog,importMonsters,paintRegion,placeMonster,setEnemyLevels,generateEnemies} from './monster-tools.ts';
import type {Region} from './monster-tools.ts';
import chests from '../src/content/chests.json' with {type:'json'};

import '../src/ui/styles.css';
import './map-maker.css';

function checked(world:WorldBundle,terrainOnly=false){
  const result=loadMakerWorld(world,terrainOnly);
  if(!result.ok)throw new Error(result.errors.slice(0,8).map(e=>`${e.path}: ${e.message}`).join('\n'));
  return result.content;
}
function errorText(e:unknown){return e instanceof Error?e.message:String(e);}
function Overview({map,floor,selected,region,onSelect}:{map:MapDefinition;floor:MapDefinition['floors'][number];selected:CellPosition;region:Region;onSelect:(a:{x:number;y:number},b:{x:number;y:number})=>void}){
  const ref=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null),drag=useRef<{x:number;y:number}|undefined>(undefined),[zoom,setZoom]=useState('fit');
  const scale=Math.min(8,Math.max(2,Math.floor(2048/Math.max(floor.width,floor.height))));
  useEffect(()=>{
    const c=ref.current!.getContext('2d');if(!c)return;c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,floor.width,floor.height);
    for(const cell of floor.cells){c.fillStyle=cell.tileId==='tile.wall'?'#969696':cell.zoneId==='zone.camp'?'#c9d9e2':'#efadad';c.fillRect(cell.x,cell.y,1,1);
      if(cell.encounterId){c.fillStyle='#6e2235';c.beginPath();c.arc(cell.x+.5,cell.y+.5,.32,0,Math.PI*2);c.fill();}
      if(cell.chestId){c.fillStyle='#5c461d';c.fillRect(cell.x+.2,cell.y+.2,.6,.6);}
      if(cell.exit){c.strokeStyle='#174a70';c.lineWidth=.15;c.strokeRect(cell.x+.15,cell.y+.15,.7,.7);}}
    if(map.start.floor===floor.floor){c.strokeStyle='#111';c.lineWidth=.18;c.strokeRect(map.start.x+.1,map.start.y+.1,.8,.8);}
  },[map,floor,scale]);
  useEffect(()=>{const c=overlay.current!.getContext('2d');if(!c)return;c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,floor.width,floor.height);
    const x=Math.min(region.x1,region.x2),y=Math.min(region.y1,region.y2),w=Math.abs(region.x2-region.x1)+1,h=Math.abs(region.y2-region.y1)+1;
    c.fillStyle='#ffffff40';c.fillRect(x,y,w,h);c.strokeStyle='#183d5e';c.lineWidth=.15;c.strokeRect(x+.075,y+.075,w-.15,h-.15);
  },[region,selected,floor.width,floor.height,scale]);
  const point=(e:PointerEvent<HTMLCanvasElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.min(floor.width-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*floor.width))),y:Math.min(floor.height-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*floor.height)))};};
  return <><label>지도 확대<select aria-label="지도 확대" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">폭에 맞춤</option>{[12,24,48].map(n=><option key={n} value={n}>{n}px / 칸</option>)}</select></label>
    <div className="maker-canvas-scroll"><div className="maker-canvas-stack" style={{width:zoom==='fit'?'100%':floor.width*Number(zoom)}}><canvas ref={ref} width={floor.width*scale} height={floor.height*scale} role="img" aria-label={`맵 전체 지형 ${floor.width}×${floor.height}, 드래그하면 영역 선택`} style={{width:'100%',touchAction:'none'}}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current=point(e);onSelect(drag.current,drag.current);}}
      onPointerMove={e=>{if(drag.current)onSelect(drag.current,point(e));}}
      onPointerUp={e=>{if(drag.current)onSelect(drag.current,point(e));drag.current=undefined;}}
      onPointerCancel={()=>{drag.current=undefined;}}/>
      <canvas ref={overlay} width={floor.width*scale} height={floor.height*scale} aria-hidden="true" className="maker-selection-overlay"/></div></div></>;
}
const directions:readonly [Direction,string,string][]=[['north','▲','위로 이동'],['west','◀','왼쪽으로 이동'],['south','▼','아래로 이동'],['east','▶','오른쪽으로 이동']];
function WalkPreview({store,onClose,notice}:{store:GameStore;onClose:()=>void;notice:string}){
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot),location=currentLocation(state,store.content)!;
  const [message,setMessage]=useState(notice+' 방향키/WASD로 이동하고 출입구에서 Z/스페이스를 누르세요.');
  const move=(direction:Direction)=>{const r=store.dispatch({type:'move/step',direction});setMessage(r.ok?'이동했습니다.':'이동할 수 없거나 스태미나가 부족합니다.');};
  const travel=()=>{const r=store.dispatch({type:'map/travel'});setMessage(r.ok?'출입구를 통해 이동했습니다.':'이동할 수 없습니다.');};
  useEffect(()=>bindMovementKeys(window,move),[store]);useEffect(()=>bindInteractionKeys(window,travel),[store]);
  const exit=currentExit(state,store.content);
  return <main className="maker-play"><header><button onClick={onClose}>제작 화면으로</button><strong>{location.map.name}</strong><span>임시 이동 시험</span></header>
    <div className="maker-map"><MapView key={`${location.map.id}:${location.position.floor}`} content={store.content} map={location.map} position={location.position} memory={location.memory}/></div>
    <div className="maker-position"><span data-testid="maker-position">({location.position.x}, {location.position.y})</span><span className="n">스태미나 {state.character!.stamina.current} / {state.character!.stamina.max}</span></div>
    <p className="maker-move-message" role="status">{message}</p>{exit&&<button className="maker-travel" onClick={travel}>{exit.name} 이동</button>}
    <div className="maker-controls"><div className="movement-controls" role="group" aria-label="이동">{directions.map(([direction,glyph,label])=><button className={`move-${direction}`} aria-label={label} key={direction} onClick={()=>move(direction)}>{glyph}</button>)}</div>
      <button onClick={()=>{const r=store.dispatch({type:'map/return'});setMessage(r.ok?'시작 위치로 돌아왔습니다.':'이미 안전 구역이거나 귀환할 수 없습니다.');}}>시작 위치로</button></div></main>;
}
function Maker(){
  const defaults=GeneratorOptionsSchema.parse({}),[world,setWorld]=useState<WorldBundle>(()=>parseWorld([generateMap().map]));
  const [selectedId,setSelectedId]=useState(world.startMapId),[selection,setSelection]=useState<CellPosition>({mapId:world.maps[0]!.id,...world.maps[0]!.start});
  const [summary,setSummary]=useState('칸을 선택해 지형·배치·출입구를 편집할 수 있습니다.'),[error,setError]=useState('');
  const [preview,setPreview]=useState<{store:GameStore;game:boolean;notice:string}>(),history=useRef<WorldBundle[]>([]),importVersion=useRef(0);
  const map=world.maps.find(m=>m.id===selectedId)??world.maps[0]!;
  const floor=map.floors.find(f=>f.floor===selection.floor)??map.floors[0]!;
  const p={mapId:map.id,floor:floor.floor,x:Math.max(0,Math.min(floor.width-1,selection.mapId===map.id?selection.x:map.start.x)),y:Math.max(0,Math.min(floor.height-1,selection.mapId===map.id?selection.y:map.start.y))};
  const cell=cellAt(world,p)!;
  const [anchor,setAnchor]=useState<CellPosition>(),[exitPick,setExitPick]=useState<{from:CellPosition;kind:'door'|'stairs'|'portal'}>();
  const [scope,setScope]=useState<'auto'|'selected'|'world'>('auto'),[enemyLevel,setEnemyLevel]=useState(1),[selectedMonster,setSelectedMonster]=useState('monster.wolf');
  const catalog=monsterCatalog(world),allEncounters=encounterCatalog(world);
  const r:Region={mapId:map.id,floor:floor.floor,x1:anchor?.mapId===p.mapId&&anchor.floor===p.floor?anchor.x:p.x,y1:anchor?.mapId===p.mapId&&anchor.floor===p.floor?anchor.y:p.y,x2:p.x,y2:p.y};

  const commit=(next:WorldBundle,text='편집했습니다. 검증 후 시험하거나 내보낼 수 있습니다.')=>{history.current.push(world);history.current=history.current.slice(-20);importVersion.current++;setWorld(next);setSummary(text);setError('');};
  const attempt=(fn:()=>void)=>{try{fn();setError('');}catch(e){setError(errorText(e));}};
  const selectMap=(id:string)=>{setAnchor(undefined);const next=world.maps.find(m=>m.id===id)!;setSelectedId(id);setSelection({mapId:id,...next.start});};
  const uniqueId=()=>{let n=2;while(world.maps.some(m=>m.id===`map.generated_${n}`))n++;return `map.generated_${n}`;};
  const regenerate=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();attempt(()=>{const data=new FormData(e.currentTarget),options:Partial<GeneratorOptions>={seed:parseMapSeed(String(data.get('seed')))};
      for(const key of ['width','height','rooms','roomMin','roomMax','straightness','deadEndRetention','extraConnections'] as const)options[key]=Number(data.get(key));
      const mode=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value;
      const result=generateMap({...options,id:mode==='add'?uniqueId():map.id});if(mode==='add')result.map.name+=` ${world.maps.length+1}`;
      let next=world;
      if(mode==='floor'){
        const f={...result.map.floors[0]!,floor:Math.max(...map.floors.map(f=>f.floor))+1};
        next={...world,maps:world.maps.map(m=>m.id===map.id?{...m,floors:[...m.floors,f]}:m)};setSelection({mapId:map.id,...result.map.start,floor:f.floor});
      }else if(mode==='add'){next={...world,maps:[...world.maps,result.map]};setSelectedId(result.map.id);setSelection({mapId:result.map.id,...result.map.start});}
      else{for(const f of map.floors)for(const c of f.cells)if(c.exit)next=disconnect(next,{mapId:map.id,floor:f.floor,x:c.x,y:c.y});
        next={...next,maps:next.maps.map(m=>m.id===map.id?result.map:m)};setSelection({mapId:map.id,...result.map.start});}
      commit(next,`방 ${result.stats.rooms}개 · 바닥 ${result.stats.walkable}칸 · 막다른 끝 ${result.stats.deadEnds}개 · 추가 연결 ${result.stats.extraConnections}개`);
    });
  };
  const download=(bundle:boolean)=>attempt(()=>{checked(world);const data=bundle||world.maps.length>1||map.floors.length>1||world.monsters?.length||world.encounters?.length?world:[map];
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=bundle?'vigil-world.json':`${map.id.replace('.','-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const importFile=async(file:File)=>{
    const version=++importVersion.current;setError('');
    const raw=await readImportJson(file,64);
    if(version!==importVersion.current)return '다른 편집으로 취소되었습니다. 다시 불러오려면 아래 버튼을 누르세요.';
    const next=parseWorld(raw);checked(next);commit(next,`${file.name} · 검증 통과`);setSelectedId(next.startMapId);setSelection({mapId:next.startMapId,...next.maps.find(m=>m.id===next.startMapId)!.start});
    return `불러오기 완료 · 맵 ${next.maps.length}개 · ${next.maps.find(m=>m.id===next.startMapId)!.name}`;
  };
  const startPreview=(game:boolean)=>attempt(()=>{const result=preparePreview(world,p,!game,scope);setPreview({store:createNewGameStore(result.content,[1,2,3,4],Date.now),game,notice:result.notice});});
  if(preview)return preview.game?<App store={preview.store} onExitPreview={()=>setPreview(undefined)}/>:<WalkPreview store={preview.store} onClose={()=>setPreview(undefined)} notice={preview.notice}/>;
  const fields:readonly [keyof GeneratorOptions,string,number,number,number][]=[['width','가로 칸 수',9,512,1],['height','세로 칸 수',9,512,1],['rooms','방 개수',1,128,1],['roomMin','방 최소 크기',3,31,1],['roomMax','방 최대 크기',3,63,1],['straightness','통로 직진 성향',0,1,.05],['deadEndRetention','막다른 가지 유지 비율',0,1,.05],['extraConnections','추가 연결 수',0,256,1]];
  const change=(fn:Parameters<typeof editCell>[2])=>attempt(()=>commit(editCell(world,p,fn)));
  const place=(kind:'chestId'|'encounterId',id:string)=>change(c=>{if(id&&(c.tileId!=='tile.floor'||c.exit||(kind==='chestId'?c.encounterId:c.chestId)))throw new Error('출입구·다른 배치가 없는 바닥 칸을 선택해 주세요.');if(id)c[kind]=id;else delete c[kind];});
  return <main className="map-maker"><header><h1>제작자 맵 생성기</h1><a href="/">게임으로</a></header>
    <p>맵을 편집하고 출입구로 연결한 뒤 배포용 묶음으로 내보냅니다. 시험 진행은 기존 저장과 별도로 실행됩니다.</p>
    <div className="maker-actions"><button onClick={()=>attempt(()=>{const loaded=loadGameContent();if(!loaded.ok)throw new Error('현재 게임 콘텐츠를 불러오지 못했습니다.');const next=worldFromContent(loaded.content);commit(next,'현재 게임 맵을 불러왔습니다.');setSelectedId(next.startMapId);setSelection({mapId:next.startMapId,...next.maps.find(m=>m.id===next.startMapId)!.start});})}>현재 게임 맵 불러오기</button>
      <button disabled={!history.current.length} onClick={()=>{const last=history.current.pop();if(last){importVersion.current++;setWorld(last);setError('');setSummary('직전 편집을 되돌렸습니다.');}}}>되돌리기</button><button onClick={()=>attempt(()=>{checked(world);setSummary('맵·배치·출입구 연결 검증을 통과했습니다.');})}>전체 검증</button></div>
    <div className="maker-layout"><section><form onSubmit={regenerate}><h2>생성 설정</h2><label>시드<input name="seed" defaultValue="1,2,3,4" required spellCheck={false}/></label>
      <div className="maker-fields">{fields.map(([name,label,min,max,step])=><label key={name}>{label}<input type="number" name={name} min={min} max={max} step={step} defaultValue={String(defaults[name])} required/></label>)}</div>
      <p className="muted">막다른 가지를 유지할 확률입니다. 맵 생성은 선택한 맵을 새 지형으로 바꿉니다.</p>
      <div className="maker-actions"><button type="submit" value="replace">맵 생성</button><button type="submit" value="add">새 맵으로 추가</button><button type="submit" value="floor">층 추가</button></div></form>
      <h2>맵 목록 · 시작 맵: {world.maps.find(m=>m.id===world.startMapId)?.name}</h2>
      <label>편집할 맵<select aria-label="편집할 맵" value={map.id} onChange={e=>selectMap(e.target.value)}>{world.maps.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
      <label>편집할 층<select aria-label="편집할 층" value={floor.floor} onChange={e=>setSelection({mapId:map.id,floor:Number(e.target.value),x:map.start.x,y:map.start.y})}>{map.floors.map(f=><option key={f.floor} value={f.floor}>{f.floor}층</option>)}</select></label>
      <button onClick={()=>attempt(()=>{const copy=structuredClone(map);copy.id=uniqueId();copy.name=map.name+' 사본';copy.version=1;for(const f of copy.floors)for(const c of f.cells){delete c.exit;delete c.chestId;delete c.encounterId;}commit({...world,maps:[...world.maps,copy]},'지형을 새 맵으로 복제했습니다. 상자·적·출입구는 새로 배치해 주세요.');setSelectedId(copy.id);setSelection({mapId:copy.id,...copy.start});})}>선택 맵 지형 복제</button>
      <form key={`${map.id}:${map.name}:${map.version}`} className="maker-metadata" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);attempt(()=>{const id=String(data.get('id'));commit(renameMap(world,map.id,id,String(data.get('name')),Number(data.get('version'))));setSelectedId(id);setSelection({...p,mapId:id});});}}>
        <label>맵 이름<input name="name" defaultValue={map.name} required/></label><label>맵 ID<input name="id" defaultValue={map.id} required/></label><label>맵 버전<input name="version" type="number" min="1" defaultValue={map.version} required/></label><button>맵 정보 적용</button></form>
    </section><section className="maker-result" aria-label="생성 결과"><h2>{map.name} <span className="n" data-testid="maker-size">{floor.width}×{floor.height}</span></h2><p role="status">{summary}</p>
      {exitPick&&<p className="maker-pick-status" role="status">출발점 {exitPick.from.mapId} {exitPick.from.floor}층 ({exitPick.from.x}, {exitPick.from.y}) 지정됨. 도착 맵/층을 고른 뒤 칸을 클릭하고 아래 연결 버튼을 누르세요.<button onClick={()=>setExitPick(undefined)}>출입구 선택 취소</button></p>}
      <Overview map={map} floor={floor} selected={p} region={r} onSelect={(a,b)=>{setAnchor({mapId:map.id,floor:floor.floor,...a});setSelection({mapId:map.id,floor:floor.floor,...b});}}/>
      <div className="maker-brush"><strong>선택 영역 ({Math.min(r.x1,r.x2)}, {Math.min(r.y1,r.y2)}) ~ ({Math.max(r.x1,r.x2)}, {Math.max(r.y1,r.y2)}) · {(Math.abs(r.x2-r.x1)+1)*(Math.abs(r.y2-r.y1)+1)}칸</strong><div className="maker-actions">{(['floor','wall','safe','danger'] as const).map((mode,i)=><button key={mode} onClick={()=>attempt(()=>commit(paintRegion(world,r,mode),'선택 영역을 변경했습니다.'))}>{['영역을 바닥으로','영역을 벽으로','영역을 안전 구역으로','영역을 위험 구역으로'][i]}</button>)}</div><p className="muted">드래그로 사각형을 선택한 뒤 적용합니다. 벽으로 바꾸면 배치/연결을 제거하고, 안전 구역으로 바꾸면 적을 제거합니다. 되돌리기로 복구할 수 있습니다.</p></div>
      <p className="muted">회색: 벽 · 분홍 #efadad: 위험 구역 · 파랑 #c9d9e2: 안전 구역 · 원: 몬스터 · 네모: 상자/출입구</p>
      <section className="maker-cell" aria-label="선택한 칸"><h2>선택한 칸 ({p.x}, {p.y}) · {p.floor}층</h2>
        <div className="maker-fields"><label>X<input aria-label="선택 X" type="number" min="0" max={floor.width-1} value={p.x} onChange={e=>setSelection({...p,x:Math.max(0,Math.min(floor.width-1,Math.trunc(Number(e.target.value))))})}/></label><label>Y<input aria-label="선택 Y" type="number" min="0" max={floor.height-1} value={p.y} onChange={e=>setSelection({...p,y:Math.max(0,Math.min(floor.height-1,Math.trunc(Number(e.target.value))))})}/></label></div>
        <div className="maker-actions"><button onClick={()=>change(c=>{c.tileId='tile.floor';})}>바닥으로</button><button onClick={()=>attempt(()=>{let next=disconnect(world,p);next=editCell(next,p,c=>{c.tileId='tile.wall';delete c.chestId;delete c.encounterId;});commit(next);})}>벽으로</button><button onClick={()=>change(c=>{c.zoneId='zone.camp';})}>안전 구역</button><button onClick={()=>change(c=>{c.zoneId='zone.ruins';})}>위험 구역</button></div>
        <button onClick={()=>attempt(()=>{if(cell.tileId!=='tile.floor'||cell.encounterId)throw new Error('적이 없는 바닥 칸을 선택해 주세요.');const next=editCell(world,p,c=>{c.zoneId='zone.camp';});commit({...next,startMapId:map.id,maps:next.maps.map(m=>m.id===map.id?{...m,start:{floor:p.floor,x:p.x,y:p.y}}:m)},'거점/새 게임 시작점을 지정했습니다.');})}>거점·새 게임 시작점으로</button>
        <label>상자 배치<select aria-label="상자 배치" value={cell.chestId??''} onChange={e=>place('chestId',e.target.value)}><option value="">없음</option>{chests.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>적 배치<select aria-label="적 배치" value={cell.encounterId??''} onChange={e=>place('encounterId',e.target.value)}><option value="">없음</option>{allEncounters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <form key={`${map.id}:${floor.floor}:${p.x}:${p.y}`} className="maker-exit" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);attempt(()=>commit(connect(world,p,{mapId:String(data.get('targetMap')),floor:Number(data.get('targetFloor')),x:Number(data.get('x')),y:Number(data.get('y'))},String(data.get('kind')) as 'door'|'stairs'|'portal'),'왕복 출입구를 연결했습니다.'));}}>
          <div className="maker-actions"><button type="button" onClick={e=>{const f=new FormData(e.currentTarget.form!);setExitPick({from:{...p},kind:String(f.get('kind')) as 'door'|'stairs'|'portal'});setSummary('출발점을 선택했습니다. 도착 맵/층의 칸을 선택해 주세요.');}}>이 칸을 출발점으로 선택</button><button type="button" disabled={!exitPick} onClick={()=>attempt(()=>{commit(connect(world,exitPick!.from,p,exitPick!.kind),'선택한 두 칸을 왕복 연결했습니다.');setExitPick(undefined);})}>선택한 칸을 도착점으로 연결</button></div>
          <h2>출입구 · {cell.exit?`${cell.exit.name} 연결됨`:'연결 없음'}</h2><label>종류<select name="kind" aria-label="출입구 종류" defaultValue={cell.exit?.kind??'door'}><option value="door">문</option><option value="stairs">계단</option><option value="portal">포탈</option></select></label>
          <label>도착 맵<select name="targetMap" aria-label="도착 맵" defaultValue={cell.exit?.target.mapId??world.maps.find(m=>m.id!==map.id)?.id??map.id}>{world.maps.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
          <div className="maker-fields">{[['targetFloor','도착 층',cell.exit?.target.floor??0],['x','도착 X',cell.exit?.target.x??1],['y','도착 Y',cell.exit?.target.y??1]].map(([name,label,value])=><label key={name}>{label}<input name={String(name)} aria-label={String(label)} type="number" defaultValue={value} required/></label>)}</div>
          <div className="maker-actions"><button>왕복 출입구 연결</button><button type="button" onClick={e=>{const data=new FormData(e.currentTarget.form!);attempt(()=>{const target=world.maps.find(m=>m.id===String(data.get('targetMap')))!;commit(connect(world,p,{mapId:target.id,...target.start},String(data.get('kind')) as 'door'|'stairs'|'portal'),'도착 맵의 시작점과 왕복 연결했습니다.');});}}>도착 맵의 시작점과 연결</button><button type="button" disabled={!cell.exit} onClick={()=>attempt(()=>commit(disconnect(world,p)))}>출입구 제거</button></div>
        </form>
      </section>
      <section className="maker-enemies" aria-label="몬스터 배치"><h2>몬스터 · 레벨 · 절차적 배치</h2><a href="/monster-maker.html" target="_blank" rel="noreferrer">몬스터 제작 화면 열기</a>
        <FileImport label="몬스터 불러오기" onImport={async file=>{
          const version=++importVersion.current;setError('');const raw=await readImportJson(file,2);
          if(version!==importVersion.current)return '다른 편집으로 취소되었습니다. 다시 불러오려면 아래 버튼을 누르세요.';
          const next=importMonsters(world,raw);commit(next,'몬스터를 불러왔습니다. 아래 목록에서 선택해 배치하세요.');const added=next.monsters?.at(-1);if(added)setSelectedMonster(added.id);
          return '불러오기 완료 · 아래 목록에서 선택해 배치하세요.';
        }}/>

        <label>배치할 몬스터<select aria-label="배치할 몬스터" value={selectedMonster} onChange={e=>setSelectedMonster(e.target.value)}>{catalog.map(m=><option value={m.id} key={m.id}>{m.glyph} {m.name} · 기본 Lv.{m.level}</option>)}</select></label>
        <label>선택 칸의 적 레벨<input aria-label="선택 칸의 적 레벨" type="number" min="1" max="999" value={enemyLevel} onChange={e=>setEnemyLevel(Number(e.target.value))}/></label>
        <div className="maker-actions"><button onClick={()=>attempt(()=>commit(placeMonster(world,p,selectedMonster,enemyLevel),'선택 칸에 몬스터를 배치했습니다.'))}>선택 칸에 몬스터 배치</button><button disabled={!cell.encounterId} onClick={()=>attempt(()=>commit(setEnemyLevels(world,map.id,enemyLevel,enemyLevel,[1,2,3,4],{...r,x1:p.x,y1:p.y,x2:p.x,y2:p.y}),'선택 칸의 적 레벨을 변경했습니다.'))}>선택 칸 레벨 적용</button></div>
        {cell.encounterId&&<p data-testid="selected-enemy">{allEncounters.find(e=>e.id===cell.encounterId)?.enemies.map(e=>{const m=catalog.find(m=>m.id===e.monsterId)!;return `${m.name} Lv.${m.level} HP ${m.health} 피해 ${m.damageMin}~${m.damageMax}`;}).join(' / ')}</p>}
        <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);attempt(()=>{const min=Number(data.get('levelMin')),max=Number(data.get('levelMax')),seed=parseMapSeed(String(data.get('enemySeed'))),selected=data.get('enemyScope')==='selection';const mode=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value;
          if(mode==='levels'){commit(setEnemyLevels(world,map.id,min,max,seed,selected?r:undefined),'범위 안의 적 레벨을 변경했습니다.');}
          else {commit(generateEnemies(world,selected?r:{mapId:map.id,floor:floor.floor,x1:0,y1:0,x2:floor.width-1,y2:floor.height-1},{count:Number(data.get('count')),spacing:Number(data.get('spacing')),min,max,seed,monsterIds:data.get('pool')==='all'?catalog.filter(m=>!m.levelSourceId).map(m=>m.id):[selectedMonster]}),'위험 구역의 빈 칸에 적을 절차적으로 배치했습니다.');}
        });}}>
          <div className="maker-fields"><label>최소 레벨<input aria-label="최소 레벨" type="number" name="levelMin" min="1" max="999" defaultValue="8" required/></label><label>최대 레벨<input aria-label="최대 레벨" type="number" name="levelMax" min="1" max="999" defaultValue="9" required/></label><label>배치 수<input type="number" name="count" min="1" max="1000" defaultValue="8" required/></label><label>최소 칸 간격<input type="number" name="spacing" min="0" max="512" defaultValue="3" required/></label></div>
          <label>적 배치 시드<input name="enemySeed" defaultValue="1,2,3,4" required/></label><label>적 변경 범위<select name="enemyScope" aria-label="적 변경 범위"><option value="floor">현재 층 (레벨은 현재 맵 전체)</option><option value="selection">드래그 선택 영역</option></select></label><label>절차적 배치 종류<select name="pool"><option value="selected">선택한 몬스터</option><option value="all">목록의 모든 기본 몬스터</option></select></label>
          <div className="maker-actions"><button type="submit" value="generate">적 절차적 배치</button><button type="submit" value="levels">범위 내 적 레벨 적용</button></div></form>
        <p className="muted">레벨 변경은 기본 레벨 대비 체력·피해·회복량을 비례 조정합니다(임시 계산식). 개별 배치는 별도 ID를 사용하므로 같은 종류를 여러 칸에 둘 수 있습니다. 절차적 배치는 기존 적·시작점·출입구·안전 구역·상자를 보존합니다.</p>
      </section>
      <label>시험 범위<select aria-label="시험 범위" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="auto">전체 맵 · 미연결 상태면 현재 맵/층</option><option value="selected">현재 맵/층만</option><option value="world">전체 연결 맵 (엄격한 검증)</option></select></label>
      {error&&<p className="maker-error" role="alert">{error}</p>}
      <div className="maker-actions"><button onClick={()=>startPreview(false)}>걸어 보기</button><button onClick={()=>startPreview(true)}>게임에서 시험</button><button onClick={()=>download(false)}>JSON 내려받기</button></div>
      <button className="maker-export" onClick={()=>download(true)}>배포용 맵 묶음 내보내기</button>
      <FileImport className="maker-file" label="수정한 JSON 불러오기" onImport={importFile}/>
      <p className="muted">묶음을 내보낸 뒤 register:world 명령으로 검증·등록하고 배포합니다. 사용법: docs/map-maker.md</p>
    </section></div></main>;
}
createRoot(document.getElementById('root')!).render(<Maker/>);
