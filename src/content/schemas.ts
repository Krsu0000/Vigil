import { z } from 'zod';

export const ContentIdSchema = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
const JsonPathSchema = z.string().regex(/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.json$/);
const nonnegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const ManifestSchema = z.strictObject({
  contentVersion: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  timeRulesFile: JsonPathSchema,
  definitionFiles: z.array(JsonPathSchema),
});

export const TimeRulesSchema = z.strictObject({
  id: ContentIdSchema.refine((id) => id.startsWith('rules.'), '시간 규칙 ID는 rules.로 시작해야 한다'),
  tickMs: positiveInteger,
  minimumMoveIntervalMs: positiveInteger,
  maxOfflineMs: positiveInteger,
  heartbeatIntervalMs: positiveInteger,
  heartbeatGraceMs: positiveInteger,
  ambush: z.strictObject({
    waitChancePerTick: z.number().min(0).max(1),
    restChancePerTick: z.number().min(0).max(1),
  }).refine((rules) => rules.restChancePerTick >= rules.waitChancePerTick, {
    message: '휴식 습격 확률은 대기 확률 이상이어야 한다', path: ['restChancePerTick'],
  }),
  stamina: z.strictObject({
    recoveryIntervalMs: positiveInteger,
    max: positiveInteger,
    safeRegenPerTick: nonnegativeInteger,
    waitRegenPerTick: nonnegativeInteger,
    restRegenPerTick: nonnegativeInteger,
    unexploredMoveCost: nonnegativeInteger,
    exploredMoveCost: nonnegativeInteger,
    safeMoveCost: nonnegativeInteger,
  }),
}).refine((rules) => rules.heartbeatGraceMs >= rules.heartbeatIntervalMs, {
  message: '하트비트 유예 시간은 간격 이상이어야 한다',
  path: ['heartbeatGraceMs'],
});

export const ContentEffectSchema = z.strictObject({
  type: z.string().min(1),
  params: z.json().transform((params): unknown => structuredClone(params)),
}).refine((effect) => Object.hasOwn(effect, 'params'), { message: 'params가 필요하다', path: ['params'] });

// S0 참조 검증용 공통 메타데이터. 개별 게임 정의 스키마는 각 시스템 도입 시 추가한다.
export const DefinitionSchema = z.strictObject({
  id: ContentIdSchema,
  references: z.array(ContentIdSchema).default([]),
  dependsOn: z.array(ContentIdSchema).default([]),
  effects: z.array(ContentEffectSchema).default([]),
});

const namedId = (kind: string) => ContentIdSchema.refine(
  (id) => id.startsWith(`${kind}.`), `${kind} 정의의 ID는 ${kind}.로 시작해야 한다`,
);
const text = z.string().refine((value) => value.trim().length > 0, '빈 문구는 사용할 수 없다');
const floorNumber = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const TileDefinitionSchema = DefinitionSchema.extend({
  kind: z.literal('tile'),
  id: namedId('tile'),
  name: text,
  glyph: text,
  walkable: z.boolean(),
  blocksSight: z.boolean(),
});

export const ZoneDefinitionSchema = DefinitionSchema.extend({
  kind: z.literal('zone'),
  id: namedId('zone'),
  name: text,
  description: text,
  safety: z.enum(['safe', 'danger']),
});

export const MapDefinitionSchema = DefinitionSchema.extend({
  kind: z.literal('map'),
  id: namedId('map'),
  name: text,
  description: text,
  version: positiveInteger,
  start: z.strictObject({ floor: floorNumber, x: nonnegativeInteger, y: nonnegativeInteger }),
  floors: z.array(z.strictObject({
    floor: floorNumber,
    width: positiveInteger,
    height: positiveInteger,
    cells: z.array(z.strictObject({
      x: nonnegativeInteger,
      y: nonnegativeInteger,
      tileId: namedId('tile'),
      zoneId: namedId('zone'),
      chestId: namedId('chest').optional(),
    })).min(1),
  })).min(1),
});

// 구체적인 맵 정의가 S0 공통 외피로 처리되어 검증을 우회하지 못하게 한다.
export const ItemDefinitionSchema = DefinitionSchema.extend({
  kind: z.literal('item'), id: namedId('item'), name: text, description: text,
  tags: z.array(text).min(1), weightGrams: nonnegativeInteger,
  category: z.enum(['food', 'equipment']),
  slot: z.literal('feet').optional(),
  modifiers: z.array(z.strictObject({
    target: z.literal('move_cost'), op: z.enum(['add', 'mul']),
    value: z.number().finite(),
  })).default([]),
}).refine(item => item.category === 'food'
  ? item.effects.length > 0 && item.slot === undefined && item.modifiers.length === 0
  : item.slot !== undefined && item.effects.length === 0 && item.modifiers.length > 0,
  { message: '음식에는 사용 효과, 장비에는 슬롯과 수정치가 필요하다' });

export const ChestDefinitionSchema = DefinitionSchema.extend({
  kind: z.literal('chest'), id: namedId('chest'), name: text, glyph: text,
  loot: z.array(z.strictObject({ itemId: namedId('item'), quantity: positiveInteger })).min(1),
}).refine(chest => chest.effects.length === 0, { message: '상자는 loot로만 아이템을 지급한다' });

const GenericDefinitionSchema = DefinitionSchema.extend({ kind: z.undefined().optional() }).refine(
  (definition) => !/^(map|tile|zone|item|chest)\./.test(definition.id),
  { message: 'map·tile·zone·item·chest ID에는 해당 종류의 구체적인 정의가 필요하다', path: ['id'] },
);
export const ContentDefinitionSchema = z.discriminatedUnion('kind', [
  MapDefinitionSchema, TileDefinitionSchema, ZoneDefinitionSchema, ItemDefinitionSchema, ChestDefinitionSchema, GenericDefinitionSchema,
]);
export const DefinitionsSchema = z.array(ContentDefinitionSchema);

export type ContentManifest = z.infer<typeof ManifestSchema>;
export type TimeRules = z.infer<typeof TimeRulesSchema>;
export type ContentDefinition = z.infer<typeof ContentDefinitionSchema>;
export type ContentEffect = z.infer<typeof ContentEffectSchema>;
export type MapDefinition = z.infer<typeof MapDefinitionSchema>;
export type TileDefinition = z.infer<typeof TileDefinitionSchema>;
export type ZoneDefinition = z.infer<typeof ZoneDefinitionSchema>;
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;
export type ChestDefinition = z.infer<typeof ChestDefinitionSchema>;
