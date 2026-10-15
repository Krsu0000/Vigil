import type { AmbushResult } from '../engine/systems/ambush/actions.ts';
import type { Direction } from '../engine/systems/map/actions.ts';
import { currentLocation, findCell, requireZone } from '../engine/systems/map/selectors.ts';
import type { Clock, Scheduler } from './clock.ts';
import type { GameStore } from './store.ts';

export type SessionStatus = Readonly<{
  running: boolean; paused: boolean; settingsOpen: boolean; gapPaused: boolean; ambushPending: boolean;
}>;

// 게임 상태는 Store만 소유한다. 이 객체는 저장하지 않는 세션의 시간·입력 제한만 관리한다.
export function createGameLoop(store: GameStore, clock: Clock, scheduler: Scheduler) {
  const rules = store.content.timeRules;
  const listeners = new Set<() => void>();
  let status: SessionStatus = { running: false, paused: false, settingsOpen: false, gapPaused: false, ambushPending: !!store.getSnapshot().expedition?.pendingAmbush };
  let active = false;
  let unsubscribe: (() => void) | undefined;
  let observedActivity = store.getSnapshot().character?.activity;
  let pumping = false;
  let timer: unknown;
  let generation = 0;
  let tickAt = 0;
  let heartbeatAt = 0;
  let recoveryAt = 0;
  let nextMoveAt = -Infinity;
  let coveredUntil = 0;
  const publish = (patch: Partial<SessionStatus>) => {
    const next = { ...status, ...patch };
    next.running = active && !next.paused && !next.settingsOpen && !next.gapPaused && !next.ambushPending;
    if (Object.keys(next).every((key) => next[key as keyof SessionStatus] === status[key as keyof SessionStatus])) return;
    status = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  };
  const cancel = () => {
    generation += 1;
    if (timer !== undefined) scheduler.cancel(timer);
    timer = undefined;
  };
  const reanchor = () => {
    tickAt = heartbeatAt = recoveryAt = clock.monotonicNow();
    coveredUntil = Math.max(coveredUntil, clock.wallNow());
  };
  const pump = () => {
    if (!status.running) return;
    const now = clock.monotonicNow();
    const state = store.getSnapshot();
    const location = currentLocation(state, store.content);
    const danger = location && requireZone(store.content, findCell(location.map, location.position)!.zoneId).safety === 'danger';
    // 입력이 타이머보다 먼저 도착해도 공백 검사를 먼저 한다.
    if (now - heartbeatAt > rules.heartbeatGraceMs && danger) {
      reanchor();
      publish({ gapPaused: true });
      return;
    }
    if (now - heartbeatAt > rules.heartbeatGraceMs && !danger) {
      // 긴 안전 구역 실행 공백은 오프라인과 같은 상한/역행 규칙을 적용한다.
      pumping = true;
      try {
        store.dispatch({ type: 'time/settle', from: coveredUntil, to: clock.wallNow() });
        reanchor();
        store.dispatch({ type: 'time/heartbeat' });
      } finally { pumping = false; }
      return;
    }
    // 마감 시각 순서로 처리한다. 동시에는 전역 틱을 먼저, 회복을 다음에 처리한다.
    pumping = true;
    try {
      while (status.running) {
        const nextTick = tickAt + rules.tickMs;
        const nextRecovery = recoveryAt + rules.stamina.recoveryIntervalMs;
        if (Math.min(nextTick, nextRecovery) > now) break;
        if (nextTick <= nextRecovery) {
          store.dispatch({ type: 'time/tick' });
          tickAt = nextTick;
        } else {
          store.dispatch({ type: 'stamina/recover', periods: 1 });
          recoveryAt = nextRecovery;
        }
      }
    } finally { pumping = false; }
    coveredUntil = Math.max(coveredUntil, clock.wallNow());
    if (status.running && now - heartbeatAt >= rules.heartbeatIntervalMs) {
      store.dispatch({ type: 'time/heartbeat' });
      heartbeatAt = now;
    }
  };
  const schedule = () => {
    cancel();
    if (!status.running) return;
    const token = generation;
    const now = clock.monotonicNow();
    const delay = Math.max(0, Math.min(tickAt + rules.tickMs, heartbeatAt + rules.heartbeatIntervalMs,
      recoveryAt + rules.stamina.recoveryIntervalMs) - now);
    timer = scheduler.schedule(() => {
      if (token !== generation || !active) return;
      timer = undefined;
      pump();
      schedule();
    }, delay);
  };
  const observeStore = () => {
    const state = store.getSnapshot();
    const activity = state.character?.activity;
    if (activity !== observedActivity) {
      observedActivity = activity;
      if (!pumping) recoveryAt = clock.monotonicNow();
    }
    const pending = !!state.expedition?.pendingAmbush;
    if (pending !== status.ambushPending) {
      const wasRunning = status.running;
      publish({ ambushPending: pending });
      if (status.running && !wasRunning) {
        reanchor();
        store.dispatch({ type: 'time/heartbeat' });
      }
      schedule();
    } else if (!pumping) schedule();
  };
  const transition = (patch: Partial<SessionStatus>) => {
    pump();
    const wasRunning = status.running;
    publish(patch);
    if (status.running && !wasRunning) {
      // 정지 구간과 남은 부분 틱은 재개 시 소급하지 않는다.
      reanchor();
      store.dispatch({ type: 'time/heartbeat' });
    }
    schedule();
  };
  return Object.freeze({
    getSnapshot: () => status,
    synchronize() { pump(); schedule(); },
    resetAfterRestore() {
      // 다른 탐험의 실행 완료 시각/부분 주기/이동 제한을 가져온 파일에 물려주지 않는다.
      coveredUntil = 0;
      nextMoveAt = -Infinity;
      observedActivity = store.getSnapshot().character?.activity;
      reanchor();
      publish({ ambushPending: !!store.getSnapshot().expedition?.pendingAmbush });
      schedule();
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (active) return;
      active = true;
      observedActivity = store.getSnapshot().character?.activity;
      unsubscribe = store.subscribe(observeStore);
      reanchor();
      publish({ ambushPending: !!store.getSnapshot().expedition?.pendingAmbush });
      if (status.running) store.dispatch({ type: 'time/heartbeat' });
      schedule();
    },
    stop() { if (!active) return; active = false; unsubscribe?.(); unsubscribe = undefined; cancel(); publish({}); },
    setPaused(paused: boolean) { transition({ paused, ...(paused ? {} : { gapPaused: false }) }); },
    setSettingsOpen(settingsOpen: boolean) { transition({ settingsOpen }); },
    setResting(resting: boolean) {
      pump();
      schedule();
      if (!status.running) return { ok: false, reason: 'paused' } as const;
      return store.dispatch({ type: resting ? 'rest/start' : 'rest/stop' });
    },
    resolveAmbush(result: AmbushResult) {
      return store.dispatch({ type: 'ambush/resolve', result });
    },
    returnToCamp() {
      // 마감이 지난 기존 시간 처리를 먼저 한다. 귀환 자체의 추가 시간/이동 대기는 없다.
      pump();
      schedule();
      if (!status.running) return { ok: false, reason: 'paused' } as const;
      const result = store.dispatch({ type: 'map/return' });
      if (result.ok) {
        recoveryAt = clock.monotonicNow();
        schedule();
      }
      return result;
    },
    move(direction: Direction) {
      pump();
      schedule();
      if (!status.running) return { ok: false, reason: 'paused' } as const;
      const now = clock.monotonicNow();
      if (now < nextMoveAt) return { ok: false, reason: 'cooldown' } as const;
      const result = store.dispatch({ type: 'move/step', direction });
      if (result.ok) {
        nextMoveAt = now + rules.minimumMoveIntervalMs;
        // 성공한 이동만 회복 대기를 다시 센다. 전역 틱과 하트비트는 유지한다.
        recoveryAt = now;
        schedule();
      }
      return result;
    },
  });
}
