import { z } from 'zod';
import { GameStateV3Schema, StaminaSchema } from './schemas-v3.ts';
import { PositionSchema } from './schemas-v2.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
const activity = z.enum(['waiting', 'resting']);
export const GameStateV4Schema = z.strictObject({
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
});

export const SaveFileV4Schema = SaveFileV1Schema.extend({ schemaVersion: z.literal(4), state: GameStateV4Schema });
