import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrateSave, runMigrations, SAVE_FORMAT, SAVE_MIGRATIONS } from './index.ts';
import type { SaveMigration } from './index.ts';

const initial = { format: SAVE_FORMAT, schemaVersion: 1, value: 5 };

describe('세이브 버전 변환 체인', () => {
  it('제품은 버전 1이고 실제 변환 목록은 비어 있다', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(SAVE_MIGRATIONS).toEqual([]);
    expect(migrateSave(initial)).toEqual(initial);
  });

  it('단계 목록 순서와 관계없이 버전 순서대로 연결한다', () => {
    const calls: number[] = [];
    const steps: SaveMigration[] = [
      { fromVersion: 2, migrate: (s) => { calls.push(2); return { ...s, schemaVersion: 3, value: Number(s.value) * 2 }; } },
      { fromVersion: 1, migrate: (s) => { calls.push(1); return { ...s, schemaVersion: 2, value: Number(s.value) + 1 }; } },
    ];
    expect(runMigrations(initial, 3, steps)).toEqual({ ...initial, schemaVersion: 3, value: 12 });
    expect(calls).toEqual([1, 2]);
    expect(initial).toEqual({ format: SAVE_FORMAT, schemaVersion: 1, value: 5 });
  });

  it('현 버전 입력은 변환 함수를 호출하지 않는다', () => {
    const migrate = vi.fn(() => { throw new Error('호출되면 안 된다'); });
    const result = runMigrations(initial, 1, [{ fromVersion: 1, migrate }]);
    expect(migrate).not.toHaveBeenCalled();
    expect(result).toEqual(initial);
    expect(result).not.toBe(initial);
  });

  it('변환 함수가 중첩 객체를 바꾸어도 원본 입력은 손상되지 않는다', () => {
    const raw = { ...initial, nested: { value: 1 } };
    const original = structuredClone(raw);
    const steps: SaveMigration[] = [{ fromVersion: 1, migrate: (s) => {
      const nested = s.nested as { value: number };
      nested.value = 2;
      return { ...s, schemaVersion: 2 };
    } }];
    expect(runMigrations(raw, 2, steps)).toMatchObject({ schemaVersion: 2, nested: { value: 2 } });
    expect(raw).toEqual(original);
  });

  it('필요한 단계가 없으면 일부 변환 결과를 반환하지 않는다', () => {
    const steps: SaveMigration[] = [{ fromVersion: 1, migrate: (s) => ({ ...s, schemaVersion: 2 }) }];
    expect(() => runMigrations(initial, 3, steps)).toThrow('2 → 3 변환이 없다');
  });

  it.each([0, 1, 3])('변환 후 버전 %s는 정확한 1단계 증가가 아니므로 거부한다', (version) => {
    expect(() => runMigrations(initial, 2, [{ fromVersion: 1, migrate: (s) => ({ ...s, schemaVersion: version }) }])).toThrow();
  });

  it.each([null, { format: 'other', schemaVersion: 2 }, { format: SAVE_FORMAT, schemaVersion: 2, value: Infinity }])(
    '손상된 변환 결과를 거부한다: %j', (output) => {
      expect(() => runMigrations(initial, 2, [{ fromVersion: 1, migrate: () => output }])).toThrow();
    },
  );

  it('변환 함수의 코드 예외를 숨기지 않는다', () => {
    const error = new Error('변환 코드 결함');
    expect(() => runMigrations(initial, 2, [{ fromVersion: 1, migrate: () => { throw error; } }])).toThrow(error);
  });

  it('미래 버전은 변환 함수를 호출하거나 다운그레이드하지 않는다', () => {
    const migrate = vi.fn();
    expect(() => runMigrations({ ...initial, schemaVersion: 3 }, 2, [{ fromVersion: 1, migrate }]))
      .toThrow('미래 세이브 버전');
    expect(migrate).not.toHaveBeenCalled();
  });

  it('중복 단계는 순서에 따라 고르지 않고 거부한다', () => {
    const step: SaveMigration = { fromVersion: 1, migrate: (s) => ({ ...s, schemaVersion: 2 }) };
    expect(() => runMigrations(initial, 2, [step, step])).toThrow('중복');
  });

  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('잘못된 목표·시작 버전 %s를 거부한다', (version) => {
    expect(() => runMigrations(initial, version, [])).toThrow();
    expect(() => runMigrations(initial, 2, [{ fromVersion: version, migrate: (s) => s }])).toThrow();
  });
});
