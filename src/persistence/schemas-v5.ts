import { z } from 'zod';
import { GameStateV4Schema } from './schemas-v4.ts';
import { ContentIdSchema } from '../content/schemas.ts';
import { SaveFileV1Schema } from './schemas-v1.ts';
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
export const GameStateV5Schema = GameStateV4Schema.safeExtend({
  campaign: GameStateV4Schema.shape.campaign.extend({
    openedChests: z.record(ContentIdSchema.refine(id => id.startsWith('chest.')), z.literal(true)),
  }),
  character: GameStateV4Schema.shape.character.unwrap().extend({ inventory: InventorySchema }).nullable(),
});

export const SaveFileV5Schema = SaveFileV1Schema.extend({ schemaVersion: z.literal(5), state: GameStateV5Schema });
