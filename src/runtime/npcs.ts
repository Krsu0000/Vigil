import innkeeperRaw from '../world/npcs/innkeeper.json' with {type:'json'};
import {parseNpc} from '../content/npc-schema.ts';
import type {NpcDefinition} from '../content/npc-schema.ts';
import type {TownDefinition} from '../content/town-schema.ts';

export const registeredNpcs:readonly NpcDefinition[]=Object.freeze([parseNpc(innkeeperRaw)]);
export function findNpc(id:string):NpcDefinition|undefined{
  return registeredNpcs.find(npc=>npc.id===id);
}

/** Check actual game-registered NPC references. Authoring drafts may remain incomplete. */
export function validateRegisteredTownNpcs(town:TownDefinition):void{
  for(const scene of town.scenes)for(const spot of scene.hotspots){
    if(spot.target.type==='npc'&&!findNpc(spot.target.npcId))
      throw new Error(`마을 NPC 배치에 등록되지 않은 ID: ${spot.target.npcId}`);
  }
}
