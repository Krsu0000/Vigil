import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileImport,readImportJson} from './file-import.tsx';
import {MakerNavigation} from './maker-navigation.tsx';
import {parseTown,sampleTown} from './town-content.ts';
import type {TownDefinition} from './town-content.ts';
import {addTownScene,removeTownScene,renameTownScene,addTownHotspot,removeTownHotspot,updateTownHotspot} from './town-editor.ts';
import type {Hotspot} from './town-editor.ts';
import '../src/ui/styles.css';
import './map-maker.css';

type Mode='edit'|'preview';
function TownMaker(){
  const [town,setTown]=useState<TownDefinition>(sampleTown);
  const [sceneId,setSceneId]=useState(sampleTown.entrySceneId);
  const [selected,setSelected]=useState<string>();
  const [mode,setMode]=useState<Mode>('edit');
  const [status,setStatus]=useState('첫 마을 샘플입니다. 아직 실제 게임에 등록되지 않았습니다.');
  const [error,setError]=useState('');
  const scene=town.scenes.find(s=>s.id===sceneId)??town.scenes[0]!;
  const active=scene.hotspots.find(h=>h.id===selected);
  const attempt=(action:()=>void)=>{try{action();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
  function navigate(id:string){setSceneId(id);setSelected(undefined);setStatus('장면: '+town.scenes.find(s=>s.id===id)?.title);}
  function choose(spot:Hotspot){
    if(mode==='edit'){setSelected(spot.id);return;}
    setSelected(spot.id);
    if(spot.target.type==='scene')navigate(spot.target.sceneId);
    else if(spot.target.type==='exit')setStatus('나가기 동작: 실제 게임 좌표는 바뀌지 않는 제작 미리보기입니다.');
    else setStatus('NPC 상호작용은 C3에서 연결합니다: '+spot.target.npcId);
  }
  const changeScene=(field:'title'|'description',value:string)=>setTown(t=>({...t,scenes:t.scenes.map(s=>s.id===scene.id?{...s,[field]:value}:s)}));
  const changeSpot=(transform:(h:Hotspot)=>Hotspot)=>{if(active)setTown(t=>updateTownHotspot(t,scene.id,active.id,transform));};
  const createScene=()=>attempt(()=>{const result=addTownScene(town,scene.id);setTown(result.town);setSceneId(result.sceneId);setSelected(undefined);setStatus('장면과 돌아가기 연결을 추가했습니다.');});
  const removeScene=()=>attempt(()=>{if(!window.confirm(`${scene.title} 장면을 삭제할까요? 이 장면으로 들어오는 연결도 삭제합니다.`))return;
    setTown(removeTownScene(town,scene.id));setSceneId(town.entrySceneId);setSelected(undefined);setStatus('장면을 삭제했습니다.');});
  const createSpot=()=>attempt(()=>{const result=addTownHotspot(town,scene.id);setTown(result.town);setSelected(result.hotspotId);setStatus('핫스팟을 추가했습니다. 대상과 위치를 수정하세요.');});
  const removeSpot=()=>attempt(()=>{if(!active||!window.confirm('선택한 핫스팟을 삭제할까요?'))return;setTown(removeTownHotspot(town,scene.id,active.id));setSelected(undefined);setStatus('핫스팟을 삭제했습니다.');});
  const download=()=>attempt(()=>{const checked=parseTown(town),url=URL.createObjectURL(new Blob([JSON.stringify(checked,null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=checked.id.replace('.','-')+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('검증 후 JSON을 내려받았습니다. 실제 게임 등록은 아직 지원하지 않습니다.');
  });
  return <main className="map-maker town-maker">
    <header><h1>마을 제작 · 포인트 앤 클릭</h1><a href="/">게임으로</a></header>
    <MakerNavigation active="town"/>
    <p>장면을 만들고 건물·NPC 핫스팟을 배치하세요. 게임 안에서 마을 입장·퇴장하는 기능은 아직 연결되지 않았습니다.</p>
    <p className="maker-draft-status" role="status">{status}</p>
    <div className="maker-layout">
      <section>
        <h2>마을·격자 앵커</h2>
        <label>마을 이름<input value={town.name} onChange={e=>setTown(t=>({...t,name:e.target.value}))}/></label>
        <label>마을 ID<input value={town.id} onChange={e=>setTown(t=>({...t,id:e.target.value}))}/></label>
        <div className="maker-fields">
          <label>격자 맵 ID<input aria-label="마을 앵커 맵 ID" value={town.anchor.mapId} onChange={e=>setTown(t=>({...t,anchor:{...t.anchor,mapId:e.target.value}}))}/></label>
          <label>층<input aria-label="마을 앵커 층" type="number" value={town.anchor.floor} onChange={e=>setTown(t=>({...t,anchor:{...t.anchor,floor:Number(e.target.value)}}))}/></label>
          <label>입구 X<input aria-label="마을 앵커 X" type="number" min={0} value={town.anchor.x} onChange={e=>setTown(t=>({...t,anchor:{...t.anchor,x:Number(e.target.value)}}))}/></label>
          <label>입구 Y<input aria-label="마을 앵커 Y" type="number" min={0} value={town.anchor.y} onChange={e=>setTown(t=>({...t,anchor:{...t.anchor,y:Number(e.target.value)}}))}/></label>
        </div>
        <h2>장면 편집</h2>
        <label>선택 장면<select aria-label="편집할 장면" value={scene.id} onChange={e=>navigate(e.target.value)}>{town.scenes.map(s=><option key={s.id} value={s.id}>{s.title} ({s.id})</option>)}</select></label>
        <div className="maker-actions"><button type="button" onClick={createScene}>장면 추가</button><button type="button" disabled={scene.id===town.entrySceneId} onClick={removeScene}>장면 삭제</button></div>
        <label>장면 ID<input key={scene.id} defaultValue={scene.id} onBlur={e=>{const next=e.target.value.trim();if(next!==scene.id)attempt(()=>{const result=renameTownScene(town,scene.id,next);setTown(result);setSceneId(next);setStatus('장면 ID 및 연결을 함께 변경했습니다.');});}}/></label>
        <label>장면 제목<input value={scene.title} onChange={e=>changeScene('title',e.target.value)}/></label>
        <label>장면 설명<textarea rows={3} value={scene.description} onChange={e=>changeScene('description',e.target.value)}/></label>
        <label>입장 장면<select aria-label="마을 입장 장면" value={town.entrySceneId} onChange={e=>setTown(t=>({...t,entrySceneId:e.target.value}))}>{town.scenes.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <h2>핫스팟 편집</h2>
        <div className="maker-actions"><button type="button" onClick={createSpot}>핫스팟 추가</button><button type="button" disabled={!active} onClick={removeSpot}>선택 삭제</button></div>
        {scene.hotspots.map(h=><button type="button" key={h.id} className="town-list-button" aria-pressed={selected===h.id} onClick={()=>{setMode('edit');setSelected(h.id);}}>{h.label} · {h.target.type==='scene'?'장면 이동':h.target.type==='exit'?'나가기':'NPC'} {selected===h.id?'(선택됨)':''}</button>)}
        {active?<div className="town-property" aria-label="선택한 핫스팟 속성">
          <p className="muted">핫스팟 ID: {active.id}</p>
          <label>표시 이름<input aria-label="핫스팟 이름" value={active.label} onChange={e=>changeSpot(h=>({...h,label:e.target.value}))}/></label>
          <label>설명<textarea aria-label="핫스팟 설명" rows={2} value={active.description} onChange={e=>changeSpot(h=>({...h,description:e.target.value}))}/></label>
          <div className="maker-fields">
            <label>X (%)<input aria-label="핫스팟 X" type="number" min={0} max={100} value={active.x} onChange={e=>changeSpot(h=>({...h,x:Number(e.target.value)}))}/></label>
            <label>Y (%)<input aria-label="핫스팟 Y" type="number" min={0} max={100} value={active.y} onChange={e=>changeSpot(h=>({...h,y:Number(e.target.value)}))}/></label>
          </div>
          <label>상호작용 종류<select aria-label="핫스팟 종류" value={active.target.type} onChange={e=>changeSpot(h=>({...h,target:e.target.value==='scene'?{type:'scene',sceneId:town.entrySceneId}:e.target.value==='npc'?{type:'npc',npcId:'npc.new_1'}:{type:'exit'}}))}>
            <option value="scene">다른 장면으로</option><option value="exit">마을 나가기</option><option value="npc">NPC와 대화 (C3 연동 예정)</option>
          </select></label>
          {active.target.type==='scene'&&<label>도착 장면<select aria-label="핫스팟 도착 장면" value={active.target.sceneId} onChange={e=>changeSpot(h=>({...h,target:{type:'scene',sceneId:e.target.value}}))}>{town.scenes.map(s=><option key={s.id} value={s.id}>{s.title} ({s.id})</option>)}</select></label>}
          {active.target.type==='npc'&&<label>NPC ID<input aria-label="핫스팟 NPC ID" value={active.target.npcId} onChange={e=>changeSpot(h=>({...h,target:{type:'npc',npcId:e.target.value}}))}/></label>}
        </div>:<p className="muted">왼쪽 목록이나 장면의 핫스팟을 선택해 속성을 편집하세요.</p>}
        <div className="maker-actions"><button type="button" onClick={()=>attempt(()=>{parseTown(town);setStatus('마을 구조 검증 통과');})}>전체 검증</button><button type="button" onClick={download}>마을 JSON 내려받기</button></div>
        <FileImport label="마을 JSON 불러오기" onImport={async file=>{const data=await readImportJson(file,2);const restored=parseTown(data);setTown(restored);setSceneId(restored.entrySceneId);setSelected(undefined);setError('');setStatus('마을 초안을 불러왔습니다.');return '마을 JSON 검증·적용 완료';}}/>
      </section>
      <section className="maker-result" aria-label="마을 장면">
        <div className="town-stage-heading"><h2>{scene.title}</h2><div className="maker-actions" role="group" aria-label="장면 작업 모드">
          <button type="button" aria-pressed={mode==='edit'} onClick={()=>setMode('edit')}>편집</button>
          <button type="button" aria-pressed={mode==='preview'} onClick={()=>{attempt(()=>{parseTown(town);setMode('preview');setSelected(undefined);setStatus('장면 미리보기: 장소를 누르면 이동합니다.');});}}>걸어 보기</button>
        </div></div>
        <p>{scene.description}</p>
        <div className="town-scene" role="group" aria-label={scene.title}>
          <div className="town-scene-grid" aria-hidden="true"/>
          {scene.hotspots.map(h=><button type="button" key={h.id} className="town-hotspot" aria-pressed={mode==='edit'?selected===h.id:undefined} style={{left:h.x+'%',top:h.y+'%'}} onClick={()=>choose(h)} aria-label={h.label} title={h.description}>{h.label}</button>)}
        </div>
        <p className="muted">{mode==='edit'?'편집 모드: 핫스팟을 클릭해 속성을 수정합니다.':'미리보기 모드: 장소를 클릭해 장면을 이동합니다.'} 배경 이미지 없이도 목록과 키보드로 사용할 수 있습니다.</p>
        {active&&<p role="status">{active.description}</p>}
      </section>
    </div>
    {error&&<p className="maker-error" role="alert">{error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<TownMaker/>);
