// 지형 그래프의 네 방향 연결 검사. 입력은 완전한 직사각형 배치이며 1이 이동 가능 칸이다.
// 재귀/Array.shift 없이 각 칸을 최대 한 번 방문한다.
export function reachableCells(width: number, height: number, walkable: Uint8Array, start: number): Uint8Array {
  const seen = new Uint8Array(walkable.length);
  if (!walkable[start]) return seen;
  const queue = new Uint32Array(walkable.length);
  let head = 0, tail = 1;
  queue[0] = start; seen[start] = 1;
  const visit = (next: number) => {
    if (walkable[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
  };
  while (head < tail) {
    const index = queue[head++]!, x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1);
    if (x + 1 < width) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y + 1 < height) visit(index + width);
  }
  return seen;
}
