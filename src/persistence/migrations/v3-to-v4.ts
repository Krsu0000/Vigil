import { SaveFileV3Schema } from '../schemas-v3.ts';

// 현재 콘텐츠·시계를 읽거나 게임 진행을 적용하지 않는다.
export function v3ToV4(raw: Readonly<Record<string, unknown>>): unknown {
  const save = SaveFileV3Schema.parse(raw);
  return { ...save, schemaVersion: 4, state: {
    ...save.state,
    character: save.state.character === null ? null : { ...save.state.character, activity: 'waiting' },
    expedition: save.state.expedition === null ? null : { pendingAmbush: null },
  } };
}
