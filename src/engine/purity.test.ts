// 엔진 순수성 검사 (CLAUDE.md 6절 4항, architecture 1.2절, INV-17).
// src/engine/ 소스에서 금지된 API와 import를 문자열로 찾는다. 주석에 같은 표기가 있어도 실패하므로
// 주석에서는 다른 표기를 쓴다. 이 파일은 검사 대상에서 뺀다.
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Rule = { name: string; pattern: RegExp; appliesTo?: (file: string) => boolean };

const RULES: Rule[] = [
  { name: 'Math.random', pattern: /\bMath\.random\b/ },
  { name: 'Date.now', pattern: /\bDate\.now\b/ },
  { name: 'new Date', pattern: /\bnew Date\b/ },
  { name: 'performance', pattern: /\bperformance\./ },
  { name: 'window', pattern: /\bwindow\./ },
  { name: 'document', pattern: /\bdocument\./ },
  { name: 'crypto', pattern: /\bcrypto\./ },
  { name: 'React import', pattern: /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/ },
  { name: 'Node 모듈 import', pattern: /from\s+['"]node:/ },
  {
    name: 'engine 밖 계층 import',
    pattern: /from\s+['"][^'"]*\/(ui|runtime|persistence|sync)\/[^'"]*['"]/,
  },
  {
    name: 'core에서 systems import',
    pattern: /from\s+['"][^'"]*\/systems\/[^'"]*['"]/,
    appliesTo: (file) => file.startsWith(`core${sep}`),
  },
];

const ENGINE_DIR = fileURLToPath(new URL('./', import.meta.url));
const SELF = fileURLToPath(import.meta.url);

function findViolations(file: string, source: string): string[] {
  return RULES.filter((rule) => (rule.appliesTo?.(file) ?? true) && rule.pattern.test(source)).map(
    (rule) => `${file}: ${rule.name}`,
  );
}

function engineSourceFiles(): string[] {
  return readdirSync(ENGINE_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => join(ENGINE_DIR, file) !== SELF)
    .sort();
}

describe('엔진 순수성', () => {
  it('src/engine/에 금지된 API와 import가 없다', () => {
    const files = engineSourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const violations = files.flatMap((file) =>
      findViolations(file, readFileSync(join(ENGINE_DIR, file), 'utf8')),
    );
    expect(violations).toEqual([]);
  });

  it('검사 규칙이 위반을 실제로 찾아낸다', () => {
    const samples: [string, string][] = [
      ['a.ts', 'const x = Math.random();'],
      ['a.ts', 'const t = Date.now();'],
      ['a.ts', 'const d = new Date();'],
      ['a.ts', 'performance.now();'],
      ['a.ts', 'window.addEventListener("x", f);'],
      ['a.ts', 'document.title = "";'],
      ['a.ts', 'crypto.randomUUID();'],
      ['a.ts', "import { useState } from 'react';"],
      ['a.ts', "import { createRoot } from 'react-dom/client';"],
      ['a.ts', "import { readFileSync } from 'node:fs';"],
      ['systems/map/a.ts', "import { GameStore } from '../../../runtime/store.ts';"],
      [`core${sep}a.ts`, "import { step } from '../systems/map/step.ts';"],
    ];
    for (const [file, source] of samples) {
      expect(findViolations(file, source), source).toHaveLength(1);
    }
    expect(findViolations(`systems${sep}a.ts`, "import { createRng } from '../core/rng.ts';")).toEqual([]);
  });
});
