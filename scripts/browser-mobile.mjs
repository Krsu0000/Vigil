import assert from 'node:assert/strict';
import path from 'node:path';

// 주소창 높이 변화와 회전은 같은 세션에서 viewport를 바꿔 검사한다.
export async function checkMobile({ browser, url, artifacts }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(), errors = [], sizes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-15T01:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-15T01:00:01Z'));
    await page.goto(url); await page.getByTestId('position').waitFor();
    const inspect = async label => {
      await page.clock.runFor(50);
      await page.waitForFunction(() => {
        const player = document.querySelector('.map-cell.is-player')?.getBoundingClientRect();
        const map = document.querySelector('.map-viewport')?.getBoundingClientRect();
        return player && map && player.top >= map.top && player.bottom <= map.bottom;
      });
      const layout = await page.evaluate(() => {
        const rect = selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
        };
        return {
          height:innerHeight, width:innerWidth, scrollHeight:document.scrollingElement.scrollHeight,
          scrollWidth:document.scrollingElement.scrollWidth, scrollY,
          status:rect('.character-column'), map:rect('.map-viewport'), situation:rect('.situation'),
          commands:rect('.exploration-commands'), records:rect('[aria-label="최근 기록"]'), nav:rect('.bottom-tabs'),
          buttons:[...document.querySelectorAll('.exploration-commands button,.bottom-tabs button,.chest-controls button')].map(button => {
            const r = button.getBoundingClientRect(); return { text:button.textContent, top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height };
          }),
        };
      });
      assert(layout.scrollHeight <= layout.height + 1, `${label}: document scroll ${JSON.stringify(layout)}`);
      assert(layout.scrollWidth <= layout.width); assert.equal(layout.scrollY, 0);
      for (const area of ['status','map','situation','commands','records','nav']) {
        const r = layout[area];
        assert(r.y >= 0 && r.bottom <= layout.height + 1 && r.right <= layout.width + 1, `${label}: ${area} outside viewport`);
      }
      assert(layout.map.height >= 56, `${label}: map must retain at least two rows`);
      assert(layout.records.bottom <= layout.commands.y + 1, `${label}: records overlap controls`);
      assert(layout.commands.bottom <= layout.nav.y + 1, `${label}: controls overlap navigation`);
      for (const b of layout.buttons) {
        assert(b.width >= 44 && b.height >= 44, `${label}: tap target ${JSON.stringify(b)}`);
        assert(b.top >= 0 && b.bottom <= layout.nav.bottom && b.left >= 0 && b.right <= layout.width, `${label}: hidden button`);
      }
      // The input dock is the last content region before navigation.
      // No empty interaction button is rendered on an ordinary floor tile.
      const slot = page.locator('.interaction-slot');
      const exists = await slot.count();
      if (!exists) assert.equal(await page.locator('.interaction-empty').count(), 0);
      return layout;
    };
    for (const [width,height] of [[390,844],[390,650],[390,844],[320,568],[360,640],[430,932],[740,360],[568,320],[844,390],[932,430]]) {
      await page.setViewportSize({ width,height });
      const geometry = await inspect(`${width}x${height}`);
      assert.equal(await page.getByTestId('position').textContent(), '(1, 1)');
      sizes.push({ width,height,mapHeight:geometry.map.height });
      await page.screenshot({ path:path.join(artifacts,`mobile-fit-${width}-${height}.png`) });
    }
    // safe area도 실제 레이아웃 공간을 차지하며 조작부 위로 겹치지 않는다.
    await page.setViewportSize({ width:390,height:650 });
    await page.addStyleTag({ content:':root{--safe-top:24px;--safe-bottom:34px}' });
    await inspect('safe-area');
    const nav = page.getByRole('navigation', { name:'주 메뉴' });
    // 짧은 화면에서 획득 품목 안내와 두 줄의 기록까지 함께 표시한다.
    await page.setViewportSize({ width:320,height:568 });
    for (let i=0;i<2;i++) { await page.clock.runFor(100); await page.getByRole('button',{ name:'오른쪽으로 이동',exact:true }).tap(); }
    await page.getByRole('button',{ name:'상자 열기',exact:true }).tap();
    await inspect('short-portrait-chest-with-safe-area');
    assert(await page.getByTestId('chest-status').isVisible());
    assert((await page.getByTestId('chest-status').textContent()).includes('탐험용 장화 ×1'));
    await page.screenshot({ path:path.join(artifacts,'mobile-fit-chest.png') });
    await page.setViewportSize({ width:740,height:360 });
    await page.addStyleTag({ content:':root{--safe-top:0px;--safe-bottom:20px}' });
    await inspect('landscape-chest-with-safe-area');
    // 긴 내용은 탭 안에서 스크롤하고 하단 탐색은 제자리에 남는다.
    await page.setViewportSize({ width:740,height:360 });
    await nav.getByRole('button',{ name:'소지품',exact:true }).tap();
    const tab = page.locator('.tab-page');
    assert(await tab.isVisible()); assert(!await page.locator('.exploration-center').isVisible());
    assert(await tab.evaluate(el => el.scrollHeight > el.clientHeight));
    await tab.evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert(await tab.evaluate(el => el.scrollTop > 0));
    assert.equal(await page.evaluate(() => scrollY),0);
    const feet = tab.getByRole('button',{ name:'탐험용 장화 1개',exact:true });
    await feet.tap(); await tab.getByRole('button',{ name:'장착',exact:true }).tap();
    await nav.getByRole('button',{ name:'탐험',exact:true }).tap();
    await page.setViewportSize({ width:320,height:568 });
    await inspect('return-from-scrollable-inventory');
    await page.setViewportSize({ width:740,height:360 });
    await page.getByRole('button',{ name:'설정',exact:true }).tap();
    const dialog = page.locator('.settings-dialog');
    assert((await dialog.boundingBox()).height <= 360);
    assert(await dialog.evaluate(el => el.scrollHeight > el.clientHeight));
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.getByRole('button',{ name:'닫기',exact:true }).tap();
    await page.setViewportSize({ width:320,height:568 });
    await inspect('settings-close');
    await page.locator('.map-viewport').hover(); await page.mouse.wheel(0,500);
    await inspect('map-wheel-does-not-scroll-document');
    assert.deepEqual(errors,[]);
    return { mobileViewportSizes:sizes, safeAreas:true, chestAndRecordsFit:true, internalTabScrolling:true, settingsFit:true, errors };
  } finally { await context.close(); }
}
