import { z } from 'zod';
import { SAVE_FORMAT } from './format.ts';

// 공개된 v1 계약을 보존한다. 새 상태 필드는 이 스키마에 추가하지 않는다.
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uint32 = z.number().int().min(0).max(0xffff_ffff);
const emptyState = z.strictObject({});

export const GameStateV1Schema = z.strictObject({
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
});

export const SaveFileV1Schema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  schemaVersion: z.literal(1),
  contentVersion: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  saveId: z.uuid(),
  revision: nonnegativeInteger,
  savedAt: nonnegativeInteger,
  state: GameStateV1Schema,
});
