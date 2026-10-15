import { SaveFileV6Schema } from '../schemas-v6.ts';

// 기존 상태/전투를 보존한다. 기록과 직업 자원은 없는 동안 빈 상태로 해석한다.
export function v6ToV7(raw: unknown) {
  const save = SaveFileV6Schema.parse(raw);
  return { ...save, schemaVersion: 7 };
}
