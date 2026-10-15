import { describe, expect, it, vi } from 'vitest';
import legacyV3 from './fixtures/v3-explored.json' with { type: 'json' };
import { v5ToV6 } from './migrations/v5-to-v6.ts';
import { v4ToV5 } from './migrations/v4-to-v5.ts';
import { v3ToV4 } from './migrations/v3-to-v4.ts';
import { SaveFileV3Schema } from './schemas-v3.ts';
import { createSaveFile, deserializeSave, parseSave, restoreSave, serializeSave } from './save-file.ts';
import { mapContext, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { createGameStore } from '../runtime/store.ts';
import { deepFreeze } from '../engine/core/test-fixtures.ts';

const metadata = { contentVersion: '0.2.4', saveId: '00112233-4455-4677-8899-aabbccddeeff', revision: 7, savedAt: 1_700_000_001_000 };
const v3 = SaveFileV3Schema.parse(legacyV3);

describe('v3→v4 호환성과 휴식·습격 저장', () => {
  it.each([null,{}])('이전 원정 %j와 모든 필드를 보존하고 기본 필드만 추가한다', (expedition) => {
    const old = deepFreeze({ ...v3, state: { ...v3.state, expedition } });
    const expected = { ...old, schemaVersion: 4, state: { ...old.state,
      character: { ...old.state.character!, activity: 'waiting' }, expedition: expedition === null ? null : { pendingAmbush: null },
    } };
    expect(v3ToV4(old)).toEqual(expected);
    expect(parseSave(old)).toEqual(v5ToV6(v4ToV5(expected)));
    expect(deserializeSave(serializeSave(parseSave(old)))).toEqual(v5ToV6(v4ToV5(expected)));
    expect(old.schemaVersion).toBe(3);
  });

  it('null 캐릭터를 생성하지 않고 미배치 캐릭터를 배치하지 않는다', () => {
    for (const character of [null,{ ...v3.state.character!, position: null }]) {
      const old = { ...v3, state: { ...v3.state, character } };
      const result = parseSave(old);
      expect(result.state.character).toEqual(character === null ? null : { ...character, health: { current: 100, max: 100 }, activity: 'waiting', inventory: { stacks: {}, equipment: { feet: null } } });
      expect(result.state.meta).toEqual(old.state.meta);
    }
  });

  it.each(['resting','pending'] as const)('%s 왕복 후 시간·난수·자원과 후속 행동이 이어진다', (kind) => {
    const ctx = mapContext();
    const base = walk(startedState(ctx), ['east','east','south','south','east'],ctx);
    const state = { ...base, character: { ...base.character!, activity: kind === 'resting' ? 'resting' as const : 'waiting' as const },
      expedition: kind === 'pending' ? { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'resting' as const } } : null };
    const save = createSaveFile(deepFreeze(state),metadata);
    const now = vi.fn(() => ctx.now);
    const a = createGameStore(ctx.content,state,now);
    const b = createGameStore(ctx.content,restoreSave(serializeSave(save)),now);
    expect(b.getSnapshot()).toEqual(state);
    expect(now).not.toHaveBeenCalled();
    if (kind === 'pending') {
      const before = b.getSnapshot();
      expect(b.dispatch({ type: 'move/step', direction: 'east' }).state).toBe(before);
      expect(b.dispatch({ type: 'ambush/resolve', result: 'escaped' })).toEqual(a.dispatch({ type: 'ambush/resolve', result: 'escaped' }));
    }
    expect(b.dispatch({ type: 'stamina/recover', periods: 1 })).toEqual(a.dispatch({ type: 'stamina/recover', periods: 1 }));
    expect(b.dispatch({ type: 'time/tick' })).toEqual(a.dispatch({ type: 'time/tick' }));
  });

  it('v3 형식은 새 필드·손상된 난수·누락을 조용히 보정하지 않는다', () => {
    for (const raw of [
      { ...v3, state: { ...v3.state, character: { ...v3.state.character, activity: 'waiting' } } },
      { ...v3, state: { ...v3.state, meta: { ...v3.state.meta, rngState: [1,2,3] } } },
      { ...v3, state: { ...v3.state, character: { position: v3.state.character!.position } } },
    ]) { expect(() => v3ToV4(raw)).toThrow(); expect(() => parseSave(raw)).toThrow(); }
  });

  it('잘못된 휴식·미처리 상태를 원자적으로 거부한다', () => {
    const ctx = mapContext(); const safe = startedState(ctx);
    const danger = walk(safe,['east','east','south','south','east'],ctx);
    const store = createGameStore(ctx.content,safe,() => ctx.now); const notify = vi.fn(); store.subscribe(notify);
    const before = store.getSnapshot();
    for (const state of [
      { ...safe, character: { ...safe.character!, stamina: { current: 880, max: 900 }, activity: 'resting' } },
      { ...danger, character: { ...danger.character!, stamina: { current: 900, max: 900 }, activity: 'resting' } },
      { ...danger, character: { ...danger.character!, position: null, activity: 'resting' } },
      { ...safe, expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'waiting' } } },
      { ...danger, expedition: { pendingAmbush: { triggeredAt: 1, activityAtTrigger: 'waiting' } } },
      { ...danger, character: { ...danger.character!, activity: 'resting' }, expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'resting' } } },
      { ...danger, character: { ...danger.character!, activity: 'bad' } },
      { ...danger, expedition: {} },
    ]) {
      expect(() => store.restore({ ...metadata, format: 'last-vigil-save', schemaVersion: 4, state })).toThrow();
      expect(store.getSnapshot()).toBe(before);
    }
    expect(notify).not.toHaveBeenCalled();
  });
});
