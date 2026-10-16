import {MonsterGroupSchema} from '../src/content/schemas.ts';
import type {MonsterDefinition} from '../src/content/schemas.ts';
type Group=NonNullable<MonsterDefinition['groups']>[number];
type Step=Group['steps'][number];
export function normalGroup(id='normal'):Group{return MonsterGroupSchema.parse({id,name:'일반 공격',weight:3,steps:[{type:'attack',text:'공격한다.',multiplier:1}]});}
function nextId(groups:Group[],prefix:string){let id=prefix,n=2;while(groups.some(g=>g.id===id))id=`${prefix}_${n++}`;return id;}
export function presetGroup(groups:Group[],type:'charge'|'recover'):Group{
 return MonsterGroupSchema.parse(type==='charge'?{id:nextId(groups,'charge'),name:'힘 모으기 후 강공격',weight:1,steps:[{type:'wait',text:'힘을 모은다.',repeat:2},{type:'attack',text:'강하게 내리친다.',multiplier:2}]}:
  {id:nextId(groups,'recover'),name:'위기 시 회복',weight:1,priority:10,condition:{type:'health_below',value:50},cooldown:3,steps:[{type:'wait',text:'상처를 살피며 숨을 고른다.'},{type:'heal',text:'스스로 상처를 회복한다.',amount:10}]});
}
export function MonsterGroups({groups,onChange}:{groups:Group[];onChange:(groups:Group[])=>void}){
 const change=(index:number,patch:Partial<Group>)=>onChange(groups.map((g,i)=>i===index?{...g,...patch}:g));
 const stepChange=(gi:number,si:number,next:Step)=>change(gi,{steps:groups[gi]!.steps.map((s,i)=>i===si?next:s)});
 return <section className="monster-groups" aria-label="조건·무작위 행동 묶음">
  <h2>행동 묶음 · 조건과 랜덤 선택</h2><p>조건을 만족하는 묶음 중 우선순위가 높은 후보를 고른 뒤 가중치로 추첨합니다. 일반 공격3·강공격1이면 둘 다 조건을 만족할 때 3:1입니다. 시작한 묶음은 끝까지 실행한 뒤 다시 고릅니다.</p>
  <div className="maker-actions"><button type="button" disabled={groups.length>=32} onClick={()=>onChange([...groups,presetGroup(groups,'charge')])}>예제: 힘 모으기 2회 → 강공격</button><button type="button" disabled={groups.length>=32} onClick={()=>onChange([...groups,presetGroup(groups,'recover')])}>예제: 체력 50% 미만 → 대기·회복</button></div>
  {groups.map((g,gi)=><fieldset key={g.id} className="monster-group" data-testid="monster-group"><legend>묶음 {gi+1}</legend>
   <label>묶음 이름<input aria-label={`묶음 ${gi+1} 이름`} value={g.name} required onChange={e=>change(gi,{name:e.target.value})}/></label>
   <div className="maker-fields"><label>조건<select aria-label={`묶음 ${gi+1} 조건`} value={g.condition.type} onChange={e=>{const type=e.target.value as Group['condition']['type'];change(gi,{condition:type==='always'?{type}:{type,value:type==='health_below'?50:3}});}}><option value="always">항상</option><option value="health_below">자신의 체력 N% 미만</option><option value="turn_at_least">전투 N턴부터</option><option value="every_n_turns">전투 매 N번째 턴</option></select></label>
    {g.condition.type!=='always'&&<label>{g.condition.type==='health_below'?'체력 기준 (%)':'기준 턴'}<input type="number" aria-label={`묶음 ${gi+1} 조건 수치`} min="1" max={g.condition.type==='health_below'?100:10000} value={g.condition.value} onChange={e=>change(gi,{condition:g.condition.type==='always'?g.condition:{...g.condition,value:Number(e.target.value)}})}/></label>}
    <label>선택 가중치<input aria-label={`묶음 ${gi+1} 가중치`} type="number" min="1" max="1000" required value={g.weight} onChange={e=>change(gi,{weight:Number(e.target.value)})}/></label>
    <label>우선순위 (높을수록 우선)<input aria-label={`묶음 ${gi+1} 우선순위`} type="number" min="0" max="100" value={g.priority} onChange={e=>change(gi,{priority:Number(e.target.value)})}/></label>
    <label>완료 후 재사용 대기 턴<input aria-label={`묶음 ${gi+1} 재사용 대기`} type="number" min="0" max="1000" value={g.cooldown} onChange={e=>change(gi,{cooldown:Number(e.target.value)})}/></label>
    <label>전투당 최대 사용 (0=무제한)<input aria-label={`묶음 ${gi+1} 최대 사용`} type="number" min="0" max="1000" value={g.maxUses} onChange={e=>change(gi,{maxUses:Number(e.target.value)})}/></label>
   </div>
   {g.steps.map((step,si)=><fieldset className="monster-step" key={si}><legend>{si+1}번째 단계</legend><div className="maker-fields"><label>행동<select aria-label={`묶음 ${gi+1} 단계 ${si+1} 행동`} value={step.type} onChange={e=>{const type=e.target.value as Step['type'],common={repeat:step.repeat,text:type==='wait'?'힘을 모은다.':type==='heal'?'회복한다.':type==='guard'?'방어한다.':'공격한다.'};stepChange(gi,si,type==='attack'?{...common,type,multiplier:1}:type==='guard'?{...common,type,multiplier:.5}:type==='heal'?{...common,type,amount:10}:{...common,type});}}><option value="attack">공격</option><option value="wait">힘 모으기·대기</option><option value="guard">방어</option><option value="heal">자가 회복</option></select></label>
    <label>반복 횟수<input aria-label={`묶음 ${gi+1} 단계 ${si+1} 반복`} type="number" min="1" max="20" value={step.repeat} onChange={e=>stepChange(gi,si,{...step,repeat:Number(e.target.value)})}/></label></div>
    <label>행동 문구<input aria-label={`묶음 ${gi+1} 단계 ${si+1} 문구`} value={step.text} required onChange={e=>stepChange(gi,si,{...step,text:e.target.value})}/></label>
    {step.type!=='wait'&&<label>{step.type==='heal'?'회복량':step.type==='guard'?'받는 피해 배율 (0~1)':'공격 피해 배율 (0.1~10)'}<input aria-label={`묶음 ${gi+1} 단계 ${si+1} 수치`} type="number" min={step.type==='heal'?1:step.type==='attack'?.1:0} max={step.type==='guard'?1:step.type==='attack'?10:10000000} step={step.type==='heal'?1:.1} value={step.type==='heal'?step.amount:step.multiplier} onChange={e=>stepChange(gi,si,step.type==='heal'?{...step,amount:Number(e.target.value)}:{...step,multiplier:Number(e.target.value)})}/></label>}
    <div className="maker-actions"><button type="button" disabled={si===0} onClick={()=>{const steps=[...g.steps];[steps[si-1],steps[si]]=[steps[si]!,steps[si-1]!];change(gi,{steps});}}>단계 위로</button><button type="button" disabled={g.steps.length===1} onClick={()=>change(gi,{steps:g.steps.filter((_,i)=>i!==si)})}>단계 삭제</button></div>
   </fieldset>)}
   <div className="maker-actions"><button type="button" disabled={g.steps.length>=32} onClick={()=>change(gi,{steps:[...g.steps,{type:'attack',text:'공격한다.',multiplier:1,repeat:1}]})}>단계 추가</button><button type="button" disabled={groups.length===1} onClick={()=>onChange(groups.filter((_,i)=>i!==gi))}>묶음 삭제</button></div>
  </fieldset>)}
  <button type="button" disabled={groups.length>=32} onClick={()=>onChange([...groups,normalGroup(nextId(groups,'group'))])}>새 묶음 추가</button>
  <p className="muted">조건은 묶음을 시작할 때 검사합니다. 재사용 대기는 완료 다음 턴부터 세며, 조건에 맞는 묶음이 없으면 일반 공격합니다. 반복 횟수는 한 턴의 연속 행동 수가 아니라 같은 행동을 실행할 턴 수입니다.</p>
 </section>;
}
