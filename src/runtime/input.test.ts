import { describe, expect, it, vi } from 'vitest';
import { bindMovementKeys, movementDirection } from './input.ts';

describe('이동 키 연결', () => {
  it.each([
    ['ArrowUp', 'north'], ['ArrowDown', 'south'], ['ArrowLeft', 'west'], ['ArrowRight', 'east'],
    ['w', 'north'], ['W', 'north'], ['a', 'west'], ['s', 'south'], ['d', 'east'],
  ])('%s를 %s로 연결한다', (key, direction) => {
    expect(movementDirection(key)).toBe(direction);
  });

  it.each(['Enter', ' ', 'constructor', 'toString'])('다른 키 %s는 이동시키지 않는다', (key) => {
    expect(movementDirection(key)).toBeUndefined();
  });

  it('키 이벤트는 한 번 이동시키고 해제 후에는 호출하지 않는다', () => {
    const target = new EventTarget();
    const move = vi.fn();
    const dispose = bindMovementKeys(target, move);
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' });
    target.dispatchEvent(event);
    expect(move).toHaveBeenCalledExactlyOnceWith('east');
    expect(event.defaultPrevented).toBe(true);
    dispose();
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' }));
    expect(move).toHaveBeenCalledOnce();
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'isComposing'])('%s 상태에서는 이동을 처리하지 않는다', (modifier) => {
    const target = new EventTarget();
    const move = vi.fn();
    const dispose = bindMovementKeys(target, move);
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight', [modifier]: true }));
    expect(move).not.toHaveBeenCalled();
    dispose();
  });
});
