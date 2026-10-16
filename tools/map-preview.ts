import type {WorldBundle,CellPosition} from './world-editor.ts';
import {loadMakerWorld} from './map-content.ts';
import type {ContentDb} from '../src/content/types.ts';
export function preparePreview(world:WorldBundle,p:CellPosition,terrainOnly:boolean,scope:'auto'|'selected'|'world'='auto'):{content:ContentDb;notice:string}{
  if(scope!=='selected'){
    const full=loadMakerWorld(world,terrainOnly);if(full.ok)return {content:full.content,notice:'전체 연결 맵 시험'};
    if(scope==='world'||full.errors.some(e=>!['unreachable_map','invalid_start_map'].includes(e.code)))throw new Error(full.errors.slice(0,5).map(e=>e.message).join('\n'));
  }
  const map=world.maps.find(m=>m.id===p.mapId)!,floor=map.floors.find(f=>f.floor===p.floor)!;
  const cells=floor.cells.map(c=>{const n={...c};if(n.exit&&(n.exit.target.mapId!==map.id||n.exit.target.floor!==floor.floor))delete n.exit;return n;});
  const start=cells.find(c=>c.x===map.start.x&&c.y===map.start.y&&map.start.floor===floor.floor&&c.tileId==='tile.floor'&&!c.encounterId)
    ??cells.find(c=>c.tileId==='tile.floor'&&c.zoneId==='zone.camp'&&!c.encounterId)??cells.find(c=>c.tileId==='tile.floor'&&!c.encounterId);
  if(!start)throw new Error('시험을 시작할 수 있는 바닥 칸이 없습니다.');
  const temporary={...world,startMapId:map.id,maps:[{...map,start:{floor:floor.floor,x:start.x,y:start.y},floors:[{...floor,cells:cells.map(c=>c===start?{...c,zoneId:'zone.camp'}:c)}]}]};
  const loaded=loadMakerWorld(temporary,terrainOnly);if(!loaded.ok)throw new Error(loaded.errors.slice(0,5).map(e=>e.message).join('\n'));
  return {content:loaded.content,notice:'현재 맵/층만 시험합니다. 다른 맵 출입구를 제외하고 시험 시작점만 임시 안전 구역으로 사용합니다. 편집 원본은 유지됩니다.'};
}
