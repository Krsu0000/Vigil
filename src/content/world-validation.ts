import type { ContentDefinition, MapDefinition } from './schemas.ts';
import type { ContentError } from './types.ts';

type Located={ file:string;index:number;definition:ContentDefinition };
export function validateWorld(definitions:readonly Located[],startMapId?:string):ContentError[] {
  const errors:ContentError[]=[],byId=new Map(definitions.map(d => [d.definition.id,d.definition]));
  const maps=definitions.filter((d):d is Located & {definition:MapDefinition} => d.definition.kind==='map');
  type Cell=MapDefinition['floors'][number]['cells'][number];
  const floors=new Map<string,MapDefinition['floors'][number]>(),indexes=new Map<string,Cell[]>(),graph=new Map<string,Set<string>>();
  const key=(mapId:string,p:{floor:number;x:number;y:number}) => `${mapId}/${p.floor}/${p.x}/${p.y}`;
  const node=(mapId:string,floor:number) => `${mapId}/${floor}`;
  for (const {definition:map} of maps) for (const floor of map.floors) {
    graph.set(node(map.id,floor.floor),new Set());
    floors.set(node(map.id,floor.floor),floor);
  }
  const cellAt=(mapId:string,p:{floor:number;x:number;y:number})=>{
    const n=node(mapId,p.floor),floor=floors.get(n);
    if(!floor||p.x>=floor.width||p.y>=floor.height)return undefined;
    let cells=indexes.get(n);
    if(!cells){cells=new Array<Cell>(floor.width*floor.height);for(const c of floor.cells)cells[c.y*floor.width+c.x]=c;indexes.set(n,cells);}
    return cells[p.y*floor.width+p.x];
  };
  const walkable=(cell:MapDefinition['floors'][number]['cells'][number]|undefined) => {
    const tile=cell&&byId.get(cell.tileId);return tile?.kind==='tile'&&tile.walkable;
  };
  for (const {file,index,definition:map} of maps) map.floors.forEach((floor,fi) => floor.cells.forEach((cell,ci) => {
    if (!cell.exit) return;
    const path=`${index}.floors.${fi}.cells.${ci}.exit`,source=key(map.id,{floor:floor.floor,...cell}),target=cell.exit.target;
    const destination=cellAt(target.mapId,target);
    const report=(message:string) => errors.push({file,path,code:'invalid_exit',message});
    if (!walkable(cell)||cell.chestId||cell.encounterId) report('출입구는 물품·적이 없는 이동 가능한 칸에 배치해야 합니다.');
    if (key(target.mapId,target)===source) report('같은 출입구를 자기 목적지로 지정할 수 없습니다.');
    if (!walkable(destination)||destination?.chestId||destination?.encounterId) report('도착할 수 있는 출입구 칸이 없습니다.');
    if (!destination?.exit || key(destination.exit.target.mapId,destination.exit.target)!==source) report('목적지 출입구에 돌아오는 연결이 필요합니다.');
    graph.get(node(map.id,floor.floor))!.add(node(target.mapId,target.floor));
  }));
  if (startMapId!==undefined) {
    const start=byId.get(startMapId);
    if (start?.kind!=='map') errors.push({file:'manifest.json',path:'startMapId',code:'invalid_start_map',message:'시작 맵이 없습니다.'});
    else {
      const cell=cellAt(startMapId,start.start),zone=cell&&byId.get(cell.zoneId);
      if (!walkable(cell)||zone?.kind!=='zone'||zone.safety!=='safe') errors.push({file:'manifest.json',path:'startMapId',code:'invalid_start_map',message:'시작 맵의 시작점은 안전하고 이동 가능한 칸이어야 합니다.'});
      const queue=[node(startMapId,start.start.floor)],seen=new Set(queue);
      for (let i=0;i<queue.length;i++) for (const next of graph.get(queue[i]!)??[]) if (!seen.has(next)) {seen.add(next);queue.push(next);}
      for (const n of graph.keys()) if (!seen.has(n)) errors.push({file:'manifest.json',path:'startMapId',code:'unreachable_map',message:`시작점에서 출입구로 도달할 수 없는 맵/층: ${n}`});
    }
  }
  return errors;
}
