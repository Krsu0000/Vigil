import { SaveFileV5Schema } from '../schemas-v5.ts';
export function v5ToV6(raw: unknown) {
  const save = SaveFileV5Schema.parse(raw);
  return { ...save, schemaVersion: 6, state: { ...save.state,
    character: save.state.character === null ? null : { ...save.state.character, health: { current: 100, max: 100 } },
  } };
}
