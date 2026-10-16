import {describe,it,expect} from 'vitest';
import {generateMap} from './map-generator.ts';
import {parseWorld,cellAt,connect} from './world-editor.ts';
import {importMonsters,monsterCatalog,encounterCatalog,paintRegion,placeMonster,setEnemyLevels,generateEnemies} from './monster-tools.ts';
import {preparePreview} from './map-preview.ts';
import {loadMakerWorld} from './map-content.ts';
import {MonsterDefinitionSchema} from '../src/content/schemas.ts';
import {createNewGameStore,createGameStore} from '../src/runtime/store.ts';
import {createSaveFile,restoreSave} from '../src/persistence/save-file.ts';
import {connectedWorld} from './world-test-fixtures.ts';
const seed=[1,2,3,4];
function world(){return parseWorld([generateMap({width:32,height:24,rooms:4}).map]);}
const monster=MonsterDefinitionSchema.parse({kind:'monster',id:'monster.clockwork',name:'시계 인형',description:'턴 순서대로 행동한다.',glyph:'⚙',level:2,health:40,damageMin:4,damageMax:4,hitChance:1,intent:'다음 행동을 준비한다',loot:[],behavior:[{type:'wait',text:'태엽을 감는다.'},{type:'attack',text:'강하게 내리친다.',multiplier:2},{type:'guard',text:'방어한다.',multiplier:0},{type:'heal',text:'수리한다.',amount:5}]});
describe('제작자 영역·몬스터 확장',()=>{
  it('드래그 방향과 관계없이 사각형만 바꾸며 원본을 보존한다',()=>{const w=world(),before=JSON.stringify(w),m=w.maps[0]!;const r={mapId:m.id,floor:0,x1:3,y1:3,x2:1,y2:1};
    const next=paintRegion(w,r,'danger');expect(JSON.stringify(w)).toBe(before);for(const c of next.maps[0]!.floors[0]!.cells)if(c.x>=1&&c.x<=3&&c.y>=1&&c.y<=3)expect(c.zoneId).toBe('zone.ruins');
    expect(cellAt(paintRegion(w,r,'floor'),{mapId:m.id,floor:0,x:1,y:1})!.tileId).toBe('tile.floor');});
  it('벽 영역은 출입구 양쪽을 해제하고 시작점을 벽으로 바꾸지 않는다',()=>{const w=connectedWorld(),r={mapId:'map.s1_test',floor:0,x1:2,y1:1,x2:2,y2:1};const next=paintRegion(w,r,'wall');expect(cellAt(next,{mapId:'map.second',floor:0,x:1,y:1})!.exit).toBeUndefined();expect(()=>paintRegion(w,{...r,x1:1,x2:1},'wall')).toThrow('시작점');});
  it('안전 영역은 적 배치를 제거한다',()=>{const w=connectedWorld(),r={mapId:'map.s1_test',floor:0,x1:5,y1:1,x2:5,y2:1};expect(cellAt(paintRegion(w,r,'safe'),{mapId:r.mapId,floor:0,x:5,y:1})!.encounterId).toBeUndefined();});
  it('몬스터 불러오기는 중복 덮어쓰기와 실행 코드·잘못된 행동을 거부한다',()=>{const w=importMonsters(world(),[monster]);expect(monsterCatalog(w).find(m=>m.id===monster.id)).toEqual(monster);expect(importMonsters(w,[monster])).toEqual(w);
    expect(()=>importMonsters(w,[{...monster,health:999}])).toThrow('덮어쓸');expect(()=>importMonsters(w,[{...monster,behavior:[{type:'javascript',text:'run'}]}])).toThrow();});
  it('동일 종류의 배치 ID를 나누고 레벨을 여러 번 바꿔도 기본 수치에서 계산한다',()=>{let w=importMonsters(connectedWorld(),[monster]);const a={mapId:'map.second',floor:0,x:2,y:1},b={...a,x:3};
    w=placeMonster(w,a,monster.id,8);w=placeMonster(w,b,monster.id,9);expect(cellAt(w,a)!.encounterId).not.toBe(cellAt(w,b)!.encounterId);expect(loadMakerWorld(w).ok).toBe(true);
    const r={...a,x1:2,y1:1,x2:2,y2:1};w=setEnemyLevels(w,a.mapId,11,11,seed,r);const e=encounterCatalog(w).find(e=>e.id===cellAt(w,a)!.encounterId)!;const m=monsterCatalog(w).find(m=>m.id===e.enemies[0]!.monsterId)!;
    expect(m.level).toBe(11);expect(m.health).toBe(220);expect(m.damageMax).toBe(22);expect(monsterCatalog(w).find(m=>m.id===monster.id)).toEqual(monster);
    const other=encounterCatalog(w).find(e=>e.id===cellAt(w,b)!.encounterId)!;expect(monsterCatalog(w).find(m=>m.id===other.enemies[0]!.monsterId)!.level).toBe(9);
  });
  it('절차적 배치는 같은 시드로 재현하고 위험한 빈 칸/간격만 사용한다',()=>{const w=world(),m=w.maps[0]!,f=m.floors[0]!,r={mapId:m.id,floor:0,x1:0,y1:0,x2:f.width-1,y2:f.height-1},options={count:12,min:8,max:9,spacing:3,seed,monsterIds:['monster.wolf','monster.hound']};
    const a=generateEnemies(w,r,options),b=generateEnemies(w,r,options);expect(a).toEqual(b);expect(loadMakerWorld(a).ok).toBe(true);const placed=a.maps[0]!.floors[0]!.cells.filter(c=>c.encounterId);expect(placed).toHaveLength(12);
    for(const c of placed){expect(c.zoneId).toBe('zone.ruins');expect(c.tileId).toBe('tile.floor');for(const o of placed)if(o!==c)expect(Math.abs(o.x-c.x)+Math.abs(o.y-c.y)).toBeGreaterThanOrEqual(3);}
    expect(()=>generateEnemies(w,r,{...options,count:1000,spacing:512})).toThrow('조건');expect(w.encounters).toBeUndefined();});
  it('미연결 맵을 추가한 뒤에도 두 시험의 콘텐츠를 만들 수 있다',()=>{const w=world(),added=generateMap({id:'map.detached',width:9,height:9,rooms:1}).map;w.maps.push(added);const p={mapId:added.id,...added.start};
    expect(loadMakerWorld(w).ok).toBe(false);for(const terrain of [true,false]){const preview=preparePreview(w,p,terrain);expect(preview.notice).toContain('현재 맵');expect(preview.content.startMapId).toBe(added.id);expect(createNewGameStore(preview.content,seed,()=>0).getSnapshot().character!.position!.mapId).toBe(added.id);}
    expect(()=>preparePreview(w,p,false,'world')).toThrow();expect(w.maps).toHaveLength(2);
  });
  it('사용자 몬스터 전투의 행동과 SaveFile7 재생 복원이 일치한다',()=>{let w=importMonsters(connectedWorld(),[monster]);w=placeMonster(w,{mapId:'map.s1_test',floor:0,x:4,y:3},monster.id,2);const loaded=loadMakerWorld(w);if(!loaded.ok)throw new Error(JSON.stringify(loaded.errors));
    const store=createNewGameStore(loaded.content,seed,()=>0);for(const direction of ['east','east','south','south','east'] as const)expect(store.dispatch({type:'move/step',direction}).ok).toBe(true);expect(store.dispatch({type:'combat/start'}).ok).toBe(true);
    const before=store.getSnapshot().character!.health.current;store.dispatch({type:'combat/act',choice:'defend'});expect(store.getSnapshot().character!.health.current).toBe(before);expect(store.getSnapshot().expedition!.combat!.history.at(-1)!.text).toContain('태엽');
    store.dispatch({type:'combat/act',choice:'defend'});expect(store.getSnapshot().character!.health.current).toBe(before-4);
    store.dispatch({type:'combat/act',choice:'defend'});const enemy=store.getSnapshot().expedition!.combat!.enemies[0]!;store.dispatch({type:'combat/act',choice:'attack',targetId:enemy.id});expect(store.getSnapshot().expedition!.combat!.enemies[0]!.health).toBe(enemy.health);
    const save=createSaveFile(store.getSnapshot(),{contentVersion:loaded.content.contentVersion,saveId:'00000000-0000-4000-8000-000000000001',revision:1,savedAt:0});expect(createGameStore(loaded.content,restoreSave(JSON.parse(JSON.stringify(save))),()=>0).getSnapshot()).toEqual(store.getSnapshot());
  });
});
