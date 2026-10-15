import { describe, expect, it } from 'vitest';
import { mapWindow } from './map-window.ts';

describe('큰 맵의 표시 범위', () => {
  it('작은 맵 전체·스크롤 중간·오른쪽 아래를 실제 좌표로 제한한다', () => {
    expect(mapWindow(9, 7, -20, -10, 600, 300, 32)).toEqual({ x0: 0, y0: 0, x1: 9, y1: 7 });
    expect(mapWindow(1000, 1000, 3200, 6400, 320, 200, 32)).toEqual({ x0: 99, y0: 199, x1: 111, y1: 208 });
    expect(mapWindow(1000, 1000, 31900, 31900, 320, 200, 32)).toEqual({ x0: 995, y0: 995, x1: 1000, y1: 1000 });
  });
  it('맵 크기가 커져도 같은 화면의 생성 칸 수는 일정하다', () => {
    const count = (size: number) => {
      const w = mapWindow(size, size, 100, 100, 600, 284, 24);
      return (w.x1 - w.x0) * (w.y1 - w.y0);
    };
    expect(count(128)).toBe(count(1024));
    expect(count(1024)).toBeLessThan(400);
  });
});
