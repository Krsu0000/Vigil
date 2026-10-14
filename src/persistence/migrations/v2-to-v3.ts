import { SaveFileV2Schema } from '../schemas-v2.ts';

// v2 당시의 승인된 최대치다. 변환은 현재 콘텐츠나 시계를 읽지 않는다.
const LEGACY_STAMINA_MAX = 900;

export function v2ToV3(raw: Readonly<Record<string, unknown>>): unknown {
  const save = SaveFileV2Schema.parse(raw);
  return { ...save, schemaVersion: 3, state: {
    ...save.state,
    character: save.state.character === null ? null : {
      ...save.state.character,
      stamina: { current: LEGACY_STAMINA_MAX, max: LEGACY_STAMINA_MAX },
      movedSinceLastTick: false,
    },
  } };
}
