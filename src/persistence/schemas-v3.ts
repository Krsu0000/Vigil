// 공개된 v3 스태미나·이동 표시 계약을 보존한다.
import { z } from 'zod';
import { GameStateV2Schema, PositionSchema } from './schemas-v2.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const StaminaSchema = z.strictObject({
  current: integer, max: integer.min(1),
}).refine((stamina) => stamina.current <= stamina.max, { message: '스태미나는 최대치를 초과할 수 없다', path: ['current'] });

// v2의 위치·탐사 검증을 유지하고 승인된 S2 필드를 추가한다.
export const GameStateV3Schema = GameStateV2Schema.safeExtend({
  character: z.strictObject({
    position: PositionSchema.nullable(), stamina: StaminaSchema, movedSinceLastTick: z.boolean(),
  }).nullable(),
});

export const SaveFileV3Schema = SaveFileV1Schema.extend({
  schemaVersion: z.literal(3), state: GameStateV3Schema,
});

