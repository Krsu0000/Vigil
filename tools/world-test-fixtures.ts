import maps from '../src/content/maps/s1-test.json' with {type:'json'};
import {MapDefinitionSchema} from '../src/content/schemas.ts';
import {connect,parseWorld} from './world-editor.ts';
export function connectedWorld(){
  const first=MapDefinitionSchema.parse(maps[0]);for(const f of first.floors)for(const c of f.cells)delete c.exit;const second=structuredClone(first);second.id='map.second';second.name='두 번째 지역';
  for(const f of second.floors)for(const c of f.cells){delete c.chestId;delete c.encounterId;c.zoneId='zone.ruins';}
  return connect({...parseWorld([first]),maps:[first,second]},
    {mapId:first.id,floor:0,x:2,y:1},{mapId:second.id,floor:0,x:1,y:1},'door');
}
