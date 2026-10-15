import type { CombatState } from './combat-log.ts';
export type MapPosition = Readonly<{ mapId: string; floor: number; x: number; y: number }>;
export type MapExploration = Readonly<{
  mapVersion: number;
  visited: Readonly<Record<string, true>>; // 정규 좌표 키 floor:x:y
}>;
export type RecentRecord = Readonly<{ at: number; text: string }>;
export type CampaignState = Readonly<{
  exploration: Readonly<Record<string, MapExploration>>;
  openedChests: Readonly<Record<string, true>>;
  recentRecords?: readonly RecentRecord[];
}>;
export type InventoryState = Readonly<{
  stacks: Readonly<Record<string, number>>;
  equipment: Readonly<{ feet: string | null }>;
}>;
// 이전 세이브의 빈 캐릭터는 위치가 없는 상태로 유지한다.
export type StaminaState = Readonly<{ current: number; max: number }>;
export type CharacterState = Readonly<{
  inventory: InventoryState;
  health: StaminaState;
  archetype?: 'warrior' | 'rogue' | 'mage';
  mana?: StaminaState;
  position: MapPosition | null;
  stamina: StaminaState;
  movedSinceLastTick: boolean;
  activity: 'waiting' | 'resting';
}>;
// 미처리 조우·전투·토벌을 저장한다. 원정 재생성 수명 주기는 후속 단계에서 정의한다.
export type ExpeditionState = Readonly<{
  pendingAmbush: null | Readonly<{ triggeredAt: number; activityAtTrigger: 'waiting' | 'resting'; encounterId?: string; retreat?: MapPosition }>;
  combat?: CombatState;
  defeatedEnemies?: Readonly<Record<string, true>>;
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
