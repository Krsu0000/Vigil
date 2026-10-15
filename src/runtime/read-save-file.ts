import type { ContentDb } from '../content/types.ts';
import { validateStateContent } from './validate-state.ts';
import { deserializeSave } from '../persistence/save-file.ts';
import type { SaveFile } from '../persistence/save-file.ts';

// 파일 전체를 읽기 전의 크기 제한. 게임의 저장 형식이나 맵 용량 계약과 구분한다.
export const MAX_SAVE_FILE_BYTES = 10 * 1024 * 1024;

export async function readSaveFile(file: Pick<File, 'size' | 'text'>, content: ContentDb): Promise<SaveFile> {
  if (file.size <= 0 || file.size > MAX_SAVE_FILE_BYTES) throw new Error('세이브 파일 크기 오류');
  const json = await file.text();
  if (new TextEncoder().encode(json).byteLength > MAX_SAVE_FILE_BYTES) throw new Error('세이브 파일 크기 오류');
  const save = deserializeSave(json.replace(/^\uFEFF/, ''));
  validateStateContent(save.state, content);
  return save;
}
