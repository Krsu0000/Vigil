import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
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
import chests from '../src/content/chests.json' with {type:'json'};
import encounters from '../src/content/encounters.json' with {type:'json'};
import '../src/ui/styles.css';
import './map-maker.css';

function checked(world:WorldBundle,terrainOnly=false){
  const result=loadMakerWorld(world,terrainOnly);
  if(!result.ok)throw new Error(result.errors.slice(0,8).map(e=>`${e.path}: ${e.message}`).join('\n'));
  return result.content;
}
function errorText(e:unknown){return e instanceof Error?e.message:String(e);}
function Overview({map,floor,selected,onSelect}:{map:MapDefinition;floor:MapDefinition['floors'][number];selected:CellPosition;onSelect:(x:number,y:number)=>void}){
  const ref=useRef<HTMLCanvasElement>(null),[zoom,setZoom]=useState('fit');
  useEffect(()=>{
    const c=ref.current!.getContext('2d');if(!c)return;
    for(const cell of floor.cells){c.fillStyle=cell.tileId==='tile.wall'?'#969696':cell.zoneId==='zone.camp'?'#626262':'#242424';c.fillRect(cell.x,cell.y,1,1);
      if(cell.exit||cell.chestId||cell.encounterId){c.fillStyle='#ccc';c.fillRect(cell.x,cell.y,1,1);}}
    if(map.start.floor===floor.floor){c.fillStyle='#fff';c.fillRect(map.start.x,map.start.y,1,1);}
    c.strokeStyle='#fff';c.lineWidth=.2;c.strokeRect(selected.x+.1,selected.y+.1,.8,.8);
  },[map,floor,selected]);
  return <><label>지도 확대<select aria-label="지도 확대" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">폭에 맞춤</option>{[12,24,48].map(n=><option key={n} value={n}>{n}px / 칸</option>)}</select></label>
    <div className="maker-canvas-scroll"><canvas ref={ref} width={floor.width} height={floor.height} role="img" aria-label={`맵 전체 지형 ${floor.width}×${floor.height}, 칸을 누르면 선택`} style={{width:zoom==='fit'?'100%':floor.width*Number(zoom)}}
      onClick={e=>{const r=e.currentTarget.getBoundingClientRect();onSelect(Math.min(floor.width-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*floor.width))),Math.min(floor.height-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*floor.height))));}}/></div></>;
}
const directions:readonly [Direction,string,string][]=[['north','▲','위로 이동'],['west','◀','왼쪽으로 이동'],['south','▼','아래로 이동'],['east','▶','오른쪽으로 이동']];
function WalkPreview({store,onClose}:{store:GameStore;onClose:()=>void}){
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot),location=currentLocation(state,store.content)!;
  const [message,setMessage]=useState('방향키/WASD로 이동하고 출입구에서 Z/스페이스를 누르세요.');
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
  const [preview,setPreview]=useState<{store:GameStore;game:boolean}>(),history=useRef<WorldBundle[]>([]),importVersion=useRef(0);
  const map=world.maps.find(m=>m.id===selectedId)??world.maps[0]!;
  const floor=map.floors.find(f=>f.floor===selection.floor)??map.floors[0]!;
  const p={mapId:map.id,floor:floor.floor,x:Math.max(0,Math.min(floor.width-1,selection.mapId===map.id?selection.x:map.start.x)),y:Math.max(0,Math.min(floor.height-1,selection.mapId===map.id?selection.y:map.start.y))};
  const cell=cellAt(world,p)!;
  const commit=(next:WorldBundle,text='편집했습니다. 검증 후 시험하거나 내보낼 수 있습니다.')=>{history.current.push(world);history.current=history.current.slice(-20);importVersion.current++;setWorld(next);setSummary(text);setError('');};
  const attempt=(fn:()=>void)=>{try{fn();setError('');}catch(e){setError(errorText(e));}};
  const selectMap=(id:string)=>{const next=world.maps.find(m=>m.id===id)!;setSelectedId(id);setSelection({mapId:id,...next.start});};
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
  const download=(bundle:boolean)=>attempt(()=>{checked(world);const data=bundle||world.maps.length>1||map.floors.length>1?world:[map];
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=bundle?'vigil-world.json':`${map.id.replace('.','-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const importFile=async(file:File|undefined)=>{
    if(!file)return;const version=++importVersion.current;
    try{if(file.size>64*1024*1024)throw new Error('JSON은 64MB 이하로 불러와 주세요.');const text=await file.text();if(version!==importVersion.current)return;
      const next=parseWorld(JSON.parse(text));checked(next);commit(next,`${file.name} · 검증 통과`);setSelectedId(next.startMapId);setSelection({mapId:next.startMapId,...next.maps.find(m=>m.id===next.startMapId)!.start});
    }catch(e){if(version===importVersion.current)setError(errorText(e));}
  };
  const startPreview=(game:boolean)=>attempt(()=>setPreview({store:createNewGameStore(checked(world,!game),[1,2,3,4],Date.now),game}));
  if(preview)return preview.game?<App store={preview.store} onExitPreview={()=>setPreview(undefined)}/>:<WalkPreview store={preview.store} onClose={()=>setPreview(undefined)}/>;
  const fields:readonly [keyof GeneratorOptions,string,number,number,number][]=[['width','가로 칸 수',9,512,1],['height','세로 칸 수',9,512,1],['rooms','방 개수',1,128,1],['roomMin','방 최소 크기',3,31,1],['roomMax','방 최대 크기',3,63,1],['straightness','통로 직진 성향',0,1,.05],['deadEndRetention','막다른 가지 유지 비율',0,1,.05],['extraConnections','추가 연결 수',0,256,1]];
  const change=(fn:Parameters<typeof editCell>[2])=>attempt(()=>commit(editCell(world,p,fn)));
  const place=(kind:'chestId'|'encounterId',id:string)=>change(c=>{if(id&&(c.tileId!=='tile.floor'||c.exit||(kind==='chestId'?c.encounterId:c.chestId)))throw new Error('출입구·다른 배치가 없는 바닥 칸을 선택해 주세요.');if(id)c[kind]=id;else delete c[kind];});
  return <main className="map-maker"><header><h1>제작자 맵 생성기</h1><a href="/">게임으로</a></header>
    <p>맵을 편집하고 출입구로 연결한 뒤 배포용 묶음으로 내보냅니다. 시험 진행은 기존 저장과 별도로 실행됩니다.</p>
    <div className="maker-actions"><button onClick={()=>attempt(()=>{const loaded=loadGameContent();if(!loaded.ok)throw new Error('현재 게임 콘텐츠를 불러오지 못했습니다.');const next=worldFromContent(loaded.content);commit(next,'현재 게임 맵을 불러왔습니다.');setSelectedId(next.startMapId);setSelection({mapId:next.startMapId,...next.maps.find(m=>m.id===next.startMapId)!.start});})}>현재 게임 맵 불러오기</button>
      <button disabled={!history.current.length} onClick={()=>{const last=history.current.pop();if(last){importVersion.current++;setWorld(last);setError('');setSummary('직전 편집을 되돌렸습니다.');}}}>되돌리기</button><button onClick={()=>attempt(()=>{checked(world);setSummary('맵·배치·출입구 연결 검증을 통과했습니다.');})}>전체 검증</button></div>
    {error&&<p className="maker-error" role="alert">{error}</p>}
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
      <Overview map={map} floor={floor} selected={p} onSelect={(x,y)=>setSelection({mapId:map.id,floor:floor.floor,x,y})}/>
      <p className="muted">회색: 벽 · 어두운 칸: 통로/방 · 밝은 바닥: 안전 구역 · 흰 칸: 시작점/배치</p>
      <section className="maker-cell" aria-label="선택한 칸"><h2>선택한 칸 ({p.x}, {p.y}) · {p.floor}층</h2>
        <div className="maker-fields"><label>X<input aria-label="선택 X" type="number" min="0" max={floor.width-1} value={p.x} onChange={e=>setSelection({...p,x:Math.max(0,Math.min(floor.width-1,Number(e.target.value)))})}/></label><label>Y<input aria-label="선택 Y" type="number" min="0" max={floor.height-1} value={p.y} onChange={e=>setSelection({...p,y:Math.max(0,Math.min(floor.height-1,Number(e.target.value)))})}/></label></div>
        <div className="maker-actions"><button onClick={()=>change(c=>{c.tileId='tile.floor';})}>바닥으로</button><button onClick={()=>attempt(()=>{let next=disconnect(world,p);next=editCell(next,p,c=>{c.tileId='tile.wall';delete c.chestId;delete c.encounterId;});commit(next);})}>벽으로</button><button onClick={()=>change(c=>{c.zoneId='zone.camp';})}>안전 구역</button><button onClick={()=>change(c=>{c.zoneId='zone.ruins';})}>위험 구역</button></div>
        <button onClick={()=>attempt(()=>{if(cell.tileId!=='tile.floor'||cell.encounterId)throw new Error('적이 없는 바닥 칸을 선택해 주세요.');const next=editCell(world,p,c=>{c.zoneId='zone.camp';});commit({...next,startMapId:map.id,maps:next.maps.map(m=>m.id===map.id?{...m,start:{floor:p.floor,x:p.x,y:p.y}}:m)},'거점/새 게임 시작점을 지정했습니다.');})}>거점·새 게임 시작점으로</button>
        <label>상자 배치<select aria-label="상자 배치" value={cell.chestId??''} onChange={e=>place('chestId',e.target.value)}><option value="">없음</option>{chests.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>적 배치<select aria-label="적 배치" value={cell.encounterId??''} onChange={e=>place('encounterId',e.target.value)}><option value="">없음</option>{encounters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <form key={`${map.id}:${floor.floor}:${p.x}:${p.y}`} className="maker-exit" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);attempt(()=>commit(connect(world,p,{mapId:String(data.get('targetMap')),floor:Number(data.get('targetFloor')),x:Number(data.get('x')),y:Number(data.get('y'))},String(data.get('kind')) as 'door'|'stairs'|'portal'),'왕복 출입구를 연결했습니다.'));}}>
          <h2>출입구 · {cell.exit?`${cell.exit.name} 연결됨`:'연결 없음'}</h2><label>종류<select name="kind" aria-label="출입구 종류" defaultValue={cell.exit?.kind??'door'}><option value="door">문</option><option value="stairs">계단</option><option value="portal">포탈</option></select></label>
          <label>도착 맵<select name="targetMap" aria-label="도착 맵" defaultValue={cell.exit?.target.mapId??world.maps.find(m=>m.id!==map.id)?.id??map.id}>{world.maps.map(m=><option key={m.id} value={m.id}>{m.name} · {m.id}</option>)}</select></label>
          <div className="maker-fields">{[['targetFloor','도착 층',cell.exit?.target.floor??0],['x','도착 X',cell.exit?.target.x??1],['y','도착 Y',cell.exit?.target.y??1]].map(([name,label,value])=><label key={name}>{label}<input name={String(name)} aria-label={String(label)} type="number" defaultValue={value} required/></label>)}</div>
          <div className="maker-actions"><button>왕복 출입구 연결</button><button type="button" onClick={e=>{const data=new FormData(e.currentTarget.form!);attempt(()=>{const target=world.maps.find(m=>m.id===String(data.get('targetMap')))!;commit(connect(world,p,{mapId:target.id,...target.start},String(data.get('kind')) as 'door'|'stairs'|'portal'),'도착 맵의 시작점과 왕복 연결했습니다.');});}}>도착 맵의 시작점과 연결</button><button type="button" disabled={!cell.exit} onClick={()=>attempt(()=>commit(disconnect(world,p)))}>출입구 제거</button></div>
        </form>
      </section>
      <div className="maker-actions"><button onClick={()=>startPreview(false)}>걸어 보기</button><button onClick={()=>startPreview(true)}>게임에서 시험</button><button onClick={()=>download(false)}>JSON 내려받기</button></div>
      <button className="maker-export" onClick={()=>download(true)}>배포용 맵 묶음 내보내기</button>
      <label className="maker-file">수정한 JSON 불러오기<input type="file" accept="application/json,.json" onChange={e=>{void importFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>
      <p className="muted">묶음을 내보낸 뒤 register:world 명령으로 검증·등록하고 배포합니다. 사용법: docs/map-maker.md</p>
    </section></div></main>;
}
createRoot(document.getElementById('root')!).render(<Maker/>);
