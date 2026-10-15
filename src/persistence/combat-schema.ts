import { z } from 'zod';
import { ContentIdSchema } from '../content/schemas.ts';
import { PositionSchema } from './schemas-v2.ts';
import { StaminaSchema } from './schemas-v3.ts';
import { GameStateV5Schema } from './schemas-v5.ts';
const integer=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const enemy=z.strictObject({id:z.string().min(1),monsterId:ContentIdSchema,health:integer,maxHealth:integer.min(1),row:z.enum(['front','back'])})
  .refine(e=>e.health<=e.maxHealth,{message:'적 체력 범위 오류'});
export const CombatCharacterSchema=GameStateV5Schema.shape.character.unwrap().extend({health:StaminaSchema,archetype:z.enum(['warrior','rogue','mage']).optional(),mana:StaminaSchema.optional()});
export const CombatStateSchema=z.strictObject({
  encounterId:ContentIdSchema,origin:z.enum(['map','ambush']),retreat:PositionSchema,
  status:z.enum(['active','victory','escaped','defeat']),turn:integer.min(1),enemies:z.array(enemy).min(1).max(6),
  history:z.array(z.strictObject({turn:integer.min(1),text:z.string()})),
  actions:z.array(z.strictObject({type:z.literal('combat/act'),choice:z.enum(['attack','defend','skill','item','escape']),targetId:z.string().optional(),itemId:ContentIdSchema.optional()})),
  loot:z.array(z.strictObject({itemId:ContentIdSchema,quantity:integer.min(1)})),
  initial:z.strictObject({contentVersion:z.string().min(1),character:CombatCharacterSchema,enemies:z.array(enemy).min(1).max(6),
    rngState:z.tuple([integer.max(4294967295),integer.max(4294967295),integer.max(4294967295),integer.max(4294967295)]).refine(v=>v.some(n=>n!==0)),gameTime:integer}),
}).superRefine((c,ctx)=>{
  if(c.turn!==c.actions.length+1||new Set(c.enemies.map(e=>e.id)).size!==c.enemies.length)
    ctx.addIssue({code:'custom',message:'전투 턴/개체 ID 오류'});
  if(c.status==='victory'&&c.enemies.some(e=>e.health!==0))ctx.addIssue({code:'custom',message:'승리한 전투에 살아 있는 적이 있다'});
  if(c.status==='active'&&c.enemies.every(e=>e.health===0))ctx.addIssue({code:'custom',message:'진행 중 전투에 적이 없다'});
});
