// npm run validate:content — Node 내장 TypeScript 실행으로 돌린다 (D-016).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../src/content/load.ts';
import type { ContentDb, ContentError, EffectValidator } from '../src/content/types.ts';
import { effectRegistry } from '../src/engine/core/effects.ts';

export type ContentCheckResult = {
  checkedFiles: string[];
  errors: ContentError[];
  content?: ContentDb;
};

export function checkContentFiles(
  rootDir: string,
  validateEffect: EffectValidator = effectRegistry.validate,
): ContentCheckResult {
  let checkedFiles: string[];
  try {
    checkedFiles = readdirSync(rootDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.json'))
      .sort();
  } catch (error) {
    return {
      checkedFiles: [],
      errors: [{ file: 'manifest.json', path: '', code: 'read_error', message: error instanceof Error ? error.message : String(error) }],
    };
  }

  const errors: ContentError[] = [];
  const sources: Record<string, unknown> = {};
  for (const relativePath of checkedFiles) {
    const file = relativePath.replaceAll('\\', '/');
    try {
      sources[file] = JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'));
    } catch (error) {
      errors.push({ file, path: '', code: 'invalid_json', message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (errors.length > 0) return { checkedFiles, errors };
  const loaded = loadContent(sources, validateEffect);
  return loaded.ok
    ? { checkedFiles, errors: [], content: loaded.content }
    : { checkedFiles, errors: loaded.errors };
}

function main(): void {
  const contentDir = process.argv[2] ?? fileURLToPath(new URL('../src/content/', import.meta.url));
  const result = checkContentFiles(contentDir);
  for (const error of result.errors) {
    console.error(`오류: ${error.file}${error.path ? ` (${error.path})` : ''}: [${error.code}] ${error.message}`);
  }
  console.log(`콘텐츠 검증: JSON 파일 ${result.checkedFiles.length}개, 오류 ${result.errors.length}개`);
  if (result.errors.length > 0) process.exitCode = 1;
}

if (import.meta.main) main();
