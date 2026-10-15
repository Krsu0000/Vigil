import { describe, expect, it, vi } from 'vitest';
import { createCampaign } from '../engine/core/campaign.ts';
import { mapContext, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { mapSources } from '../content/test-fixtures.ts';
import v1 from '../persistence/fixtures/v1-placeholders.json' with { type: 'json' };
import { createSaveFile, serializeSave } from '../persistence/save-file.ts';
import { createGameStore, createNewGameStore, initialMapId } from './store.ts';

const seed = [1, 2, 3, 4] as const;
const metadata = { contentVersion: '0.2.0', saveId: v1.saveId, revision: 7, savedAt: v1.savedAt };

describe('GameStore', () => {
  it('새 게임은 같은 주입값에서 동일하고 시작점에 배치한다', () => {
    const ctx = mapContext();
    const a = createNewGameStore(ctx.content, seed, () => ctx.now);
    const b = createNewGameStore(ctx.content, seed, () => ctx.now);
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    expect(a.getSnapshot().character?.position).toMatchObject({ x: 1, y: 1 });
    expect(a.getSnapshot().campaign.exploration['map.s1_test']!.visited).toEqual({ '0:1:1': true });
    expect(a.getSnapshot()).toBe(a.getSnapshot());
  });

  it('시작 시 입력 상태와 분리하며 구독 중에는 같은 스냅샷을 반환한다', () => {
    const ctx = mapContext();
    const state = startedState(ctx);
    const store = createGameStore(ctx.content, state, () => ctx.now);
    expect(store.getSnapshot()).not.toBe(state);
    expect(store.getSnapshot()).toEqual(state);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('성공 시 한 번 알리고 거부 시 같은 스냅샷과 알림 수를 유지한다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, seed, () => ctx.now);
    const notify = vi.fn();
    store.subscribe(notify);
    const before = store.getSnapshot();
    expect(store.dispatch({ type: 'move/step', direction: 'north' }).ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    const result = store.dispatch({ type: 'move/step', direction: 'east' });
    expect(result.ok).toBe(true);
    expect(store.getSnapshot()).toBe(result.state);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('구독 해제 후에는 알리지 않고 다른 구독은 유지한다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, seed, () => ctx.now);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = store.subscribe(first);
    store.subscribe(second);
    unsubscribe();
    unsubscribe();
    store.dispatch({ type: 'move/step', direction: 'east' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('저장 복원은 검증 후 교체·알림을 하며 시간 공급자를 호출하지 않는다', () => {
    const ctx = mapContext();
    const now = vi.fn(() => ctx.now);
    const store = createNewGameStore(ctx.content, seed, now);
    const state = walk(startedState(ctx), ['east', 'east'], ctx);
    const notify = vi.fn();
    store.subscribe(notify);
    now.mockClear();
    store.restore(serializeSave(createSaveFile(state, metadata)));
    expect(store.getSnapshot()).toEqual(state);
    expect(notify).toHaveBeenCalledOnce();
    expect(now).not.toHaveBeenCalled();
  });

  it('손상·맵 버전 불일치 복원은 원래 상태와 구독을 유지한다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, seed, () => ctx.now);
    const before = store.getSnapshot();
    const notify = vi.fn();
    store.subscribe(notify);
    const save = createSaveFile(before, metadata);
    const mismatch = { ...save, state: { ...save.state, campaign: { openedChests: {}, exploration: {
      'map.s1_test': { ...save.state.campaign.exploration['map.s1_test']!, mapVersion: 2 },
    } } } };
    for (const raw of ['{', mismatch]) {
      expect(() => store.restore(raw)).toThrow();
      expect(store.getSnapshot()).toBe(before);
      expect(notify).not.toHaveBeenCalled();
    }
    store.dispatch({ type: 'move/step', direction: 'east' });
    expect(notify).toHaveBeenCalledOnce();
  });

  it('v1 복원은 자동 배치 없이 미배치 상태로 유지하고 명시적으로 시작할 수 있다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, seed, () => ctx.now);
    store.restore(v1);
    expect(store.getSnapshot().character?.position).toBeNull();
    expect(store.getSnapshot().meta).toEqual(v1.state.meta);
    expect(store.dispatch({ type: 'map/start', mapId: initialMapId(ctx.content) }).ok).toBe(true);
    expect(store.getSnapshot().meta).toEqual(v1.state.meta);
  });

  it('검증되지 않은 초기 상태로 저장소를 만들지 않는다', () => {
    const ctx = mapContext();
    const state = createCampaign(ctx.content, seed, ctx.now);
    expect(() => createGameStore(ctx.content, { ...state, campaign: { openedChests: {}, exploration: {
      'map.missing': { mapVersion: 1, visited: {} },
    } } }, () => ctx.now)).toThrow();
  });

  it('여러 시작 맵을 배열 순서로 임의 선택하지 않는다', () => {
    const sources = mapSources();
    sources['maps/s1-test.json'].push({ ...structuredClone(sources['maps/s1-test.json'][0]!), id: 'map.other' });
    const ctx = mapContext(sources);
    expect(() => initialMapId(ctx.content)).toThrow('1개');
  });

  it('이동과 시간 행동은 같은 구독 경로로 한 번씩 반영된다', () => {
    const ctx = mapContext(); const store = createNewGameStore(ctx.content, seed, () => ctx.now);
    const notify = vi.fn(); store.subscribe(notify);
    store.dispatch({ type: 'move/step', direction: 'east' });
    expect(store.getSnapshot().character?.movedSinceLastTick).toBe(true);
    const first = store.dispatch({ type: 'time/tick' });
    expect(first.ok).toBe(true);
    expect(store.getSnapshot()).toBe(first.state);
    expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(store.getSnapshot().character?.movedSinceLastTick).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('자원 부족 이동도 같은 스냅샷을 유지하고 구독에 알리지 않는다', () => {
    const ctx = mapContext();
    const initial = walk(startedState(ctx), ['east','east','south','south'], ctx);
    const store = createGameStore(ctx.content, { ...initial, character: {
      ...initial.character!, stamina: { current: 5, max: 900 }, movedSinceLastTick: false,
    } }, () => ctx.now);
    const before = store.getSnapshot(); const notify = vi.fn();store.subscribe(notify);
    expect(store.dispatch({ type: 'move/step', direction: 'east' })).toEqual({ ok: false, state: before, reason: 'insufficient_resources' });
    expect(store.getSnapshot()).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    store.dispatch({ type: 'time/tick' });
    expect(store.getSnapshot().character?.stamina.current).toBe(5);
    store.dispatch({ type: 'stamina/recover', periods: 1 });
    expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(store.getSnapshot().character?.stamina.current).toBe(6);
    expect(store.dispatch({ type: 'move/step', direction: 'east' }).ok).toBe(true);
  });
});
