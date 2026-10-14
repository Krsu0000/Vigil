import { z } from 'zod';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { migrateSave } from './migrations/index.ts';
import { GameStateV2Schema, PositionSchema } from './schemas-v2.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
export { PositionSchema } from './schemas-v2.ts';

const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const StaminaSchema = z.strictObject({
  current: integer, max: integer.min(1),
}).refine((stamina) => stamina.current <= stamina.max, { message: '스태미나는 최대치를 초과할 수 없다', path: ['current'] });

// v2의 위치·탐사 검증을 유지하고 승인된 S2 필드를 추가한다.
export const GameStateSchema = GameStateV2Schema.safeExtend({
  character: z.strictObject({
    position: PositionSchema.nullable(), stamina: StaminaSchema, movedSinceLastTick: z.boolean(),
  }).nullable(),
}) satisfies z.ZodType<GameState>;

export const SaveFileSchema = SaveFileV1Schema.extend({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), state: GameStateSchema,
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
