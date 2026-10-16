import {describe,expect,it} from 'vitest';
import {connectedWorld} from '../../tools/world-test-fixtures.ts';
import {loadMakerWorld} from '../../tools/map-content.ts';
import {cellAt,editCell} from '../../tools/world-editor.ts';
import {createNewGameStore,createGameStore} from './store.ts';
import {createSaveFile,restoreSave} from '../persistence/save-file.ts';
import {currentExit} from '../engine/systems/map/selectors.ts';
import {mapHandlers} from '../engine/systems/map/actions.ts';
import {createDispatcher} from '../engine/core/dispatch.ts';
import type {MapAction,MapEvent} from '../engine/systems/map/actions.ts';
import {createGameLoop} from './loop.ts';
import type {GameState} from '../engine/core/state.ts';

function setup(){const world=connectedWorld(),loaded=loadMakerWorld(world);if(!loaded.ok)throw new Error(JSON.stringify(loaded.errors));const store=createNewGameStore(loaded.content,[1,2,3,4],()=>1000);return {world,content:loaded.content,store};}
describe('맵 사이 이동과 저장',()=>{
  it('도착 칸만 공개하며 기존 탐사·자원·시간·난수·물품을 보존하고 자동 재이동하지 않는다',()=>{
    const {store}=setup();store.dispatch({type:'move/step',direction:'east'});const before=store.getSnapshot();
    expect(store.dispatch({type:'map/travel'}).ok).toBe(true);const after=store.getSnapshot();
    expect(after.character!.position).toEqual({mapId:'map.second',floor:0,x:1,y:1});expect(after.campaign.exploration['map.second']!.visited).toEqual({'0:1:1':true});
    expect(after.campaign.exploration['map.s1_test']).toEqual(before.campaign.exploration['map.s1_test']);expect(after.meta).toEqual(before.meta);
    expect(after.character!.stamina).toEqual(before.character!.stamina);expect(after.character!.inventory).toEqual(before.character!.inventory);
    expect(after.campaign.recentRecords).toEqual(before.campaign.recentRecords);expect(currentExit(after,store.content)).toBeDefined();
    expect(store.dispatch({type:'map/travel'}).ok).toBe(true);expect(store.getSnapshot().character!.position!.mapId).toBe('map.s1_test');
  });
  it('다른 맵에서 명시한 거점으로 귀환하고 지역 기록을 보존한다',()=>{
    const {store}=setup();store.dispatch({type:'move/step',direction:'east'});store.dispatch({type:'map/travel'});const before=store.getSnapshot().campaign.exploration['map.second'];
    expect(store.dispatch({type:'map/return'}).ok).toBe(true);expect(store.getSnapshot().character!.position).toEqual({mapId:'map.s1_test',floor:0,x:1,y:1});expect(store.getSnapshot().campaign.exploration['map.second']).toEqual(before);
  });
  it('SaveFile7에서 여러 맵 위치와 탐사 기록이 왕복 복원된다',()=>{
    const {store,content}=setup();store.dispatch({type:'move/step',direction:'east'});store.dispatch({type:'map/travel'});
    const file=createSaveFile(store.getSnapshot(),{contentVersion:content.contentVersion,saveId:'00000000-0000-4000-8000-000000000001',revision:1,savedAt:1000});
    expect(file.schemaVersion).toBe(7);const restored=createGameStore(content,restoreSave(JSON.parse(JSON.stringify(file))),()=>1000);
    expect(restored.getSnapshot()).toEqual(store.getSnapshot());expect(restored.dispatch({type:'map/travel'}).ok).toBe(true);
  });
  it.each(['no-exit','pending','dead','combat'])('%s에서는 이동을 거부하고 같은 상태를 반환한다',mode=>{
    const {store,content}=setup();if(mode!=='no-exit')store.dispatch({type:'move/step',direction:'east'});
    const before=store.getSnapshot(),state:GameState=mode==='pending'?{...before,expedition:{pendingAmbush:{triggeredAt:0,activityAtTrigger:'waiting' as const}}}:mode==='dead'?{...before,character:{...before.character!,health:{current:0,max:100}}}:mode==='combat'?{...before,expedition:{pendingAmbush:null,...before.expedition,combat:{} as NonNullable<NonNullable<typeof before.expedition>['combat']>}}:before;
    const result=createDispatcher<MapAction,MapEvent>(mapHandlers)(state,{type:'map/travel'},{content,now:1000});expect(result.ok).toBe(false);expect(result.state).toBe(state);
  });
  it('런타임의 입력 간격과 설정창 정지를 지킨다',()=>{
    const {store}=setup();let mono=0;const clock={wallNow:()=>1000,monotonicNow:()=>mono};const loop=createGameLoop(store,clock,{schedule:()=>0,cancel:()=>{}});loop.start();
    expect(loop.move('east').ok).toBe(true);expect(loop.travel().ok).toBe(false);mono=100;expect(loop.travel().ok).toBe(true);expect(loop.travel().ok).toBe(false);
    mono=200;loop.setSettingsOpen(true);expect(loop.travel().ok).toBe(false);loop.setSettingsOpen(false);expect(loop.travel().ok).toBe(true);loop.stop();
  });
  it.each(['missing','one-way','wall','self','object','unreachable','bad-home'])('잘못된 맵 연결 %s를 콘텐츠 로딩에서 거부한다',mode=>{
    let world=connectedWorld();const source={mapId:'map.s1_test',floor:0,x:2,y:1},target={mapId:'map.second',floor:0,x:1,y:1};
    if(mode==='missing')cellAt(world,source)!.exit!.target.mapId='map.missing';
    if(mode==='one-way')delete cellAt(world,target)!.exit;
    if(mode==='wall')cellAt(world,target)!.tileId='tile.wall';
    if(mode==='self')cellAt(world,source)!.exit!.target={...source};
    if(mode==='object')cellAt(world,source)!.chestId='chest.camp_supply';
    if(mode==='unreachable'){delete cellAt(world,source)!.exit;delete cellAt(world,target)!.exit;}
    if(mode==='bad-home')world.startMapId='map.missing';
    expect(loadMakerWorld(world).ok).toBe(false);
  });
  it('다른 층 계단도 같은 행동으로 왕복한다',()=>{
    const base=setup(),world=base.world;const second=world.maps.pop()!;const home=world.maps[0]!;const floor=second.floors[0]!;floor.floor=1;home.floors.push(floor);
    cellAt(world,{mapId:home.id,floor:0,x:2,y:1})!.exit!.target={mapId:home.id,floor:1,x:1,y:1};
    cellAt(world,{mapId:home.id,floor:1,x:1,y:1})!.exit!.target={mapId:home.id,floor:0,x:2,y:1};
    const loaded=loadMakerWorld(world);if(!loaded.ok)throw new Error(JSON.stringify(loaded.errors));const store=createNewGameStore(loaded.content,[1,2,3,4],()=>1000);
    store.dispatch({type:'move/step',direction:'east'});expect(store.dispatch({type:'map/travel'}).ok).toBe(true);expect(store.getSnapshot().character!.position!.floor).toBe(1);
  });
});
