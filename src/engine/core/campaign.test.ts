import { describe, expect, it } from 'vitest';
import { createCampaign } from './campaign.ts';
import { createUuid } from './id.ts';
import { createRng, seedRngState } from './rng.ts';
import { content, ctx, deepFreeze, seed } from './test-fixtures.ts';

describe('새 캠페인', () => {
  it('상태 영역과 정산 시각을 초기화한다', () => {
    const state = createCampaign(content, seed, ctx.now);
    expect(state.campaign).toEqual({});
    expect(state.character).toBeNull();
    expect(state.expedition).toBeNull();
    expect(state.meta.gameTime).toBe(0);
    expect(state.meta.lastActiveAt).toBe(ctx.now);
    expect(state.meta.settledUntil).toBe(ctx.now);
    expect(state.meta.campaignId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('같은 입력이면 같은 캠페인이 생성된다', () => {
    expect(createCampaign(content, seed, ctx.now)).toEqual(createCampaign(content, seed, ctx.now));
  });

  it('ID 생성 후의 난수 상태를 저장해 이후 수열을 이어 간다', () => {
    const expected = createRng(seedRngState(seed));
    const beforeId = expected.getState();
    const expectedId = createUuid(expected);
    const state = createCampaign(content, seed, ctx.now);
    expect(state.meta.campaignId).toBe(expectedId);
    expect(state.meta.rngState).toEqual(expected.getState());
    expect(state.meta.rngState).not.toEqual(beforeId);
    const actual = createRng(state.meta.rngState);
    expect(Array.from({ length: 8 }, () => actual.nextUint32()))
      .toEqual(Array.from({ length: 8 }, () => expected.nextUint32()));
  });

  it('입력 시드와 콘텐츠를 수정하지 않고 호출마다 독립된 객체를 만든다', () => {
    const inputSeed = deepFreeze([...seed]);
    const inputContent = deepFreeze({ ...content });
    const a = createCampaign(inputContent, inputSeed, ctx.now);
    const b = createCampaign(inputContent, inputSeed, ctx.now);
    expect(inputSeed).toEqual(seed);
    expect(inputContent).toEqual(content);
    expect(a).not.toBe(b);
    expect(a.meta).not.toBe(b.meta);
    expect(a.meta.rngState).not.toBe(b.meta.rngState);
    expect(a.campaign).not.toBe(b.campaign);
  });

  it('시각 0도 올바른 초기화 입력이다', () => {
    expect(createCampaign(content, seed, 0).meta.settledUntil).toBe(0);
  });

  it('잘못된 시각은 거부한다', () => {
    for (const now of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createCampaign(content, seed, now)).toThrow('now');
    }
  });

  it('잘못된 시드는 기존 난수 검증을 통해 거부한다', () => {
    for (const invalid of [[], [1, 2, 3], [1, 2, 3, -1], [1, 2, 3, 2 ** 32]]) {
      expect(() => createCampaign(content, invalid, ctx.now)).toThrow('시드');
    }
  });
});
