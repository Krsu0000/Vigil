import { describe, expect, it, vi } from 'vitest';
import v1 from '../persistence/fixtures/v1-empty.json' with { type: 'json' };
import v2 from '../persistence/fixtures/v2-explored.json' with { type: 'json' };
import v3 from '../persistence/fixtures/v3-explored.json' with { type: 'json' };
import { mapContext, startedState } from '../engine/systems/map/test-fixtures.ts';
import { createSaveFile, serializeSave } from '../persistence/save-file.ts';
import { MAX_SAVE_FILE_BYTES, readSaveFile } from './read-save-file.ts';

const ctx = mapContext();
const save = createSaveFile(startedState(ctx), { saveId: startedState(ctx).meta.campaignId, revision: 3, savedAt: ctx.now, contentVersion: ctx.content.contentVersion });
const file = (json: string) => ({ size: new TextEncoder().encode(json).byteLength, text: async () => json });

describe('가져올 파일 검증', () => {
  it('v4 JSON 파일을 상태·시각·난수 변경 없이 읽고 UTF-8 BOM도 허용한다', async () => {
    expect(await readSaveFile(file(serializeSave(save)), ctx.content)).toEqual(save);
    expect(await readSaveFile(file('\uFEFF' + serializeSave(save)), ctx.content)).toEqual(save);
  });
  it.each([v1, v2, v3])('이전 v$schemaVersion을 기존 변환으로 읽고 위치를 자동 배치하지 않는다', async raw => {
    const result = await readSaveFile(file(JSON.stringify(raw)), ctx.content);
    expect(result.schemaVersion).toBe(4); expect(result.state.meta).toEqual(raw.state.meta);
    expect(result.saveId).toBe(raw.saveId); expect(result.savedAt).toBe(raw.savedAt);
    if (raw.schemaVersion === 1) expect(result.state.character).toBeNull();
    else expect(result.state.character!.position).toEqual((raw.state.character as { position: unknown }).position);
  });
  it.each(['{', 'null', '{}', JSON.stringify({ ...save, format: 'other' }), JSON.stringify({ ...save, schemaVersion: 100 }), JSON.stringify({ ...save, extra: true })])('잘못된 파일 %s는 거부한다', async json => {
    await expect(readSaveFile(file(json), ctx.content)).rejects.toThrow();
  });
  it('실제 맵 버전과 맞지 않거나 안전 구역에서 휴식 중이면 거부한다', async () => {
    const badMap = JSON.parse(serializeSave(save)); badMap.state.campaign.exploration['map.s1_test']!.mapVersion = 999;
    await expect(readSaveFile(file(JSON.stringify(badMap)), ctx.content)).rejects.toThrow();
    const badActivity = JSON.parse(serializeSave(save));
    badActivity.state.character!.activity = 'resting'; badActivity.state.character!.stamina.current = 800;
    await expect(readSaveFile(file(JSON.stringify(badActivity)), ctx.content)).rejects.toThrow();
  });
  it('빈 파일과 10MiB 초과 파일은 내용을 읽기 전에 거부한다', async () => {
    const text = vi.fn(async () => serializeSave(save));
    for (const size of [0, MAX_SAVE_FILE_BYTES + 1]) await expect(readSaveFile({ size, text }, ctx.content)).rejects.toThrow();
    expect(text).not.toHaveBeenCalled();
  });
  it('읽기 실패와 실제 UTF-8 크기 초과를 거부한다', async () => {
    await expect(readSaveFile({ size: 10, text: async () => { throw new Error('읽기 실패'); } }, ctx.content)).rejects.toThrow();
    await expect(readSaveFile({ size: 10, text: async () => '가'.repeat(MAX_SAVE_FILE_BYTES / 3 + 1) }, ctx.content)).rejects.toThrow();
  });
});
