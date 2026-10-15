import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindInteractionKeys, bindMovementKeys, movementDirection } from './input.ts';

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


describe('자동 반복 제거 회귀', () => {
  afterEach(() => vi.useRealTimers());
  it('키를 누른 뒤 추가 이벤트가 없으면 시간이 지나도 스스로 이동하지 않는다', () => {
    vi.useFakeTimers();
    const target = new EventTarget(); const move = vi.fn(); const dispose = bindMovementKeys(target, move);
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' }));
    vi.advanceTimersByTime(5_000);
    expect(move).toHaveBeenCalledExactlyOnceWith('east'); expect(vi.getTimerCount()).toBe(0); dispose();
  });
  it('OS 반복 이벤트도 별도 입력으로 전달하고 연결 해제 후에는 전달하지 않는다', () => {
    const target = new EventTarget(); const move = vi.fn(); const dispose = bindMovementKeys(target, move);
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight' }));
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowDown', repeat: true }));
    expect(move.mock.calls).toEqual([['east'], ['south']]); dispose();
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowDown', repeat: true }));
    expect(move).toHaveBeenCalledTimes(2);
  });
});

describe('상호작용 단축키', () => {
  afterEach(() => vi.unstubAllGlobals());
  const press = (target: EventTarget, properties: object) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), properties);
    target.dispatchEvent(event); return event;
  };
  it.each([{ key: 'z' }, { key: 'Z' }, { key: 'ㅋ', code: 'KeyZ' }, { key: ' ' }, { key: '', code: 'Space' }])('Z/스페이스바를 한 번 실행하고 기본 스크롤을 막는다: %j', properties => {
    const target = new EventTarget(), interact = vi.fn(); const dispose = bindInteractionKeys(target, interact);
    expect(press(target, properties).defaultPrevented).toBe(true); expect(interact).toHaveBeenCalledOnce();
    dispose();press(target, properties);expect(interact).toHaveBeenCalledOnce();
  });
  it.each(['z',' '])('길게 누른 %s 반복은 실행하지 않고 스크롤만 막는다', key => {
    const target=new EventTarget(),interact=vi.fn();const dispose=bindInteractionKeys(target,interact);
    press(target,{key});expect(press(target,{key,repeat:true}).defaultPrevented).toBe(true);
    expect(interact).toHaveBeenCalledOnce();dispose();
  });
  it.each(['altKey','ctrlKey','metaKey','isComposing'])('%s 조합은 가로채지 않는다', modifier => {
    const target=new EventTarget(),interact=vi.fn();const dispose=bindInteractionKeys(target,interact);
    expect(press(target,{key:'z',[modifier]:true}).defaultPrevented).toBe(false);expect(interact).not.toHaveBeenCalled();dispose();
  });
  it('모달/입력 필드/포커스된 버튼은 가로채지 않아 기본 클릭이 중복되지 않는다', () => {
    class FocusTarget extends EventTarget {
      selector: string;
      constructor(selector: string) { super(); this.selector = selector; }
      closest(selector: string) { return selector.includes(this.selector) ? this : null; }
    }
    vi.stubGlobal('Element', FocusTarget);
    for (const selector of ['dialog[open]', 'input', 'textarea', 'select', '[contenteditable]', 'button', 'a[href]', 'summary', '[role="button"]']) {
      const target = new FocusTarget(selector === '[contenteditable]' ? '[contenteditable]' : selector), interact = vi.fn();
      const dispose=bindInteractionKeys(target,interact);
      expect(press(target,{key:' '}).defaultPrevented).toBe(false);expect(interact).not.toHaveBeenCalled();dispose();
    }
  });
  it('다른 처리에서 소비한 키와 이동 키는 처리하지 않는다', () => {
    const target=new EventTarget(),interact=vi.fn();const dispose=bindInteractionKeys(target,interact);
    const consumed=Object.assign(new Event('keydown',{cancelable:true}),{key:'z'});consumed.preventDefault();target.dispatchEvent(consumed);
    press(target,{key:'ArrowRight'});press(target,{key:'Enter'});expect(interact).not.toHaveBeenCalled();dispose();
  });
});
