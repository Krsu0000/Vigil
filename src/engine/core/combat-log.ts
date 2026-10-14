import type { Action } from './actions.ts';

// 기록 형식만 정의한다. 실제 전투 행동·초기 전투 상태·재현 실행기는 S5에서 정의한다.
export type CombatLog<A extends Action = Action> = Readonly<{
  contentVersion: string;
  rngState: readonly number[];
  actions: readonly A[];
}>;
