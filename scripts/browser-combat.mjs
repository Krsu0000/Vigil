import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkCombat({ page, width, artifacts, readSlot }) {
  const move = async key => { await page.locator('.map-grid').focus(); await page.clock.runFor(100); await page.keyboard.press(key); };
  const button = name => page.getByRole('button', { name, exact: true });
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp']) await move(key);
  await page.getByRole('dialog', { name: '적과 조우했습니다' }).waitFor(); await button('전투 시작').click();
  let panel = page.getByTestId('combat-panel'); await panel.waitFor();
  assert.equal(await panel.getByRole('button', { name: '공격', exact: true }).count(), 1);
  assert.equal(await panel.getByRole('button', { name: '방어', exact: true }).count(), 1);
  const tick = await page.getByTestId('clock').textContent(); const stamina = await panel.getByTestId('stamina').textContent();
  await page.clock.runFor(5000); assert.equal(await page.getByTestId('clock').textContent(), tick); assert.equal(await panel.getByTestId('stamina').textContent(), stamina);
  await page.keyboard.press('ArrowDown'); assert.equal(await page.getByTestId('position').textContent(), '(5, 1)');
  await panel.getByRole('button', { name: '방어', exact: true }).click(); await panel.getByRole('button', { name: '공격', exact: true }).click();
  await panel.getByRole('button', { name: '아이템', exact: true }).click(); await panel.getByRole('button', { name: '여행 식량 ×2', exact: true }).click();
  await page.clock.runFor(5000); const activeSave = await readSlot(page); assert.equal(activeSave.state.expedition.combat.actions.length, 3);
  await page.screenshot({ path: path.join(artifacts, `combat-${width}.png`), fullPage: true });
  const rect = await panel.boundingBox(); if (width === 1440) assert.equal(rect.width, 480); else assert.equal(rect.y, 214);
  assert(!await panel.evaluate(el => el.scrollWidth > el.clientWidth)); assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await page.reload(); panel = page.getByTestId('combat-panel'); await panel.waitFor();
  assert((await panel.locator('header').textContent()).includes('4턴'));
  for (let turns = 0; turns < 10 && await panel.getByRole('button', { name: '기술', exact: true }).count(); turns += 1) await panel.getByRole('button', { name: '기술', exact: true }).click();
  assert((await panel.locator('.combat-result').textContent()).includes('승리')); await button('계속 탐험').click();
  await page.clock.runFor(5000); const won = await readSlot(page); assert.equal(won.state.expedition.defeatedEnemies['encounter.wolf_pack'], true);
  assert.equal(won.state.character.inventory.stacks['item.travel_ration'], 3);
  // 다른 적에게서 실제 도주를 확인한다. 고정 시드와 행동 수열로 재현한다.
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight']) await move(key);
  await button('전투 시작').click(); panel = page.getByTestId('combat-panel');
  for (let tries = 0; tries < 6 && await panel.getByRole('button', { name: '도주 60%', exact: true }).count(); tries += 1) await panel.getByRole('button', { name: '도주 60%', exact: true }).click();
  assert((await panel.locator('.combat-result').textContent()).includes('도주 성공')); assert.equal(await page.getByTestId('position').textContent(), '(6, 3)');
  await button('계속 탐험').click(); await move('ArrowRight'); await page.getByRole('dialog', { name: '적과 조우했습니다' }).waitFor();
  return { width, combatFiveActions: true, frozenRealTime: true, combatReload: true, lootOnce: true, fleeRetreatAndEnemyRemains: true, panelGeometry: true };
}
