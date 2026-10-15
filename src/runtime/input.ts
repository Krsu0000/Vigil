import type { Direction } from '../engine/systems/map/actions.ts';
import type { Scheduler } from './clock.ts';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
  w: 'north', s: 'south', a: 'west', d: 'east',
};

export function movementDirection(key: string): Direction | undefined {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return Object.hasOwn(KEY_DIRECTIONS, normalized) ? KEY_DIRECTIONS[normalized] : undefined;
}

// 입력 의도만 보관한다. 상태 변경과 최소 이동 간격 검증은 기존 loop.move를 거친다.
// move는 성공/쿨다운에는 true, 벽/자원 부족/정지에는 false를 반환한다.
export function createMovementInput(move: (direction: Direction) => boolean, intervalMs: number, scheduler: Scheduler) {
  const held = new Map<string, Direction>();
  let timer: unknown;
  let generation = 0;
  const cancel = () => {
    generation += 1;
    if (timer !== undefined) scheduler.cancel(timer);
    timer = undefined;
  };
  const clear = () => { cancel(); held.clear(); };
  const schedule = () => {
    cancel();
    const token = generation;
    timer = scheduler.schedule(() => {
      if (token !== generation) return;
      timer = undefined;
      step();
    }, intervalMs);
  };
  const step = () => {
    const direction = [...held.values()].at(-1);
    if (!direction) return;
    if (!move(direction)) { clear(); return; }
    // 이동 중 습격/정지 구독이 입력을 해제했을 수 있다. 밀린 이동은 재생하지 않는다.
    if (held.size) schedule();
  };
  return Object.freeze({
    press(source: string, direction: Direction) {
      if (held.has(source)) return;
      cancel();
      held.set(source, direction);
      step();
    },
    release(source: string) {
      const active = [...held.keys()].at(-1) === source;
      if (!held.delete(source) || !active) return;
      cancel();
      if (held.size) schedule();
    },
    clear,
  });
}

const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const isEditing = (target: EventTarget | null) => typeof Element !== 'undefined' &&
  target instanceof Element && !!target.closest(editableSelector);
const keySource = (event: KeyboardEvent) => `key:${event.code || event.key.toLowerCase()}`;

export function bindMovementKeys(target: EventTarget, input: ReturnType<typeof createMovementInput>, visibilityTarget?: Document): () => void {
  const keydown = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || isEditing(event.target)) {
      input.clear(); return;
    }
    if (event.defaultPrevented) return;
    const direction = movementDirection(event.key);
    if (!direction) { input.clear(); return; }
    event.preventDefault();
    // OS의 초기 반복 지연과 반복 속도를 사용하지 않는다. 해제 뒤 들어온 반복도 무시한다.
    if (!event.repeat) input.press(keySource(event), direction);
  };
  const keyup = (raw: Event) => input.release(keySource(raw as KeyboardEvent));
  const pointerEnd = (raw: Event) => input.release(`pointer:${(raw as PointerEvent).pointerId}`);
  const clear = () => input.clear();
  const visibility = () => { if (visibilityTarget?.hidden) clear(); };
  const focus = (event: Event) => { if (isEditing(event.target)) clear(); };
  const bindings = [
    ['keydown', keydown], ['keyup', keyup], ['pointerup', pointerEnd], ['pointercancel', pointerEnd],
    ['blur', clear], ['pagehide', clear], ['focusin', focus],
  ] as const;
  for (const [name, handler] of bindings) target.addEventListener(name, handler);
  visibilityTarget?.addEventListener('visibilitychange', visibility);
  return () => {
    clear();
    for (const [name, handler] of bindings) target.removeEventListener(name, handler);
    visibilityTarget?.removeEventListener('visibilitychange', visibility);
  };
}
