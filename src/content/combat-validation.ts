import type { ContentDefinition } from './schemas.ts';
import type { ContentError } from './types.ts';
type Located={file:string;index:number;definition:ContentDefinition};
export function validateCombat(definitions:readonly Located[]):ContentError[]{
  const errors:ContentError[]=[];const byId=new Map(definitions.map(e=>[e.definition.id,e.definition]));const placed=new Set<string>();
  for(const {file,index,definition}of definitions){
    const report=(path:string,message:string)=>errors.push({file,path:`${index}.${path}`,code:'invalid_combat_reference',message});
    if(definition.kind==='monster')for(const [i,entry]of definition.loot.entries()){
      if(byId.get(entry.itemId)?.kind!=='item')report(`loot.${i}`,'전리품의 아이템 정의가 없다');
    }
    if(definition.kind==='encounter')for(const [i,enemy]of definition.enemies.entries())if(byId.get(enemy.monsterId)?.kind!=='monster')report(`enemies.${i}`,'몬스터 정의가 없다');
    if(definition.kind==='map')for(const [fi,floor]of definition.floors.entries())for(const [ci,cell]of floor.cells.entries()){
      if(!cell.encounterId)continue;
      const path=`floors.${fi}.cells.${ci}.encounterId`;
      if(byId.get(cell.encounterId)?.kind!=='encounter'||placed.has(cell.encounterId))report(path,'조우 ID는 존재하며 전체 맵에 한 번만 배치해야 한다');
      placed.add(cell.encounterId);const tile=byId.get(cell.tileId),zone=byId.get(cell.zoneId);
      if(tile?.kind!=='tile'||!tile.walkable||zone?.kind!=='zone'||zone.safety!=='danger')report(path,'적은 이동 가능한 위험 구역에 배치한다');
    }
  }return errors;
}
