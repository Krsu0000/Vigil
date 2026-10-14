// 공개된 v2 위치·탐사 계약을 보존한다. 새 필드는 여기에 추가하지 않는다.
import { z } from 'zod';
import { ContentIdSchema } from '../content/schemas.ts';
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

// v2 당시의 위치·탐사 검증을 보존한다. 현재 코어 타입과 구분한다.
export const GameStateV2Schema = z.strictObject({
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
});

export const SaveFileV2Schema = SaveFileV1Schema.extend({
  schemaVersion: z.literal(2),
  state: GameStateV2Schema,
});

export type GameStateV2 = z.infer<typeof GameStateV2Schema>;
