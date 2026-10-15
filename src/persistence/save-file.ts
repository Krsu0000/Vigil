import { z } from 'zod';
import type { GameState } from '../engine/core/state.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { migrateSave } from './migrations/index.ts';
import { GameStateV4Schema } from './schemas-v4.ts';
import { ContentIdSchema } from '../content/schemas.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
export { PositionSchema } from './schemas-v2.ts';
export { StaminaSchema } from './schemas-v3.ts';

const integer = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const itemId = ContentIdSchema.refine(id => id.startsWith('item.'));
export const InventorySchema = z.strictObject({
  stacks: z.record(itemId, integer),
  equipment: z.strictObject({ feet: itemId.nullable() }),
}).superRefine((inventory, ctx) => {
  const feet = inventory.equipment.feet;
  if (feet !== null && !Object.hasOwn(inventory.stacks, feet)) {
    ctx.addIssue({ code: 'custom', path: ['equipment', 'feet'], message: '장비는 소지품에 있어야 한다' });
  }
});
export const GameStateSchema = GameStateV4Schema.safeExtend({
  campaign: GameStateV4Schema.shape.campaign.extend({
    openedChests: z.record(ContentIdSchema.refine(id => id.startsWith('chest.')), z.literal(true)),
  }),
  character: GameStateV4Schema.shape.character.unwrap().extend({ inventory: InventorySchema }).nullable(),
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
