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
  stamina: z.strictObject({
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
    })).min(1),
  })).min(1),
});

// 구체적인 맵 정의가 S0 공통 외피로 처리되어 검증을 우회하지 못하게 한다.
const GenericDefinitionSchema = DefinitionSchema.extend({ kind: z.undefined().optional() }).refine(
  (definition) => !/^(map|tile|zone)\./.test(definition.id),
  { message: 'map·tile·zone ID에는 해당 종류의 구체적인 정의가 필요하다', path: ['id'] },
);
export const ContentDefinitionSchema = z.discriminatedUnion('kind', [
  MapDefinitionSchema, TileDefinitionSchema, ZoneDefinitionSchema, GenericDefinitionSchema,
]);
export const DefinitionsSchema = z.array(ContentDefinitionSchema);

export type ContentManifest = z.infer<typeof ManifestSchema>;
export type TimeRules = z.infer<typeof TimeRulesSchema>;
export type ContentDefinition = z.infer<typeof ContentDefinitionSchema>;
export type ContentEffect = z.infer<typeof ContentEffectSchema>;
export type MapDefinition = z.infer<typeof MapDefinitionSchema>;
export type TileDefinition = z.infer<typeof TileDefinitionSchema>;
export type ZoneDefinition = z.infer<typeof ZoneDefinitionSchema>;
