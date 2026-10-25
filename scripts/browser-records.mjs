import assert from 'node:assert/strict';

export async function checkRecords({ page, width, readSlot }) {
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  await nav.getByRole('button', { name: '소지품', exact: true }).click();
  const panel = width > 760 ? page.getByRole('dialog', { name: '소지품', exact: true }) : page.locator('.tab-page');
  await panel.getByRole('button', { name: '탐험용 장화 1개', exact: true }).click();
  // 실제 장착/해제로 100개 상한을 넘긴다. 짝수 번이므로 장착 상태는 그대로다.
  for (let i = 0; i < 106; i++) await panel.getByRole('button', { name: i % 2 ? '장착' : '해제', exact: true }).click();
  if (width > 760) await page.getByRole('button', { name: '소지품 닫기', exact: true }).click();
  else await nav.getByRole('button', { name: '탐험', exact: true }).click();
  await page.clock.runFor(5000);
  const saved = await readSlot(page); const records = saved.state.campaign.recentRecords;
  assert.equal(records.length, 100); assert(records.every(entry => !/길로 이동|길을 확인/.test(entry.text)));
  const times = await page.getByRole('region', { name: '최근 기록', exact: true }).getByTestId('record-time').allTextContents();
  assert(times.length > 0); assert(times.every(value => /^\d{2}:\d{2}$/.test(value)));
  await page.reload(); await page.getByTestId('position').waitFor();
  const restored = await readSlot(page); assert.deepEqual(restored.state.campaign.recentRecords, records);
  assert((await page.getByRole('region', { name: '최근 기록', exact: true }).textContent()).includes('탐험용 장화'));
  const view = page.locator('.map-viewport'); const initial = await view.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop }));
  await view.hover(); await page.mouse.wheel(240, 240);
  assert.deepEqual(await view.evaluate(el => ({ x: el.scrollLeft, y: el.scrollTop })), initial);
  assert.equal(await view.evaluate(el => getComputedStyle(el).overflow), 'hidden');
  await page.locator('.map-grid').focus(); await page.clock.runFor(100); await page.keyboard.press('ArrowLeft');
  const height = await view.evaluate(el => el.clientHeight); if (width > 760) assert(height >= 120, 'HUD 도크 도입 후에도 지도에 최소 120px 표시 영역이 필요하다');
  await page.clock.runFor(100); await page.keyboard.press('ArrowRight');
  await page.clock.runFor(5000); assert.deepEqual((await readSlot(page)).state.campaign.recentRecords, records);
  return { width, recentRecordsCap100: true, realTime24h: true, recordsReload: true, noMovementRecords: true, mapCameraNoManualPan: true };
}
