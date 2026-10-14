import type { ContentDb } from '../../content/types.ts';

export type EngineContext = Readonly<{
  content: ContentDb;
  now: number; // 행동 시점의 현실 시각(epoch ms). 호출자가 주입한다.
}>;
