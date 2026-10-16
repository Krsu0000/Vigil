import {describe,it,expect} from 'vitest';
import {MonsterDefinitionSchema,MonsterGroupSchema} from '../content/schemas.ts';
import {connectedWorld} from '../../tools/world-test-fixtures.ts';
import {importMonsters,placeMonster,setEnemyLevels,monsterCatalog,encounterCatalog} from '../../tools/monster-tools.ts';
import {loadMakerWorld} from '../../tools/map-content.ts';
import {createNewGameStore,createGameStore} from './store.ts';
import {createSaveFile,restoreSave} from '../persistence/save-file.ts';
import {v7ToV8} from '../persistence/migrations/v7-to-v8.ts';
import {SaveFileV7Schema} from '../persistence/schemas-v7.ts';
import type {MonsterDefinition} from '../content/schemas.ts';
const idle=MonsterGroupSchema.parse({id:'idle',name:'관찰',steps:[{type:'wait',text:'지켜본다'}]});
const heal=MonsterGroupSchema.parse({id:'recover',name:'위기 회복',priority:10,condition:{type:'health_below',value:50},steps:[{type:'wait',text:'숨을 고른다'},{type:'heal',text:'회복한다',amount:25}]});
const metadata={contentVersion:'0.4.0',saveId:'00000000-0000-4000-8000-000000000001',revision:1,savedAt:0};
function setup(groups:NonNullable<MonsterDefinition['groups']>){
 const monster=MonsterDefinitionSchema.parse({kind:'monster',id:'monster.conditional',name:'조건 적',description:'상태를 판단한다',glyph:'●',level:1,health:100,damageMin:4,damageMax:4,hitChance:1,intent:'준비한다',loot:[],groups});
 let world=importMonsters(connectedWorld(),[monster]);world=placeMonster(world,{mapId:'map.s1_test',floor:0,x:4,y:3},monster.id,1);
 const loaded=loadMakerWorld(world);if(!loaded.ok)throw new Error(JSON.stringify(loaded.errors));
 const content={...loaded.content,timeRules:{...loaded.content.timeRules,combat:{...loaded.content.timeRules.combat,attackMin:10,attackMax:10,hitChance:1}}};
 const store=createNewGameStore(content,[1,2,3,4],()=>0);for(const direction of ['east','east','south','south','east'] as const)store.dispatch({type:'move/step',direction});store.dispatch({type:'combat/start'});return {store,content,world};
}
describe('묶음 전투와 저장 연속성',()=>{
 it('가중치로 추첨한 전투도 저장 후 재추첨 없이 같은 난수/선택으로 이어진다',()=>{const {store,content}=setup([{...idle,weight:3},{...idle,id:'other',name:'다른 행동',weight:1,steps:[{type:'wait',text:'다른 행동',repeat:1}]}]);
  store.dispatch({type:'combat/act',choice:'defend'});const file=createSaveFile(store.getSnapshot(),metadata),resumed=createGameStore(content,restoreSave(JSON.parse(JSON.stringify(file))),()=>0);expect(resumed.getSnapshot()).toEqual(store.getSnapshot());
  for(let i=0;i<16;i++)expect(resumed.dispatch({type:'combat/act',choice:'defend'})).toEqual(store.dispatch({type:'combat/act',choice:'defend'}));
  const uses=store.getSnapshot().expedition!.combat!.enemies[0]!.plan!.uses;expect(uses.idle).toBeGreaterThan(0);expect(uses.other).toBeGreaterThan(0);
 });

 it('피해로50% 미만이 되면 대기 후 회복하며 저장/복원도 같은 행동과 난수로 이어진다',()=>{const {store,content}=setup([idle,heal]);const target=store.getSnapshot().expedition!.combat!.enemies[0]!.id;
  for(let i=0;i<5;i++)store.dispatch({type:'combat/act',choice:'attack',targetId:target});let combat=store.getSnapshot().expedition!.combat!;expect(combat.enemies[0]!.health).toBe(50);expect(combat.enemies[0]!.plan!.uses.recover).toBeUndefined();
  store.dispatch({type:'combat/act',choice:'attack',targetId:target});combat=store.getSnapshot().expedition!.combat!;expect(combat.enemies[0]!.health).toBe(40);expect(combat.enemies[0]!.plan).toMatchObject({groupId:'recover',step:1});expect(combat.history.at(-1)!.text).toContain('숨을');
  const state=store.getSnapshot(),file=createSaveFile(state,metadata);expect(file.schemaVersion).toBe(8);const resumed=createGameStore(content,restoreSave(JSON.parse(JSON.stringify(file))),()=>0);
  expect(resumed.dispatch({type:'combat/act',choice:'defend'})).toEqual(store.dispatch({type:'combat/act',choice:'defend'}));expect(store.getSnapshot().expedition!.combat!.enemies[0]!.health).toBe(65);expect(store.getSnapshot().expedition!.combat!.history.at(-1)!.text).toContain('25 회복');
 });
 it('확정한 묶음의 반복 단계/가드/추첨 상태 위조를 복원 전에 거부한다',()=>{const group=MonsterGroupSchema.parse({...idle,id:'guard',steps:[{type:'guard',text:'막는다',multiplier:0,repeat:2},{type:'attack',text:'친다',multiplier:2}]});const {store}=setup([group]);store.dispatch({type:'combat/act',choice:'defend'});const before=store.getSnapshot(),save=createSaveFile(before,metadata);
  for(const patch of [{repeat:0},{guardMultiplier:1},{uses:{guard:999}}]){const raw=structuredClone(save);const enemy=raw.state.expedition!.combat!.enemies[0]!;const corrupted={...raw,state:{...raw.state,expedition:{...raw.state.expedition!,combat:{...raw.state.expedition!.combat!,enemies:[{...enemy,plan:{...enemy.plan!,...patch}}]}}}};expect(()=>store.restore(corrupted)).toThrow();expect(store.getSnapshot()).toBe(before);}
  const target=before.expedition!.combat!.enemies[0]!;store.dispatch({type:'combat/act',choice:'attack',targetId:target.id});expect(store.getSnapshot().expedition!.combat!.enemies[0]!.health).toBe(100);
 });
 it('진짜 v7 전투를 변경 없이 v8로 옮기고 v7에는 새 진행 필드를 허용하지 않는다',()=>{const world=connectedWorld(),loaded=loadMakerWorld(world);if(!loaded.ok)throw new Error('콘텐츠 오류');const store=createNewGameStore(loaded.content,[1,2,3,4],()=>0);
  for(const direction of ['east','east','south','south','east','east','north','north'] as const)store.dispatch({type:'move/step',direction});store.dispatch({type:'combat/start'});store.dispatch({type:'combat/act',choice:'defend'});
  const old=SaveFileV7Schema.parse({...createSaveFile(store.getSnapshot(),metadata),schemaVersion:7}),before=JSON.stringify(old),upgraded=v7ToV8(old);expect(upgraded).toEqual({...old,schemaVersion:8});expect(JSON.stringify(old)).toBe(before);
  const resumed=createGameStore(loaded.content,restoreSave(old),()=>0);expect(resumed.dispatch({type:'combat/act',choice:'defend'})).toEqual(store.dispatch({type:'combat/act',choice:'defend'}));
  const bad=structuredClone(old);Object.assign(bad.state.expedition!.combat!.enemies[0]!,{plan:{step:0,repeat:0,uses:{},completed:{}}});expect(()=>v7ToV8(bad)).toThrow();
 });
 it('레벨 변형은 묶음 조건/가중치를 유지하고 회복량도 기본 정의에서 조정한다',()=>{const {world}=setup([idle,heal]);const next=setEnemyLevels(world,'map.s1_test',2,2,[1,2,3,4]);const cell=next.maps[0]!.floors[0]!.cells.find(c=>c.x===4&&c.y===3)!;const e=encounterCatalog(next).find(e=>e.id===cell.encounterId)!;const m=monsterCatalog(next).find(m=>m.id===e.enemies[0]!.monsterId)!;expect(m.groups![1]!.condition).toEqual({type:'health_below',value:50});expect(m.groups![1]!.steps[1]).toMatchObject({type:'heal',amount:50});});
});
