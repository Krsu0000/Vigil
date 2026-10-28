import {describe,it,expect} from 'vitest';
import {sampleTown,parseTown} from './town-content.ts';
import {addTownScene,removeTownScene,renameTownScene,addTownHotspot,updateTownHotspot,removeTownHotspot} from './town-editor.ts';

describe('클릭형 마을 편집기',()=>{
  it('장면을 만들 때 왕복 연결을 함께 만든다',()=>{
    const {town,sceneId}=addTownScene(sampleTown,'scene.inn');
    expect(town.scenes).toHaveLength(3);
    expect(town.scenes.find(s=>s.id===sceneId)?.hotspots[0]?.target).toEqual({type:'scene',sceneId:'scene.inn'});
    expect(parseTown(town).scenes).toHaveLength(3);
    const cleaned=removeTownScene(town,sceneId);
    expect(cleaned).toEqual(sampleTown);
  });
  it('입장 장면은 삭제할 수 없다',()=>{
    expect(()=>removeTownScene(sampleTown,'scene.square')).toThrow('입장 장면');
  });
  it('장면 ID를 바꾸면 모든 링크와 입장 ID가 함께 변경된다',()=>{
    const renamed=renameTownScene(sampleTown,'scene.square','scene.plaza');
    expect(renamed.entrySceneId).toBe('scene.plaza');
    expect(renamed.scenes[1]?.hotspots[0]?.target).toEqual({type:'scene',sceneId:'scene.plaza'});
    expect(()=>renameTownScene(renamed,'scene.plaza','scene.inn')).toThrow('이미');
  });
  it('핫스팟 생성·좌표 수정·삭제는 원본을 바꾸지 않는다',()=>{
    const {town,hotspotId}=addTownHotspot(sampleTown,'scene.square');
    const moved=updateTownHotspot(town,'scene.square',hotspotId,h=>({...h,x:42,y:71,label:'무기상'}));
    expect(moved.scenes[0]?.hotspots.at(-1)?.x).toBe(42);
    expect(sampleTown.scenes[0]?.hotspots).toHaveLength(2);
    expect(removeTownHotspot(moved,'scene.square',hotspotId)).toEqual(sampleTown);
  });
});
