import type { ContentDb } from '../content/types.ts';
import { validateMapState } from '../engine/systems/map/selectors.ts';
import { validateActivityState } from '../engine/systems/rest/actions.ts';
import { CURRENT_SCHEMA_VERSION, SAVE_FORMAT } from './format.ts';
import { parseSave } from './save-file.ts';
import type { SaveFile } from './save-file.ts';
import type { SaveSlots } from './browser-repository.ts';

export type LoadedSave = Readonly<{ save: SaveFile | null; source: 'primary' | 'backup' | 'empty'; previousValid: string | null; generation: number }>;

export function loadSaveSlots(slots: SaveSlots, content: ContentDb): LoadedSave {
  if (slots.primary === null && slots.backup === null) return { save: null, source: 'empty', previousValid: null, generation: slots.generation };
  for (const source of ['primary', 'backup'] as const) {
    const raw = slots[source];
    if (raw === null) continue;
    let decoded: unknown;
    try { decoded = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { continue; }
    // 오래된 클라이언트가 미래 버전의 세이브를 백업으로 되돌려 덮어쓰지 않는다.
    if (decoded !== null && typeof decoded === 'object' && 'format' in decoded && decoded.format === SAVE_FORMAT &&
      'schemaVersion' in decoded && typeof decoded.schemaVersion === 'number' && Number.isSafeInteger(decoded.schemaVersion) && decoded.schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error('미래 버전의 세이브는 이 버전에서 복원하거나 덮어쓸 수 없다');
    }
    try {
      const save = parseSave(decoded);
      validateMapState(save.state, content);
      validateActivityState(save.state, content);
      // 이전 객체 형식도 JSON으로 보존한다. 현재 포맷으로 검증/변환은 이미 완료했다.
      const previousValid = typeof raw === 'string' ? raw : JSON.stringify(save);
      return { save, source, previousValid, generation: slots.generation };
    } catch { /* 기본 슬롯의 구조/콘텐츠 오류는 백업 후보까지 확인한다. */ }
  }
  throw new Error('기본 세이브와 백업을 모두 불러올 수 없다. 기존 저장 데이터는 보존한다.');
}
