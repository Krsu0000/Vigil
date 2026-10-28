import {describe,expect,it} from 'vitest';
import {mapContext} from '../engine/systems/map/test-fixtures.ts';
import {createNewGameStore} from './store.ts';
import {availableTowns,findTownAt,validateTownAnchor} from './towns.ts';

describe('T2-C2 마을의 격자 앵커 A안',()=>{
  it('첫 마을을 제품 맵 안전 시작점에서만 찾아낸다',()=>{
    const {content,now}=mapContext();
    const store=createNewGameStore(content,[1,2,3,4],()=>now);
    const original=structuredClone(store.getSnapshot().character!.position);
    const town=findTownAt(original,content);
    expect(town?.id).toBe('town.first');
    expect(()=>validateTownAnchor(town!,content)).not.toThrow();
    expect(store.getSnapshot().character!.position).toEqual(original);
    store.dispatch({type:'move/step',direction:'south'});
    expect(findTownAt(store.getSnapshot().character!.position!,content)).toBeUndefined();
    expect(findTownAt(undefined,content)).toBeUndefined();
  });
  it('파일은 기존 마을 스키마로 검증되며 모든 장면을 제공한다',()=>{
    expect(availableTowns).toHaveLength(1);
    expect(availableTowns[0]!.scenes.map(s=>s.id)).toEqual(['scene.square','scene.inn']);
    expect(availableTowns[0]!.scenes[0]!.hotspots.some(x=>x.target.type==='exit')).toBe(true);
  });
});
