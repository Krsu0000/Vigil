import { describe, expect, it, vi } from 'vitest';
import { mapContext, startedState, walk } from '../engine/systems/map/test-fixtures.ts';
import { mapSources } from '../content/test-fixtures.ts';
import { createGameStore } from './store.ts';
import { createGameLoop } from './loop.ts';
import type { Clock, Scheduler } from './clock.ts';

class FakeClock implements Clock, Scheduler {
  mono = 0;
  wall = 1_700_000_000_000;
  counter = 0;
  tasks = new Map<number, { at: number; callback: () => void }>();
  cancelled: (() => void)[] = [];
  wallNow = () => this.wall;
  monotonicNow = () => this.mono;
  schedule = (callback: () => void, delay: number) => {
    const id = ++this.counter; this.tasks.set(id, { at: this.mono + delay, callback }); return id;
  };
  cancel = (handle: unknown) => {
    const task = this.tasks.get(handle as number);
    if (task) this.cancelled.push(task.callback);
    this.tasks.delete(handle as number);
  };
  advance(ms: number) {
    const to = this.mono + ms;
    while (true) {
      const entry = [...this.tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > to) break;
      this.jump(entry[1].at - this.mono);
      this.tasks.delete(entry[0]); entry[1].callback();
    }
    this.jump(to - this.mono);
  }
  jump(ms: number) { this.mono += ms; this.wall += ms; }
  wake() {
    const entry = [...this.tasks][0];
    if (entry) { this.tasks.delete(entry[0]); entry[1].callback(); }
  }
}

// 이전 10초 경계도 회귀 검사한다. 실제 2초 설정은 아래 매개변수 검사에서 사용한다.
function tenSecondSources() {
  const sources = mapSources(); sources['time-rules.json'].tickMs = 10_000; sources['time-rules.json'].stamina.recoveryIntervalMs = 10_000; return sources;
}

function setup(danger = false, sources = tenSecondSources()) {
  const ctx = mapContext(sources); const clock = new FakeClock();
  const base = danger ? walk(startedState(ctx), ['east','east','south','south','east'], ctx) : startedState(ctx);
  const initial = { ...base, character: { ...base.character!, stamina: { current: 880, max: 900 }, movedSinceLastTick: false } };
  const store = createGameStore(ctx.content, initial, clock.wallNow);
  const loop = createGameLoop(store, clock, clock);
  loop.start();
  return { store, loop, clock };
}

