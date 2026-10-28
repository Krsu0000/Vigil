import {useEffect,useRef,useState} from 'react';
import type {TownDefinition} from '../content/town-schema.ts';
import {findNpc} from '../runtime/npcs.ts';

export function TownScene({town,onExit}:{town:TownDefinition;onExit:()=>void}){
  const [sceneId,setSceneId]=useState(town.entrySceneId);
  const [notice,setNotice]=useState('');
  const [dialogue,setDialogue]=useState<{npcId:string;nodeId:string}>();
  const npc=dialogue?findNpc(dialogue.npcId):undefined;
  const node=npc?.nodes.find(n=>n.id===dialogue?.nodeId);
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!event.defaultPrevented){
        event.preventDefault();event.stopPropagation();
        if(dialogue)setDialogue(undefined);else onExit();
      }
    };
    document.addEventListener('keydown',close,true);
    return ()=>document.removeEventListener('keydown',close,true);
  },[onExit,dialogue]);
  const scene=town.scenes.find(s=>s.id===sceneId)??town.scenes[0]!;
  const enter=(id:string)=>{setSceneId(id);setDialogue(undefined);setNotice('');};
  const act=(spot:typeof scene.hotspots[number])=>{
    if(spot.target.type==='exit'){onExit();return;}
    if(spot.target.type==='scene'){enter(spot.target.sceneId);return;}
    const target=findNpc(spot.target.npcId);
    if(!target){setNotice(`NPC 데이터가 등록되지 않았습니다: ${spot.target.npcId}`);return;}
    setDialogue({npcId:target.id,nodeId:target.startNodeId});setNotice('');
  };
  return <section className="town-game-screen" role="dialog" aria-modal="true" aria-label={town.name} data-testid="town-screen">
    <div className="town-game-shell" inert={!!dialogue}>
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
    {npc&&node&&<div className="town-dialogue-backdrop">
      <section className="town-dialogue-panel" role="dialog" aria-modal="true" aria-label={npc.name+'와 대화'}>
        <header><span className="town-dialogue-glyph" aria-hidden="true">{npc.glyph}</span><h3>{npc.name}</h3>
          <button type="button" onClick={()=>setDialogue(undefined)} aria-label="대화 닫기">×</button></header>
        <p>{node.text}</p>
        <div className="town-dialogue-choices">
          {node.choices.map((choice,index)=><button type="button" key={index} onClick={()=>choice.nextNodeId?setDialogue({npcId:npc.id,nodeId:choice.nextNodeId}):setDialogue(undefined)}>{choice.label}</button>)}
          {node.choices.length===0&&<button type="button" onClick={()=>setDialogue(undefined)}>대화 마치기</button>}
        </div>
      </section>
    </div>}
  </section>;
}
