// npm run validate:content — Node 내장 TypeScript 실행으로 돌린다 (D-016).
// 지금은 src/content/ 아래 JSON 파일의 구문만 검사한다.
// Zod 스키마 검증과 교차 참조 검증은 S0 콘텐츠 단위에서 같은 검증 코드를 호출하도록 바꾼다 (architecture 6장).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ContentFileError = { file: string; message: string };

export type ContentCheckResult = {
  checkedFiles: string[]; // rootDir 기준 상대 경로, 정렬됨
  errors: ContentFileError[];
};

export function checkContentFiles(rootDir: string): ContentCheckResult {
  // 콘텐츠 폴더가 아직 없으면 검사할 파일이 없는 것으로 본다 (콘텐츠 단위 전까지)
  if (!existsSync(rootDir)) {
    return { checkedFiles: [], errors: [] };
  }

  const checkedFiles = readdirSync(rootDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.json'))
    .sort();

  const errors: ContentFileError[] = [];
  for (const file of checkedFiles) {
    try {
      JSON.parse(readFileSync(join(rootDir, file), 'utf8'));
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return { checkedFiles, errors };
}

function main(): void {
  const contentDir = fileURLToPath(new URL('../src/content/', import.meta.url));
  const result = checkContentFiles(contentDir);

  for (const error of result.errors) {
    console.error(`오류: ${error.file}: ${error.message}`);
  }
  console.log(`콘텐츠 검증: JSON 파일 ${result.checkedFiles.length}개, 오류 ${result.errors.length}개`);

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
