import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {connectedWorld} from '../tools/world-test-fixtures.ts';
import {importMonsters,placeMonster} from '../tools/monster-tools.ts';
export async function checkGroups({browser,url,artifacts,readSlot}){
 const results=[];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1000},isMobile:width<500,hasTouch:width<500});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-16T08:00:00Z')});await page.clock.pauseAt(new Date('2026-10-16T08:00:01Z'));
   await page.goto(url);await page.getByTestId('position').waitFor();await page.clock.runFor(1100);let saved=await readSlot(page);assert.equal(saved.schemaVersion,8);
   const legacy={...saved,schemaVersion:7};await page.evaluate(async legacy=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('last-vigil',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{await new Promise((resolve,reject)=>{const tx=db.transaction('save-slots','readwrite');tx.objectStore('save-slots').put(JSON.stringify(legacy),'primary');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}},legacy);
   await page.reload();await page.getByTestId('position').waitFor();await page.clock.runFor(1100);saved=await readSlot(page);assert.equal(saved.schemaVersion,8);assert.deepEqual(saved.state.character,legacy.state.character);assert.deepEqual(saved.state.campaign,legacy.state.campaign);
   await page.goto(new URL('/monster-maker.html',url).href);await page.locator('input[name=id]').fill('monster.group_browser');await page.locator('input[name=name]').fill('묶음 골렘');await page.locator('input[name=health]').fill('100');
   await page.getByRole('combobox',{name:'행동 선택 방식',exact:true}).selectOption('groups');
   await page.getByRole('button',{name:'예제: 힘 모으기 2회 → 강공격',exact:true}).click();await page.getByRole('button',{name:'예제: 체력 50% 미만 → 대기·회복',exact:true}).click();
   assert.equal(await page.getByTestId('monster-group').count(),3);assert.equal(await page.getByRole('spinbutton',{name:'묶음 2 단계 1 반복',exact:true}).inputValue(),'2');
   assert.equal(await page.getByRole('spinbutton',{name:'묶음 3 조건 수치',exact:true}).inputValue(),'50');
   await page.getByRole('combobox',{name:'묶음 1 단계 1 행동',exact:true}).selectOption('wait');await page.getByRole('textbox',{name:'묶음 1 단계 1 문구',exact:true}).fill('상대를 지켜본다.');
   await page.getByRole('combobox',{name:'묶음 2 조건',exact:true}).selectOption('turn_at_least');await page.getByRole('spinbutton',{name:'묶음 2 조건 수치',exact:true}).fill('100');
   await page.getByRole('spinbutton',{name:'묶음 3 최대 사용',exact:true}).fill('1');await page.getByRole('spinbutton',{name:'묶음 3 단계 2 수치',exact:true}).fill('25');
   const download=async()=>{const wait=page.waitForEvent('download');await page.getByRole('button',{name:'몬스터 JSON 내보내기',exact:true}).click();return JSON.parse(await fs.readFile(await(await wait).path(),'utf8'));};
   const pack=await download(),monster=pack.monsters[0];assert(!monster.behavior);assert.equal(monster.groups[1].steps[0].repeat,2);assert.deepEqual(monster.groups[2].condition,{type:'health_below',value:50});assert.equal(monster.groups[2].maxUses,1);
   await page.getByRole('combobox',{name:'행동 선택 방식',exact:true}).selectOption('sequence');await page.getByLabel('몬스터 JSON 불러오기',{exact:true}).setInputFiles({name:'grouped.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
   await page.waitForFunction(()=>document.querySelector('select[aria-label="행동 선택 방식"]').value==='groups');assert.deepEqual(await download(),pack);
   await page.getByRole('spinbutton',{name:'묶음 3 조건 수치',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,`groups-designer-${width}.png`)});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
   let world=importMonsters(connectedWorld(),pack);world=placeMonster(world,{mapId:'map.s1_test',floor:0,x:4,y:3},monster.id,1);
   await page.goto(new URL('/map-maker.html',url).href);await page.locator('.maker-file input').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(world))});await page.locator('.maker-result>h2').filter({hasText:'탐험 테스트 맵'}).waitFor();
   await page.getByRole('button',{name:'게임에서 시험',exact:true}).click();await page.getByTestId('position').waitFor();await page.locator('.map-grid').focus();
   for(const key of ['ArrowRight','ArrowRight','ArrowDown','ArrowDown','ArrowRight']){await page.clock.runFor(100);await page.keyboard.press(key);}
   await page.getByRole('button',{name:'전투 시작',exact:true}).click();await page.getByTestId('enemy-health').waitFor();
   let hp=100,attacks=0;while(hp>=50&&attacks<20){await page.getByRole('button',{name:'공격',exact:true}).click();hp=Number((await page.getByTestId('enemy-health').textContent()).split('/')[0].trim());attacks++;}
   assert(hp>0&&hp<50);assert((await page.locator('.combat-history').textContent()).includes('숨을 고른다'));assert((await page.locator('.enemy-header').textContent()).includes('스스로 상처를 회복한다'));
   await page.getByRole('button',{name:'방어',exact:true}).click();const healed=Number((await page.getByTestId('enemy-health').textContent()).split('/')[0].trim());assert.equal(healed,Math.min(100,hp+25));assert((await page.locator('.combat-history').textContent()).includes('25 회복'));
   await page.screenshot({path:path.join(artifacts,`groups-combat-${width}.png`),fullPage:true});await page.getByRole('button',{name:'제작 화면으로',exact:true}).click();assert.deepEqual(await readSlot(page),saved);assert.deepEqual(errors,[]);
   results.push({width,legacyV7IndexedDbMigration:true,groupPresetsAndControls:true,repeatTwoAndHealthCondition:true,exportImportRoundtrip:true,conditionalWaitThenHealInGame:true,groupIntent:true,existingSaveUntouched:true,errors});
  }finally{await context.close();}
 }
 return results;
}
