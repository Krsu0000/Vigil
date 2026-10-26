import {useEffect,useRef,useState} from 'react';
import type {TownDefinition} from '../content/town-schema.ts';

export function TownScene({town,onExit}:{town:TownDefinition;onExit:()=>void}){
  const [sceneId,setSceneId]=useState(town.entrySceneId);
  const [notice,setNotice]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  const scene=town.scenes.find(s=>s.id===sceneId)??town.scenes[0]!;
  const enter=(id:string)=>{setSceneId(id);setNotice('');};
  const act=(spot:typeof scene.hotspots[number])=>{
    if(spot.target.type==='exit'){onExit();return;}
    if(spot.target.type==='scene'){enter(spot.target.sceneId);return;}
    setNotice(`${spot.label}: NPC 대화는 다음 개발 단계에서 사용할 수 있습니다.`);
  };
  return <section className="town-game-screen" role="dialog" aria-modal="true" aria-label={town.name} data-testid="town-screen">
    <div className="town-game-shell">
      <header className="town-game-header">
        <div><p className="town-game-eyebrow">거점 · 마을</p><h2 ref={heading} tabIndex={-1}>{town.name}</h2></div>
        <button type="button" onClick={onExit}>탐험으로 돌아가기</button>
      </header>
      <div className="town-game-columns">
        <section className="town-game-main" aria-label="현재 마을 장면">
          <h3>{scene.title}</h3><p>{scene.description}</p>
          <div className="town-game-stage" role="group" aria-label={scene.title}>
            {scene.hotspots.map(spot=><button type="button" className="town-game-hotspot" key={spot.id} style={{left:spot.x+'%',top:spot.y+'%'}} title={spot.description} onClick={()=>act(spot)}>{spot.label}</button>)}
          </div>
        </section>
        <aside className="town-game-details" aria-label="장소 목록">
          <h3>장소와 인물</h3>
          {scene.hotspots.map(spot=><button type="button" className="town-game-list-item" key={spot.id} onClick={()=>act(spot)}>
            <strong>{spot.label}</strong><span>{spot.description}</span>
          </button>)}
          {notice&&<p role="status" className="town-game-notice">{notice}</p>}
          <p className="town-game-hint">마을 안에서 장소를 선택해도 격자 위치와 스태미나가 변경되지 않습니다.</p>
        </aside>
      </div>
    </div>
  </section>;
}
