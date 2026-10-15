import { z } from 'zod';
import { GameStateV5Schema } from './schemas-v5.ts';
import { CombatStateSchema, CombatCharacterSchema } from './combat-schema-v6.ts';
import { PositionSchema } from './schemas-v2.ts';
import { ContentIdSchema } from '../content/schemas.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
export const GameStateV6Schema = GameStateV5Schema.safeExtend({
  character: CombatCharacterSchema.nullable(),
  expedition: GameStateV5Schema.shape.expedition.unwrap().extend({
    pendingAmbush: GameStateV5Schema.shape.expedition.unwrap().shape.pendingAmbush.unwrap().extend({
      encounterId: ContentIdSchema.optional(), retreat: PositionSchema.optional(),
    }).nullable(),
    combat: CombatStateSchema.optional(),
    defeatedEnemies: z.record(ContentIdSchema, z.literal(true)).optional(),
  }).nullable(),
}).superRefine((state,ctx)=>{
  const combat=state.expedition?.combat;
  if(combat && (!state.character?.position || state.expedition?.pendingAmbush || state.character.activity!=='waiting'))
    ctx.addIssue({code:'custom',message:'전투/조우/캐릭터 상태가 충돌한다'});
  if(state.character?.health.current===0 && combat?.status!=='defeat')
    ctx.addIssue({code:'custom',message:'체력이 0이면 패배한 전투가 필요하다'});
  if(combat && ((combat.status==='defeat') !== (state.character?.health.current===0)))
    ctx.addIssue({code:'custom',message:'전투 결과와 체력이 다르다'});
});

export const SaveFileV6Schema=SaveFileV1Schema.extend({schemaVersion:z.literal(6),state:GameStateV6Schema});
