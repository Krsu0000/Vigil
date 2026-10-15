import type { Direction } from '../engine/systems/map/actions.ts';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
  w: 'north', s: 'south', a: 'west', d: 'east',
};

export function movementDirection(key: string): Direction | undefined {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return Object.hasOwn(KEY_DIRECTIONS, normalized) ? KEY_DIRECTIONS[normalized] : undefined;
}

function ignoresGameKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return true;
  return typeof Element !== 'undefined' && event.target instanceof Element &&
    event.target.closest('dialog[open], input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

export function bindInteractionKeys(target: EventTarget, interact: () => void): () => void {
  const handler = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (ignoresGameKey(event)) return;
    if (event.key?.toLowerCase() !== 'z' && event.code !== 'KeyZ' && event.key !== ' ' && event.code !== 'Space') return;
    // 포커스된 컨트롤의 기본 키 동작을 보존해 스페이스 클릭과 중복 실행하지 않는다.
    if (typeof Element !== 'undefined' && event.target instanceof Element &&
      event.target.closest('button, a[href], summary, [role="button"], [role="link"]')) return;
    event.preventDefault();
    if (!event.repeat) interact();
  };
  target.addEventListener('keydown', handler);
  return () => { target.removeEventListener('keydown', handler); };
}

export function bindMovementKeys(target: EventTarget, move: (direction: Direction) => void): () => void {
  const handler = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (ignoresGameKey(event)) return;
    const direction = movementDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    move(direction);
  };
  target.addEventListener('keydown', handler);
  return () => { target.removeEventListener('keydown', handler); };
}
