import firstTownRaw from '../world/towns/first.json' with {type:'json'};
import type {ContentDb} from '../content/types.ts';
import type {MapPosition} from '../engine/core/state.ts';
import {parseTown} from '../content/town-schema.ts';
import type {TownDefinition} from '../content/town-schema.ts';
import {findMap,findCell,requireTile,requireZone} from '../engine/systems/map/selectors.ts';

/** Separate town content, not an extra file in the existing game-content manifest. */
export const availableTowns:readonly TownDefinition[]=Object.freeze([parseTown(firstTownRaw)]);
export function validateTownAnchor(town:TownDefinition,content:ContentDb):void{
  const map=findMap(content,town.anchor.mapId);
  if(!map)throw new Error(`마을 입구가 없는 격자 맵을 가리킵니다: ${town.anchor.mapId}`);
  const cell=findCell(map,town.anchor);
  if(!cell||!requireTile(content,cell.tileId).walkable||requireZone(content,cell.zoneId).safety!=='safe')
    throw new Error(`마을 입구는 안전하고 이동 가능한 격자 좌표여야 합니다: ${town.id}`);
}
/** A안: never rewrites the character's grid position; only exposes a UI entry at the anchor. */
export function findTownAt(position:MapPosition|undefined,content:ContentDb):TownDefinition|undefined{
  if(!position)return undefined;
  const candidate=availableTowns.find(t=>t.anchor.mapId===position.mapId&&t.anchor.floor===position.floor&&t.anchor.x===position.x&&t.anchor.y===position.y);
  if(!candidate)return undefined;
  validateTownAnchor(candidate,content);
  return candidate;
}
