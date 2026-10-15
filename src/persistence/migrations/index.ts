import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from '../format.ts';
import { v1ToV2 } from './v1-to-v2.ts';
import { v2ToV3 } from './v2-to-v3.ts';
import { v3ToV4 } from './v3-to-v4.ts';
import { v4ToV5 } from './v4-to-v5.ts';
import { v5ToV6 } from './v5-to-v6.ts';
import { v6ToV7 } from './v6-to-v7.ts';

export { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from '../format.ts';

export type SaveMigration = Readonly<{
  fromVersion: number;
  migrate: (save: Readonly<Record<string, unknown>>) => unknown;
}>;

export const SAVE_MIGRATIONS: readonly SaveMigration[] = Object.freeze([
  Object.freeze({ fromVersion: 1, migrate: v1ToV2 }),
  Object.freeze({ fromVersion: 2, migrate: v2ToV3 }),
  Object.freeze({ fromVersion: 3, migrate: v3ToV4 }),
  Object.freeze({ fromVersion: 4, migrate: v4ToV5 }),
  Object.freeze({ fromVersion: 5, migrate: v5ToV6 }),
  Object.freeze({ fromVersion: 6, migrate: v6ToV7 }),
]);

const EnvelopeSchema = z.looseObject({
  format: z.literal(SAVE_FORMAT),
  schemaVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

// 변환 전에 JSON 데이터만 허용하며 입력과 분리한다. 최종 상태 검증은 호출부가 맡는다.
export function runMigrations(
  raw: unknown,
  targetVersion: number,
  migrations: readonly SaveMigration[],
): unknown {
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 1) {
    throw new Error('목표 세이브 버전은 1 이상의 안전한 정수여야 한다');
  }
  const steps = new Map<number, SaveMigration>();
  for (const step of migrations) {
    if (!Number.isSafeInteger(step.fromVersion) || step.fromVersion < 1 || steps.has(step.fromVersion)) {
      throw new Error(`잘못되거나 중복된 세이브 변환 단계: ${step.fromVersion}`);
    }
    steps.set(step.fromVersion, step);
  }

  let save = EnvelopeSchema.parse(z.json().parse(raw));
  if (save.schemaVersion > targetVersion) {
    throw new Error(`지원하지 않는 미래 세이브 버전: ${save.schemaVersion} (현재 ${targetVersion})`);
  }
  while (save.schemaVersion < targetVersion) {
    const version = save.schemaVersion;
    const step = steps.get(version);
    if (!step) throw new Error(`세이브 버전 ${version} → ${version + 1} 변환이 없다`);
    const next = EnvelopeSchema.parse(z.json().parse(step.migrate(save)));
    if (next.schemaVersion !== version + 1) {
      throw new Error(`세이브 변환은 버전을 정확히 1 올려야 한다: ${version} → ${next.schemaVersion}`);
    }
    save = next;
  }
  return save;
}

export function migrateSave(raw: unknown): unknown {
  return runMigrations(raw, CURRENT_SCHEMA_VERSION, SAVE_MIGRATIONS);
}
