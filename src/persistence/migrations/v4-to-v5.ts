import { SaveFileV4Schema } from '../schemas-v4.ts';

export function v4ToV5(raw: unknown) {
  const save = SaveFileV4Schema.parse(raw);
  return { ...save, schemaVersion: 5, state: { ...save.state,
    campaign: { ...save.state.campaign, openedChests: {} },
    character: save.state.character === null ? null : { ...save.state.character,
      inventory: { stacks: {}, equipment: { feet: null } },
    },
  } };
}
