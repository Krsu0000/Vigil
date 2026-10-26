import innkeeperRaw from '../world/npcs/innkeeper.json' with {type:'json'};
import {parseNpc} from '../content/npc-schema.ts';
import type {NpcDefinition} from '../content/npc-schema.ts';

export const registeredNpcs:readonly NpcDefinition[]=Object.freeze([parseNpc(innkeeperRaw)]);
export function findNpc(id:string):NpcDefinition|undefined{
  return registeredNpcs.find(npc=>npc.id===id);
}
