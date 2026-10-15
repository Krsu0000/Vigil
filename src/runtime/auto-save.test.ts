import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapContext } from '../engine/systems/map/test-fixtures.ts';
import { createNewGameStore } from './store.ts';
import { createAutoSave } from './auto-save.ts';
import { deserializeSave } from '../persistence/save-file.ts';
import type { SaveRepository } from '../persistence/browser-repository.ts';

function setup() {
  const ctx = mapContext(); let now = ctx.now;
  const store = createNewGameStore(ctx.content,[1,2,3,4],()=>now);
  let primary: string | null = null; let backup: string | null = null; let generation = 0;
  const repository: SaveRepository = { read: async () => ({ primary, backup, generation }),
    write: vi.fn(async (next, previous, expected) => {
      if (expected !== generation) throw new Error('충돌');
      primary = next; if (previous !== null) backup = previous; generation += 1; return generation;
    }), close: vi.fn(),
  };
  let id = 0; const tasks = new Map<number,()=>void>(); const cancelled: (()=>void)[] = [];
  const scheduler = { schedule: vi.fn((callback:()=>void,_delay:number) => { tasks.set(++id,callback); return id; }),
    cancel: (handle:unknown) => { const callback=tasks.get(handle as number); if(callback)cancelled.push(callback);tasks.delete(handle as number); } };
  const visibility = { hidden:false, addEventListener:vi.fn(),removeEventListener:vi.fn() };
  const loaded = { save:null,source:'empty' as const,previousValid:null,generation:0 };
  const auto = createAutoSave(store,repository,loaded,()=>now,scheduler,visibility,()=>ctx.now === now ? store.getSnapshot().meta.campaignId : 'bad');
  const fire = async () => { const entry=[...tasks].at(-1); if(entry){tasks.delete(entry[0]);entry[1]();} await new Promise(resolve=>setTimeout(resolve,0)); };
  return { store,repository,auto,scheduler,visibility,tasks,cancelled,fire,clock:(value:number)=>{now=value;},slots:()=>({primary,backup,generation}) };
}

