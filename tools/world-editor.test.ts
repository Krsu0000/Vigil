import {describe,expect,it} from 'vitest';
import {connectedWorld} from './world-test-fixtures.ts';
import {cellAt,connect,disconnect,editCell,renameMap,assertCompatibleWorld,worldFromContent} from './world-editor.ts';
import {loadMakerMap,loadMakerWorld} from './map-content.ts';
import maps from '../src/content/maps/s1-test.json' with {type:'json'};

describe('맵 묶음과 제작자 편집',()=>{
  it('출입구 두 끝을 동시에 만들고 제거한다',()=>{
    const world=connectedWorld(),a={mapId:'map.s1_test',floor:0,x:2,y:1},b={mapId:'map.second',floor:0,x:1,y:1};
    expect(cellAt(world,a)!.exit!.target).toEqual(b);expect(cellAt(world,b)!.exit!.target).toEqual(a);
    expect(cellAt(disconnect(world,a),b)!.exit).toBeUndefined();expect(cellAt(world,b)!.exit).toBeDefined();
  });
  it('출입구를 옮길 때 이전 상대의 연결을 남기지 않는다',()=>{
    const world=connectedWorld(),a={mapId:'map.s1_test',floor:0,x:2,y:1},b={mapId:'map.second',floor:0,x:1,y:1},c={mapId:'map.second',floor:0,x:2,y:1};
    const next=connect(world,a,c,'portal');expect(cellAt(next,b)!.exit).toBeUndefined();expect(loadMakerWorld(next).ok).toBe(true);
  });
  it('선택 칸만 바꾸고 원본은 보존한다',()=>{
    const world=connectedWorld(),p={mapId:'map.second',floor:0,x:1,y:2},before=JSON.stringify(world);
    const next=editCell(world,p,c=>{c.zoneId='zone.camp';});expect(cellAt(next,p)!.zoneId).toBe('zone.camp');expect(JSON.stringify(world)).toBe(before);
  });
  it('ID 변경은 시작 맵과 다른 맵의 목적지까지 함께 갱신한다',()=>{
    const world=renameMap(connectedWorld(),'map.s1_test','map.home','새 거점',1);
    expect(world.startMapId).toBe('map.home');expect(cellAt(world,{mapId:'map.second',floor:0,x:1,y:1})!.exit!.target.mapId).toBe('map.home');expect(loadMakerWorld(world).ok).toBe(true);
    expect(()=>renameMap(world,'map.home','map.second','중복',1)).toThrow();
  });
  it.each(['self','wall','object'])('잘못된 연결 %s는 거부한다',mode=>{
    const w=connectedWorld(),p={mapId:'map.s1_test',floor:0,x:2,y:1},to=mode==='self'?p:{mapId:'map.second',floor:0,x:mode==='wall'?0:3,y:1};
    const world=mode==='object'?editCell(w,to,c=>{c.chestId='chest.camp_supply';}):w;
    expect(()=>connect(world,p,to,'stairs')).toThrow();
  });
  it('기존 맵을 유지한 새 지역/출입구 추가는 등록할 수 있다',()=>{
    const before=loadMakerMap(maps);if(!before.ok)throw new Error('기준 콘텐츠 오류');
    expect(()=>assertCompatibleWorld(before.content,connectedWorld())).not.toThrow();
    expect(worldFromContent(before.content).maps).toHaveLength(1);
  });
  it.each(['removed','version','wall','start','placement','home'])('기존 저장과 충돌하는 변경 %s를 등록 전에 거부한다',mode=>{
    const loaded=loadMakerMap(maps);if(!loaded.ok)throw new Error('콘텐츠 오류');const world=connectedWorld(),map=world.maps[0]!;
    if(mode==='removed')world.maps.shift();if(mode==='version')map.version++;if(mode==='wall')map.floors[0]!.cells.find(c=>c.x===1&&c.y===1)!.tileId='tile.wall';
    if(mode==='start')map.start.x++;if(mode==='placement')delete map.floors[0]!.cells.find(c=>c.chestId)!.chestId;if(mode==='home')world.startMapId='map.second';
    expect(()=>assertCompatibleWorld(loaded.content,world)).toThrow();
  });
});
