import { describe,expect,it,vi } from 'vitest';
import v3 from '../persistence/fixtures/v3-explored.json' with {type:'json'};
import { mapContext,startedState,walk } from '../engine/systems/map/test-fixtures.ts';
import { createSaveFile,serializeSave } from '../persistence/save-file.ts';
import { loadSaveSlots } from './load-slots.ts';
import { loadSavedGame } from '../runtime/startup.ts';

const ctx=mapContext();
const metadata={contentVersion:ctx.content.contentVersion,saveId:'00112233-4455-4677-8899-aabbccddeeff',revision:7,savedAt:ctx.now};
const save=serializeSave(createSaveFile(startedState(ctx),metadata));

describe('브라우저 세이브 후보 검증·시작 복원',()=>{
  it('유효한 primary를 복원한 뒤 현재 시각으로 한 번 정산하며 난수/ID는 생성하지 않는다',async()=>{
    const now=vi.fn(()=>ctx.now+86400000);const seed=vi.fn(()=>[9,8,7,6]);
    const repository={read:async()=>({primary:save,backup:'bad',generation:3}),write:vi.fn(),close:vi.fn()};
    const result=await loadSavedGame(ctx.content,repository,now,seed);
    expect(result.loaded.source).toBe('primary');expect(result.store.getSnapshot().meta.gameTime).toBe(43_200);
    expect(result.store.getSnapshot().meta.settledUntil).toBe(ctx.now+86400000);
    expect(result.store.getSnapshot().meta.rngState).toEqual(startedState(ctx).meta.rngState);
    expect(now).toHaveBeenCalledTimes(2);expect(seed).not.toHaveBeenCalled();expect(repository.write).not.toHaveBeenCalled();
  });

  it.each(['{','null',JSON.stringify({...v3,state:{...v3.state,campaign:{exploration:{}}}})])('손상/위치 오류 %s는 유효한 백업으로 복구한다',(primary)=>{
    const result=loadSaveSlots({primary,backup:save,generation:2},ctx.content);
    expect(result.source).toBe('backup');expect(result.previousValid).toBe(save);expect(result.generation).toBe(2);
  });

  it('지원하지 않는 미래 버전은 유효한 이전 백업이 있어도 덮어쓰지 않는다',()=>{
    expect(()=>loadSaveSlots({primary:JSON.stringify({...v3,schemaVersion:100}),backup:save,generation:1},ctx.content)).toThrow('미래 버전');
  });

  it('실제 콘텐츠가 사용할 수 없는 primary도 백업에서 복구한다',()=>{
    const current=JSON.parse(save);current.state.campaign.exploration['map.s1_test'].mapVersion=999;
    expect(loadSaveSlots({primary:JSON.stringify(current),backup:save,generation:1},ctx.content).source).toBe('backup');
  });

  it('v3를 변환해 불러오되 기존 원문·revision·자원·시간·난수를 보존한다',()=>{
    const raw=JSON.stringify(v3);const result=loadSaveSlots({primary:raw,backup:null,generation:1},ctx.content);
    expect(result.save!.schemaVersion).toBe(6);expect(result.previousValid).toBe(raw);
    expect(result.save!.state.meta).toEqual(v3.state.meta);expect(result.save!.state.character!.stamina).toEqual(v3.state.character.stamina);
    expect(result.save!.revision).toBe(v3.revision);
  });

  it('휴식/미처리 습격은 그대로 복원하며 최대치/안전 구역의 잘못된 활동을 거부한다',()=>{
    const danger=walk(startedState(ctx),['east','east','south','south','east'],ctx);
    for(const kind of ['resting','pending']){
      const state={...danger,character:{...danger.character!,activity:kind==='resting'?'resting' as const:'waiting' as const},
        expedition:kind==='pending'?{pendingAmbush:{triggeredAt:0,activityAtTrigger:'resting' as const}}:null};
      const raw=serializeSave(createSaveFile(state,metadata));
      expect(loadSaveSlots({primary:raw,backup:null,generation:1},ctx.content).save!.state).toEqual(state);
    }
    const raw=JSON.parse(save);raw.state.character.activity='resting';raw.state.character.stamina.current=880;
    expect(()=>loadSaveSlots({primary:JSON.stringify(raw),backup:null,generation:1},ctx.content)).toThrow();
  });

  it('두 슬롯이 모두 없을 때만 새 게임을 만들고 둘 다 손상되면 덮어쓰지 않는다',async()=>{
    const loaded=loadSaveSlots({primary:null,backup:null,generation:0},ctx.content);expect(loaded.source).toBe('empty');
    const write=vi.fn();const repository={read:async()=>({primary:'bad',backup:'bad',generation:0}),write,close:vi.fn()};
    const seed=vi.fn(()=>[1,2,3,4]);await expect(loadSavedGame(ctx.content,repository,()=>ctx.now,seed)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();expect(seed).not.toHaveBeenCalled();
  });
});