describe('자동 저장 연결부', () => {
  it('성공 행동을 1초로 모으고 직전 유효 세이브를 백업 한 개에 원자적으로 전달한다', async () => {
    const t=setup();t.auto.start();await t.auto.flush();const first=t.slots().primary;
    t.store.dispatch({type:'move/step',direction:'east'});t.store.dispatch({type:'move/step',direction:'east'});
    expect(t.tasks.size).toBe(2);expect(t.scheduler.schedule).toHaveBeenLastCalledWith(expect.any(Function),1000);
    expect(t.slots().primary).toBe(first);await t.fire();
    const slots=t.slots();expect(slots.backup).toBe(first);expect(deserializeSave(slots.primary!).revision).toBe(2);
    expect(deserializeSave(slots.primary!).state).toEqual(t.store.getSnapshot());
    const current=t.store.getSnapshot();expect(current.character!.position!.x).toBe(3);expect(t.auto.getSnapshot().phase).toBe('saved');
  });

  it('저장 실패는 기존 primary/backup·revision·게임 상태를 유지하고 명시적 재시도로 복구한다', async () => {
    const t=setup();await t.auto.flush();const before=t.slots();t.auto.start();
    const write=vi.mocked(t.repository.write);write.mockRejectedValueOnce(new Error('용량 오류'));
    t.store.dispatch({type:'move/step',direction:'east'});const state=t.store.getSnapshot();
    expect(await t.auto.flush()).toBe(false);expect(t.slots()).toEqual(before);expect(t.store.getSnapshot()).toBe(state);
    expect(t.auto.getSnapshot().phase).toBe('error');
    t.store.dispatch({type:'time/tick'});expect(t.tasks.size).toBe(0);
    expect(await t.auto.flush()).toBe(true);expect(deserializeSave(t.slots().primary!).revision).toBe(2);
  });

  it('화면 숨김은 타이머를 기다리지 않고 저장하며 보이기 이벤트는 시간을 정산하지 않는다', async () => {
    const t=setup();t.auto.start();await t.auto.flush();t.store.dispatch({type:'move/step',direction:'east'});
    const callback=t.visibility.addEventListener.mock.calls[0]![1] as ()=>void;
    t.visibility.hidden=true;callback();await t.auto.flush();expect(t.tasks.size).toBe(0);
    const saved=deserializeSave(t.slots().primary!);const before=t.store.getSnapshot();
    t.visibility.hidden=false;callback();expect(t.store.getSnapshot()).toBe(before);
    expect(saved.state).toEqual(before);
  });

  it('동시에 저장 요청이 와도 쓰기를 직렬화하고 쓰기 중 생긴 최신 변경을 이어서 저장한다', async () => {
    const t=setup();let done:((n:number)=>void)|undefined;
    vi.mocked(t.repository.write).mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
    const first=t.auto.flush();t.store.dispatch({type:'move/step',direction:'east'});
    // 실제 사용처럼 구독된 상태에서 다음 저장 요청을 큐에 넣는다.
    t.auto.start();t.store.dispatch({type:'move/step',direction:'east'});const second=t.auto.flush();
    expect(t.repository.write).toHaveBeenCalledTimes(1);done!(0);
    expect(await first).toBe(true);expect(await second).toBe(true);
    expect(t.repository.write).toHaveBeenCalledTimes(2);
    expect(deserializeSave(t.slots().primary!).state).toEqual(t.store.getSnapshot());
  });

  it('시작/종료 중복·취소 콜백은 중복 구독/쓰기를 막고 명시적 flush로 마지막 변경을 저장한다', async () => {
    const t=setup();t.auto.start();t.auto.start();expect(t.visibility.addEventListener).toHaveBeenCalledTimes(1);
    t.store.dispatch({type:'move/step',direction:'east'});t.auto.stop();t.auto.stop();await t.auto.flush();
    expect(t.visibility.removeEventListener).toHaveBeenCalledTimes(1);const count=vi.mocked(t.repository.write).mock.calls.length;
    for(const callback of t.cancelled)callback();expect(t.repository.write).toHaveBeenCalledTimes(count);
    t.auto.start();t.store.dispatch({type:'move/step',direction:'east'});await t.auto.flush();
    expect(deserializeSave(t.slots().primary!).state).toEqual(t.store.getSnapshot());
  });

  it('거부 행동은 자동 저장을 요청하지 않고 저장 자체는 시간·난수를 진행하지 않는다', async () => {
    const t=setup();t.auto.start();await t.auto.flush();const before=t.store.getSnapshot();const count=vi.mocked(t.repository.write).mock.calls.length;
    t.store.dispatch({type:'move/step',direction:'north'});expect(t.tasks.size).toBe(0);
    await t.auto.flush();expect(t.repository.write).toHaveBeenCalledTimes(count);expect(t.store.getSnapshot()).toBe(before);
  });

  it('저장소를 사용할 수 없으면 메모리 상태와 명시적 안내를 유지한다', async () => {
    const t=setup();const loaded={save:null,source:'empty' as const,previousValid:null,generation:0};
    const auto=createAutoSave(t.store,null,loaded,()=>0,t.scheduler,t.visibility,()=>t.store.getSnapshot().meta.campaignId);
    auto.start();t.store.dispatch({type:'move/step',direction:'east'});expect(await auto.flush()).toBe(false);
    expect(auto.getSnapshot().phase).toBe('unavailable');expect(t.tasks.size).toBe(0);
  });
});


describe('연속 조작의 저장 상한', () => {
  afterEach(() => vi.useRealTimers());
  it('1초 미만 간격으로 계속 이동해도 첫 변경부터 5초에 저장하고 다음 변경도 새 상한으로 저장한다', async () => {
    vi.useFakeTimers();
    const t = setup();
    let now = 0;
    const auto = createAutoSave(t.store, t.repository, { save: null, source: 'empty', previousValid: null, generation: 0 },
      () => 1_700_000_000_000 + now,
      { schedule: (cb, delay) => setTimeout(cb, delay), cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) },
      t.visibility, () => t.store.getSnapshot().meta.campaignId);
    await auto.flush(); auto.start();
    const writes = vi.mocked(t.repository.write);
    for (let i = 0; i < 100; i += 1) {
      t.store.dispatch({ type: 'move/step', direction: i % 2 ? 'west' : 'east' });
      now += 100; await vi.advanceTimersByTimeAsync(100);
      expect(writes).toHaveBeenCalledTimes(1 + Math.floor((i + 1) / 50));
    }
    auto.stop(); await vi.advanceTimersByTimeAsync(10_000);
    expect(writes).toHaveBeenCalledTimes(3);
  });
});