describe('실시간 틱·세션 제어', () => {
  it('연속 이동은 회복 대기만 초기화하고 전역 틱의 시각은 유지한다', () => {
    const { store, loop, clock } = setup(true, mapSources());
    const ticks: { time: number; at: number }[] = [];
    let observed = 0;
    store.subscribe(() => {
      const time = store.getSnapshot().meta.gameTime;
      if (time !== observed) { ticks.push({ time, at: clock.mono }); observed = time; }
    });
    for (const direction of ['east', 'west', 'east'] as const) {
      clock.advance(ticks.length === 0 && clock.mono === 0 ? 1_000 : 2_000);
      expect(loop.move(direction).ok).toBe(true);
    }
    const current = store.getSnapshot().character!.stamina.current;
    clock.advance(1_999);
    expect(store.getSnapshot().character!.stamina.current).toBe(current);
    clock.advance(1); expect(store.getSnapshot().character!.stamina.current).toBe(current + 1);
    expect(ticks).toEqual([{ time: 1, at: 2_000 }, { time: 2, at: 4_000 }, { time: 3, at: 6_000 }]);
  });

  it('벽 충돌과 이동 간격 거부는 회복 대기를 초기화하지 않는다', () => {
    const wall = setup(true, mapSources()); wall.clock.advance(1_999);
    expect(wall.loop.move('north').ok).toBe(false); wall.clock.advance(1);
    expect(wall.store.getSnapshot().character!.stamina.current).toBe(881);
    const cooldown = setup(true, mapSources()); cooldown.clock.advance(1_000);
    expect(cooldown.loop.move('east').ok).toBe(true); const current = cooldown.store.getSnapshot().character!.stamina.current;
    cooldown.clock.advance(100); expect(cooldown.loop.move('west')).toEqual({ ok: false, reason: 'cooldown' });
    cooldown.clock.advance(1_899); expect(cooldown.store.getSnapshot().character!.stamina.current).toBe(current);
    cooldown.clock.advance(1); expect(cooldown.store.getSnapshot().character!.stamina.current).toBe(current + 1);
  });

  it.each([[10_000,2_000],[2_000,5_000]])('전역 틱 %ims와 회복 간격 %ims는 서로 독립적이다', (tickMs, recoveryIntervalMs) => {
    const sources = mapSources(); sources['time-rules.json'].tickMs = tickMs;
    sources['time-rules.json'].stamina.recoveryIntervalMs = recoveryIntervalMs;
    const { loop, store, clock } = setup(true, sources); clock.advance(1_000);
    expect(loop.move('east').ok).toBe(true); const current = store.getSnapshot().character!.stamina.current;
    clock.advance(recoveryIntervalMs - 1); expect(store.getSnapshot().character!.stamina.current).toBe(current);
    clock.advance(1); expect(store.getSnapshot().character!.stamina.current).toBe(current + 1);
    expect(store.getSnapshot().meta.gameTime).toBe(Math.floor(clock.mono / tickMs));
    clock.advance(recoveryIntervalMs); expect(store.getSnapshot().character!.stamina.current).toBe(current + 2);
    expect(store.getSnapshot().meta.gameTime).toBe(Math.floor(clock.mono / tickMs));
  });

  it('늦게 도착한 콜백도 시각 순서로 처리하고 동시에는 전역 틱 다음 회복이다', () => {
    const { store, loop, clock } = setup(true, mapSources()); loop.stop();
    const dispatch = vi.fn(store.dispatch);
    const controlled = createGameLoop({ ...store, dispatch }, clock, clock); controlled.start();
    clock.jump(6_000); clock.wake();
    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
      'time/heartbeat', 'time/tick', 'stamina/recover', 'time/tick', 'stamina/recover', 'time/tick', 'stamina/recover',
    ]);
    expect(store.getSnapshot().meta.gameTime).toBe(3);
    expect(store.getSnapshot().character!.stamina.current).toBe(883);
    expect(clock.tasks.size).toBe(1);
  });
  it.each([999, 1_999, 2_001])('틱 경계와 무관하게 %ims에 이동한 뒤 정확히 2초 후 회복한다', (moveAt) => {
    const { store, loop, clock } = setup(true, mapSources());
    clock.advance(moveAt);
    expect(loop.move('east').ok).toBe(true);
    const current = store.getSnapshot().character!.stamina.current;
    clock.advance(1_999);
    expect(store.getSnapshot().character!.stamina.current).toBe(current);
    clock.advance(1);
    expect(store.getSnapshot().character!.stamina.current).toBe(current + 1);
    expect(store.getSnapshot().meta.gameTime).toBe(Math.floor((moveAt + 2_000) / 2_000));
  });
  it.each([2_000, 10_000])('%ims 회복 간격이면 이동 후 한 주기마다 회복한다', (tickMs) => {
    const sources = mapSources(); sources['time-rules.json'].tickMs = tickMs; sources['time-rules.json'].stamina.recoveryIntervalMs = tickMs;
    const { store, loop, clock } = setup(true, sources);
    expect(loop.move('east').ok).toBe(true);
    clock.advance(tickMs - 1); expect(store.getSnapshot().meta.gameTime).toBe(0);
    clock.advance(1);
    expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(store.getSnapshot().character?.stamina.current).toBe(875);
    clock.advance(tickMs);
    expect(store.getSnapshot().meta.gameTime).toBe(2);
    expect(store.getSnapshot().character?.stamina.current).toBe(876);
  });

  it.each([2_000, 10_000])('%ims 경계 직후 이동해도 그때부터 한 주기 뒤 회복한다', (tickMs) => {
    const sources = mapSources(); sources['time-rules.json'].tickMs = tickMs; sources['time-rules.json'].stamina.recoveryIntervalMs = tickMs;
    const { store, loop, clock } = setup(true, sources);
    clock.advance(tickMs); expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(loop.move('east').ok).toBe(true);
    clock.advance(tickMs);
    expect(store.getSnapshot().meta.gameTime).toBe(2);
    expect(store.getSnapshot().character?.stamina.current).toBe(876);
    clock.advance(tickMs);
    expect(store.getSnapshot().meta.gameTime).toBe(3);
    expect(store.getSnapshot().character?.stamina.current).toBe(877);
  });
  it('10초 경계마다 한 틱과 회복을 적용하고 하트비트는 별도로 갱신한다', () => {
    const { store, clock } = setup(); const rng = store.getSnapshot().meta.rngState;
    clock.advance(9_999); expect(store.getSnapshot().meta.gameTime).toBe(0);
    clock.advance(1); expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(store.getSnapshot().character?.stamina.current).toBe(881);
    clock.advance(5_000); expect(store.getSnapshot().meta.lastActiveAt).toBe(clock.wall);
    expect(store.getSnapshot().meta.gameTime).toBe(1);
    clock.advance(15_000); expect(store.getSnapshot().meta.gameTime).toBe(3);
    expect(store.getSnapshot().meta.rngState).toEqual(rng);
    expect(clock.tasks.size).toBe(1);
  });

  it('이동 후 첫 회복 주기부터 회복하고 이후 주기도 같은 양을 회복한다', () => {
    const { store, loop, clock } = setup(true);
    expect(loop.move('east').ok).toBe(true);
    expect(store.getSnapshot().character?.stamina.current).toBe(874);
    clock.advance(10_000); expect(store.getSnapshot().character?.stamina.current).toBe(875);
    clock.advance(10_000); expect(store.getSnapshot().character?.stamina.current).toBe(876);
  });

  it('일시정지는 틱·회복·난수를 보존하고 입력도 막으며 재개 시 소급하지 않는다', () => {
    const { store, loop, clock } = setup(true);
    clock.advance(5_000); loop.setPaused(true);
    const before = store.getSnapshot();
    clock.advance(600_000);
    expect(store.getSnapshot()).toBe(before);
    expect(loop.move('east')).toEqual({ ok: false, reason: 'paused' });
    expect(clock.tasks.size).toBe(0);
    loop.setPaused(false);
    expect(loop.getSnapshot().running).toBe(true);
    expect(store.getSnapshot().meta.gameTime).toBe(0);
    clock.advance(9_999); expect(store.getSnapshot().meta.gameTime).toBe(0);
    clock.advance(1); expect(store.getSnapshot().meta.gameTime).toBe(1);
  });

  it('설정창은 자동 정지하고 닫으면 재개하며 수동 정지는 유지한다', () => {
    const { loop, store, clock } = setup();
    loop.setSettingsOpen(true); const before = store.getSnapshot();
    clock.advance(100_000); expect(store.getSnapshot()).toBe(before);
    loop.setSettingsOpen(false); expect(loop.getSnapshot().running).toBe(true);
    loop.setPaused(true); loop.setSettingsOpen(true); loop.setSettingsOpen(false);
    expect(loop.getSnapshot()).toMatchObject({ running: false, paused: true, settingsOpen: false });
    expect(clock.tasks.size).toBe(0);
  });

  it('반복한 정지·설정 요청은 정지 구간을 진행시키지 않는다', () => {
    const { loop, store, clock } = setup();
    loop.setPaused(true); clock.advance(20_000); loop.setPaused(true);
    loop.setSettingsOpen(true); clock.advance(20_000); loop.setSettingsOpen(true);
    loop.setPaused(false); expect(loop.getSnapshot().running).toBe(false);
    loop.setSettingsOpen(false); clock.advance(10_000);
    expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(clock.tasks.size).toBe(1);
  });

  it('유예 이하의 백그라운드 지연은 빠진 틱을 정확히 처리한다', () => {
    const { store, clock, loop } = setup(true);
    clock.jump(60_000); clock.wake();
    expect(store.getSnapshot().meta.gameTime).toBe(6);
    expect(store.getSnapshot().character?.stamina.current).toBe(886);
    expect(loop.getSnapshot().running).toBe(true);
    clock.advance(10_000); expect(store.getSnapshot().meta.gameTime).toBe(7);
  });

  it('정확히 2분인 공백은 진행하지만 1ms 초과하면 위험지대 전체 공백을 제외한다', () => {
    const exact = setup(true); exact.clock.jump(120_000); exact.clock.wake();
    expect(exact.store.getSnapshot().meta.gameTime).toBe(12);
    const over = setup(true); const before = over.store.getSnapshot();
    over.clock.jump(120_001); over.clock.wake();
    expect(over.store.getSnapshot()).toBe(before);
    expect(over.loop.getSnapshot()).toMatchObject({ running: false, gapPaused: true });
    expect(over.clock.tasks.size).toBe(0);
    over.loop.setPaused(false); over.clock.advance(10_000);
    expect(over.store.getSnapshot().meta.gameTime).toBe(1);
    expect(over.store.getSnapshot().character?.stamina.current).toBe(881);
  });

  it('타이머보다 먼저 온 이동 입력도 공백 정지를 우회하지 못한다', () => {
    const { store, clock, loop } = setup(true); const before = store.getSnapshot();
    clock.jump(120_001);
    expect(loop.move('east')).toEqual({ ok: false, reason: 'paused' });
    expect(store.getSnapshot()).toBe(before);
    expect(loop.getSnapshot().gapPaused).toBe(true);
  });

  it('직전 실행 하트비트를 기준으로 공백을 검사한다', () => {
    const { store, clock, loop } = setup(true);
    clock.advance(30_000); const before = store.getSnapshot();
    clock.jump(120_001); clock.wake();
    expect(store.getSnapshot()).toBe(before);
    expect(loop.getSnapshot().gapPaused).toBe(true);
  });

  it('안전지대의 열린 세션 지연은 일괄 회복하되 자원 상한을 지킨다', () => {
    const { store, clock, loop } = setup();
    clock.jump(3_600_000); clock.wake();
    expect(store.getSnapshot().meta.gameTime).toBe(360);
    expect(store.getSnapshot().character?.stamina.current).toBe(900);
    expect(loop.getSnapshot().running).toBe(true);
  });

  it('시스템 시각 역행·점프는 실시간 틱과 입력 간격에 영향을 주지 않는다', () => {
    const { store, clock, loop } = setup(); const initialHeartbeat = store.getSnapshot().meta.lastActiveAt;
    expect(loop.move('east').ok).toBe(true);
    clock.wall -= 86_400_000;
    expect(loop.move('east')).toEqual({ ok: false, reason: 'cooldown' });
    clock.advance(200); expect(loop.move('east').ok).toBe(true);
    clock.advance(14_800); expect(store.getSnapshot().meta.gameTime).toBe(1);
    expect(store.getSnapshot().meta.lastActiveAt).toBe(initialHeartbeat);
    clock.wall += 172_800_000;
    clock.advance(5_000); expect(store.getSnapshot().meta.gameTime).toBe(2);
  });

  it('시작·종료 중복과 StrictMode의 시작→종료→시작에도 타이머가 하나만 남는다', () => {
    const { loop, clock, store } = setup();
    loop.start(); loop.start(); expect(clock.tasks.size).toBe(1);
    loop.stop(); loop.stop(); expect(clock.tasks.size).toBe(0);
    loop.start(); expect(clock.tasks.size).toBe(1);
    for (const callback of clock.cancelled) callback();
    expect(clock.tasks.size).toBe(1);
    clock.advance(10_000); expect(store.getSnapshot().meta.gameTime).toBe(1);
    loop.stop(); const before = store.getSnapshot(); clock.advance(60_000);
    for (const callback of clock.cancelled) callback();
    expect(store.getSnapshot()).toBe(before);
  });

  it('이동 간격 199ms는 거부하고 200ms부터 허용하며 자원·탐사·난수를 보존한다', () => {
    const { loop, clock, store } = setup();
    expect(loop.move('east').ok).toBe(true); const before = store.getSnapshot();
    clock.advance(199); expect(loop.move('east')).toEqual({ ok: false, reason: 'cooldown' });
    expect(store.getSnapshot()).toBe(before);
    clock.advance(1); expect(loop.move('east').ok).toBe(true);
  });

  it('벽·자원 부족의 거부는 이동 간격을 소비하지 않는다', () => {
    const safe = setup(); expect(safe.loop.move('north').ok).toBe(false);
    expect(safe.loop.move('east').ok).toBe(true);
    const danger = setup(true);
    const snapshot = danger.store.getSnapshot();
    const low = createGameStore(danger.store.content, { ...snapshot, character: {
      ...snapshot.character!, stamina: { current: 3, max: 900 },
    } }, danger.clock.wallNow);
    const loop = createGameLoop(low, danger.clock, danger.clock); loop.start();
    expect(loop.move('east')).toMatchObject({ ok: false, reason: 'insufficient_resources' });
    expect(loop.move('west').ok).toBe(true);
  });

  it('콘텐츠의 이동 간격을 읽고 세션 상태 변경을 구독자에게 알린다', () => {
    const sources = tenSecondSources(); sources['time-rules.json'].minimumMoveIntervalMs = 500;
    const { loop, clock } = setup(false, sources); const notify = vi.fn();
    const unsubscribe = loop.subscribe(notify);
    expect(loop.move('east').ok).toBe(true); clock.advance(200);
    expect(loop.move('east').ok).toBe(false); clock.advance(300);
    expect(loop.move('east').ok).toBe(true);
    loop.setPaused(true); expect(notify).toHaveBeenCalledOnce();
    loop.setPaused(true); expect(notify).toHaveBeenCalledOnce();
    unsubscribe(); loop.setPaused(false); expect(notify).toHaveBeenCalledOnce();
  });
});
