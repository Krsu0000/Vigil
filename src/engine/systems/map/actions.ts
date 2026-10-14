import type { ActionHandlers } from '../../core/actions.ts';
import type { MapPosition } from '../../core/state.ts';
import { coordinateKey, currentLocation, findCell, findMap, requireTile } from './selectors.ts';
import { assertStamina, consumeStamina, createStamina, getMoveCost } from '../stamina/stamina.ts';

export type Direction = 'north' | 'south' | 'east' | 'west';
export type MapAction =
  | Readonly<{ type: 'map/start'; mapId: string }>
  | Readonly<{ type: 'move/step'; direction: Direction }>;
export type MapEvent =
  | Readonly<{ type: 'map/started'; position: MapPosition }>
  | Readonly<{ type: 'move/stepped'; from: MapPosition; to: MapPosition; newlyExplored: boolean }>;

const DELTAS: Readonly<Record<Direction, readonly [number, number]>> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
};

function destination(position: MapPosition, direction: Direction): MapPosition {
  const [dx, dy] = DELTAS[direction];
  return { ...position, x: position.x + dx, y: position.y + dy };
}

export const mapHandlers: ActionHandlers<MapAction, MapEvent> = {
  'map/start': {
    validate: (state, action, ctx) => {
      if (!findMap(ctx.content, action.mapId)) return 'invalid_action';
      // 최초 프로토타입 배치 전용이다. 기존 위치·탐사 기록을 초기화하거나 부활시키지 않는다.
      if (state.character?.position || Object.keys(state.campaign.exploration).length > 0) return 'condition_not_met';
      return null;
    },
    execute: (state, action, ctx) => {
      const map = findMap(ctx.content, action.mapId)!;
      const position = { mapId: map.id, ...map.start };
      const cell = findCell(map, position);
      if (!cell || !requireTile(ctx.content, cell.tileId).walkable) throw new Error('맵 시작 위치가 유효하지 않다');
      return {
        state: {
          ...state,
          campaign: { ...state.campaign, exploration: {
            [map.id]: { mapVersion: map.version, visited: { [coordinateKey(position)]: true } },
          } },
          character: state.character ? { ...state.character, position } : {
            position, stamina: createStamina(ctx.content), movedSinceLastTick: false,
          },
        },
        events: [{ type: 'map/started', position }],
      };
    },
  },
  'move/step': {
    validate: (state, action, ctx) => {
      if (!Object.hasOwn(DELTAS, action.direction)) return 'invalid_action';
      const location = currentLocation(state, ctx.content);
      if (!location) return 'condition_not_met';
      const to = destination(location.position, action.direction);
      const cell = findCell(location.map, to);
      if (!cell || !requireTile(ctx.content, cell.tileId).walkable) return 'condition_not_met';
      assertStamina(state.character!.stamina);
      return state.character!.stamina.current < getMoveCost(state, to, ctx.content) ? 'insufficient_resources' : null;
    },
    execute: (state, action, ctx) => {
      const { position, memory } = currentLocation(state, ctx.content)!;
      const to = destination(position, action.direction);
      const key = coordinateKey(to);
      const newlyExplored = memory.visited[key] !== true;
      return {
        state: {
          ...state,
          character: { ...state.character!, position: to,
            stamina: consumeStamina(state.character!.stamina, getMoveCost(state, to, ctx.content)),
            movedSinceLastTick: true,
          },
          campaign: newlyExplored ? { ...state.campaign, exploration: {
            ...state.campaign.exploration,
            [to.mapId]: { ...memory, visited: { ...memory.visited, [key]: true } },
          } } : state.campaign,
        },
        events: [{ type: 'move/stepped', from: position, to, newlyExplored }],
      };
    },
  },
};
