import assert from 'node:assert/strict';
import path from 'node:path';

// 배포 빌드의 실제 입력과 IndexedDB를 통해 검사한다. 제품 전역에 Store를 노출하지 않는다.
export async function checkInventory({ page, width, artifacts, readSlot, font }) {
  const button = name => page.getByRole('button', { name, exact: true });
  const move = async key => { await page.clock.runFor(100); await page.keyboard.press(key); };
  await button('재개').click();
  // (1,1) → (3,1): 보급 상자. 아직 보지 못한 폐허 상자는 DOM에 노출하지 않는다.
  assert.equal(await page.getByRole('gridcell', { name: '폐허의 상자 (5, 3)', exact: true }).count(), 0);
  await move('ArrowRight'); await move('ArrowRight');
  assert.equal(await page.getByTestId('position').textContent(), '(3, 1)');
  const chestButton = button('상자 열기');
  // 일시정지 중 단축키로 획득할 수 없다.
  await button('일시정지').click(); await page.locator('.map-grid').focus();
  await page.keyboard.press('z'); assert.equal(await page.getByTestId('chest-status').count(), 0);
  await button('재개').click(); await page.locator('.map-grid').focus();
  if (width === 390) await page.keyboard.press('z');
  else if (width === 320) await page.keyboard.press('Space');
  else await chestButton.click();
  assert(await chestButton.isDisabled());
  const receipt = await page.getByTestId('chest-status').textContent();
  assert(receipt.includes('상자를 열어 다음 물품을 얻었습니다.'));
  assert(receipt.includes('여행 식량 ×3')); assert(receipt.includes('탐험용 장화 ×1'));
  assert(!receipt.includes('이미 연 상자입니다.'));
  // 반복 입력으로 획득 결과가 빈 상자 안내로 덮이지 않는다.
  await page.locator('.map-grid').focus(); await page.keyboard.press('z');
  assert.equal(await page.getByTestId('chest-status').textContent(), receipt);
  if (width < 500) assert(await page.locator('.chest-controls').evaluate(el =>
    el.getBoundingClientRect().width > el.closest('.travel-panel').clientWidth * 0.7));
  await page.screenshot({ path: path.join(artifacts, `chest-receipt-${width}.png`), fullPage: true });
  await move('ArrowLeft'); await move('ArrowRight');
  assert.equal(await page.getByTestId('chest-status').textContent(), '이미 연 상자입니다.');
  await button('소지품').click();
  const dialog = page.getByRole('dialog', { name: '소지품', exact: true });
  await dialog.waitFor();
  const food = dialog.locator('[data-item-id="item.travel_ration"]');
  assert((await food.textContent()).includes('×3'));
  assert.equal(await page.getByTestId('inventory-weight').textContent(), '1550 g');
  assert(await button('먹기').isDisabled());
  // 소지품 내부 화살표 키는 지도 이동으로 새지 않는다.
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('z');
  assert.equal(await page.getByTestId('position').textContent(), '(3, 1)');
  await button('장착').click();
  assert((await page.getByTestId('inventory-move-cost').textContent()).includes('미탐사 4 · 탐사 경로 2'));
  assert.equal(await page.getByTestId('inventory-weight').textContent(), '1550 g');
  await button('소지품 닫기').click();
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight']) await move(key);
  assert.equal(await page.getByTestId('stamina').textContent(), '896 / 900');
  await button('소지품').click();
  const tickBefore = await page.getByTestId('game-time').textContent();
  // 현재 시드의 첫 위험 대기 틱에서 습격이 없고 소지품 창을 유지한 채 회복한다.
  await page.clock.runFor(2000);
  assert.notEqual(await page.getByTestId('game-time').textContent(), tickBefore);
  await dialog.waitFor();
  assert.equal(await page.getByTestId('inventory-stamina').textContent(), '897 / 900');
  await button('먹기').click();
  assert.equal(await page.getByTestId('inventory-stamina').textContent(), '900 / 900');
  assert((await food.textContent()).includes('×2'));
  assert.equal(await page.getByTestId('inventory-weight').textContent(), '1300 g');
  await button('해제').click();
  assert((await page.getByTestId('inventory-move-cost').textContent()).includes('미탐사 6 · 탐사 경로 3'));
  await button('장착').click();
  await font(page);
  assert(!await dialog.evaluate(el => el.scrollWidth > el.clientWidth));
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await page.screenshot({ path: path.join(artifacts, `inventory-${width}.png`), fullPage: true });
  await button('소지품 닫기').click();
  await button('거점으로 귀환').click();
  await page.clock.runFor(5000);
  const saved = await readSlot(page);
  assert.equal(saved.schemaVersion, 5);
  assert.equal(saved.state.character.inventory.equipment.feet, 'item.trail_boots');
  assert.equal(saved.state.character.inventory.stacks['item.travel_ration'], 2);
  assert.equal(saved.state.campaign.openedChests['chest.camp_supply'], true);
  await page.reload(); await page.getByTestId('position').waitFor();
  await button('소지품').click();
  assert((await dialog.locator('[data-item-id="item.travel_ration"]').textContent()).includes('×2'));
  assert((await page.getByTestId('inventory-move-cost').textContent()).includes('미탐사 4 · 탐사 경로 2'));
  await button('소지품 닫기').click();
  await move('ArrowRight'); await move('ArrowRight'); assert(await chestButton.isDisabled());
  assert.equal(await page.getByTestId('chest-status').textContent(), '이미 연 상자입니다.');
  return { width, inventoryLootUseEquip: true, lootReceipt: true, interactionShortcut: width === 390 ? 'Z' : width === 320 ? 'Space' : 'button', recoveryWithInventoryOpen: true, persistedInventory: true, noHorizontalOverflow: true };
}
