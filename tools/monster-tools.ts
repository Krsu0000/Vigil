import {z} from 'zod';
import {MonsterDefinitionSchema,EncounterDefinitionSchema} from '../src/content/schemas.ts';
import type {MonsterDefinition,EncounterDefinition} from '../src/content/schemas.ts';
import defaults from '../src/content/monsters.json' with {type:'json'};
import defaultEncounters from '../src/content/encounters.json' with {type:'json'};
import type {WorldBundle,CellPosition} from './world-editor.ts';
import {createRng,seedRngState} from '../src/engine/core/rng.ts';

export const MonsterPackSchema=z.strictObject({format:z.literal('vigil-monsters-v1'),monsters:z.array(MonsterDefinitionSchema).min(1).max(1000)});
export function parseMonsterPack(raw:unknown){
  if(Array.isArray(raw))return MonsterPackSchema.parse({format:'vigil-monsters-v1',monsters:raw});
  if(raw&&typeof raw==='object'&&'kind' in raw)return MonsterPackSchema.parse({format:'vigil-monsters-v1',monsters:[raw]});
  return MonsterPackSchema.parse(raw);
}
function canonical(v:unknown):string {
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';
  return JSON.stringify(v);
}
export function mergeDefinitions<T extends {id:string}>(base:readonly T[],added:readonly T[]):T[]{
  const byId=new Map(base.map(v=>[v.id,v]));
  for(const entry of added){const old=byId.get(entry.id);if(old&&canonical(old)!==canonical(entry))throw new Error(`같은 ID의 정의를 덮어쓸 수 없습니다. 새 ID로 만들어 주세요: ${entry.id}`);byId.set(entry.id,entry);}
  return [...byId.values()];
}
export function monsterCatalog(world:WorldBundle):MonsterDefinition[]{return mergeDefinitions(defaults.map(m=>MonsterDefinitionSchema.parse(m)),world.monsters??[]);}
export function encounterCatalog(world:WorldBundle):EncounterDefinition[]{return mergeDefinitions(defaultEncounters.map(m=>EncounterDefinitionSchema.parse(m)),world.encounters??[]);}
export function importMonsters(world:WorldBundle,raw:unknown):WorldBundle {
  const pack=parseMonsterPack(raw);mergeDefinitions(monsterCatalog(world),pack.monsters);
  return {...world,monsters:mergeDefinitions(world.monsters??[],pack.monsters)};
}
const level=z.number().int().min(1).max(999);
function uniqueId(prefix:string,ids:Set<string>){let n=1,id=prefix;while(ids.has(id))id=`${prefix}_${n++}`;ids.add(id);return id;}
function scaledMonster(world:WorldBundle,monsterId:string,targetLevel:number):{world:WorldBundle;id:string}{
  level.parse(targetLevel);const monsters=monsterCatalog(world),original=monsters.find(m=>m.id===monsterId);if(!original)throw new Error('몬스터 정의가 없습니다.');
  const base=monsters.find(m=>m.id===original.levelSourceId)??original;
  if(base.level===targetLevel)return {world,id:base.id};
  const ratio=targetLevel/base.level,scaled=(n:number)=>Math.max(1,Math.round(n*ratio));
  const candidate=MonsterDefinitionSchema.parse({...base,id:`${base.id}_lv_${targetLevel}`,level:targetLevel,levelSourceId:base.id,
    references:[...new Set([...base.references,base.id])],health:scaled(base.health),damageMin:scaled(base.damageMin),damageMax:scaled(base.damageMax),
    ...(base.behavior?{behavior:base.behavior.map(b=>b.type==='heal'?{...b,amount:scaled(b.amount)}:b)}:{})});
  const existing=monsters.find(m=>m.id===candidate.id);
  if(existing&&canonical(existing)===canonical(candidate))return {world,id:existing.id};
  if(existing)candidate.id=uniqueId(candidate.id,new Set(monsters.map(m=>m.id)));
  return {world:{...world,monsters:[...(world.monsters??[]),candidate]},id:candidate.id};
}
export type Region={mapId:string;floor:number;x1:number;y1:number;x2:number;y2:number};
export function inRegion(c:{x:number;y:number},r:Region){return c.x>=Math.min(r.x1,r.x2)&&c.x<=Math.max(r.x1,r.x2)&&c.y>=Math.min(r.y1,r.y2)&&c.y<=Math.max(r.y1,r.y2);}
export function paintRegion(world:WorldBundle,r:Region,mode:'floor'|'wall'|'safe'|'danger'):WorldBundle{
  const map=world.maps.find(m=>m.id===r.mapId),floor=map?.floors.find(f=>f.floor===r.floor);if(!floor)throw new Error('선택한 층이 없습니다.');
  const selected=new Set(floor.cells.filter(c=>inRegion(c,r)).map(c=>`${c.x},${c.y}`));
  if(mode==='wall'&&map!.start.floor===r.floor&&selected.has(`${map!.start.x},${map!.start.y}`))throw new Error('시작점은 벽으로 바꿀 수 없습니다. 시작점을 먼저 옮겨 주세요.');
  return {...world,maps:world.maps.map(m=>({...m,floors:m.floors.map(f=>({...f,cells:f.cells.map(c=>{
    const hit=m.id===r.mapId&&f.floor===r.floor&&selected.has(`${c.x},${c.y}`);
    const removePair=mode==='wall'&&c.exit?.target.mapId===r.mapId&&c.exit.target.floor===r.floor&&selected.has(`${c.exit.target.x},${c.exit.target.y}`);
    if(!hit&&!removePair)return c;const next={...c};if(removePair)delete next.exit;
    if(hit){if(mode==='floor')next.tileId='tile.floor';else if(mode==='wall'){next.tileId='tile.wall';delete next.exit;delete next.chestId;delete next.encounterId;}
      else {next.zoneId=mode==='safe'?'zone.camp':'zone.ruins';if(mode==='safe')delete next.encounterId;}}
    return next;
  })}))}))};
}
export function placeMonster(world:WorldBundle,p:CellPosition,monsterId:string,targetLevel:number):WorldBundle{
  const floor=world.maps.find(m=>m.id===p.mapId)?.floors.find(f=>f.floor===p.floor),cell=floor?.cells.find(c=>c.x===p.x&&c.y===p.y);
  const map=world.maps.find(m=>m.id===p.mapId);
  if(!cell||cell.tileId!=='tile.floor'||cell.zoneId!=='zone.ruins'||cell.chestId||cell.exit||(map?.start.floor===p.floor&&map.start.x===p.x&&map.start.y===p.y))throw new Error('시작점·출입구·상자가 없는 위험 구역 바닥에 배치해 주세요.');
  const scaled=scaledMonster(world,monsterId,targetLevel);const ids=new Set(encounterCatalog(scaled.world).map(e=>e.id));
  const id=uniqueId('encounter.placed',ids),monster=monsterCatalog(scaled.world).find(m=>m.id===scaled.id)!;
  const encounter=EncounterDefinitionSchema.parse({kind:'encounter',id,name:monster.name,enemies:[{monsterId:scaled.id,row:'front'}]});
  return {...scaled.world,encounters:[...(scaled.world.encounters??[]),encounter],maps:scaled.world.maps.map(m=>m.id!==p.mapId?m:{...m,floors:m.floors.map(f=>f.floor!==p.floor?f:{...f,cells:f.cells.map(c=>c.x===p.x&&c.y===p.y?{...c,encounterId:id}:c)})})};
}
function applyPlacements(world:WorldBundle,mapId:string,changes:Map<string,string>):WorldBundle {
  return {...world,maps:world.maps.map(m=>m.id!==mapId?m:{...m,floors:m.floors.map(f=>({...f,cells:f.cells.map(c=>{const id=changes.get(`${f.floor}:${c.x}:${c.y}`);return id?{...c,encounterId:id}:c;})}))})};
}
export function setEnemyLevels(world:WorldBundle,mapId:string,min:number,max:number,seed:readonly number[],region?:Region):WorldBundle{
  level.parse(min);level.parse(max);if(min>max)throw new Error('최소 레벨은 최대 레벨 이하여야 합니다.');
  const rng=createRng(seedRngState(seed)),catalog=encounterCatalog(world),ids=new Set(catalog.map(e=>e.id)),changes=new Map<string,string>();let next=world;
  const targets=world.maps.find(m=>m.id===mapId)?.floors.flatMap(f=>f.cells.filter(c=>c.encounterId&&(!region||(f.floor===region.floor&&inRegion(c,region)))).map(c=>({mapId,floor:f.floor,x:c.x,y:c.y,encounterId:c.encounterId!})))??[];
  for(const p of targets){const encounter=catalog.find(e=>e.id===p.encounterId)!;const enemies=[];
    for(const e of encounter.enemies){const scaled=scaledMonster(next,e.monsterId,rng.nextInt(min,max));next=scaled.world;enemies.push({...e,monsterId:scaled.id});}
    const id=uniqueId('encounter.leveled',ids),changed={...encounter,id,enemies};
    next={...next,encounters:[...(next.encounters??[]),changed]};changes.set(`${p.floor}:${p.x}:${p.y}`,id);
  }
  if(!targets.length)throw new Error('지정한 범위에 배치된 적이 없습니다.');return applyPlacements(next,mapId,changes);
}
export function generateEnemies(world:WorldBundle,r:Region,options:{count:number;min:number;max:number;spacing:number;seed:readonly number[];monsterIds:readonly string[]}):WorldBundle{
  z.number().int().min(1).max(1000).parse(options.count);z.number().int().min(0).max(512).parse(options.spacing);level.parse(options.min);level.parse(options.max);
  if(options.min>options.max||!options.monsterIds.length)throw new Error('레벨 범위와 몬스터 종류를 확인해 주세요.');
  const catalog=monsterCatalog(world);if(options.monsterIds.some(id=>!catalog.some(m=>m.id===id)))throw new Error('알 수 없는 몬스터입니다.');
  const map=world.maps.find(m=>m.id===r.mapId),floor=map?.floors.find(f=>f.floor===r.floor);if(!map||!floor)throw new Error('선택한 맵/층이 없습니다.');
  const candidates=floor.cells.filter(c=>inRegion(c,r)&&c.tileId==='tile.floor'&&c.zoneId==='zone.ruins'&&!c.exit&&!c.chestId&&!c.encounterId&&!(map.start.floor===r.floor&&map.start.x===c.x&&map.start.y===c.y));
  const rng=createRng(seedRngState(options.seed));for(let i=candidates.length-1;i>0;i--){const j=rng.nextInt(0,i);[candidates[i],candidates[j]]=[candidates[j]!,candidates[i]!];}
  // 좌표 버킷으로 주변 칸만 확인해 적 사이의 최소 간격을 지킨다.
  const bucketSize=Math.max(1,options.spacing),buckets=new Map<string,{x:number;y:number}[]>();
  const add=(c:{x:number;y:number})=>{const k=`${Math.floor(c.x/bucketSize)},${Math.floor(c.y/bucketSize)}`;const bucket=buckets.get(k)??[];bucket.push(c);buckets.set(k,bucket);};
  floor.cells.filter(c=>c.encounterId).forEach(add);const chosen:typeof candidates=[];
  for(const c of candidates){const bx=Math.floor(c.x/bucketSize),by=Math.floor(c.y/bucketSize);let blocked=false;
    for(let y=by-1;y<=by+1&&!blocked;y++)for(let x=bx-1;x<=bx+1&&!blocked;x++)blocked=(buckets.get(`${x},${y}`)??[]).some(o=>Math.abs(o.x-c.x)+Math.abs(o.y-c.y)<options.spacing);
    if(blocked)continue;chosen.push(c);add(c);if(chosen.length===options.count)break;}
  if(chosen.length!==options.count)throw new Error(`조건에 맞는 칸이 ${chosen.length}개입니다. 배치 수/간격을 줄여 주세요. 기존 배치는 유지됩니다.`);
  let next=world;const changes=new Map<string,string>(),ids=new Set(encounterCatalog(world).map(e=>e.id));
  for(const c of chosen){const scaled=scaledMonster(next,options.monsterIds[rng.nextInt(0,options.monsterIds.length-1)]!,rng.nextInt(options.min,options.max));next=scaled.world;
    const id=uniqueId('encounter.placed',ids),monster=monsterCatalog(next).find(m=>m.id===scaled.id)!;
    next={...next,encounters:[...(next.encounters??[]),EncounterDefinitionSchema.parse({kind:'encounter',id,name:monster.name,enemies:[{monsterId:scaled.id,row:'front'}]})]};changes.set(`${r.floor}:${c.x}:${c.y}`,id);
  }
  return applyPlacements(next,r.mapId,changes);
}
