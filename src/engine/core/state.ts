// 시스템별 상태 필드는 그 시스템을 도입할 때 추가한다 (architecture 2.2절).
// 빈 상태에 임의의 필드나 JSON으로 저장할 수 없는 값을 넣지 못하게 한다.
export type CampaignState = Readonly<Record<string, never>>;
export type CharacterState = Readonly<Record<string, never>>;
export type ExpeditionState = Readonly<Record<string, never>>;

export type StateMeta = Readonly<{
  campaignId: string;
  gameTime: number;
  rngState: readonly number[];
  lastActiveAt: number;
  settledUntil: number;
}>;

export type GameState = Readonly<{
  meta: StateMeta;
  campaign: CampaignState;
  character: CharacterState | null;
  expedition: ExpeditionState | null;
}>;
