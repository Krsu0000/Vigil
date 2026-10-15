import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function engineValueImports(source: string): string[] {
  // 프로젝트의 import type 규약을 검사한다. 다중 줄 및 부수 효과 import도 포함한다.
  return [...source.matchAll(/^\s*import\s+(type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"]+)['"]/gm)]
    .filter(match => match[2]!.includes('/engine/') && !match[1])
    .map(match => match[2]!);
}

describe('저장 계층의 의존 방향', () => {
  it('제품 persistence에서 엔진 실행 함수를 가져오지 않는다', () => {
    const directory = new URL('../src/persistence/', import.meta.url);
    const files = readdirSync(directory, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap(file => engineValueImports(readFileSync(new URL(file, directory), 'utf8'))
      .map(target => `${fileURLToPath(new URL(file, directory))}: ${target}`))).toEqual([]);
  });
  it('타입 전용 import와 실행 함수 import를 구분한다', () => {
    expect(engineValueImports("import type { GameState } from '../engine/core/state.ts';")).toEqual([]);
    expect(engineValueImports("import { validate } from '../engine/systems/map/selectors.ts';")).toHaveLength(1);
  });
});
