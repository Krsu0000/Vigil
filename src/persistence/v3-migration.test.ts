import { describe, expect, it } from 'vitest';
import v2Empty from './fixtures/v2-empty.json' with { type: 'json' };
import v2Unplaced from './fixtures/v2-unplaced.json' with { type: 'json' };
import v2Explored from './fixtures/v2-explored.json' with { type: 'json' };
import { SaveFileV2Schema } from './schemas-v2.ts';
import { v2ToV3 } from './migrations/v2-to-v3.ts';
import { createSaveFile, deserializeSave, parseSave, restoreSave, serializeSave } from './save-file.ts';
import { deepFreeze } from '../engine/core/test-fixtures.ts';
import { createGameStore } from '../runtime/store.ts';
import { mapContext } from '../engine/systems/map/test-fixtures.ts';
import { getTileVisibility } from '../engine/systems/map/visibility.ts';

describe('이전 코드로 생성한 v2의 v3 변환', () => {
  it.each([v2Empty, v2Unplaced, v2Explored])('v2 예시 전체를 검증하고 새 필드만 추가한다', (legacy) => {
    expect(SaveFileV2Schema.parse(legacy)).toEqual(legacy);
    const input = deepFreeze(structuredClone(legacy));
    const before = structuredClone(input);
    const expected = { ...legacy, schemaVersion: 3, state: {
      ...legacy.state, character: legacy.state.character === null ? null : {
        ...legacy.state.character, stamina: { current: 900, max: 900 }, movedSinceLastTick: false,
      },
    } };
    expect(v2ToV3(input)).toEqual(expected);
    expect(parseSave(input)).toEqual(expected);
    expect(deserializeSave(JSON.stringify(input))).toEqual(expected);
    expect(deserializeSave(serializeSave(parseSave(input)))).toEqual(expected);
    expect(input).toEqual(before);
  });

  it('변환된 v2의 위치·기록·벽 안개와 이후 이동/틱이 중단 없는 v3와 같다', () => {
    const ctx = mapContext();
    const migrated = restoreSave(v2Explored);
    const base = SaveFileV2Schema.parse(v2Explored).state;
    const direct = { ...base, character: {
      ...base.character!, stamina: { current: 900, max: 900 }, movedSinceLastTick: false,
    } };
    expect(migrated).toEqual(direct);
    for (const legacyState of [migrated, direct]) {
      expect(legacyState.meta).toEqual(v2Explored.state.meta);
      expect(legacyState.campaign).toEqual(v2Explored.state.campaign);
    }
    const a = createGameStore(ctx.content, migrated, () => ctx.now);
    const b = createGameStore(ctx.content, direct, () => ctx.now);
    for (const action of [
      { type: 'move/step', direction: 'east' }, { type: 'time/tick' }, { type: 'stamina/recover', periods: 1 }, { type: 'time/tick' },
      { type: 'move/step', direction: 'west' }, { type: 'time/tick' },
    ] as const) expect(a.dispatch(action)).toEqual(b.dispatch(action));
    for (let x = 0; x < 9; x += 1) for (let y = 0; y < 7; y += 1) {
      const to = { mapId: 'map.s1_test', floor: 0, x, y };
      expect(getTileVisibility(a.getSnapshot(), to, ctx.content)).toBe(getTileVisibility(b.getSnapshot(), to, ctx.content));
    }
  });

  it('실제로 이동한 v3를 저장/복원해도 이동 표시와 독립적인 시간/회복 결과가 보존된다', () => {
    const ctx = mapContext(); const original = createGameStore(ctx.content, restoreSave(v2Explored), () => ctx.now);
    original.dispatch({ type: 'move/step', direction: 'east' });
    const moved = original.getSnapshot();
    const { contentVersion, saveId, revision, savedAt } = v2Explored;
    const save = createSaveFile(moved, { contentVersion, saveId, revision, savedAt });
    const restored = createGameStore(ctx.content, restoreSave(serializeSave(save)), () => ctx.now);
    expect(restored.getSnapshot()).toEqual(moved);
    expect(restored.getSnapshot().character?.movedSinceLastTick).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      expect(restored.dispatch({ type: 'time/tick' })).toEqual(original.dispatch({ type: 'time/tick' }));
      expect(restored.dispatch({ type: 'stamina/recover', periods: 1 })).toEqual(original.dispatch({ type: 'stamina/recover', periods: 1 }));
    }
  });

  it.each([
    { ...v2Explored, extra: true },
    { ...v2Explored, revision: -1 },
    { ...v2Explored, state: { ...v2Explored.state, character: { ...v2Explored.state.character, extra: true } } },
    { ...v2Explored, state: { ...v2Explored.state, character: { position: { ...v2Explored.state.character.position, x: -1 } } } },
    { ...v2Explored, state: { ...v2Explored.state, meta: { ...v2Explored.state.meta, rngState: [1, 2, 3] } } },
  ])('손상된 v2를 변환 중 삭제·강제 변환으로 보정하지 않는다', (raw) => {
    expect(() => v2ToV3(raw)).toThrow();
    expect(() => parseSave(raw)).toThrow();
  });

  it('새 필드가 있는 v3를 v2로 속이면 이전 스키마에서 거부한다', () => {
    const v3 = parseSave(v2Explored);
    expect(() => parseSave({ ...v3, schemaVersion: 2 })).toThrow();
  });
});

describe('v3 스태미나 저장 경계', () => {
  it.each([
    { current: -1, max: 900 }, { current: 901, max: 900 }, { current: 1.5, max: 900 },
    { current: 0, max: 0 }, { current: 0, max: 1.5 }, { current: NaN, max: 900 },
    { current: 0, max: Number.MAX_SAFE_INTEGER + 1 }, { current: 0, max: 900, extra: 1 },
  ])('잘못된 스태미나 %j를 거부한다', (stamina) => {
    const v3 = parseSave(v2Explored);
    expect(() => parseSave({ ...v3, state: { ...v3.state, character: { ...v3.state.character, stamina } } })).toThrow();
  });

  it('이동 표시·필수 스태미나 누락을 거부한다', () => {
    const v3 = parseSave(v2Explored);
    for (const movedSinceLastTick of [1, 'true', undefined]) {
      expect(() => parseSave({ ...v3, state: { ...v3.state, character: { ...v3.state.character, movedSinceLastTick } } })).toThrow();
    }
    expect(() => parseSave({ ...v3, state: { ...v3.state, character: { position: v3.state.character!.position, movedSinceLastTick: false } } })).toThrow();
  });
});
