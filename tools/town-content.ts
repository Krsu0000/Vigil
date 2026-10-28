export {TownHotspotSchema,TownSceneSchema,TownDefinitionSchema,parseTown} from '../src/content/town-schema.ts';
import {parseTown} from '../src/content/town-schema.ts';
import type {TownDefinition} from '../src/content/town-schema.ts';
export type {TownDefinition} from '../src/content/town-schema.ts';

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
