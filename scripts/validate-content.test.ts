import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkContentFiles } from './validate-content.ts';

describe('checkContentFiles', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'vigil-content-'));
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  it('폴더가 없으면 검사한 파일과 오류가 없다', () => {
    const result = checkContentFiles(join(rootDir, 'missing'));
    expect(result).toEqual({ checkedFiles: [], errors: [] });
  });

  it('하위 폴더를 포함해 JSON 파일만 검사한다', () => {
    mkdirSync(join(rootDir, 'maps'));
    writeFileSync(join(rootDir, 'items.json'), '{"items": []}');
    writeFileSync(join(rootDir, 'maps', 'test.json'), '[]');
    writeFileSync(join(rootDir, 'schema.ts'), 'export {};');

    const result = checkContentFiles(rootDir);

    expect(result.checkedFiles).toEqual(['items.json', join('maps', 'test.json')]);
    expect(result.errors).toEqual([]);
  });

  it('구문이 깨진 JSON은 파일 경로와 함께 오류로 보고한다', () => {
    writeFileSync(join(rootDir, 'good.json'), '{}');
    writeFileSync(join(rootDir, 'broken.json'), '{"items": [');

    const result = checkContentFiles(rootDir);

    expect(result.checkedFiles).toEqual(['broken.json', 'good.json']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe('broken.json');
  });
});
