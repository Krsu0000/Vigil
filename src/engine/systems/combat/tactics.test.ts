import {describe,it,expect} from 'vitest';
import {MonsterDefinitionSchema,MonsterGroupSchema} from '../../../content/schemas.ts';
import type {MonsterDefinition} from '../../../content/schemas.ts';
import type {CombatEnemyState} from '../../core/combat-log.ts';
import type {Rng} from '../../core/rng.ts';
import {groupedAction,eligibleGroups,groupedIntent} from './tactics.ts';
const normal=MonsterGroupSchema.parse({id:'normal',name:'일반',weight:3,steps:[{type:'wait',text:'일반 행동'}]});
const charge=MonsterGroupSchema.parse({id:'charge',name:'강공격',weight:1,steps:[{type:'wait',text:'힘을 모은다',repeat:2},{type:'attack',text:'강하게 공격한다',multiplier:2}]});
const recover=MonsterGroupSchema.parse({id:'recover',name:'회복',priority:10,condition:{type:'health_below',value:50},cooldown:3,steps:[{type:'wait',text:'숨을 고른다'},{type:'heal',text:'회복한다',amount:25}]});
function monster(groups:NonNullable<MonsterDefinition['groups']>){return MonsterDefinitionSchema.parse({kind:'monster',id:'monster.grouped',name:'묶음 적',description:'조건을 판단한다',glyph:'●',level:1,health:100,damageMin:4,damageMax:4,hitChance:1,intent:'준비한다',loot:[],groups});}
const initial:CombatEnemyState={id:'enemy',monsterId:'monster.grouped',health:100,maxHealth:100,row:'front'};
function random(draws:number[]){let calls=0;const rng:Rng={nextInt(min,max){const n=draws[calls++%draws.length]!;expect(n).toBeGreaterThanOrEqual(min);expect(n).toBeLessThanOrEqual(max);return n;},nextFloat:()=>.5,nextUint32:()=>1,getState:()=>[1,2,3,4]};return {rng,calls:()=>calls};}
describe('조건과 가중치로 고르는 묶음',()=>{
 it('같은 우선순위 가중치3:1을 정확한 정수 추첨 구간으로 나눈다',()=>{const m=monster([normal,{...normal,id:'other',weight:1,name:'다른 묶음'}]),r=random([0,1,2,3]);let e=initial;for(let turn=1;turn<=4;turn++)e={...e,plan:groupedAction(m,e,turn,r.rng).plan};expect(e.plan!.uses).toEqual({normal:3,other:1});expect(r.calls()).toBe(4);});
 it('묶음 중간에 다시 추첨하거나 체력 조건으로 끊지 않고 대기2회 뒤 강공격한다',()=>{const m=monster([normal,charge,recover]),r=random([3]);let e=initial;
  const a=groupedAction(m,e,1,r.rng);expect(a.behavior?.type).toBe('wait');e={...e,health:30,plan:a.plan};expect(groupedIntent(m,e)).toContain('(2/2)');
  const b=groupedAction(m,e,2,r.rng);expect(b.behavior?.type).toBe('wait');e={...e,plan:b.plan};expect(groupedIntent(m,e)).toContain('강하게');
  const c=groupedAction(m,e,3,r.rng);expect(c.behavior).toMatchObject({type:'attack',multiplier:2});expect(r.calls()).toBe(1);e={...e,plan:c.plan};
  const d=groupedAction(m,e,4,r.rng);expect(d.plan.groupId).toBe('recover');expect(d.behavior?.type).toBe('wait');expect(r.calls()).toBe(1);
 });
 it('체력50%는 미만 조건에 포함하지 않으며49%일 때 높은 우선순위가 우선한다',()=>{const m=monster([normal,recover]),r=random([0]);expect(eligibleGroups(m,{...initial,health:50},1).map(g=>g.id)).toEqual(['normal']);const chosen=groupedAction(m,{...initial,health:49},1,r.rng);expect(chosen.plan.groupId).toBe('recover');expect(r.calls()).toBe(0);});
 it('완료 다음턴부터 재사용 대기를 세고 전투당 사용 횟수를 제한한다',()=>{const m=monster([normal,recover]),r=random([0]);let e={...initial,health:20};const a=groupedAction(m,e,1,r.rng);e={...e,plan:a.plan};const b=groupedAction(m,e,2,r.rng);e={...e,plan:b.plan};
  for(const turn of [3,4,5])expect(eligibleGroups(m,e,turn).map(g=>g.id)).toEqual(['normal']);expect(eligibleGroups(m,e,6).map(g=>g.id)).toContain('recover');
  const once=monster([normal,{...recover,maxUses:1}]);expect(eligibleGroups(once,e,6).map(g=>g.id)).toEqual(['normal']);
 });
 it('전투 시작 턴과 매N번째 턴 조건을 검사하고 후보가 없으면 일반 공격으로 돌아간다',()=>{const m=monster([{...normal,condition:{type:'turn_at_least',value:4}},{...normal,id:'periodic',condition:{type:'every_n_turns',value:3}}]),r=random([0]);expect(eligibleGroups(m,initial,1)).toEqual([]);expect(groupedAction(m,initial,1,r.rng).behavior).toBeUndefined();expect(r.calls()).toBe(0);expect(eligibleGroups(m,initial,3).map(g=>g.id)).toEqual(['periodic']);expect(eligibleGroups(m,initial,4).map(g=>g.id)).toEqual(['normal']);});
 it('방어는 실제 실행한 턴에만 설정하고 다음 행동에서 해제한다',()=>{const m=monster([{...normal,steps:[{type:'guard',text:'막는다',multiplier:0,repeat:1},{type:'wait',text:'쉰다',repeat:1}]}]),r=random([0]);const a=groupedAction(m,initial,1,r.rng);expect(a.plan.guardMultiplier).toBe(0);const b=groupedAction(m,{...initial,plan:a.plan},2,r.rng);expect(b.plan.guardMultiplier).toBeUndefined();});
 it('객체 내장 속성과 같은 묶음 ID도 사용 횟수를 정확히 센다',()=>{const m=monster([{...normal,id:'constructor',maxUses:1}]),r=random([0]);const a=groupedAction(m,initial,1,r.rng);expect(a.plan.uses.constructor).toBe(1);expect(eligibleGroups(m,{...initial,plan:a.plan},2)).toEqual([]);});
 it('중복ID·순차/묶음 혼용·과도한 반복·잘못된 조건을 거부한다',()=>{const m=monster([normal]);expect(()=>MonsterDefinitionSchema.parse({...m,groups:[normal,normal]})).toThrow();expect(()=>MonsterDefinitionSchema.parse({...m,behavior:[{type:'wait',text:'대기'}]})).toThrow();expect(()=>MonsterGroupSchema.parse({...charge,steps:Array.from({length:7},()=>({...charge.steps[0]!,repeat:20}))})).toThrow();expect(()=>MonsterGroupSchema.parse({...normal,condition:{type:'health_below',value:0}})).toThrow();});
});
