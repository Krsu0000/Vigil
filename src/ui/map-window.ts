export type MapWindow = Readonly<{ x0: number; y0: number; x1: number; y1: number }>;

// 화면 밖 한 줄도 그려 스크롤 도중의 빈틈을 줄인다.
export function mapWindow(columns: number, rows: number, x: number, y: number,
  width: number, height: number, cellSize: number): MapWindow {
  return {
    x0: Math.min(columns, Math.max(0, Math.floor(x / cellSize) - 1)),
    y0: Math.min(rows, Math.max(0, Math.floor(y / cellSize) - 1)),
    x1: Math.min(columns, Math.max(0, Math.ceil((x + width) / cellSize) + 1)),
    y1: Math.min(rows, Math.max(0, Math.ceil((y + height) / cellSize) + 1)),
  };
}
