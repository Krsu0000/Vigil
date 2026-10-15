import type { ContentDb } from '../../content/types.ts';
import { createUuid } from './id.ts';
import { createRng, seedRngState } from './rng.ts';
import type { GameState } from './state.ts';

// 최초 위치 배치는 map/start 행동으로 한다. 콘텐츠를 상태에 복사하지 않는다.
export function createCampaign(_content: ContentDb, seed: readonly number[], now: number): GameState {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error(`createCampaign: now는 0 이상의 안전한 정수여야 한다 (${now})`);
  }
  const rng = createRng(seedRngState(seed));
  const campaignId = createUuid(rng);
  return {
    meta: {
      campaignId,
      gameTime: 0,
      rngState: rng.getState(),
      lastActiveAt: now,
      settledUntil: now,
    },
    campaign: { exploration: {}, openedChests: {} },
    character: null,
    expedition: null,
  };
}
