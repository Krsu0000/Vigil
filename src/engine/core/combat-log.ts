import type { CharacterState, MapPosition } from './state.ts';
export type CombatChoice = 'attack' | 'defend' | 'skill' | 'item' | 'escape';
export type CombatTurnAction = Readonly<{ type: 'combat/act'; choice: CombatChoice; targetId?: string; itemId?: string }>;
export type EnemyPlan=Readonly<{groupId?:string;step:number;repeat:number;uses:Readonly<Record<string,number>>;completed:Readonly<Record<string,number>>;guardMultiplier?:number}>;
export type CombatEnemyState = Readonly<{ id: string; monsterId: string; health: number; maxHealth: number; row: 'front' | 'back';plan?:EnemyPlan }>;
export type CombatLine = Readonly<{ turn: number; text: string }>;
export type CombatState = Readonly<{
  encounterId: string; origin: 'map' | 'ambush'; retreat: MapPosition;
  status: 'active' | 'victory' | 'escaped' | 'defeat'; turn: number;
  enemies: readonly CombatEnemyState[];
  history: readonly CombatLine[];
  actions: readonly CombatTurnAction[];
  loot: readonly Readonly<{ itemId: string; quantity: number }>[];
  initial: Readonly<{ contentVersion: string; character: CharacterState; enemies: readonly CombatEnemyState[];
    rngState: readonly number[]; gameTime: number }>;
}>;
// S0에서 공개한 최소 기록도 유지한다. S5는 CombatState.initial/actions를 재생한다.
export type CombatLog<A = CombatTurnAction> = Readonly<{ contentVersion: string; rngState: readonly number[]; actions: readonly A[] }>;
