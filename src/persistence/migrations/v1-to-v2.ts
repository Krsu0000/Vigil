import { SaveFileV1Schema } from '../schemas-v1.ts';

export function v1ToV2(raw: Readonly<Record<string, unknown>>): unknown {
  // 이전 형식 전체를 먼저 검증해 손상된 필드를 변환 중 삭제하지 않는다.
  const save = SaveFileV1Schema.parse(raw);
  return {
    ...save,
    schemaVersion: 2,
    state: {
      ...save.state,
      campaign: { exploration: {} },
      character: save.state.character === null ? null : { position: null },
    },
  };
}
