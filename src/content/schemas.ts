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
export const DefinitionsSchema = z.array(DefinitionSchema);

export type ContentManifest = z.infer<typeof ManifestSchema>;
export type TimeRules = z.infer<typeof TimeRulesSchema>;
export type ContentDefinition = z.infer<typeof DefinitionSchema>;
export type ContentEffect = z.infer<typeof ContentEffectSchema>;
