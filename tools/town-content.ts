import {z} from 'zod';
import {ContentIdSchema} from '../src/content/schemas.ts';

/** T2-C2 authoring data only. It does not redefine character.position or game save state. */
export const TownHotspotSchema=z.strictObject({
  id:ContentIdSchema,
  label:z.string().trim().min(1),
  description:z.string().default(''),
  x:z.number().min(0).max(100),
  y:z.number().min(0).max(100),
  target:z.discriminatedUnion('type',[
    z.strictObject({type:z.literal('scene'),sceneId:ContentIdSchema}),
    z.strictObject({type:z.literal('exit')}),
    z.strictObject({type:z.literal('npc'),npcId:ContentIdSchema}),
  ]),
});
export const TownSceneSchema=z.strictObject({
  id:ContentIdSchema,
  title:z.string().trim().min(1),
  description:z.string(),
  hotspots:z.array(TownHotspotSchema),
});
export const TownDefinitionSchema=z.strictObject({
  format:z.literal('vigil-town-v1'),
  id:ContentIdSchema,
  version:z.number().int().min(1),
  name:z.string().trim().min(1),
  anchor:z.strictObject({mapId:ContentIdSchema,floor:z.number().int(),x:z.number().int().min(0),y:z.number().int().min(0)}),
  entrySceneId:ContentIdSchema,
  scenes:z.array(TownSceneSchema).min(1),
});
export type TownDefinition=z.infer<typeof TownDefinitionSchema>;
export function parseTown(raw:unknown):TownDefinition {
  const town=TownDefinitionSchema.parse(raw);
  const scenes=new Map<string,TownDefinition['scenes'][number]>();
  for(const scene of town.scenes){
    if(scenes.has(scene.id))throw new Error('중복된 장면 ID: '+scene.id);
    scenes.set(scene.id,scene);
    const ids=new Set<string>();
    for(const spot of scene.hotspots){
      if(ids.has(spot.id))throw new Error('중복된 핫스팟 ID: '+spot.id);
      ids.add(spot.id);
    }
  }
  if(!scenes.has(town.entrySceneId))throw new Error('입장 장면 ID가 존재하지 않습니다.');
  for(const scene of town.scenes)for(const spot of scene.hotspots){
    if(spot.target.type==='scene'&&!scenes.has(spot.target.sceneId))throw new Error('장면 연결 대상이 존재하지 않습니다: '+spot.target.sceneId);
  }
  // A town cannot be exited if no reachable scene has an exit hotspot.
  const visited=new Set<string>(),queue=[town.entrySceneId];let hasExit=false;
  for(let i=0;i<queue.length;i++){
    const id=queue[i]!;if(visited.has(id))continue;visited.add(id);
    for(const spot of scenes.get(id)!.hotspots){
      if(spot.target.type==='exit')hasExit=true;
      if(spot.target.type==='scene'&&!visited.has(spot.target.sceneId))queue.push(spot.target.sceneId);
    }
  }
  if(!hasExit)throw new Error('입장 장면에서 도달 가능한 나가기 핫스팟이 필요합니다.');
  if(visited.size!==town.scenes.length)throw new Error('입장 장면에서 도달할 수 없는 장면이 있습니다.');
  return town;
}
export const sampleTown:TownDefinition=parseTown({
  format:'vigil-town-v1',id:'town.first',version:1,name:'첫 번째 마을',
  anchor:{mapId:'map.s1_test',floor:0,x:1,y:1},entrySceneId:'scene.square',
  scenes:[{id:'scene.square',title:'광장',description:'마을의 중심 광장입니다.',hotspots:[
    {id:'hotspot.inn',label:'여관',description:'쉬어 갈 수 있는 장소입니다.',x:27,y:58,target:{type:'scene',sceneId:'scene.inn'}},
    {id:'hotspot.exit',label:'마을 나가기',description:'탐험 지도로 돌아갑니다.',x:78,y:75,target:{type:'exit'}},
  ]},{id:'scene.inn',title:'여관',description:'작은 여관의 실내입니다.',hotspots:[
    {id:'hotspot.square',label:'광장으로',description:'마을 광장으로 돌아갑니다.',x:20,y:70,target:{type:'scene',sceneId:'scene.square'}},
  ]}],
});
