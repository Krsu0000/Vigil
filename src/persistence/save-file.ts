import { z } from 'zod';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { migrateSave } from './migrations/index.ts';
import { PositionSchema } from './schemas-v2.ts';
import { GameStateV3Schema, StaminaSchema } from './schemas-v3.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
export { PositionSchema } from './schemas-v2.ts';
export { StaminaSchema } from './schemas-v3.ts';

const activity = z.enum(['waiting', 'resting']);
export const GameStateSchema = z.strictObject({
  ...GameStateV3Schema.shape,
  character: z.strictObject({
    position: PositionSchema.nullable(), stamina: StaminaSchema,
    movedSinceLastTick: z.boolean(), activity,
  }).nullable(),
  expedition: z.strictObject({ pendingAmbush: z.strictObject({
    triggeredAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), activityAtTrigger: activity,
  }).nullable() }).nullable(),
}).superRefine((state, ctx) => {
  const character = state.character;
  if (character?.position) {
    const p = character.position;
    if (state.campaign.exploration[p.mapId]?.visited[`${p.floor}:${p.x}:${p.y}`] !== true) {
      ctx.addIssue({ code: 'custom', path: ['character', 'position'], message: '현재 위치는 탐사 기록에 있어야 한다' });
    }
  }
  if (character?.activity === 'resting' && (!character.position || character.stamina.current === character.stamina.max)) {
    ctx.addIssue({ code: 'custom', path: ['character', 'activity'], message: '휴식에는 배치된 캐릭터와 최대치 미만 스태미나가 필요하다' });
  }
  const pending = state.expedition?.pendingAmbush;
  if (pending && (!character?.position || character.activity !== 'waiting' || pending.triggeredAt > state.meta.gameTime)) {
    ctx.addIssue({ code: 'custom', path: ['expedition', 'pendingAmbush'], message: '미처리 습격의 위치·활동·발생 시간이 유효하지 않다' });
  }
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
