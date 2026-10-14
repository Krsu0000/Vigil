import { DefinitionsSchema, ManifestSchema, TimeRulesSchema } from './schemas.ts';
import type { ContentDefinition } from './schemas.ts';
import type { ContentDb, ContentEntry, ContentError, ContentLoadResult, EffectValidator } from './types.ts';

export type ContentSources = Readonly<Record<string, unknown>>;
type LocatedDefinition = { file: string; index: number; definition: ContentDefinition };

function freezeData(value: object): void {
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') stack.push(child);
    }
    Object.freeze(current);
  }
}

function addSchemaErrors(errors: ContentError[], file: string, issues: readonly {
  path: readonly PropertyKey[]; message: string;
}[]): void {
  for (const issue of issues) {
    errors.push({ file, path: issue.path.map(String).join('.'), code: 'invalid_schema', message: issue.message });
  }
}

// 깊은 의존 관계도 호출 스택을 늘리지 않고 검사한다. 일반 참조의 순환은 허용하고 dependsOn만 검사한다.
function dependencyCycle(definitions: readonly LocatedDefinition[]): string[] | null {
  const byId = new Map(definitions.map((entry) => [entry.definition.id, entry.definition]));
  const visited = new Set<string>();
  for (const entry of definitions) {
    if (visited.has(entry.definition.id)) continue;
    const stack = [{ id: entry.definition.id, next: 0 }];
    const active = new Map([[entry.definition.id, 0]]);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const dependencies = byId.get(frame.id)?.dependsOn ?? [];
      if (frame.next >= dependencies.length) {
        visited.add(frame.id);
        active.delete(frame.id);
        stack.pop();
        continue;
      }
      const dependency = dependencies[frame.next++]!;
      const start = active.get(dependency);
      if (start !== undefined) return [...stack.slice(start).map((part) => part.id), dependency];
      if (!visited.has(dependency)) {
        active.set(dependency, stack.length);
        stack.push({ id: dependency, next: 0 });
      }
    }
  }
  return null;
}

export function loadContent(sources: ContentSources, validateEffect: EffectValidator): ContentLoadResult {
  const errors: ContentError[] = [];
  if (!Object.hasOwn(sources, 'manifest.json')) {
    return { ok: false, errors: [{ file: 'manifest.json', path: '', code: 'missing_file', message: '필수 매니페스트가 없다' }] };
  }
  const manifestResult = ManifestSchema.safeParse(sources['manifest.json']);
  if (!manifestResult.success) {
    addSchemaErrors(errors, 'manifest.json', manifestResult.error.issues);
    return { ok: false, errors };
  }
  const manifest = manifestResult.data;
  const expectedFiles = ['manifest.json', manifest.timeRulesFile, ...manifest.definitionFiles];
  const expected = new Set<string>();
  for (const file of expectedFiles) {
    if (expected.has(file)) errors.push({ file: 'manifest.json', path: '', code: 'duplicate_file', message: `중복 파일: ${file}` });
    expected.add(file);
    if (!Object.hasOwn(sources, file)) errors.push({ file, path: '', code: 'missing_file', message: '매니페스트가 참조하는 파일이 없다' });
  }
  for (const file of Object.keys(sources).sort()) {
    if (!expected.has(file)) errors.push({ file, path: '', code: 'unlisted_file', message: '매니페스트에 등록되지 않은 파일' });
  }
  if (errors.length > 0) return { ok: false, errors };

  const timeResult = TimeRulesSchema.safeParse(sources[manifest.timeRulesFile]);
  if (!timeResult.success) addSchemaErrors(errors, manifest.timeRulesFile, timeResult.error.issues);
  const located: LocatedDefinition[] = [];
  for (const file of manifest.definitionFiles) {
    const result = DefinitionsSchema.safeParse(sources[file]);
    if (!result.success) addSchemaErrors(errors, file, result.error.issues);
    else result.data.forEach((definition, index) => located.push({ file, index, definition }));
  }
  if (!timeResult.success || errors.length > 0) return { ok: false, errors };

  const entries: [string, ContentEntry][] = [[timeResult.data.id, timeResult.data]];
  const ids = new Set([timeResult.data.id]);
  for (const { file, index, definition } of located) {
    if (ids.has(definition.id)) {
      errors.push({ file, path: `${index}.id`, code: 'duplicate_id', message: `중복 ID: ${definition.id}` });
    } else {
      ids.add(definition.id);
      entries.push([definition.id, definition]);
    }
  }
  for (const { file, index, definition } of located) {
    for (const field of ['references', 'dependsOn'] as const) {
      definition[field].forEach((id, position) => {
        if (!ids.has(id)) errors.push({ file, path: `${index}.${field}.${position}`, code: 'missing_reference', message: `존재하지 않는 참조: ${id}` });
      });
    }
    definition.effects.forEach((effect, position) => {
      const result = validateEffect(effect);
      if (!result.ok) errors.push({ file, path: `${index}.effects.${position}`, code: result.reason, message: result.message });
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  const cycle = dependencyCycle(located);
  if (cycle !== null) {
    const first = located.find((entry) => entry.definition.id === cycle[0])!;
    return { ok: false, errors: [{ file: first.file, path: `${first.index}.dependsOn`, code: 'dependency_cycle', message: `순환 의존: ${cycle.join(' → ')}` }] };
  }

  // Zod가 만든 새 객체만 고정하고 호출자의 입력은 수정하지 않는다.
  freezeData(timeResult.data);
  for (const { definition } of located) {
    freezeData(definition);
  }
  const byId = Object.fromEntries(entries);
  Object.setPrototypeOf(byId, null);
  const content: ContentDb = Object.freeze({
    contentVersion: manifest.contentVersion,
    timeRules: timeResult.data,
    definitions: Object.freeze(located.map((entry) => entry.definition)),
    byId: Object.freeze(byId),
  });
  return { ok: true, content };
}
