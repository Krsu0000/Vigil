import {z} from 'zod';
import {ContentIdSchema} from './schemas.ts';

/** T2-C3: static, effect-free dialogue. Quest mutations are deferred to the quest engine. */
export const NpcChoiceSchema=z.strictObject({
  label:z.string().trim().min(1).max(150),
  nextNodeId:ContentIdSchema.optional(),
});
export const NpcDialogueNodeSchema=z.strictObject({
  id:ContentIdSchema,
  text:z.string().trim().min(1).max(5000),
  choices:z.array(NpcChoiceSchema).max(10),
});
export const NpcDefinitionSchema=z.strictObject({
  format:z.literal('vigil-npc-v1'),
  id:ContentIdSchema.refine(id=>id.startsWith('npc.'),'NPC ID는 npc.로 시작해야 합니다.'),
  name:z.string().trim().min(1),
  glyph:z.string().trim().min(1).max(5),
  description:z.string().default(''),
  startNodeId:ContentIdSchema,
  nodes:z.array(NpcDialogueNodeSchema).min(1).max(200),
});
export type NpcDefinition=z.infer<typeof NpcDefinitionSchema>;
export function parseNpc(raw:unknown):NpcDefinition{
  const npc=NpcDefinitionSchema.parse(raw);
  const nodes=new Set<string>();
  for(const node of npc.nodes){
    if(nodes.has(node.id))throw new Error('중복된 대화 노드 ID: '+node.id);
    nodes.add(node.id);
  }
  if(!nodes.has(npc.startNodeId))throw new Error('시작 대화 노드가 없습니다.');
  for(const node of npc.nodes)for(const choice of node.choices){
    if(choice.nextNodeId&&!nodes.has(choice.nextNodeId))throw new Error('대화 연결 노드가 존재하지 않습니다: '+choice.nextNodeId);
  }
  const visited=new Set<string>(),queue=[npc.startNodeId];
  for(let i=0;i<queue.length;i++){
    const id=queue[i]!;
    if(visited.has(id))continue;
    visited.add(id);
    for(const choice of npc.nodes.find(n=>n.id===id)!.choices)if(choice.nextNodeId)queue.push(choice.nextNodeId);
  }
  if(visited.size!==npc.nodes.length)throw new Error('시작 대화에서 도달할 수 없는 노드가 있습니다.');
  return npc;
}
