import manifest from '../src/content/manifest.json' with { type:'json' };
import timeRules from '../src/content/time-rules.json' with { type:'json' };
import tiles from '../src/content/tiles.json' with { type:'json' };
import zones from '../src/content/zones.json' with { type:'json' };
import items from '../src/content/items.json' with { type:'json' };
import chests from '../src/content/chests.json' with { type:'json' };
import monsters from '../src/content/monsters.json' with { type:'json' };
import encounters from '../src/content/encounters.json' with { type:'json' };
import { loadContent } from '../src/content/load.ts';
import { itemEffectRegistry } from '../src/engine/systems/inventory/effects.ts';
import type { ContentLoadResult, DeepReadonly } from '../src/content/types.ts';
import type { MapDefinition } from '../src/content/schemas.ts';
import { parseWorld } from './world-editor.ts';
import {monsterCatalog,encounterCatalog} from './monster-tools.ts';

// 같은 로더/참조 검증을 쓰되 제품 맵 파일을 메모리 안에서만 교체한다.
export function loadMakerMap(raw:unknown):ContentLoadResult {
  if (!Array.isArray(raw) || raw.length!==1) throw new Error('맵 JSON에는 맵 정의1개를 배열로 넣어 주세요.');
  const failure=(path:string,message:string):ContentLoadResult => ({ ok:false,errors:[{ file:'maps/s1-test.json',path,code:'invalid_maker_map',message }] });
  if (!raw[0] || typeof raw[0]!=='object' || raw[0].kind!=='map') return failure('0.kind','맵 정의가 필요합니다.');
  const loaded=loadContent({ 'manifest.json':{...manifest,startMapId:raw[0].id,definitionFiles:[...manifest.definitionFiles.filter(f=>!f.startsWith('maps/')),'maps/s1-test.json']},'time-rules.json':timeRules,
    'tiles.json':tiles,'zones.json':zones,'items.json':items,'chests.json':chests,
    'monsters.json':monsters,'encounters.json':encounters,'maps/s1-test.json':raw },itemEffectRegistry.validate);
  if (!loaded.ok) return loaded;
  const map=loaded.content.definitions.find(d => d.kind==='map')!;
  if (map.kind!=='map') return failure('0.kind','맵 정의가 필요합니다.');
  if (map.floors.length!==1) return failure('0.floors','현재 제작자 도구는 단일 층 맵을 지원합니다.');
  const start=map.floors[0]!.cells.find(c => c.x===map.start.x && c.y===map.start.y)!;
  const zone=loaded.content.byId[start.zoneId];
  if (!zone || !('kind' in zone) || zone.kind!=='zone' || zone.safety!=='safe') return failure('0.start','시작 위치를 이동 가능한 안전 구역에 배치해 주세요.');
  return loaded;
}

// 이동 시험에서 조우에 묶이지 않도록 배치 레이어는 원본/다운로드에만 보존한다.
export function loadTerrainPreview(map:DeepReadonly<MapDefinition>):ContentLoadResult {
  const terrain={ ...map,floors:map.floors.map(floor => ({ ...floor,cells:floor.cells.map(({ chestId: _chest,encounterId: _encounter,...cell }) => cell) })) };
  return loadMakerMap([terrain]);
}

export function loadMakerWorld(raw:unknown,terrainOnly=false):ContentLoadResult {
  const world=parseWorld(raw);
  const maps=terrainOnly?world.maps.map(map=>({...map,floors:map.floors.map(f=>({...f,cells:f.cells.map(({chestId:_chest,encounterId:_enemy,...cell})=>cell)}))})):world.maps;
  return loadContent({'manifest.json':{...manifest,startMapId:world.startMapId,definitionFiles:[...manifest.definitionFiles.filter(f=>!f.startsWith('maps/')),'maps/s1-test.json']},'time-rules.json':timeRules,
    'tiles.json':tiles,'zones.json':zones,'items.json':items,'chests.json':chests,'monsters.json':monsterCatalog(world),'encounters.json':encounterCatalog(world),'maps/s1-test.json':maps},itemEffectRegistry.validate);
}
