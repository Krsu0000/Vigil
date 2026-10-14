export type MapPosition = Readonly<{ mapId: string; floor: number; x: number; y: number }>;
export type MapExploration = Readonly<{
  mapVersion: number;
  visited: Readonly<Record<string, true>>; // 정규 좌표 키 floor:x:y
}>;
export type CampaignState = Readonly<{
  exploration: Readonly<Record<string, MapExploration>>;
}>;
// 이전 세이브의 빈 캐릭터는 위치가 없는 상태로 유지한다.
export type StaminaState = Readonly<{ current: number; max: number }>;
export type CharacterState = Readonly<{
  position: MapPosition | null;
  stamina: StaminaState;
  movedSinceLastTick: boolean;
}>;
// 원정 시스템의 상태는 해당 단계에서 추가한다.
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
