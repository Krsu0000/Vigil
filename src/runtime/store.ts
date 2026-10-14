import type { ContentDb } from '../content/types.ts';
import type { DispatchResult } from '../engine/core/actions.ts';
import { createCampaign } from '../engine/core/campaign.ts';
import { createDispatcher } from '../engine/core/dispatch.ts';
import type { GameState } from '../engine/core/state.ts';
import { mapHandlers } from '../engine/systems/map/actions.ts';
import type { MapAction, MapEvent } from '../engine/systems/map/actions.ts';
import { timeHandlers } from '../engine/systems/time/actions.ts';
import type { TimeAction } from '../engine/systems/time/actions.ts';
import type { TimeEvent } from '../engine/systems/time/advance.ts';
import { validateMapState } from '../engine/systems/map/selectors.ts';
import { GameStateSchema, restoreSave } from '../persistence/save-file.ts';

export type RuntimeAction = MapAction | TimeAction;
export type RuntimeEvent = MapEvent | TimeEvent;

export type GameStore = Readonly<{
  content: ContentDb;
  getSnapshot: () => GameState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: RuntimeAction) => DispatchResult<RuntimeEvent>;
  restore: (raw: unknown) => void;
}>;

export function createGameStore(content: ContentDb, initial: GameState, now: () => number): GameStore {
  let state: GameState = GameStateSchema.parse(initial);
  validateMapState(state, content);
  const run = createDispatcher<RuntimeAction, RuntimeEvent>({ ...mapHandlers, ...timeHandlers });
  const listeners = new Set<() => void>();
  const publish = (next: GameState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return Object.freeze({
    content,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispatch(action: RuntimeAction) {
      const result = run(state, action, { content, now: now() });
      if (result.ok) publish(result.state);
      return result;
    },
    restore(raw: unknown) {
      const restored = restoreSave(raw);
      validateMapState(restored, content);
      // 모든 검증을 통과한 뒤 교체한다. 실패 시 원래 상태와 구독을 유지한다.
      publish(restored);
    },
  });
}

// 초기 프로토타입의 시작 맵은 하나다. 여러 후보에서 배열 순서로 선택하지 않는다.
export function initialMapId(content: ContentDb): string {
  const maps = content.definitions.filter((entry) => entry.kind === 'map');
  if (maps.length !== 1) throw new Error('초기 프로토타입에는 시작 맵이 1개 필요하다');
  return maps[0]!.id;
}

export function createNewGameStore(content: ContentDb, seed: readonly number[], now: () => number): GameStore {
  const mapId = initialMapId(content);
  const store = createGameStore(content, createCampaign(content, seed, now()), now);
  const result = store.dispatch({ type: 'map/start', mapId });
  if (!result.ok) throw new Error('시작 맵에 배치할 수 없다');
  return store;
}
