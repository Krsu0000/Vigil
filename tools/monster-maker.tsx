import {useState} from 'react';
import type {FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {MonsterDefinitionSchema} from '../src/content/schemas.ts';
import type {MonsterDefinition} from '../src/content/schemas.ts';
import {parseMonsterPack} from './monster-tools.ts';
import '../src/ui/styles.css';
import './map-maker.css';
type Step=NonNullable<MonsterDefinition['behavior']>[number];
const initial=MonsterDefinitionSchema.parse({kind:'monster',id:'monster.custom',name:'새 몬스터',description:'새로 만든 몬스터입니다.',glyph:'◆',level:1,health:30,damageMin:4,damageMax:7,hitChance:.85,intent:'공격을 준비한다',loot:[]});
function download(data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='vigil-monsters.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function MonsterMaker(){
  const [base,setBase]=useState(initial),[steps,setSteps]=useState<Step[]>([{type:'attack',text:'발톱을 휘두른다.',multiplier:1}]),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [raw,setRaw]=useState(''),[formKey,setFormKey]=useState(0);
  const build=(form:HTMLFormElement)=>{const f=new FormData(form);return MonsterDefinitionSchema.parse({...base,id:f.get('id'),name:f.get('name'),description:f.get('description'),glyph:f.get('glyph'),intent:f.get('intent'),
    ...Object.fromEntries(['level','health','damageMin','damageMax','hitChance'].map(k=>[k,Number(f.get(k))])),behavior:steps});};
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();try{const monster=build(e.currentTarget);download({format:'vigil-monsters-v1',monsters:[monster]});setRaw(JSON.stringify(monster,null,2));setError('');setMessage('JSON을 저장했습니다. 맵 메이커의 몬스터 불러오기로 사용할 수 있습니다.');}catch(e){setError(e instanceof Error?e.message:String(e));}};
  const apply=(monster:MonsterDefinition)=>{setBase(monster);setSteps(monster.behavior??[{type:'attack',text:monster.intent,multiplier:1}]);setFormKey(k=>k+1);setError('');setMessage('몬스터를 불러왔습니다.');};
  return <main className="map-maker monster-maker"><header><h1>몬스터 제작</h1><a href="/map-maker.html" target="_blank" rel="noreferrer">맵 메이커</a></header>
    <p>기본 수치와 반복할 행동 순서를 정하고 JSON으로 내보낸 뒤 맵 메이커에서 불러오세요. 기존 몬스터를 수정하려면 새 ID를 사용하세요.</p>
    <form key={formKey} onSubmit={submit}><div className="maker-fields">
      {(['id','name','glyph','description','intent'] as const).map((k,i)=><label key={k}>{['몬스터 ID','이름','아이콘 문자','설명','기본 의도 문구'][i]}<input name={k} defaultValue={base[k]} required/></label>)}
      {(['level','health','damageMin','damageMax','hitChance'] as const).map((k,i)=><label key={k}>{['기본 레벨','체력','최소 피해','최대 피해','명중 확률 (0~1)'][i]}<input type="number" name={k} defaultValue={base[k]} min={k==='hitChance'?0:1} max={k==='hitChance'?1:k==='level'?999:10000000} step={k==='hitChance'?'.01':'1'} required/></label>)}
    </div><h2>행동 순서</h2><p>첫 행동부터 한 턴에 하나씩 실행하고 끝에 도달하면 반복합니다. 준비 → 강한 공격처럼 구성할 수 있습니다. 방어는 다음 플레이어 공격까지 적용됩니다.</p>
    {steps.map((step,index)=><fieldset className="monster-step" key={index}><legend>{index+1}번째 행동</legend><label>행동 종류<select aria-label={`행동 ${index+1} 종류`} value={step.type} onChange={e=>{const type=e.target.value as Step['type'];setSteps(s=>s.map((v,i)=>i!==index?v:type==='attack'?{type,text:'공격한다.',multiplier:1}:type==='guard'?{type,text:'방어 자세를 취한다.',multiplier:.5}:type==='heal'?{type,text:'상처를 회복한다.',amount:5}:{type,text:'힘을 모은다.'}));}}><option value="attack">공격</option><option value="wait">준비·대기</option><option value="guard">방어</option><option value="heal">자가 회복</option></select></label>
      <label>행동 문구<input aria-label={`행동 ${index+1} 문구`} value={step.text} required onChange={e=>setSteps(s=>s.map((v,i)=>i===index?{...v,text:e.target.value}:v))}/></label>
      {step.type!=='wait'&&<label>{step.type==='heal'?'회복량':step.type==='guard'?'받는 피해 배율 (0~1)':'공격 피해 배율 (0.1~10)'}<input aria-label={`행동 ${index+1} 수치`} type="number" min={step.type==='heal'?1:step.type==='attack'?.1:0} max={step.type==='guard'?1:step.type==='attack'?10:10000000} step={step.type==='heal'?1:.1} value={step.type==='heal'?step.amount:step.multiplier} onChange={e=>setSteps(s=>s.map((v,i)=>i!==index?v:v.type==='heal'?{...v,amount:Number(e.target.value)}:v.type==='wait'?v:{...v,multiplier:Number(e.target.value)}))}/></label>}
      <div className="maker-actions"><button type="button" disabled={index===0} onClick={()=>setSteps(s=>{const n=[...s];[n[index-1],n[index]]=[n[index]!,n[index-1]!];return n;})}>위로</button><button type="button" disabled={steps.length===1} onClick={()=>setSteps(s=>s.filter((_,i)=>i!==index))}>행동 삭제</button></div>
    </fieldset>)}
    <div className="maker-actions"><button type="button" disabled={steps.length>=32} onClick={()=>setSteps(s=>[...s,{type:'attack',text:'공격한다.',multiplier:1}])}>행동 추가</button><button type="submit">몬스터 JSON 내보내기</button></div></form>
    {error&&<p role="alert" className="maker-error">{error}</p>}<p role="status">{message}</p>
    <label>몬스터 JSON 불러오기<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return;try{if(file.size>2*1024*1024)throw new Error('몬스터 파일은 2MB 이하로 불러와 주세요.');const pack=parseMonsterPack(JSON.parse(await file.text()));if(pack.monsters.length!==1)throw new Error('이 화면에서는 몬스터 한 개의 파일을 편집합니다. 여러 개 묶음은 맵 메이커에서 불러오세요.');apply(pack.monsters[0]!);}catch(e){setError(e instanceof Error?e.message:String(e));}}}/></label>
    <details><summary>고급 JSON 편집 · 전리품 등</summary><textarea aria-label="몬스터 JSON" rows={16} value={raw} onChange={e=>setRaw(e.target.value)}/><button onClick={()=>{try{apply(MonsterDefinitionSchema.parse(JSON.parse(raw)));}catch(e){setError(e instanceof Error?e.message:String(e));}}}>JSON을 제작 화면에 적용</button></details>
  </main>;
}
createRoot(document.getElementById('root')!).render(<MonsterMaker/>);
