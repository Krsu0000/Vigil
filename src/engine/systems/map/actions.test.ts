import { describe, expect, it } from 'vitest';
import { mapSources } from '../../../content/test-fixtures.ts';
import { createCampaign } from '../../core/campaign.ts';
import { deepFreeze } from '../../core/test-fixtures.ts';
import type { GameState } from '../../core/state.ts';
import type { MapAction } from './actions.ts';
import { coordinateKey, validateMapState } from './selectors.ts';
import { mapContext, mapDispatch, startedState, walk } from './test-fixtures.ts';

describe('맵 최초 배치와 이동', () => {
  it('최초 배치는 JSON 시작점만 기록하고 시간·난수를 보존한다', () => {
    const ctx = mapContext();
    const state = deepFreeze(createCampaign(ctx.content, [1, 2, 3, 4], ctx.now));
    const result = mapDispatch(state, { type: 'map/start', mapId: 'map.s1_test' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.state.character?.position).toEqual({ mapId: 'map.s1_test', floor: 0, x: 1, y: 1 });
    expect(result.state.campaign.exploration).toEqual({
      'map.s1_test': { mapVersion: 1, visited: { '0:1:1': true } },
    });
    expect(result.state.meta).toEqual(state.meta);
    expect(result.state.expedition).toBe(state.expedition);
    expect(state.character).toBeNull();
    expect(state.campaign.exploration).toEqual({});
    if (!result.ok) throw new Error('최초 배치 실패');
    expect(result.events).toEqual([{ type: 'map/started', position: result.state.character!.position }]);
  });

  it('미배치 캐릭터도 첫 배치를 할 수 있다', () => {
    const ctx = mapContext();
    const state = { ...createCampaign(ctx.content, [1, 2, 3, 4], ctx.now), character: { position: null, stamina: { current: 900, max: 900 }, movedSinceLastTick: false, activity: 'waiting' as const } };
    expect(mapDispatch(state, { type: 'map/start', mapId: 'map.s1_test' }, ctx).ok).toBe(true);
  });

  it('시작 맵 누락·이미 배치됨·기록이 있는 캐릭터 없음 상태를 거부한다', () => {
    const ctx = mapContext();
    const started = deepFreeze(startedState(ctx));
    for (const [state, mapId, reason] of [
      [started, 'map.missing', 'invalid_action'],
      [started, 'map.s1_test', 'condition_not_met'],
      [{ ...started, character: null }, 'map.s1_test', 'condition_not_met'],
    ] as const) {
      expect(mapDispatch(state, { type: 'map/start', mapId }, ctx)).toEqual({ ok: false, state, reason });
    }
  });

  it.each([
    ['north', 2, 1], ['south', 2, 3], ['east', 3, 2], ['west', 1, 2],
  ] as const)('%s로 정확히 한 칸 이동하고 밟은 칸을 기록한다', (direction, x, y) => {
    const ctx = mapContext();
    const state = deepFreeze(walk(startedState(ctx), ['east', 'south'], ctx));
    const before = structuredClone(state);
    const result = mapDispatch(state, { type: 'move/step', direction }, ctx);
    if (!result.ok) throw new Error('이동 실패');
    const position = { mapId: 'map.s1_test', floor: 0, x, y };
    expect(result.state.character?.position).toEqual(position);
    expect(result.state.campaign.exploration['map.s1_test']!.visited[coordinateKey(position)]).toBe(true);
    expect(result.events).toEqual([{
      type: 'move/stepped', from: state.character!.position, to: position,
      newlyExplored: state.campaign.exploration['map.s1_test']!.visited[coordinateKey(position)] !== true,
    }]);
    expect(result.state.meta).toEqual(state.meta);
    expect(state).toEqual(before);
    validateMapState(result.state, ctx.content);
  });

  it.each(['north', 'west'] as const)('벽으로의 %s 이동은 같은 상태 참조를 반환한다 (INV-02)', (direction) => {
    const ctx = mapContext();
    const state = deepFreeze(startedState(ctx));
    const result = mapDispatch(state, { type: 'move/step', direction }, ctx);
    expect(result).toEqual({ ok: false, state, reason: 'condition_not_met' });
    expect(result.state).toBe(state);
    expect(result.state.meta.rngState).toBe(state.meta.rngState);
  });

  it('경계의 열린 칸에서도 맵 밖으로 이동할 수 없다', () => {
    const sources = mapSources();
    const map = sources['maps/s1-test.json'][0]!;
    map.start.x = 0;
    map.floors[0]!.cells.find((cell) => cell.x === 0 && cell.y === 1)!.tileId = 'tile.floor';
    const ctx = mapContext(sources);
    const state = deepFreeze(startedState(ctx));
    const result = mapDispatch(state, { type: 'move/step', direction: 'west' }, ctx);
    expect(result.state).toBe(state);
    expect(result.ok).toBe(false);
  });

  it('왕복해도 탐사 칸을 중복 기록하지 않고 기록을 잃지 않는다', () => {
    const ctx = mapContext();
    const state = walk(startedState(ctx), ['east', 'west', 'east', 'west'], ctx);
    expect(state.campaign.exploration['map.s1_test']!.visited).toEqual({ '0:1:1': true, '0:2:1': true });
    expect(state.character?.position).toMatchObject({ x: 1, y: 1 });
  });

  it('캐릭터 없음·미배치·알 수 없는 방향은 변경 없이 거부한다', () => {
    const ctx = mapContext();
    const empty = createCampaign(ctx.content, [1, 2, 3, 4], ctx.now);
    for (const state of [empty, { ...empty, character: { position: null, stamina: { current: 900, max: 900 }, movedSinceLastTick: false, activity: 'waiting' as const } }]) {
      expect(mapDispatch(state, { type: 'move/step', direction: 'east' }, ctx).state).toBe(state);
    }
    const state = deepFreeze(startedState(ctx));
    for (const direction of ['diagonal', 'constructor', '', 1]) {
      const action = { type: 'move/step', direction } as MapAction;
      expect(mapDispatch(state, action, ctx)).toEqual({ ok: false, state, reason: 'invalid_action' });
    }
  });

  it('같은 입력은 같은 상태와 사건을 만든다 (INV-04)', () => {
    const ctx = deepFreeze(mapContext());
    const state = deepFreeze(startedState(ctx));
    const action: MapAction = { type: 'move/step', direction: 'east' };
    expect(mapDispatch(state, action, ctx)).toEqual(mapDispatch(state, action, ctx));
  });

  it('맵 버전 불일치·손상된 현재 위치는 일반 이동 거부로 숨기지 않는다', () => {
    const ctx = mapContext();
    const state = startedState(ctx);
    const mismatch: GameState = { ...state, campaign: { exploration: {
      'map.s1_test': { ...state.campaign.exploration['map.s1_test']!, mapVersion: 2 },
    } } };
    expect(() => mapDispatch(mismatch, { type: 'move/step', direction: 'east' }, ctx)).toThrow('버전');
    const invalid: GameState = { ...state, character: { ...state.character!, position: { ...state.character!.position!, x: 0 } } };
    expect(() => mapDispatch(invalid, { type: 'move/step', direction: 'east' }, ctx)).toThrow('현재 위치');
  });
});

describe('복원 상태와 실제 맵 대조', () => {
  it('캐릭터가 없어도 캠페인의 탐사 기록은 보존하고 검증한다', () => {
    const ctx = mapContext();
    const state = { ...walk(startedState(ctx), ['east'], ctx), character: null };
    const before = structuredClone(state);
    validateMapState(deepFreeze(state), ctx.content);
    expect(state).toEqual(before);
  });

  it.each(['0:0:1', '0:99:1', '01:1:1', 'bad'])('잘못된 탐사 기록 %s를 콘텐츠와 대조해 거부한다', (key) => {
    const ctx = mapContext();
    const state = startedState(ctx);
    const raw: GameState = { ...state, campaign: { exploration: {
      'map.s1_test': { mapVersion: 1, visited: { '0:1:1': true, [key]: true } },
    } } };
    expect(() => validateMapState(raw, ctx.content)).toThrow();
  });

  it('없는 맵과 다른 버전의 탐사 기록을 임의로 초기화하지 않는다', () => {
    const ctx = mapContext();
    for (const [mapId, mapVersion] of [['map.missing', 1], ['map.s1_test', 2]] as const) {
      const state: GameState = { ...startedState(ctx), character: null,
        campaign: { exploration: { [mapId]: { mapVersion, visited: {} } } } };
      expect(() => validateMapState(state, ctx.content)).toThrow('맵 버전');
    }
  });
});
