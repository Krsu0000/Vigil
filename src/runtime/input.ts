import type { Direction } from '../engine/systems/map/actions.ts';

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
  w: 'north', s: 'south', a: 'west', d: 'east',
};

export function movementDirection(key: string): Direction | undefined {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  return Object.hasOwn(KEY_DIRECTIONS, normalized) ? KEY_DIRECTIONS[normalized] : undefined;
}

export function bindMovementKeys(target: EventTarget, move: (direction: Direction) => void): () => void {
  const handler = (raw: Event) => {
    const event = raw as KeyboardEvent;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    if (typeof Element !== 'undefined' && event.target instanceof Element &&
      event.target.closest('dialog[open], input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const direction = movementDirection(event.key);
    if (!direction) return;
    event.preventDefault();
    move(direction);
  };
  target.addEventListener('keydown', handler);
  return () => { target.removeEventListener('keydown', handler); };
}
