import type { ContentDb } from '../../content/types.ts';
import { createUuid } from './id.ts';
import { createRng, seedRngState } from './rng.ts';
import type { GameState } from './state.ts';

// 초기 캐릭터와 시작 위치는 각 시스템 도입 시 추가한다.
// S0에서는 content를 상태에 복사하지 않고, 이후 초기화에 쓸 인수로 받는다.
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
    campaign: {},
    character: null,
    expedition: null,
  };
}
