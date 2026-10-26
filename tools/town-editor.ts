import type {TownDefinition} from './town-content.ts';
import {parseTown} from './town-content.ts';

type Scene=TownDefinition['scenes'][number];
export type Hotspot=Scene['hotspots'][number];
function unused(ids:readonly string[],prefix:'scene'|'hotspot'):string{
  let n=1;
  while(ids.includes(`${prefix}.new_${n}`))n++;
  return `${prefix}.new_${n}`;
}
export function addTownScene(town:TownDefinition,fromId:string):{town:TownDefinition;sceneId:string}{
  const source=town.scenes.find(s=>s.id===fromId);
  if(!source)throw new Error('현재 장면을 찾을 수 없습니다.');
  const id=unused(town.scenes.map(s=>s.id),'scene');
  const next:Scene={id,title:'새 장소',description:'장소 설명을 입력하세요.',hotspots:[
    {id:'hotspot.back',label:'돌아가기',description:'이전 장소로 이동합니다.',x:25,y:76,target:{type:'scene',sceneId:fromId}},
  ]};
  const linkId=unused(source.hotspots.map(h=>h.id),'hotspot');
  const result:TownDefinition={...town,scenes:town.scenes.map(s=>s.id===fromId?
    {...s,hotspots:[...s.hotspots,{id:linkId,label:'새 장소',description:'새 장소로 이동합니다.',x:50,y:50,target:{type:'scene',sceneId:id}}]}:s).concat(next)};
  return {town:parseTown(result),sceneId:id};
}
export function removeTownScene(town:TownDefinition,id:string):TownDefinition{
  if(id===town.entrySceneId)throw new Error('입장 장면은 삭제할 수 없습니다.');
  if(!town.scenes.some(s=>s.id===id))throw new Error('장면을 찾을 수 없습니다.');
  const result:TownDefinition={...town,scenes:town.scenes.filter(s=>s.id!==id).map(s=>({...s,
    hotspots:s.hotspots.filter(h=>h.target.type!=='scene'||h.target.sceneId!==id)}))};
  return parseTown(result);
}
export function renameTownScene(town:TownDefinition,oldId:string,nextId:string):TownDefinition{
  if(oldId===nextId)return town;
  if(town.scenes.some(s=>s.id===nextId))throw new Error('이미 사용 중인 장면 ID입니다.');
  return parseTown({...town,entrySceneId:town.entrySceneId===oldId?nextId:town.entrySceneId,
    scenes:town.scenes.map(s=>({...s,id:s.id===oldId?nextId:s.id,hotspots:s.hotspots.map(h=>
      h.target.type==='scene'&&h.target.sceneId===oldId?{...h,target:{type:'scene',sceneId:nextId}}:h)}))});
}
export function addTownHotspot(town:TownDefinition,sceneId:string):{town:TownDefinition;hotspotId:string}{
  const scene=town.scenes.find(s=>s.id===sceneId);if(!scene)throw new Error('장면을 찾을 수 없습니다.');
  const id=unused(scene.hotspots.map(h=>h.id),'hotspot');
  const spot:Hotspot={id,label:'새 장소',description:'핫스팟 설명',x:50,y:50,target:{type:'exit'}};
  return {town:{...town,scenes:town.scenes.map(s=>s.id===sceneId?{...s,hotspots:[...s.hotspots,spot]}:s)},hotspotId:id};
}
export function updateTownHotspot(town:TownDefinition,sceneId:string,id:string,update:(spot:Hotspot)=>Hotspot):TownDefinition{
  if(!town.scenes.some(s=>s.id===sceneId&&s.hotspots.some(h=>h.id===id)))throw new Error('핫스팟을 찾을 수 없습니다.');
  return {...town,scenes:town.scenes.map(s=>s.id===sceneId?{...s,hotspots:s.hotspots.map(h=>h.id===id?update(h):h)}:s)};
}
export function removeTownHotspot(town:TownDefinition,sceneId:string,id:string):TownDefinition{
  return {...town,scenes:town.scenes.map(s=>s.id===sceneId?{...s,hotspots:s.hotspots.filter(h=>h.id!==id)}:s)};
}
