import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { generateMap, GeneratorOptionsSchema, parseMapSeed } from './map-generator.ts';
import type { GeneratorOptions } from './map-generator.ts';
import { loadMakerMap, loadTerrainPreview } from './map-content.ts';
import type { ContentDb, DeepReadonly } from '../src/content/types.ts';
import type { MapDefinition } from '../src/content/schemas.ts';
import { createNewGameStore } from '../src/runtime/store.ts';
import type { GameStore } from '../src/runtime/store.ts';
import { bindMovementKeys } from '../src/runtime/input.ts';
import type { Direction } from '../src/engine/systems/map/actions.ts';
import { currentLocation } from '../src/engine/systems/map/selectors.ts';
import { MapView } from '../src/ui/MapView.tsx';
import '../src/ui/styles.css';
import './map-maker.css';

type Draft = { content:ContentDb; map:DeepReadonly<MapDefinition>; summary:string };
function validate(raw:unknown,summary:string):Draft {
  const loaded=loadMakerMap(raw);
  if (!loaded.ok) throw new Error(loaded.errors.slice(0,8).map(e => `${e.path}: ${e.message}`).join('\n'));
  const map=loaded.content.definitions.find(d => d.kind==='map')! as DeepReadonly<MapDefinition>;
  return { content:loaded.content,map,summary };
}
function generated(options:Partial<GeneratorOptions>):Draft {
  const result=generateMap(options),s=result.stats;
  return validate([result.map],`방 ${s.rooms}개 · 바닥 ${s.walkable}칸 · 막다른 끝 ${s.deadEnds}개 · 추가 연결 ${s.extraConnections}개`);
}
function Overview({ draft }:{ draft:Draft }) {
  const ref=useRef<HTMLCanvasElement>(null), floor=draft.map.floors[0]!;
  useEffect(() => {
    const ctx=ref.current!.getContext('2d'); if (!ctx) return;
    for (const cell of floor.cells) {
      const tile=draft.content.byId[cell.tileId],zone=draft.content.byId[cell.zoneId];
      ctx.fillStyle=tile && 'kind' in tile && tile.kind==='tile' && tile.walkable ? zone && 'kind' in zone && zone.kind==='zone' && zone.safety==='safe'?'#626262':'#242424':'#969696';
      ctx.fillRect(cell.x,cell.y,1,1);
    }
    ctx.fillStyle='#fff'; ctx.fillRect(draft.map.start.x,draft.map.start.y,1,1);
  },[draft,floor]);
  return <canvas ref={ref} width={floor.width} height={floor.height} role="img" aria-label={`맵 전체 지형 ${floor.width}×${floor.height}, 흰 칸은 시작 위치`} />;
}
const directions:readonly [Direction,string,string][]=[['north','▲','위로 이동'],['west','◀','왼쪽으로 이동'],['south','▼','아래로 이동'],['east','▶','오른쪽으로 이동']];
function WalkPreview({ store,onClose }:{ store:GameStore;onClose:()=>void }) {
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot), location=currentLocation(state,store.content)!;
  const [message,setMessage]=useState('방향키/WASD 또는 방향 버튼으로 이동하세요.');
  const move=(direction:Direction) => {
    const result=store.dispatch({ type:'move/step',direction });
    setMessage(result.ok?'이동했습니다.':result.reason==='insufficient_resources'?'스태미나가 부족합니다. 거점으로 돌아가거나 이동 시험을 다시 시작하세요.':'이동할 수 없는 칸입니다.');
  };
  useEffect(() => bindMovementKeys(window,move),[store]);
  return <main className="maker-play">
    <header><button onClick={onClose}>제작 화면으로</button><strong>이동 시험</strong><span>임시 진행</span></header>
    <div className="maker-map"><MapView content={store.content} map={location.map} position={location.position} memory={location.memory}/></div>
    <div className="maker-position"><span data-testid="maker-position">({location.position.x}, {location.position.y})</span><span className="n">스태미나 {state.character!.stamina.current} / {state.character!.stamina.max}</span></div>
    <p className="maker-move-message" role="status">{message}</p>
    <div className="maker-controls"><div className="movement-controls" role="group" aria-label="이동">{directions.map(([direction,glyph,label]) =>
      <button className={`move-${direction}`} aria-label={label} key={direction} onClick={() => move(direction)}>{glyph}</button>)}</div>
      <button onClick={() => { store.dispatch({ type:'map/return' }); setMessage('시작 위치로 돌아왔습니다.'); }}>시작 위치로</button></div>
  </main>;
}
function Maker() {
  const defaults=GeneratorOptionsSchema.parse({}), [draft,setDraft]=useState(() => generated(defaults));
  const [error,setError]=useState(''),[store,setStore]=useState<GameStore>();
  const importVersion=useRef(0);
  const regenerate=(event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); importVersion.current++; const data=new FormData(event.currentTarget);
    try {
      const next:Partial<GeneratorOptions>={ seed:parseMapSeed(String(data.get('seed'))) };
      for (const field of ['width','height','rooms','roomMin','roomMax','straightness','deadEndRetention','extraConnections'] as const) next[field]=Number(data.get(field));
      setDraft(generated(next)); setError('');
    } catch (e) { setError(e instanceof Error?e.message:String(e)); }
  };
  const importFile=async (file:File|undefined) => {
    if (!file) return;
    const version=++importVersion.current;
    try {
      if (file.size>64*1024*1024) throw new Error('맵 JSON은64MB 이하로 불러와 주세요.');
      const text=await file.text();
      if (version!==importVersion.current) return;
      const next=validate(JSON.parse(text),`${file.name} · 검증 통과`);
      setDraft(next); setError('');
    } catch (e) { if (version===importVersion.current) setError(e instanceof Error?e.message:String(e)); }
  };
  const download=() => {
    const url=URL.createObjectURL(new Blob([JSON.stringify([draft.map],null,2)+'\n'],{ type:'application/json' }));
    const link=document.createElement('a');link.href=url;link.download=`${draft.map.id.replace('.','-')}.json`;link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const startWalk=() => {
    const preview=loadTerrainPreview(draft.map);
    if (!preview.ok) { setError(preview.errors.map(e => e.message).join('\n')); return; }
    setStore(createNewGameStore(preview.content,[1,2,3,4],Date.now));
  };
  if (store) return <WalkPreview store={store} onClose={() => setStore(undefined)}/>;
  const fields:readonly [keyof GeneratorOptions,string,number,number,number][]=[
    ['width','가로 칸 수',9,512,1],['height','세로 칸 수',9,512,1],['rooms','방 개수',1,128,1],
    ['roomMin','방 최소 크기',3,31,1],['roomMax','방 최대 크기',3,63,1],['straightness','통로 직진 성향',0,1,0.05],
    ['deadEndRetention','막다른 가지 유지 비율',0,1,0.05],['extraConnections','추가 연결 수',0,256,1],
  ];
  return <main className="map-maker">
    <header><h1>제작자 맵 생성기</h1><a href="/">게임으로</a></header>
    <p>같은 시드와 설정으로 같은 지형을 만듭니다. 기존 탐험과 저장 데이터는 바뀌지 않습니다.</p>
    <div className="maker-layout"><form onSubmit={regenerate}>
      <h2>생성 설정</h2><label>시드<input name="seed" defaultValue="1,2,3,4" required spellCheck={false}/></label>
      <div className="maker-fields">{fields.map(([name,label,min,max,step]) => <label key={name}>{label}<input type="number" name={name} min={min} max={max} step={step} defaultValue={String(defaults[name])} required/></label>)}</div>
      <p className="muted">막다른 가지를 유지할 확률입니다. 방 연결과 추가 통로에 따라 실제 막다른 끝 개수는 달라집니다.</p>
      <button type="submit">맵 생성</button>
    </form><section className="maker-result" aria-label="생성 결과">
      <h2>{draft.map.name} <span className="n" data-testid="maker-size">{draft.map.floors[0]!.width}×{draft.map.floors[0]!.height}</span></h2>
      <p role="status">{draft.summary}</p><Overview draft={draft}/>
      <p className="muted">회색: 벽 · 어두운 칸: 통로/방 · 밝은 바닥: 안전 구역 · 흰 칸: 시작 위치</p>
      <div className="maker-actions"><button onClick={startWalk}>걸어 보기</button><button onClick={download}>JSON 내려받기</button></div>
      <label className="maker-file">수정한 JSON 불러오기<input type="file" accept="application/json,.json" onChange={e => { void importFile(e.currentTarget.files?.[0]); e.currentTarget.value=''; }}/></label>
      <p className="muted">지형 이동을 시험하는 임시 진행입니다. 상자·적 배치는 내려받는 JSON에 보존하며, 제작 화면으로 돌아오면 시험을 다시 시작할 수 있습니다.</p>
    </section></div>
    {error&&<p className="maker-error" role="alert">{error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Maker/>);
