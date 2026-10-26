import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileImport,readImportJson} from './file-import.tsx';
import {parseTown,sampleTown} from './town-content.ts';
import type {TownDefinition} from './town-content.ts';
import '../src/ui/styles.css';
import './map-maker.css';

function TownMaker(){
  const [town,setTown]=useState<TownDefinition>(sampleTown);
  const [sceneId,setSceneId]=useState(sampleTown.entrySceneId);
  const [selected,setSelected]=useState<string>();
  const [status,setStatus]=useState('첫 마을 샘플입니다. 아직 실제 게임에 등록되지 않았습니다.');
  const [error,setError]=useState('');
  const scene=town.scenes.find(s=>s.id===sceneId)??town.scenes[0]!;
  const active=scene.hotspots.find(h=>h.id===selected);
  function navigate(id:string){setSceneId(id);setSelected(undefined);setStatus('장면: '+town.scenes.find(s=>s.id===id)?.title);}
  function choose(id:string){const spot=scene.hotspots.find(h=>h.id===id)!;setSelected(id);
    if(spot.target.type==='scene')navigate(spot.target.sceneId);
    else if(spot.target.type==='exit')setStatus('마을을 나갔습니다. 현재는 제작 미리보기이므로 실제 게임 좌표는 변하지 않습니다.');
    else setStatus('NPC 상호작용은 C3에서 연결합니다: '+spot.target.npcId);
  }
  const changeScene=(field:'title'|'description',value:string)=>{
    const next={...town,scenes:town.scenes.map(s=>s.id===scene.id?{...s,[field]:value}:s)};
    setTown(next);
  };
  const download=()=>{
    try{const checked=parseTown(town),url=URL.createObjectURL(new Blob([JSON.stringify(checked,null,2)+'\n'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=checked.id.replace('.','-')+'.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');setStatus('검증 후 JSON을 내려받았습니다. 실제 게임 등록은 아직 지원하지 않습니다.');
    }catch(e){setError(String(e));}
  };
  return <main className="map-maker town-maker">
    <header><h1>마을 제작 · 장면 미리보기</h1><a href="/">게임으로</a></header>
    <nav className="maker-navigation" aria-label="제작 도구"><a href="/map-maker.html">맵 메이커</a><a href="/monster-maker.html">몬스터 메이커</a><a href="/town-maker.html" aria-current="page">마을 메이커</a><span className="maker-navigation-status">NPC · 퀘스트: 준비 중</span></nav>
    <p>포인트 앤 클릭 마을을 제작·시험하는 초기 화면입니다. **게임 안에서 마을 입장·퇴장하는 기능은 아직 연결되지 않았습니다.**</p>
    <div className="maker-draft-status" role="status">{status}</div>
    <div className="maker-layout">
      <section>
        <h2>마을·장면 정보</h2>
        <label>마을 이름<input value={town.name} onChange={e=>setTown(t=>({...t,name:e.target.value}))}/></label>
        <label>마을 ID<input value={town.id} onChange={e=>setTown(t=>({...t,id:e.target.value}))}/></label>
        <p className="muted">기존 맵 앵커: {town.anchor.mapId}, {town.anchor.floor}층 ({town.anchor.x}, {town.anchor.y})</p>
        <label>편집할 장면<select value={sceneId} onChange={e=>navigate(e.target.value)}>{town.scenes.map(s=><option key={s.id} value={s.id}>{s.title} ({s.id})</option>)}</select></label>
        <label>장면 제목<input value={scene.title} onChange={e=>changeScene('title',e.target.value)}/></label>
        <label>장면 설명<textarea rows={4} value={scene.description} onChange={e=>changeScene('description',e.target.value)}/></label>
        <h2>핫스팟 목록</h2>
        {scene.hotspots.map(h=><button type="button" className="town-list-button" key={h.id} onClick={()=>choose(h.id)}>{h.label} · {h.target.type==='scene'?'다른 장면':h.target.type==='exit'?'나가기':'NPC'}</button>)}
        <div className="maker-actions"><button type="button" onClick={()=>{try{parseTown(town);setError('');setStatus('마을 구조 검증 통과');}catch(e){setError(String(e));}}}>전체 검증</button><button type="button" onClick={download}>마을 JSON 내려받기</button></div>
        <FileImport label="마을 JSON 불러오기" onImport={async file=>{const data=await readImportJson(file,2);const restored=parseTown(data);setTown(restored);setSceneId(restored.entrySceneId);setSelected(undefined);setError('');setStatus('마을 초안을 불러왔습니다.');return '마을 JSON 검증·적용 완료';}}/>
      </section>
      <section className="maker-result" aria-label="마을 장면">
        <h2>{scene.title} <span className="muted">{scene.id}</span></h2>
        <p>{scene.description}</p>
        <div className="town-scene" role="group" aria-label={scene.title}>
          <div className="town-scene-grid" aria-hidden="true"/>
          {scene.hotspots.map(h=><button type="button" key={h.id} className="town-hotspot" style={{left:h.x+'%',top:h.y+'%'}} onClick={()=>choose(h.id)} aria-label={h.label} title={h.description}>{h.label}</button>)}
        </div>
        <p className="muted">터치·키보드로 장소를 선택할 수 있습니다. 장면 이동은 일시적 화면 상태로만 관리합니다.</p>
        {active&&<p role="status">{active.description}</p>}
      </section>
    </div>
    {error&&<p className="maker-error" role="alert">{error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<TownMaker/>);
