import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadContent } from '../content/load.ts';
import { testSources } from '../content/test-fixtures.ts';
import { createEffectRegistry, defineEffect } from '../engine/core/effects.ts';
import { loadGameContent } from './content.ts';

describe('실행 환경의 콘텐츠 연결', () => {
  it('Vite가 모은 실제 JSON을 제품 효과 목록으로 검증한다', () => {
    const result = loadGameContent();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('실제 데이터 검증 실패');
    expect(result.content.contentVersion).toBe('0.1.0');
    expect(result.content.timeRules.id).toBe('rules.time');
  });

  it('제품에 등록되지 않은 효과를 콘텐츠 로딩 단계에서 차단한다 (INV-16)', () => {
    const sources = testSources([{ id: 'item.test', effects: [{ type: 'test/emit', params: {} }] }]);
    const result = loadGameContent(sources);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('미등록 효과가 통과함');
    expect(result.errors[0]).toMatchObject({ file: 'definitions.json', code: 'unknown_effect' });
  });

  it('실제 레지스트리와 같은 경로로 등록된 효과의 매개변수를 검증한다 (INV-16)', () => {
    const apply = vi.fn(() => { throw new Error('로딩 중 효과를 실행하면 안 됨'); });
    const effects = createEffectRegistry({
      'test/checked': defineEffect({ params: z.strictObject({ amount: z.number().int().min(1) }), apply }),
    });
    const valid = testSources([{ id: 'item.test', effects: [{ type: 'test/checked', params: { amount: 1 } }] }]);
    expect(loadContent(valid, effects.validate).ok).toBe(true);
    const invalid = testSources([{ id: 'item.test', effects: [{ type: 'test/checked', params: { amount: '1' } }] }]);
    const result = loadContent(invalid, effects.validate);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('잘못된 매개변수가 통과함');
    expect(result.errors[0]).toMatchObject({ file: 'definitions.json', path: '0.effects.0', code: 'invalid_effect_params' });
    expect(apply).not.toHaveBeenCalled();
  });
});
