import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testSources } from '../src/content/test-fixtures.ts';
import { createEffectRegistry, defineEffect } from '../src/engine/core/effects.ts';
import { z } from 'zod';
import { checkContentFiles } from './validate-content.ts';

describe('checkContentFiles와 실제 CLI', () => {
  let rootDir: string;
  beforeEach(() => { rootDir = mkdtempSync(join(tmpdir(), 'vigil-content-')); });
  afterEach(() => { rmSync(rootDir, { recursive: true, force: true }); });

  function writePack(sources: ReturnType<typeof testSources>): void {
    for (const [file, data] of Object.entries(sources)) {
      const path = join(rootDir, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, JSON.stringify(data));
    }
  }

  it('폴더가 없으면 오류로 보고한다', () => {
    const result = checkContentFiles(join(rootDir, 'missing'));
    expect(result.checkedFiles).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('read_error');
    expect(result.content).toBeUndefined();
  });

  it('빈 폴더는 필수 매니페스트 누락으로 실패한다', () => {
    expect(checkContentFiles(rootDir).errors[0]).toMatchObject({ file: 'manifest.json', code: 'missing_file' });
  });

  it('하위 폴더 JSON을 검사하고 코드 파일은 읽지 않는다', () => {
    const sources = testSources();
    sources['manifest.json'].definitionFiles.push('maps/test.json');
    sources['maps/test.json'] = [{ id: 'map.test', references: ['rules.time'] }];
    writePack(sources);
    writeFileSync(join(rootDir, 'schema.ts'), 'export {};');
    const result = checkContentFiles(rootDir);
    expect(result.checkedFiles).toEqual(['manifest.json', join('maps', 'test.json'), 'time-rules.json']);
    expect(result.errors).toEqual([]);
    expect(result.content?.byId['map.test']).toMatchObject({ id: 'map.test' });
  });

  it('구문 오류를 파일별로 보고하고 DB를 반환하지 않는다', () => {
    writePack(testSources());
    writeFileSync(join(rootDir, 'broken.json'), '{"items": [');
    const result = checkContentFiles(rootDir);
    expect(result.checkedFiles).toContain('broken.json');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ file: 'broken.json', code: 'invalid_json' });
    expect(result.content).toBeUndefined();
  });

  it('문법이 올바른 JSON의 스키마·참조 오류도 실패로 보고한다', () => {
    const sources = testSources([{ id: 'item.test', references: ['item.missing'] }]);
    writePack(sources);
    expect(checkContentFiles(rootDir).errors[0]).toMatchObject({ code: 'missing_reference', path: '0.references.0' });
    sources['time-rules.json'].stamina.max = -1;
    writePack(sources);
    expect(checkContentFiles(rootDir).errors[0]).toMatchObject({ code: 'invalid_schema', file: 'time-rules.json' });
  });

  it('기본 효과 목록에서 미등록 효과를 차단한다', () => {
    writePack(testSources([{ id: 'item.test', effects: [{ type: 'test/emit', params: {} }] }]));
    expect(checkContentFiles(rootDir).errors[0]).toMatchObject({ code: 'unknown_effect', path: '0.effects.0' });
  });

  it('주입된 실제 레지스트리로 같은 매개변수 검증을 수행한다', () => {
    const registry = createEffectRegistry({
      'test/checked': defineEffect({ params: z.strictObject({ amount: z.number().int() }), apply: (state) => ({ state, events: [] }) }),
    });
    writePack(testSources([{ id: 'item.test', effects: [{ type: 'test/checked', params: { amount: 2 } }] }]));
    expect(checkContentFiles(rootDir, registry.validate).errors).toEqual([]);
    writePack(testSources([{ id: 'item.test', effects: [{ type: 'test/checked', params: { amount: '2' } }] }]));
    expect(checkContentFiles(rootDir, registry.validate).errors[0]?.code).toBe('invalid_effect_params');
  });

  it('실제 CLI는 정상 팩에서 0, 잘못된 참조에서 1로 종료한다', () => {
    const script = fileURLToPath(new URL('./validate-content.ts', import.meta.url));
    writePack(testSources());
    const good = spawnSync(process.execPath, [script, rootDir], { encoding: 'utf8' });
    expect(good.status).toBe(0);
    expect(good.stdout).toContain('JSON 파일 2개, 오류 0개');
    writePack(testSources([{ id: 'item.test', references: ['item.missing'] }]));
    const bad = spawnSync(process.execPath, [script, rootDir], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('missing_reference');
    expect(bad.stderr).toContain('definitions.json');
  });
});
