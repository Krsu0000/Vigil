import type { ContentDefinition, TimeRules } from './schemas.ts';

export type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;
export type ContentEntry = DeepReadonly<TimeRules> | DeepReadonly<ContentDefinition>;

export type ContentDb = Readonly<{
  contentVersion: string;
  startMapId?: string;
  timeRules: DeepReadonly<TimeRules>;
  definitions: readonly DeepReadonly<ContentDefinition>[];
  byId: Readonly<Record<string, ContentEntry>>;
}>;

export type ContentError = Readonly<{
  file: string;
  path: string;
  code: string;
  message: string;
}>;

export type EffectValidator = (effect: Readonly<{ type: string; params: unknown }>) =>
  | { ok: true }
  | { ok: false; reason: string; message: string };

export type ContentLoadResult =
  | { ok: true; content: ContentDb }
  | { ok: false; errors: ContentError[] };
