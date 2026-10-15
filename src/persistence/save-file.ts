import { z } from 'zod';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { migrateSave } from './migrations/index.ts';
import { GameStateV5Schema } from './schemas-v5.ts';
import { CombatStateSchema, CombatCharacterSchema } from './combat-schema.ts';
import { PositionSchema } from './schemas-v2.ts';
import { ContentIdSchema } from '../content/schemas.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
export { PositionSchema } from './schemas-v2.ts';
export { StaminaSchema } from './schemas-v3.ts';

export { InventorySchema } from './schemas-v5.ts';
export const GameStateSchema = GameStateV5Schema.safeExtend({
  character: CombatCharacterSchema.nullable(),
  campaign: GameStateV5Schema.shape.campaign.extend({
    recentRecords: z.array(z.strictObject({ at: z.number().int().min(0).max(8640000000000000), text: z.string().min(1) })).max(100).optional(),
  }),
  expedition: GameStateV5Schema.shape.expedition.unwrap().extend({
    pendingAmbush: GameStateV5Schema.shape.expedition.unwrap().shape.pendingAmbush.unwrap().extend({
      encounterId: ContentIdSchema.optional(), retreat: PositionSchema.optional(),
    }).nullable(),
    combat: CombatStateSchema.optional(),
    defeatedEnemies: z.record(ContentIdSchema, z.literal(true)).optional(),
  }).nullable(),
}).superRefine((state,ctx)=>{
  if(state.character?.mana && state.character.archetype!=='mage')
    ctx.addIssue({code:'custom',message:'마나는 마법사에게만 허용한다'});
  const combat=state.expedition?.combat;
  if(combat && (!state.character?.position || state.expedition?.pendingAmbush || state.character.activity!=='waiting'))
    ctx.addIssue({code:'custom',message:'전투/조우/캐릭터 상태가 충돌한다'});
  if(state.character?.health.current===0 && combat?.status!=='defeat')
    ctx.addIssue({code:'custom',message:'체력이 0이면 패배한 전투가 필요하다'});
  if(combat && ((combat.status==='defeat') !== (state.character?.health.current===0)))
    ctx.addIssue({code:'custom',message:'전투 결과와 체력이 다르다'});
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
