import { z } from 'zod';
import { ContentIdSchema } from '../content/schemas.ts';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { migrateSave } from './migrations/index.ts';
import { GameStateV1Schema, SaveFileV1Schema } from './schemas-v1.ts';

const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const floorNumber = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const mapId = ContentIdSchema.refine((id) => id.startsWith('map.'), '맵 ID는 map.로 시작해야 한다');
const coordinate = z.string().regex(/^(0|-[1-9]\d*|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*)$/)
  .refine((key) => key.split(':').map(Number).every(Number.isSafeInteger), '탐사 좌표는 안전한 정수여야 한다');

export const PositionSchema = z.strictObject({
  mapId, floor: floorNumber, x: nonnegativeInteger, y: nonnegativeInteger,
});
const ExplorationSchema = z.strictObject({
  mapVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  visited: z.record(coordinate, z.literal(true)),
});

// 현재 코어 계약과 호환되는 저장 경계 검증이다. 코어는 persistence를 import하지 않는다.
export const GameStateSchema = z.strictObject({
  meta: GameStateV1Schema.shape.meta,
  campaign: z.strictObject({ exploration: z.record(mapId, ExplorationSchema) }),
  character: z.strictObject({ position: PositionSchema.nullable() }).nullable(),
  expedition: GameStateV1Schema.shape.expedition,
}).superRefine((state, ctx) => {
  const position = state.character?.position;
  if (!position) return;
  const memory = state.campaign.exploration[position.mapId];
  const key = `${position.floor}:${position.x}:${position.y}`;
  if (!memory || memory.visited[key] !== true) {
    ctx.addIssue({ code: 'custom', path: ['character', 'position'], message: '현재 위치는 탐사 기록에 있어야 한다' });
  }
}) satisfies z.ZodType<GameState>;

export const SaveFileSchema = SaveFileV1Schema.extend({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
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
