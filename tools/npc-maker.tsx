import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import innkeeperRaw from '../src/world/npcs/innkeeper.json' with {type:'json'};
import {parseNpc} from '../src/content/npc-schema.ts';
import type {NpcDefinition} from '../src/content/npc-schema.ts';
import {FileImport,readImportJson} from './file-import.tsx';
import {MakerNavigation} from './maker-navigation.tsx';
import '../src/ui/styles.css';
import './map-maker.css';

type Node=NpcDefinition['nodes'][number];
type Choice=Node['choices'][number];
function NpcMaker(){
  const [npc,setNpc]=useState<NpcDefinition>(()=>parseNpc(innkeeperRaw));
  const [nodeId,setNodeId]=useState('dialogue.greeting');
  const [preview,setPreview]=useState<string|null>(null);
  const [message,setMessage]=useState('샘플 NPC를 편집하고 JSON으로 내려받으세요. 실제 게임 등록은 별도 단계입니다.');
  const [error,setError]=useState('');
  const node=npc.nodes.find(n=>n.id===nodeId)??npc.nodes[0]!;
  const attempt=(fn:()=>void)=>{try{fn();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const updateNode=(fn:(n:Node)=>Node)=>setNpc(prev=>({...prev,nodes:prev.nodes.map(n=>n.id===node.id?fn(n):n)}));
  const updateChoice=(index:number,fn:(c:Choice)=>Choice)=>updateNode(n=>({...n,choices:n.choices.map((c,i)=>i===index?fn(c):c)}));
  const addNode=()=>attempt(()=>{
    let number=1;while(npc.nodes.some(n=>n.id===`dialogue.new_${number}`))number++;
    const id=`dialogue.new_${number}`,next:Node={id,text:'새 대화문을 입력하세요.',choices:[]};
    setNpc({...npc,nodes:npc.nodes.map(n=>n.id===node.id?{...n,choices:[...n.choices,{label:'새 대화로 이동',nextNodeId:id}]}:n).concat(next)});
    setNodeId(id);setPreview(null);setMessage('새 대화 노드를 추가하고 이전 노드에 연결했습니다.');
  });
  const removeNode=()=>attempt(()=>{
    if(node.id===npc.startNodeId)throw new Error('시작 노드는 삭제할 수 없습니다.');
    if(!window.confirm('이 대화 노드를 삭제하고 연결된 선택지도 제거할까요?'))return;
    const next={...npc,nodes:npc.nodes.filter(n=>n.id!==node.id).map(n=>({...n,choices:n.choices.filter(c=>c.nextNodeId!==node.id)}))};
    parseNpc(next);
    setNpc(next);setNodeId(npc.startNodeId);setPreview(null);setMessage('대화 노드를 삭제했습니다.');
  });
  const download=()=>attempt(()=>{
    const checked=parseNpc(npc),url=URL.createObjectURL(new Blob([JSON.stringify(checked,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=checked.id.replace('.','-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage('검증 완료 · NPC JSON을 내려받았습니다. 게임 자동 등록은 아직 지원하지 않습니다.');
  });
  const previewNode=preview?npc.nodes.find(n=>n.id===preview):undefined;
  return <main className="map-maker npc-maker">
    <header><h1>NPC 제작 · 대화 편집기</h1><a href="/">게임으로</a></header>
    <MakerNavigation active="npc"/>
    <p>고정 배치 NPC와 대화 선택지를 만듭니다. 마을 메이커의 NPC 핫스팟에는 동일한 NPC ID를 입력하세요.</p>
    <p className="maker-draft-status" role="status">{message}</p>
    <div className="maker-layout">
      <section>
        <h2>NPC 정의</h2>
        <label>NPC ID<input aria-label="NPC ID" value={npc.id} onChange={e=>setNpc(n=>({...n,id:e.target.value}))}/></label>
        <div className="maker-fields">
          <label>이름<input aria-label="NPC 이름" value={npc.name} onChange={e=>setNpc(n=>({...n,name:e.target.value}))}/></label>
          <label>표시 기호<input aria-label="NPC 기호" value={npc.glyph} maxLength={5} onChange={e=>setNpc(n=>({...n,glyph:e.target.value}))}/></label>
        </div>
        <label>설명<textarea rows={2} value={npc.description} onChange={e=>setNpc(n=>({...n,description:e.target.value}))}/></label>
        <label>시작 대화<select aria-label="시작 대화" value={npc.startNodeId} onChange={e=>setNpc(n=>({...n,startNodeId:e.target.value}))}>{npc.nodes.map(n=><option value={n.id} key={n.id}>{n.id}</option>)}</select></label>
        <h2>대화 노드</h2>
        <label>편집할 대화<select aria-label="편집할 대화" value={node.id} onChange={e=>setNodeId(e.target.value)}>{npc.nodes.map(n=><option value={n.id} key={n.id}>{n.id}</option>)}</select></label>
        <div className="maker-actions"><button type="button" onClick={addNode}>대화 추가</button><button type="button" onClick={removeNode} disabled={node.id===npc.startNodeId}>대화 삭제</button></div>
        <p className="muted">노드 ID: {node.id}</p>
        <label>대화문<textarea aria-label="대화 내용" rows={5} value={node.text} onChange={e=>updateNode(n=>({...n,text:e.target.value}))}/></label>
        <h2>선택지</h2>
        {node.choices.map((choice,index)=><fieldset key={index} className="npc-choice-editor">
          <legend>선택지 {index+1}</legend>
          <label>보이는 문구<input aria-label={`선택지 ${index+1} 문구`} value={choice.label} onChange={e=>updateChoice(index,c=>({...c,label:e.target.value}))}/></label>
          <label>다음 대화<select aria-label={`선택지 ${index+1} 연결`} value={choice.nextNodeId??''} onChange={e=>updateChoice(index,c=>e.target.value?{...c,nextNodeId:e.target.value}:{label:c.label})}>
            <option value="">대화 종료</option>{npc.nodes.map(n=><option key={n.id} value={n.id}>{n.id}</option>)}
          </select></label>
          <button type="button" onClick={()=>updateNode(n=>({...n,choices:n.choices.filter((_,i)=>i!==index)}))}>선택지 삭제</button>
        </fieldset>)}
        <div className="maker-actions"><button type="button" disabled={node.choices.length>=10} onClick={()=>updateNode(n=>({...n,choices:[...n.choices,{label:'대화를 마친다'}]}))}>선택지 추가</button></div>
        <div className="maker-actions"><button type="button" onClick={()=>attempt(()=>{parseNpc(npc);setMessage('NPC 구조·연결 검증 통과');})}>전체 검증</button><button type="button" onClick={download}>NPC JSON 내려받기</button></div>
        <FileImport label="NPC JSON 불러오기" onImport={async file=>{const data=await readImportJson(file,2),loaded=parseNpc(data);setNpc(loaded);setNodeId(loaded.startNodeId);setPreview(null);setError('');setMessage('NPC 파일을 불러왔습니다.');return 'NPC JSON 검증·적용 완료';}}/>
      </section>
      <section className="maker-result" aria-label="NPC 대화 미리보기">
        <h2>대화 미리보기</h2>
        <p className="muted">대화는 실제 퀘스트·게임 저장 상태를 변경하지 않습니다.</p>
        <button type="button" onClick={()=>attempt(()=>{parseNpc(npc);setPreview(npc.startNodeId);setMessage('대화 미리보기 시작');})}>대화 시험</button>
        {previewNode?<section className="npc-preview" aria-label={npc.name+' 대화 미리보기'}>
          <h3>{npc.glyph} {npc.name}</h3><p>{previewNode.text}</p>
          {previewNode.choices.map((choice,i)=><button type="button" key={i} onClick={()=>setPreview(choice.nextNodeId??null)}>{choice.label}</button>)}
          <button type="button" onClick={()=>setPreview(null)}>미리보기 종료</button>
        </section>:<p>대화 시험 버튼으로 분기와 종료를 확인할 수 있습니다.</p>}
      </section>
    </div>
    {error&&<p className="maker-error" role="alert">{error}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<NpcMaker/>);
