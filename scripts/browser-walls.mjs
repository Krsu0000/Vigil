import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkWalls({ page, width, artifacts }) {
  const move = async key => { await page.locator('.map-grid').focus(); await page.clock.runFor(100); await page.keyboard.press(key); };
  const check = async (x, y) => {
    const wall = page.locator(`.map-cell[data-x="${x}"][data-y="${y}"]`);
    assert((await wall.getAttribute('class')).includes('is-wall'));
    const appearance = await wall.evaluate(cell => {
      const object = cell.querySelector('.wall-object');
      const player = document.querySelector('.map-cell.is-player');
      const cs = getComputedStyle(cell), os = getComputedStyle(object);
      return { fill: cs.backgroundColor, border: os.borderTopWidth, borderStyle: os.borderTopStyle, objectFill: os.backgroundColor,
        width: object.getBoundingClientRect().width, height: object.getBoundingClientRect().height,
        cellWidth: cell.getBoundingClientRect().width, cellHeight: cell.getBoundingClientRect().height,
        playerWidth: player.getBoundingClientRect().width };
    });
    assert.equal(appearance.fill, 'rgba(0, 0, 0, 0)');
    assert.equal(appearance.border, '0px'); assert.equal(appearance.objectFill, 'rgb(150, 150, 150)');
    assert.equal(appearance.width, appearance.cellWidth); assert.equal(appearance.height, appearance.cellHeight);
    assert.equal(appearance.width, appearance.playerWidth);
  };
  await check(1, 0); await check(0, 1); await check(0, 0);
  await move('ArrowUp'); assert.equal(await page.getByTestId('position').textContent(), '(1, 1)');
  // 사진처럼 아래·오른쪽 벽이 함께 보이는 모서리. 모든 경로는 안전 구역이다.
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight']) await move(key);
  assert.equal(await page.getByTestId('position').textContent(), '(3, 5)');
  await check(4, 5); await check(3, 6);
  await move('ArrowRight'); await move('ArrowDown');
  assert.equal(await page.getByTestId('position').textContent(), '(3, 5)');
  await page.screenshot({ path: path.join(artifacts, `wall-corner-${width}.png`), fullPage: true });
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await move(key);
  assert.equal(await page.getByTestId('position').textContent(), '(1, 1)');
  // 지나온 길의 왼쪽/아래 경계와 바깥 모서리가 한 겹으로 이어진다.
  for (let y = 0; y <= 6; y++) await check(0, y);
  for (let x = 0; x <= 4; x++) await check(x, 6);
  await page.screenshot({ path: path.join(artifacts, `wall-boundary-${width}.png`), fullPage: true });
  return { width, wallsUseDistinctSolidTiles: true, wallObjectOneCell: true, cornerWallsAndCollision: true, knownBoundaryPersists: true };
}
