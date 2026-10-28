import {describe,it,expect} from 'vitest';
import {parseTown,sampleTown} from './town-content.ts';

describe('T2-C2 마을 장면 콘텐츠',()=>{
  it('입장 광장과 여관 왕복·마을 퇴장을 검증한다',()=>{
    expect(parseTown(sampleTown).scenes).toHaveLength(2);
    expect(sampleTown.anchor).toEqual({mapId:'map.s1_test',floor:0,x:1,y:1});
  });
  it('장면 연결 대상이 없으면 거부한다',()=>{
    const town=structuredClone(sampleTown);
    town.scenes[0]!.hotspots[0]!.target={type:'scene',sceneId:'scene.unknown'};
    expect(()=>parseTown(town)).toThrow('연결 대상');
  });
  it('퇴장이 없거나 입장 장면에서 도달 불가능한 경우 거부한다',()=>{
    const town=structuredClone(sampleTown);town.scenes[0]!.hotspots=town.scenes[0]!.hotspots.filter(x=>x.target.type!=='exit');
    expect(()=>parseTown(town)).toThrow('나가기');
    const isolated=structuredClone(sampleTown);isolated.scenes[0]!.hotspots=isolated.scenes[0]!.hotspots.filter(x=>x.target.type!=='scene');
    expect(()=>parseTown(isolated)).toThrow('도달할 수 없는');
  });
  it('동일 장면의 중복 핫스팟과 범위 밖 좌표를 거부한다',()=>{
    const town=structuredClone(sampleTown);town.scenes[0]!.hotspots.push(structuredClone(town.scenes[0]!.hotspots[0]!));
    expect(()=>parseTown(town)).toThrow('중복된 핫스팟');
    town.scenes[0]!.hotspots.pop();town.scenes[0]!.hotspots[0]!.x=101;
    expect(()=>parseTown(town)).toThrow();
  });
});
