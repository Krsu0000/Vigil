import { describe, expect, it } from 'vitest';
import { initialState, ctx, deepFreeze, rollAction, testEngine } from '../engine/core/test-fixtures.ts';
import { createRng } from '../engine/core/rng.ts';
import {
  createSaveFile, deserializeSave, GameStateSchema, parseSave, restoreSave, SaveFileSchema, serializeSave,
} from './save-file.ts';
import type { SaveFile } from './save-file.ts';

const metadata = {
  contentVersion: 'test.s0',
  saveId: '00112233-4455-4677-8899-aabbccddeeff',
  revision: 7,
  savedAt: 1_700_000_001_000,
} as const;

function fixture(): SaveFile {
  const state = initialState();
  return createSaveFile({
    ...state,
    meta: { ...state.meta, gameTime: 123, lastActiveAt: ctx.now + 100, settledUntil: ctx.now - 100 },
  }, metadata);
}

describe('SaveFile v1 저장 계약', () => {
  it('직렬화 → 역직렬화 → Zod 검증 후 전체 세이브가 같다', () => {
    const save = deepFreeze(fixture());
    const restored = deserializeSave(serializeSave(save));
    expect(SaveFileSchema.parse(restored)).toEqual(save);
    expect(GameStateSchema.parse(restored.state)).toEqual(save.state);
    expect(restored).not.toBe(save);
    expect(restored.state.meta.rngState).not.toBe(save.state.meta.rngState);
  });

  it('저장 메타데이터는 주입받고 입력 상태와 분리한다', () => {
    const state = initialState();
    const original = structuredClone(state);
    const save = createSaveFile(deepFreeze(state), deepFreeze(metadata));
    expect(save).toMatchObject({ format: 'last-vigil-save', schemaVersion: 1, ...metadata });
    expect(save.state).toEqual(original);
    expect(save.state).not.toBe(state);
    expect(state).toEqual(original);
  });

  it('객체·JSON 복원은 시간·정산 기준·난수·revision을 바꾸지 않는다 (INV-06)', () => {
    const save = deepFreeze(fixture());
    expect(restoreSave(save)).toEqual(save.state);
    expect(restoreSave(serializeSave(save))).toEqual(save.state);
    let restored = save;
    for (let i = 0; i < 5; i += 1) restored = deserializeSave(serializeSave(restored));
    expect(restored).toEqual(save);
  });

  it('저장 직전까지 소비한 난수 이후의 수열이 그대로 이어진다', () => {
    const engine = testEngine();
    let state = initialState();
    for (let i = 0; i < 3; i += 1) state = engine.dispatch(state, rollAction, ctx).state;
    const restored = restoreSave(serializeSave(createSaveFile(state, metadata)));
    const before = createRng(state.meta.rngState);
    const after = createRng(restored.meta.rngState);
    expect(Array.from({ length: 32 }, () => after.nextUint32()))
      .toEqual(Array.from({ length: 32 }, () => before.nextUint32()));
    let uninterrupted = state;
    let resumed = restored;
    for (let i = 0; i < 16; i += 1) {
      const a = engine.dispatch(uninterrupted, rollAction, ctx);
      const b = engine.dispatch(resumed, rollAction, ctx);
      expect(b).toEqual(a);
      uninterrupted = a.state;
      resumed = b.state;
    }
  });

  it('null과 현재 계약의 빈 character·expedition을 모두 보존한다', () => {
    const state = { ...initialState(), character: {}, expedition: {} };
    expect(restoreSave(serializeSave(createSaveFile(state, metadata)))).toEqual(state);
  });

  it('revision 0과 시간 0 및 uint32 최댓값을 허용한다', () => {
    const state = initialState();
    const save = createSaveFile({
      ...state,
      meta: { ...state.meta, gameTime: 0, lastActiveAt: 0, settledUntil: 0, rngState: [0, 0xffff_ffff, 0, 1] },
    }, { ...metadata, revision: 0, savedAt: 0 });
    expect(deserializeSave(serializeSave(save))).toEqual(save);
  });

  it('콘텐츠 버전을 보존하고 현재 콘텐츠에 맞춰 임의로 바꾸지 않는다', () => {
    const save = { ...fixture(), contentVersion: 'older.content-0.1' };
    expect(deserializeSave(serializeSave(save)).contentVersion).toBe(save.contentVersion);
  });

  it.each(['{', '', 'null', '[]', 'true', '42', '"문자열"'])('세이브가 아닌 JSON을 거부한다: %s', (json) => {
    expect(() => deserializeSave(json)).toThrow();
    expect(() => restoreSave(json)).toThrow();
  });

  it('미래 버전을 낮추거나 현재 형식으로 읽지 않는다', () => {
    const raw = { ...fixture(), schemaVersion: 2 };
    expect(() => parseSave(raw)).toThrow('미래 세이브 버전');
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow('미래 세이브 버전');
  });

  type InvalidCase = { name: string; change: (save: SaveFile) => unknown };
  const invalid: InvalidCase[] = [
    { name: '다른 format', change: (s) => ({ ...s, format: 'other' }) },
    { name: '버전 0', change: (s) => ({ ...s, schemaVersion: 0 }) },
    { name: '소수 버전', change: (s) => ({ ...s, schemaVersion: 1.5 }) },
    { name: '문자열 버전', change: (s) => ({ ...s, schemaVersion: '1' }) },
    { name: '버전 누락', change: (s) => ({ ...s, schemaVersion: undefined }) },
    { name: '빈 콘텐츠 버전', change: (s) => ({ ...s, contentVersion: '' }) },
    { name: '공백 콘텐츠 버전', change: (s) => ({ ...s, contentVersion: '0.1 0' }) },
    { name: '잘못된 saveId', change: (s) => ({ ...s, saveId: 'not-a-uuid' }) },
    { name: '음수 revision', change: (s) => ({ ...s, revision: -1 }) },
    { name: '소수 revision', change: (s) => ({ ...s, revision: 0.5 }) },
    { name: '정수 정밀도 초과', change: (s) => ({ ...s, revision: Number.MAX_SAFE_INTEGER + 1 }) },
    { name: '음수 savedAt', change: (s) => ({ ...s, savedAt: -1 }) },
    { name: '무한대 savedAt', change: (s) => ({ ...s, savedAt: Infinity }) },
    { name: '문자열 savedAt', change: (s) => ({ ...s, savedAt: '1000' }) },
    { name: 'null 상태', change: (s) => ({ ...s, state: null }) },
    { name: '잘못된 캠페인 ID', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, campaignId: 'bad' } } }) },
    { name: '음수 게임 시간', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, gameTime: -1 } } }) },
    { name: '소수 게임 시간', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, gameTime: 0.5 } } }) },
    { name: 'NaN 게임 시간', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, gameTime: NaN } } }) },
    { name: '음수 활동 시각', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, lastActiveAt: -1 } } }) },
    { name: '소수 정산 시각', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, settledUntil: 0.5 } } }) },
    ...[
      [], [1, 2, 3], [1, 2, 3, 4, 5], [-1, 2, 3, 4], [0.5, 2, 3, 4], [2 ** 32, 2, 3, 4], [NaN, 2, 3, 4],
    ].map((rngState, i): InvalidCase => ({
      name: `손상된 난수 상태 ${i}`,
      change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, rngState } } }),
    })),
    { name: 'UI 외부 필드', change: (s) => ({ ...s, ui: {} }) },
    { name: '상태 외부 필드', change: (s) => ({ ...s, state: { ...s.state, runtime: {} } }) },
    { name: 'meta 외부 필드', change: (s) => ({ ...s, state: { ...s.state, meta: { ...s.state.meta, other: 0 } } }) },
    { name: '미정의 campaign 필드', change: (s) => ({ ...s, state: { ...s.state, campaign: { other: 0 } } }) },
    { name: '미정의 character 필드', change: (s) => ({ ...s, state: { ...s.state, character: { other: 0 } } }) },
    { name: '미정의 expedition 필드', change: (s) => ({ ...s, state: { ...s.state, expedition: { other: 0 } } }) },
    ...[new Date(0), new Map(), new Set(), () => 1, undefined].map((campaign, i): InvalidCase => ({
      name: `JSON으로 저장할 수 없는 상태 ${i}`,
      change: (s) => ({ ...s, state: { ...s.state, campaign } }),
    })),
  ];

  it.each(invalid)('$name 입력은 삭제·강제 변환 없이 거부한다', ({ change }) => {
    const raw = change(fixture());
    expect(() => parseSave(raw)).toThrow();
    // 타입을 우회한 실행 중 입력도 JSON 변환으로 조용히 손실시키지 않는다.
    expect(() => serializeSave(raw as SaveFile)).toThrow();
  });
});
