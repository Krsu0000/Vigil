import type {MonsterDefinition} from '../../../content/schemas.ts';
import type {DeepReadonly} from '../../../content/types.ts';
import type {CombatEnemyState,EnemyPlan} from '../../core/combat-log.ts';
import type {Rng} from '../../core/rng.ts';
type Monster=DeepReadonly<MonsterDefinition>;
const count=(record:Readonly<Record<string,number>>,id:string)=>Object.hasOwn(record,id)?record[id]!:0;
export function eligibleGroups(monster:Monster,enemy:CombatEnemyState,turn:number){
 const plan=enemy.plan??{step:0,repeat:0,uses:{},completed:{}};
 return (monster.groups??[]).filter(g=>{
  if(g.maxUses>0&&count(plan.uses,g.id)>=g.maxUses)return false;
  if(Object.hasOwn(plan.completed,g.id)&&turn<=count(plan.completed,g.id)+g.cooldown)return false;
  const c=g.condition;
  return c.type==='always'||(c.type==='health_below'&&enemy.health/enemy.maxHealth*100<c.value)||
    (c.type==='turn_at_least'&&turn>=c.value)||(c.type==='every_n_turns'&&turn%c.value===0);
 });
}
// 실제 적 행동 시점에만 선택한다. 진행 중 묶음은 조건이 바뀌어도 끝까지 실행한다.
export function groupedAction(monster:Monster,enemy:CombatEnemyState,turn:number,rng:Rng):{behavior:NonNullable<Monster['groups']>[number]['steps'][number]|undefined;plan:EnemyPlan}{
 let plan:EnemyPlan=enemy.plan??{step:0,repeat:0,uses:{},completed:{}};
 let group=monster.groups?.find(g=>g.id===plan.groupId);
 if(!group){
  const eligible=eligibleGroups(monster,enemy,turn),priority=Math.max(...eligible.map(g=>g.priority));
  const pool=eligible.filter(g=>g.priority===priority);
  if(pool.length===1)group=pool[0];
  else if(pool.length>1){let choice=rng.nextInt(0,pool.reduce((n,g)=>n+g.weight,0)-1);for(const g of pool){choice-=g.weight;if(choice<0){group=g;break;}}}
  if(!group)return {behavior:undefined,plan:{step:0,repeat:0,uses:plan.uses,completed:plan.completed} satisfies EnemyPlan};
  plan={...plan,groupId:group.id,step:0,repeat:0,uses:{...plan.uses,[group.id]:count(plan.uses,group.id)+1}};
 }
 const action=group.steps[plan.step];if(!action)throw new Error('진행 중인 행동 묶음의 단계가 유효하지 않습니다.');
 let step=plan.step,repeat=plan.repeat+1;if(repeat>=action.repeat){step++;repeat=0;}
 const guard=action.type==='guard'?{guardMultiplier:action.multiplier}:{};
 const nextPlan:EnemyPlan=step>=group.steps.length?
   {step:0,repeat:0,uses:plan.uses,completed:{...plan.completed,[group.id]:turn},...guard}:
   {groupId:group.id,step,repeat,uses:plan.uses,completed:plan.completed,...guard};
 return {behavior:action,plan:nextPlan};
}
export function groupedIntent(monster:Monster,enemy:CombatEnemyState){
 const group=monster.groups?.find(g=>g.id===enemy.plan?.groupId),step=group?.steps[enemy.plan?.step??0];
 return group&&step?`${group.name} · ${step.text}${step.repeat>1?` (${(enemy.plan?.repeat??0)+1}/${step.repeat})`:''}`:'상황을 살피며 다음 행동을 준비한다.';
}
