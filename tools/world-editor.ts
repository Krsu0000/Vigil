import { z } from 'zod';
import { ContentIdSchema, MapDefinitionSchema } from '../src/content/schemas.ts';
import type { MapDefinition } from '../src/content/schemas.ts';
import type { ContentDb } from '../src/content/types.ts';

export const WorldBundleSchema=z.strictObject({format:z.literal('vigil-world-v1'),startMapId:ContentIdSchema,maps:z.array(MapDefinitionSchema).min(1)});
export type WorldBundle=z.infer<typeof WorldBundleSchema>;
export type CellPosition={mapId:string;floor:number;x:number;y:number};
export function parseWorld(raw:unknown):WorldBundle {
  if(Array.isArray(raw)){
    if(raw.length!==1)throw new Error('여러 맵은 시작 맵이 지정된 맵 묶음 파일로 불러와 주세요.');
    const map=MapDefinitionSchema.parse(raw[0]);return {format:'vigil-world-v1',startMapId:map.id,maps:[map]};
  }
  return WorldBundleSchema.parse(raw);
}
export function worldFromContent(content:ContentDb):WorldBundle {
  const maps=content.definitions.filter((d):d is MapDefinition=>d.kind==='map').map(d=>structuredClone(d));
  return {format:'vigil-world-v1',startMapId:content.startMapId??maps[0]!.id,maps};
}
export function cellAt(world:WorldBundle,p:CellPosition){return world.maps.find(m=>m.id===p.mapId)?.floors.find(f=>f.floor===p.floor)?.cells.find(c=>c.x===p.x&&c.y===p.y);}
export function editCell(world:WorldBundle,p:CellPosition,change:(cell:MapDefinition['floors'][number]['cells'][number])=>void):WorldBundle {
  if(!cellAt(world,p))throw new Error('맵 범위 안의 칸을 선택해 주세요.');
  return {...world,maps:world.maps.map(map=>map.id!==p.mapId?map:{...map,floors:map.floors.map(floor=>floor.floor!==p.floor?floor:{...floor,cells:floor.cells.map(c=>{
    if(c.x!==p.x||c.y!==p.y)return c;const next=structuredClone(c);change(next);return next;
  })})})};
}
function same(a:CellPosition,b:CellPosition){return a.mapId===b.mapId&&a.floor===b.floor&&a.x===b.x&&a.y===b.y;}
export function disconnect(world:WorldBundle,p:CellPosition):WorldBundle {
  const exit=cellAt(world,p)?.exit;
  let next=editCell(world,p,c=>{delete c.exit;});
  if(exit && cellAt(next,exit.target)?.exit && same(cellAt(next,exit.target)!.exit!.target,p))next=editCell(next,exit.target,c=>{delete c.exit;});
  return next;
}
export function connect(world:WorldBundle,from:CellPosition,to:CellPosition,kind:'door'|'stairs'|'portal'):WorldBundle {
  if(same(from,to))throw new Error('다른 칸을 목적지로 지정해 주세요.');
  for(const p of [from,to]){const c=cellAt(world,p);if(!c||c.tileId!=='tile.floor'||c.chestId||c.encounterId)throw new Error('양쪽 출입구는 상자·적이 없는 바닥 칸이어야 합니다.');}
  let next=disconnect(disconnect(world,from),to);
  next=editCell(next,from,c=>{c.exit={name:world.maps.find(m=>m.id===to.mapId)!.name,kind,target:{...to}};});
  return editCell(next,to,c=>{c.exit={name:world.maps.find(m=>m.id===from.mapId)!.name,kind,target:{...from}};});
}
export function renameMap(world:WorldBundle,id:string,nextId:string,name:string,version:number):WorldBundle {
  if(world.maps.some(m=>m.id===nextId&&m.id!==id))throw new Error('이미 사용 중인 맵 ID입니다.');
  MapDefinitionSchema.shape.id.parse(nextId);MapDefinitionSchema.shape.name.parse(name);MapDefinitionSchema.shape.version.parse(version);
  return {...world,startMapId:world.startMapId===id?nextId:world.startMapId,maps:world.maps.map(m=>({...m,id:m.id===id?nextId:m.id,name:m.id===id?name:m.name,version:m.id===id?version:m.version,
    floors:m.floors.map(f=>({...f,cells:f.cells.map(c=>c.exit?.target.mapId===id?{...c,exit:{...c.exit,target:{...c.exit.target,mapId:nextId}}}:c)}))}))};
}

// 기존 저장의 위치/탐사/전투·물품 기록을 해석할 수 있는 추가 변경만 등록한다.
export function assertCompatibleWorld(previous:ContentDb,world:WorldBundle):void {
  const oldMaps=previous.definitions.filter((m):m is MapDefinition=>m.kind==='map');
  const home=previous.startMapId??(oldMaps.length===1?oldMaps[0]!.id:undefined);
  if(home && world.startMapId!==home)throw new Error('기존 저장을 유지하려면 시작 맵을 보존해야 합니다.');
  for(const old of oldMaps){
    const next=world.maps.find(m=>m.id===old.id);
    if(!next||next.version!==old.version||JSON.stringify(next.start)!==JSON.stringify(old.start))throw new Error(`기존 맵 ID·버전·시작점을 보존해 주세요: ${old.id}`);
    for(const floor of old.floors){
      const target=next.floors.find(f=>f.floor===floor.floor);
      if(!target||target.width!==floor.width||target.height!==floor.height)throw new Error(`기존 맵 크기/층을 보존해 주세요: ${old.id}`);
      const cells=new Map(target.cells.map(c=>[`${c.x},${c.y}`,c]));
      for(const c of floor.cells){const n=cells.get(`${c.x},${c.y}`);
        if(!n||n.tileId!==c.tileId||n.zoneId!==c.zoneId||(c.chestId&&n.chestId!==c.chestId)||(c.encounterId&&n.encounterId!==c.encounterId))throw new Error(`기존 지형·배치를 바꾸려면 새 맵 ID로 추가하고 이전 맵을 유지해 주세요: ${old.id} (${c.x}, ${c.y})`);
      }
    }
  }
}
