import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkMaker({ browser,url,artifacts,readSlot }) {
  const results=[];
  for (const width of [1440,390,320]) {
    const context=await browser.newContext({ viewport:{ width,height:width===320?568:844 },isMobile:width<500,hasTouch:width<500 });
    try {
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e => errors.push(e.message));
      await page.clock.install({ time:new Date('2026-10-15T01:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-15T01:00:01Z'));
      await page.goto(url);await page.getByTestId('position').waitFor();await page.clock.runFor(1500);
      const original=await readSlot(page);
      await page.goto(new URL('/map-maker.html',url).href);
      await page.getByRole('heading',{ name:'제작자 맵 생성기',exact:true }).waitFor();
      assert.equal(await page.getByTestId('maker-size').textContent(),'64×48');
      for (const [name,value] of [['width','32'],['height','24'],['rooms','6']]) await page.locator(`input[name="${name}"]`).fill(value);
      await page.getByRole('button',{ name:'맵 생성',exact:true }).click();
      assert.equal(await page.getByTestId('maker-size').textContent(),'32×24');
      const downloadMap=async () => {
        const waiting=page.waitForEvent('download');await page.getByRole('button',{ name:'JSON 내려받기',exact:true }).click();
        return JSON.parse(await fs.readFile(await (await waiting).path(),'utf8'));
      };
      const [map]=await downloadMap();
      await page.getByRole('button',{ name:'맵 생성',exact:true }).click();assert.deepEqual(await downloadMap(),[map]);
      const floor=map.floors[0],start=map.start.y*floor.width+map.start.x;
      const cells=floor.cells,prev=new Map([[start,null]]),queue=[start];
      for (let head=0;head<queue.length;head++) {
        const i=queue[head],x=i%floor.width,y=Math.floor(i/floor.width);
        for (const [next,key] of [[x>0?i-1:-1,'ArrowLeft'],[x+1<floor.width?i+1:-1,'ArrowRight'],[y>0?i-floor.width:-1,'ArrowUp'],[y+1<floor.height?i+floor.width:-1,'ArrowDown']]) {
          if (next>=0 && cells[next].tileId==='tile.floor' && !prev.has(next)) { prev.set(next,{ i,key });queue.push(next); }
        }
      }
      let target=queue.at(-1),route=[];
      while (target!==start) { const p=prev.get(target);route.push(p.key);target=p.i; }
      route=route.reverse().slice(0,40);assert(route.length>=10);
      await page.screenshot({ path:path.join(artifacts,`maker-${width}.png`),fullPage:true });
      await page.getByRole('button',{ name:'걸어 보기',exact:true }).click();
      let x=map.start.x,y=map.start.y;
      const deltas={ ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1] };
      for (const key of route) {
        await page.keyboard.press(key);const [dx,dy]=deltas[key];x+=dx;y+=dy;
        assert.equal(await page.getByTestId('maker-position').textContent(),`(${x}, ${y})`);
      }
      await page.clock.runFor(50);
      const geometry=await page.locator('.map-cell.is-player').evaluate(el => {
        const r=el.getBoundingClientRect(),map=el.closest('.map-viewport').getBoundingClientRect();
        return { visible:r.left>=map.left && r.right<=map.right && r.top>=map.top && r.bottom<=map.bottom,overflow:document.scrollingElement.scrollHeight>innerHeight+1 };
      });
      assert(geometry.visible);assert(!geometry.overflow);
      for (const b of await page.locator('.maker-controls button').all()) { const r=await b.boundingBox();assert(r.width>=44 && r.height>=44); }
      await page.screenshot({ path:path.join(artifacts,`maker-walk-${width}.png`),fullPage:true });
      await page.getByRole('button',{ name:'시작 위치로',exact:true }).click();
      assert.equal(await page.getByTestId('maker-position').textContent(),`(${map.start.x}, ${map.start.y})`);
      await page.getByRole('button',{ name:'제작 화면으로',exact:true }).click();
      const edited=structuredClone(map);edited.name='손으로 고친 맵';
      const upload=raw => page.locator('.maker-file input').setInputFiles({ name:'edited.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw)) });
      await upload([edited]);await page.getByRole('heading',{ name:/손으로 고친 맵/ }).waitFor();
      const broken=structuredClone(edited),island=cells.findLast(c => c.tileId==='tile.floor' && Math.abs(c.x-map.start.x)+Math.abs(c.y-map.start.y)>5);
      for (const c of broken.floors[0].cells) if (Math.abs(c.x-island.x)+Math.abs(c.y-island.y)===1) c.tileId='tile.wall';
      await upload([broken]);await page.getByRole('alert').waitFor();
      assert((await page.getByRole('alert').textContent()).includes('도달할 수 없는'));
      assert.deepEqual(await downloadMap(),[edited]);
      assert.deepEqual(await readSlot(page),original);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth>innerWidth));
      let largeMapCells;
      if (width===1440) {
        for (const [name,value] of [['width','512'],['height','512'],['rooms','128']]) await page.locator(`input[name="${name}"]`).fill(value);
        await page.getByRole('button',{ name:'맵 생성',exact:true }).click();
        assert.equal(await page.getByTestId('maker-size').textContent(),'512×512');
        await page.getByRole('button',{ name:'걸어 보기',exact:true }).click();
        assert.equal(await page.locator('.map-grid').getAttribute('aria-rowcount'),'512');
        largeMapCells=await page.locator('.map-cell').count();assert(largeMapCells<2000);
        const before=await page.getByTestId('maker-position').textContent();
        await page.keyboard.press('ArrowRight');assert.notEqual(await page.getByTestId('maker-position').textContent(),before);
        assert.deepEqual(await readSlot(page),original);
      }
      assert.deepEqual(errors,[]);
      results.push({ width,makerGenerationAndDownload:true,deterministic:true,walkSteps:route.length,manualJsonRoundtrip:true,unreachableRejectedAtomically:true,existingSaveUnchanged:true,largeMapCells,errors });
    } finally { await context.close(); }
  }
  return results;
}
