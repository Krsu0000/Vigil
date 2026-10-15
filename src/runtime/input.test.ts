import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindMovementKeys, createMovementInput, movementDirection } from './input.ts';

const scheduler = { schedule: (callback: () => void, delay: number) => setTimeout(callback, delay), cancel: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
afterEach(() => vi.useRealTimers());

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
    const move = vi.fn((_direction: string) => true);
    const dispose = bindMovementKeys(target, createMovementInput(move, 100, scheduler));
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
    const move = vi.fn((_direction: string) => true);
    const dispose = bindMovementKeys(target, createMovementInput(move, 100, scheduler));
    target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowRight', [modifier]: true }));
    expect(move).not.toHaveBeenCalled();
    dispose();
  });
});


describe('누르고 있는 이동 입력', () => {
  const setup = () => {
    vi.useFakeTimers();
    const move = vi.fn((_direction: string) => true);
    const input = createMovementInput(move, 100, scheduler);
    const target = new EventTarget();
    const dispose = bindMovementKeys(target, input);
    const key = (type: string, key = 'ArrowRight', extra = {}) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { key, ...extra }));
    return { move, input, target, dispose, key };
  };

  it('첫 입력은 즉시, 이후 100ms마다 OS 반복 없이 움직이고 해제하면 멈춘다', () => {
    const { move, key, dispose } = setup();
    key('keydown'); expect(move).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(99); expect(move).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(move).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(200); expect(move).toHaveBeenCalledTimes(4);
    key('keyup'); vi.advanceTimersByTime(500); expect(move).toHaveBeenCalledTimes(4);
    dispose();
  });

  it('OS 반복과 같은 키의 중복 누름은 추가 이동이나 타이머를 만들지 않는다', () => {
    const { move, key, dispose } = setup();
    key('keydown'); vi.advanceTimersByTime(50);
    key('keydown', 'ArrowRight', { repeat: true }); key('keydown');
    expect(move).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50); expect(move).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1); dispose();
  });

  it('단타 뒤에는 예약 이동이 남지 않는다', () => {
    const { move, key, dispose } = setup();
    key('keydown'); vi.advanceTimersByTime(20); key('keyup');
    vi.advanceTimersByTime(1_000); expect(move).toHaveBeenCalledTimes(1); dispose();
  });

  it('마지막 누른 방향을 우선하고 해제하면 아직 누른 방향으로 돌아간다', () => {
    const { move, key, dispose } = setup();
    key('keydown', 'ArrowRight'); vi.advanceTimersByTime(100);
    key('keydown', 'ArrowDown'); vi.advanceTimersByTime(100);
    expect(move.mock.calls.map(([direction]) => direction)).toEqual(['east', 'east', 'south', 'south']);
    key('keyup', 'ArrowDown'); vi.advanceTimersByTime(100);
    expect(move).toHaveBeenLastCalledWith('east'); dispose();
  });

  it('우선하지 않는 키의 해제는 반복 주기를 바꾸지 않는다', () => {
    const { move, key, dispose } = setup();
    key('keydown', 'ArrowRight'); key('keydown', 'ArrowDown'); vi.advanceTimersByTime(50);
    key('keyup', 'ArrowRight'); vi.advanceTimersByTime(50);
    expect(move).toHaveBeenCalledTimes(3); expect(move).toHaveBeenLastCalledWith('south'); dispose();
  });

  it.each(['blur', 'pagehide'])('%s 뒤에는 다시 눌러야 움직인다', type => {
    const { move, key, target, dispose } = setup();
    key('keydown'); target.dispatchEvent(new Event(type)); vi.advanceTimersByTime(500);
    key('keydown', 'ArrowRight', { repeat: true }); expect(move).toHaveBeenCalledTimes(1);
    key('keyup'); key('keydown'); expect(move).toHaveBeenCalledTimes(2); dispose();
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'isComposing'])('누르는 중 %s가 적용되면 반복을 해제한다', modifier => {
    const { move, key, dispose } = setup();
    key('keydown'); key('keydown', 'ArrowRight', { [modifier]: true });
    vi.advanceTimersByTime(500); expect(move).toHaveBeenCalledTimes(1); dispose();
  });

  it('Tab 등 다른 명령으로 전환하면 반복을 해제한다', () => {
    const { move, key, dispose } = setup();
    key('keydown'); key('keydown', 'Tab'); vi.advanceTimersByTime(500);
    expect(move).toHaveBeenCalledTimes(1); dispose();
  });

  it('키 코드를 사용해 Shift 해제 뒤에도 같은 키를 해제한다', () => {
    const { move, key, dispose } = setup();
    key('keydown', 'W', { code: 'KeyW' }); key('keyup', 'w', { code: 'KeyW' });
    vi.advanceTimersByTime(500); expect(move).toHaveBeenCalledExactlyOnceWith('north'); dispose();
  });

  it.each(['pointerup', 'pointercancel'])('포인터 %s는 버튼 밖에서도 해당 입력을 해제한다', type => {
    const { move, input, target, dispose } = setup();
    input.press('pointer:7', 'east');
    target.dispatchEvent(Object.assign(new Event(type), { pointerId: 8 }));
    vi.advanceTimersByTime(100); expect(move).toHaveBeenCalledTimes(2);
    target.dispatchEvent(Object.assign(new Event(type), { pointerId: 7 }));
    vi.advanceTimersByTime(500); expect(move).toHaveBeenCalledTimes(2); dispose();
  });

  it('화면 숨김은 입력을 지우고 복귀해도 재시작하지 않는다', () => {
    const { move, input, target, dispose } = setup();
    const documentTarget = Object.assign(new EventTarget(), { hidden: false });
    const unbind = bindMovementKeys(target, input, documentTarget as unknown as Document);
    input.press('pointer:1', 'east'); documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    documentTarget.hidden = false; documentTarget.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(500); expect(move).toHaveBeenCalledTimes(1); unbind(); dispose();
  });

  it('벽·자원 부족·정지로 이동이 거부되면 자동 재시도하지 않는다', () => {
    const { move, input, dispose } = setup();
    input.press('pointer:1', 'east'); move.mockReturnValue(false);
    vi.advanceTimersByTime(100); move.mockReturnValue(true); vi.advanceTimersByTime(1_000);
    expect(move).toHaveBeenCalledTimes(2); dispose();
  });

  it('이동 도중 정지 구독이 해제하면 타이머를 다시 만들지 않는다', () => {
    vi.useFakeTimers();
    const move = vi.fn(() => { input.clear(); return true; });
    const input = createMovementInput(move, 100, scheduler);
    input.press('key:ArrowRight', 'east'); vi.advanceTimersByTime(500);
    expect(move).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it('취소된 콜백은 해제·새 누름 뒤에도 실행되지 않으며 지연 이동을 몰아서 처리하지 않는다', () => {
    const callbacks: (() => void)[] = [];
    const move = vi.fn((_direction: string) => true);
    const input = createMovementInput(move, 100, { schedule: callback => { callbacks.push(callback); return callbacks.length; }, cancel: () => {} });
    input.press('key:ArrowRight', 'east'); input.clear(); input.press('key:ArrowDown', 'south');
    callbacks[0]!(); expect(move).toHaveBeenCalledTimes(2);
    callbacks[1]!(); expect(move).toHaveBeenCalledTimes(3); expect(callbacks).toHaveLength(3);
    input.clear(); callbacks[2]!(); expect(move).toHaveBeenCalledTimes(3);
  });

  it('연결 해제 뒤 반복과 입력 리스너를 모두 제거한다', () => {
    const { move, key, dispose } = setup();
    key('keydown'); dispose(); vi.advanceTimersByTime(500); key('keydown');
    expect(move).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
