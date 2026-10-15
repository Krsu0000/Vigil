import { describe, expect, it } from 'vitest';
import v1Empty from './fixtures/v1-empty.json' with { type: 'json' };
import v1Placeholders from './fixtures/v1-placeholders.json' with { type: 'json' };
import { deepFreeze } from '../engine/core/test-fixtures.ts';
import { createRng } from '../engine/core/rng.ts';
import type { GameState } from '../engine/core/state.ts';
import { mapContext, mapDispatch, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { validateMapState } from '../engine/systems/map/selectors.ts';
import { getTileVisibility } from '../engine/systems/map/visibility.ts';
import { createSaveFile, deserializeSave, parseSave, restoreSave, SaveFileSchema, serializeSave } from './save-file.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
import { v1ToV2 } from './migrations/v1-to-v2.ts';
import { mapSources } from '../content/test-fixtures.ts';

const metadata = {
  contentVersion: '0.2.0', saveId: '00112233-4455-4677-8899-aabbccddeeff', revision: 7, savedAt: 1_700_000_001_000,
};

describe('실제 v1 예시 변환과 v4 저장 연속성', () => {
  it.each([v1Empty, v1Placeholders])('이전 작성 코드로 생성한 v1을 검증·변환하고 전체 메타데이터를 보존한다', (legacy) => {
    expect(SaveFileV1Schema.parse(legacy)).toEqual(legacy);
    const raw = deepFreeze(structuredClone(legacy));
    const before = structuredClone(raw);
    const object = parseSave(raw);
    const json = deserializeSave(JSON.stringify(raw));
    expect(json).toEqual(object);
    expect(object).toEqual({ ...legacy, schemaVersion: 5, state: {
      ...legacy.state, campaign: { exploration: {}, openedChests: {} },
      expedition: legacy.state.expedition === null ? null : { pendingAmbush: null },
      character: legacy.state.character === null ? null : { inventory: { stacks: {}, equipment: { feet: null } }, position: null, stamina: { current: 900, max: 900 }, movedSinceLastTick: false, activity: 'waiting' as const },
    } });
    expect(object.state.meta).toEqual(legacy.state.meta);
    expect(object.state.expedition).toEqual(legacy.state.expedition === null ? null : { pendingAmbush: null });
    expect(raw).toEqual(before);
    expect(SaveFileSchema.parse(object)).toEqual(object);
    expect(deserializeSave(serializeSave(object))).toEqual(object);
    expect(object.state.character?.position ?? null).toBeNull();
  });

  it('변환이 캐릭터를 생성하거나 위치를 배치하지 않고 이후 명시적인 첫 배치가 가능하다', () => {
    const ctx = mapContext();
    for (const legacy of [v1Empty, v1Placeholders]) {
      const state = restoreSave(legacy);
      validateMapState(state, ctx.content);
      const attemptedMove = mapDispatch(state, { type: 'move/step', direction: 'east' }, ctx);
      expect(attemptedMove.ok).toBe(false);
      expect(attemptedMove.state).toBe(state);
      const started = mapDispatch(state, { type: 'map/start', mapId: 'map.s1_test' }, ctx);
      expect(started.ok).toBe(true);
      expect(started.state.meta).toEqual(legacy.state.meta);
    }
  });

  it('변환 전후에도 난수 수열이 같은 지점에서 이어진다', () => {
    const restored = restoreSave(v1Empty);
    const before = createRng(v1Empty.state.meta.rngState);
    const after = createRng(restored.meta.rngState);
    expect(Array.from({ length: 32 }, () => after.nextUint32()))
      .toEqual(Array.from({ length: 32 }, () => before.nextUint32()));
  });

  it('이동한 v4의 상태·안개·후속 이동이 저장 없이 진행한 경우와 같다 (INV-06)', () => {
    const ctx = deepFreeze(mapContext());
    const original = deepFreeze(walk(startedState(ctx), ['east', 'east', 'south'], ctx));
    const save = createSaveFile(original, metadata);
    const restored = restoreSave(serializeSave(save));
    expect(restored).toEqual(original);
    validateMapState(restored, ctx.content);
    for (let x = 0; x < 9; x += 1) for (let y = 0; y < 7; y += 1) {
      const position = { mapId: 'map.s1_test', floor: 0, x, y };
      expect(getTileVisibility(restored, position, ctx.content)).toBe(getTileVisibility(original, position, ctx.content));
    }
    let resumed = restored;
    let uninterrupted: GameState = original;
    for (const direction of ['south', 'east', 'east', 'west', 'west', 'north', 'west'] as const) {
      const a = mapDispatch(uninterrupted, { type: 'move/step', direction }, ctx);
      const b = mapDispatch(resumed, { type: 'move/step', direction }, ctx);
      expect(b).toEqual(a);
      expect(b.ok).toBe(true);
      uninterrupted = a.state;
      resumed = b.state;
    }
    expect(deserializeSave(serializeSave(save))).toEqual(save);
  });

  it('캐릭터가 없어도 탐사 기록을 저장·복원할 수 있다', () => {
    const ctx = mapContext();
    const state = { ...walk(startedState(ctx), ['east'], ctx), character: null };
    const restored = restoreSave(serializeSave(createSaveFile(state, metadata)));
    expect(restored).toEqual(state);
    validateMapState(restored, ctx.content);
  });

  it.each([
    { ...v1Empty, extra: true },
    { ...v1Empty, state: { ...v1Empty.state, campaign: { unexpected: true } } },
    { ...v1Empty, state: { ...v1Empty.state, character: { unexpected: true } } },
    { ...v1Empty, state: { ...v1Empty.state, meta: { ...v1Empty.state.meta, rngState: [1, 2, 3] } } },
    { ...v1Empty, revision: -1 },
  ])('손상된 v1을 변환 중 삭제·강제 변환으로 살리지 않는다', (invalid) => {
    expect(() => v1ToV2(invalid)).toThrow();
    expect(() => parseSave(invalid)).toThrow();
  });

  it('이미 v4인 데이터를 v1이라고 표시하면 이전 형식 검증에서 거부한다', () => {
    const v4 = createSaveFile(startedState(), metadata);
    expect(() => parseSave({ ...v4, schemaVersion: 1 })).toThrow();
  });

  const invalidCoordinates = ['00:1:1', '-0:1:1', '0:01:1', '0:-1:1', '0:1.5:1', '0:1:9007199254740992', 'bad'];
  it.each(invalidCoordinates)('비정규·범위 밖 탐사 키 %s를 거부한다', (key) => {
    const state = startedState();
    const memory = state.campaign.exploration['map.s1_test']!;
    const raw = { ...createSaveFile(state, metadata), state: { ...state, campaign: { exploration: {
      'map.s1_test': { ...memory, visited: { ...memory.visited, [key]: true } },
    } } } };
    expect(() => parseSave(raw)).toThrow();
  });

  it.each([0, -1, 1.5, Infinity])('잘못된 맵 버전 %s를 거부한다', (mapVersion) => {
    const state = startedState();
    const raw = { ...createSaveFile(state, metadata), state: { ...state, campaign: { exploration: {
      'map.s1_test': { ...state.campaign.exploration['map.s1_test']!, mapVersion },
    } } } };
    expect(() => parseSave(raw)).toThrow();
  });

  it('현재 위치 기록 누락·false 값·추가 위치 필드·잘못된 맵 ID를 거부한다', () => {
    const state = startedState();
    const save = createSaveFile(state, metadata);
    for (const raw of [
      { ...save, state: { ...state, campaign: { exploration: {}, openedChests: {} } } },
      { ...save, state: { ...state, campaign: { exploration: { 'map.s1_test': { mapVersion: 1, visited: { '0:1:1': false } } } } } },
      { ...save, state: { ...state, character: { position: { ...state.character!.position!, extra: 0 } } } },
      { ...save, state: { ...state, character: { position: { ...state.character!.position!, mapId: 'item.test' } } } },
    ]) expect(() => parseSave(raw)).toThrow();
  });

  it('위치 숫자의 정수·범위를 검증한다', () => {
    const state = startedState();
    const save = createSaveFile(state, metadata);
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseSave({ ...save, state: { ...state, character: {
        position: { ...state.character!.position!, x: value },
      } } })).toThrow();
    }
  });

  it('음수 층의 좌표와 탐사 기록도 저장·복원한다', () => {
    const sources = mapSources();
    const map = sources['maps/s1-test.json'][0]!;
    map.start.floor = -1;
    map.floors[0]!.floor = -1;
    const ctx = mapContext(sources);
    const state = walk(startedState(ctx), ['east'], ctx);
    const restored = restoreSave(serializeSave(createSaveFile(state, metadata)));
    expect(restored).toEqual(state);
    expect(restored.character?.position?.floor).toBe(-1);
    expect(restored.campaign.exploration['map.s1_test']!.visited['-1:2:1']).toBe(true);
    validateMapState(restored, ctx.content);
  });
});
