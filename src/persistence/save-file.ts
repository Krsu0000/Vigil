import { z } from 'zod';
import { ManifestSchema } from '../content/schemas.ts';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, migrateSave, SAVE_FORMAT } from './migrations/index.ts';

const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uint32 = z.number().int().min(0).max(0xffff_ffff);
const emptyState = z.strictObject({});

// 현재 코어 계약과 호환되는 저장 경계 검증이다. 코어는 persistence를 import하지 않는다.
export const GameStateSchema = z.strictObject({
  meta: z.strictObject({
    campaignId: z.uuid(),
    gameTime: nonnegativeInteger,
    rngState: z.tuple([uint32, uint32, uint32, uint32]),
    lastActiveAt: nonnegativeInteger,
    settledUntil: nonnegativeInteger,
  }),
  campaign: emptyState,
  character: emptyState.nullable(),
  expedition: emptyState.nullable(),
}) satisfies z.ZodType<GameState>;

export const SaveFileSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  contentVersion: ManifestSchema.shape.contentVersion,
  saveId: z.uuid(),
  revision: nonnegativeInteger,
  savedAt: nonnegativeInteger,
  state: GameStateSchema,
});

export type SaveFile = Readonly<Omit<z.infer<typeof SaveFileSchema>, 'state'> & { state: GameState }>;
export type SaveMetadata = Pick<SaveFile, 'contentVersion' | 'saveId' | 'revision' | 'savedAt'>;

export function createSaveFile(state: GameState, metadata: SaveMetadata): SaveFile {
  return parseSave({ ...metadata, format: SAVE_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, state });
}

// 객체 입력은 형식 → 버전 변환 → 최종 스키마 순서로 검증한다.
export function parseSave(raw: unknown): SaveFile {
  return SaveFileSchema.parse(migrateSave(raw));
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(parseSave(save));
}

export function deserializeSave(json: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('세이브 JSON 구문이 올바르지 않다');
  }
  return parseSave(raw);
}

export function restoreSave(raw: unknown): GameState {
  return (typeof raw === 'string' ? deserializeSave(raw) : parseSave(raw)).state;
}
