import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkWorld({browser,url,artifacts,readSlot}){
  const results=[];
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:width<500,hasTouch:width<500});
    try{
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install({time:new Date('2026-10-15T01:00:00Z')});await page.clock.pauseAt(new Date('2026-10-15T01:00:01Z'));
      const base=new URL('/tests/browser/world.html',url).href;
      await page.goto(base+'?legacy=1');await page.getByTestId('position').waitFor();await page.keyboard.press('ArrowRight');await page.clock.runFor(1100);
      const old=await readSlot(page);assert.equal(old.state.character.position.mapId,'map.s1_test');
      await page.goto(base);await page.getByTestId('position').waitFor();assert.equal(await page.getByTestId('position').textContent(),'(2, 1)');
      await page.locator('.map-grid').focus();await page.keyboard.press('z');
      assert.equal(await page.getByTestId('position').textContent(),'(1, 1)');assert((await page.locator('.region-header').textContent()).includes('두 번째 지역'));
      await page.keyboard.press('z');assert.equal(await page.getByTestId('position').textContent(),'(1, 1)');
      await page.clock.runFor(1100);const travelled=await readSlot(page);
      assert.equal(travelled.state.character.position.mapId,'map.second');assert.deepEqual(travelled.state.campaign.exploration['map.s1_test'],old.state.campaign.exploration['map.s1_test']);
      assert.deepEqual(travelled.state.campaign.recentRecords,old.state.campaign.recentRecords);
      await page.reload();await page.getByTestId('position').waitFor();assert((await page.locator('.region-header').textContent()).includes('두 번째 지역'));
      await page.getByRole('button',{name:'설정',exact:true}).click();const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'파일로 내보내기',exact:true}).click();
      const file=JSON.parse(await fs.readFile(await (await waiting).path(),'utf8'));assert.equal(file.schemaVersion,8);assert.equal(file.state.character.position.mapId,'map.second');
      await page.locator('input[type=file]').setInputFiles({name:'world-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await page.getByRole('button',{name:'이 탐험으로 교체',exact:true}).click();await page.getByTestId('file-status').filter({hasText:'가져왔'}).waitFor();await page.getByRole('button',{name:'닫기',exact:true}).click();
      await page.clock.runFor(100);await page.locator('.map-grid').focus();await page.keyboard.press('Space');assert.equal(await page.getByTestId('position').textContent(),'(2, 1)');
      await page.clock.runFor(100);await page.getByRole('button',{name:'두 번째 지역 이동',exact:true}).click();
      await page.clock.runFor(100);await page.locator('.map-grid').focus();await page.keyboard.press('ArrowDown');
      await page.getByRole('button',{name:'귀환',exact:true}).click();assert.equal(await page.getByTestId('position').textContent(),'(1, 1)');assert((await page.locator('.region-header').textContent()).includes('탐험 테스트 맵'));
      await page.clock.runFor(100);await page.keyboard.press('ArrowRight');
      await page.clock.runFor(50);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      if(width<500){const geometry=await page.evaluate(()=>({height:innerHeight,scroll:document.scrollingElement.scrollHeight,buttons:[...document.querySelectorAll('.exploration-commands button,.exit-controls button')].map(b=>{const r=b.getBoundingClientRect();return {bottom:r.bottom,width:r.width,height:r.height};})}));assert(geometry.scroll<=geometry.height+1);for(const b of geometry.buttons){assert(b.width>=44&&b.height>=44);assert(b.bottom<=geometry.height);}}
      await page.screenshot({path:path.join(artifacts,`world-exit-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);
      results.push({width,legacyIndexedDbPreserved:true,explicitTravelBothKeysAndButton:true,worldReloadAndFileRoundtrip:true,globalReturn:true,noAutoBounce:true,mobileFits:true,errors});
    }finally{await context.close();}
  }
  return results;
}

export async function checkWorldEditor({browser,url,artifacts,readSlot}){
  const results=[];
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:width<500,hasTouch:width<500});
    try{
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.clock.install({time:new Date('2026-10-15T01:00:00Z')});await page.clock.pauseAt(new Date('2026-10-15T01:00:01Z'));
      await page.goto(url);await page.getByTestId('position').waitFor();await page.clock.runFor(1100);const saved=await readSlot(page);
      await page.goto(new URL('/map-maker.html',url).href);await page.getByRole('button',{name:'현재 게임 맵 불러오기',exact:true}).click();
      await page.getByRole('spinbutton',{name:'선택 X',exact:true}).fill('2');await page.getByRole('spinbutton',{name:'선택 Y',exact:true}).fill('2');
      await page.getByRole('button',{name:'벽으로',exact:true}).click();await page.getByRole('button',{name:'되돌리기',exact:true}).click();
      for(const [name,value]of [['width','9'],['height','9'],['rooms','1']])await page.locator(`input[name="${name}"]`).fill(value);
      await page.getByRole('button',{name:'새 맵으로 추가',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'편집할 맵',exact:true}).locator('option').count(),2);
      await page.getByRole('button',{name:'도착 맵의 시작점과 연결',exact:true}).click();await page.getByRole('button',{name:'전체 검증',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0);
      const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'배포용 맵 묶음 내보내기',exact:true}).click();const bundle=JSON.parse(await fs.readFile(await (await waiting).path(),'utf8'));
      assert.equal(bundle.format,'vigil-world-v1');assert.equal(bundle.startMapId,'map.s1_test');assert.equal(bundle.maps.length,2);
      assert.equal(bundle.maps[0].floors[0].cells.find(c=>c.x===2&&c.y===2).tileId,'tile.floor');
      const other=bundle.maps[1];assert.equal(other.floors[0].cells.find(c=>c.x===other.start.x&&c.y===other.start.y).exit.target.mapId,'map.s1_test');
      await page.screenshot({path:path.join(artifacts,`world-editor-${width}.png`),fullPage:true});
      await page.getByRole('button',{name:'게임에서 시험',exact:true}).click();await page.getByTestId('position').waitFor();
      await page.getByRole('button',{name:`${other.name} 이동`,exact:true}).click();assert((await page.locator('.region-header').textContent()).includes(other.name));
      await page.clock.runFor(100);await page.locator('.map-grid').focus();await page.keyboard.press('z');assert((await page.locator('.region-header').textContent()).includes('탐험 테스트 맵'));
      await page.getByRole('button',{name:'제작 화면으로',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'편집할 맵',exact:true}).locator('option').count(),2);
      assert.deepEqual(await readSlot(page),saved);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);
      results.push({width,cellEditingAndUndo:true,addAndConnectMaps:true,bundleExport:true,fullGamePreviewTravel:true,existingSaveUntouched:true,errors});
    }finally{await context.close();}
  }
  return results;
}
