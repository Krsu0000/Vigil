export type MapPosition = Readonly<{ mapId: string; floor: number; x: number; y: number }>;
export type MapExploration = Readonly<{
  mapVersion: number;
  visited: Readonly<Record<string, true>>; // 정규 좌표 키 floor:x:y
}>;
export type CampaignState = Readonly<{
  exploration: Readonly<Record<string, MapExploration>>;
  openedChests: Readonly<Record<string, true>>;
}>;
export type InventoryState = Readonly<{
  stacks: Readonly<Record<string, number>>;
  equipment: Readonly<{ feet: string | null }>;
}>;
// 이전 세이브의 빈 캐릭터는 위치가 없는 상태로 유지한다.
export type StaminaState = Readonly<{ current: number; max: number }>;
export type CharacterState = Readonly<{
  inventory: InventoryState;
  position: MapPosition | null;
  stamina: StaminaState;
  movedSinceLastTick: boolean;
  activity: 'waiting' | 'resting';
}>;
// S2의 미처리 습격만 보관한다. 전체 원정 수명 주기는 후속 단계에서 정의한다.
export type ExpeditionState = Readonly<{
  pendingAmbush: null | Readonly<{ triggeredAt: number; activityAtTrigger: 'waiting' | 'resting' }>;
}>;

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
