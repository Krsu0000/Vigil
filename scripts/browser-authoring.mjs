import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function checkAuthoring({browser,url,artifacts,readSlot}){
 const results=[];
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1000},isMobile:width<500,hasTouch:width<500});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install({time:new Date('2026-10-16T07:00:00Z')});await page.clock.pauseAt(new Date('2026-10-16T07:00:01Z'));
   await page.goto(url);await page.getByTestId('position').waitFor();await page.clock.runFor(1100);const original=await readSlot(page);
   await page.goto(new URL('/monster-maker.html',url).href);
   await page.locator('input[name=id]').fill('monster.artisan');await page.locator('input[name=name]').fill('시험 골렘');await page.locator('input[name=level]').fill('2');
   await page.getByRole('combobox',{name:'행동 1 종류',exact:true}).selectOption('wait');await page.getByRole('textbox',{name:'행동 1 문구',exact:true}).fill('주먹을 들어 올린다.');
   await page.getByRole('button',{name:'행동 추가',exact:true}).click();await page.getByRole('spinbutton',{name:'행동 2 수치',exact:true}).fill('2');
   const d=page.waitForEvent('download');await page.getByRole('button',{name:'몬스터 JSON 내보내기',exact:true}).click();const pack=JSON.parse(await fs.readFile(await(await d).path(),'utf8'));
   assert.equal(pack.monsters[0].behavior[0].type,'wait');assert.equal(pack.monsters[0].behavior[1].multiplier,2);assert.equal(pack.monsters[0].level,2);
   await page.goto(new URL('/map-maker.html',url).href);
   for(const [name,v] of [['width','32'],['height','24'],['rooms','4']])await page.locator(`input[name="${name}"]`).fill(v);
   await page.getByRole('button',{name:'맵 생성',exact:true}).click();
   const download=async()=>{const wait=page.waitForEvent('download');await page.getByRole('button',{name:'배포용 맵 묶음 내보내기',exact:true}).click();return JSON.parse(await fs.readFile(await(await wait).path(),'utf8'));};
   let world=await download(),map=world.maps[0],floor=map.floors[0];
   await page.getByRole('spinbutton',{name:'선택 X',exact:true}).fill('1.5');assert.equal(await page.getByRole('spinbutton',{name:'선택 X',exact:true}).inputValue(),'1');
   const canvas=page.locator('.maker-canvas-stack canvas[role=img]');await canvas.scrollIntoViewIfNeeded();let rect=await canvas.boundingBox();
   assert.equal(await page.locator('.maker-selection-overlay').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   const point=(x,y)=>({x:rect.x+(x+.5)*rect.width/floor.width,y:rect.y+(y+.5)*rect.height/floor.height});
   let a=point(2,2),b=point(5,4);
   if(width<500){const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
   else {await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();}
   assert((await page.locator('.maker-brush strong').textContent()).includes('12칸'));
   await page.getByRole('button',{name:'영역을 안전 구역으로',exact:true}).click();world=await download();
   for(const c of world.maps[0].floors[0].cells.filter(c=>c.x>=2&&c.x<=5&&c.y>=2&&c.y<=4))assert.equal(c.zoneId,'zone.camp');
   const colors=await canvas.evaluate(el=>{const ctx=el.getContext('2d');const data=ctx.getImageData(0,0,el.width,el.height).data;let safe=false,danger=false;for(let i=0;i<data.length;i+=4){if(data[i]===201&&data[i+1]===217&&data[i+2]===226)safe=true;if(data[i]===239&&data[i+1]===173&&data[i+2]===173)danger=true;}return {safe,danger};});assert(colors.safe&&colors.danger);
   await page.getByRole('button',{name:'되돌리기',exact:true}).click();
   await page.getByLabel('몬스터 불러오기',{exact:true}).setInputFiles({name:'monsters.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
   await page.getByRole('combobox',{name:'배치할 몬스터',exact:true}).selectOption('monster.artisan');
   await page.locator('input[name=count]').fill('4');await page.locator('input[name=spacing]').fill('2');await page.getByRole('button',{name:'적 절차적 배치',exact:true}).click();
   world=await download();floor=world.maps[0].floors[0];const enemies=floor.cells.filter(c=>c.encounterId);assert.equal(enemies.length,4);
   for(const c of enemies){const e=world.encounters.find(e=>e.id===c.encounterId),m=world.monsters.find(m=>m.id===e.enemies[0].monsterId);assert(m.level>=8&&m.level<=9);assert.equal(c.zoneId,'zone.ruins');}
   const chosen=enemies[0];await page.getByRole('spinbutton',{name:'선택 X',exact:true}).fill(String(chosen.x));await page.getByRole('spinbutton',{name:'선택 Y',exact:true}).fill(String(chosen.y));
   await page.getByRole('spinbutton',{name:'선택 칸의 적 레벨',exact:true}).fill('11');await page.getByRole('button',{name:'선택 칸 레벨 적용',exact:true}).click();assert((await page.getByTestId('selected-enemy').textContent()).includes('Lv.11'));
   const circle=await canvas.evaluate((el,p)=>{const scale=el.width/32,ctx=el.getContext('2d'),at=(x,y)=>[...ctx.getImageData(Math.floor(x*scale),Math.floor(y*scale),1,1).data].slice(0,3);return {center:at(p.x+.5,p.y+.5),corner:at(p.x+.02,p.y+.02)};},chosen);assert.deepEqual(circle.center,[110,34,53]);assert.deepEqual(circle.corner,[239,173,173]);
   for(const [name,v]of [['width','9'],['height','9'],['rooms','1']])await page.locator(`input[name="${name}"]`).fill(v);
   await page.getByRole('button',{name:'새 맵으로 추가',exact:true}).click();
   await page.getByRole('button',{name:'걸어 보기',exact:true}).click();await page.getByTestId('maker-position').waitFor();await page.getByRole('button',{name:'제작 화면으로',exact:true}).click();
   await page.getByRole('button',{name:'게임에서 시험',exact:true}).click();await page.getByTestId('position').waitFor();assert((await page.locator('.region-header').textContent()).includes('생성한 탐험 맵 2'));await page.getByRole('button',{name:'제작 화면으로',exact:true}).click();
   await page.getByRole('button',{name:'이 칸을 출발점으로 선택',exact:true}).click();
   await page.getByRole('combobox',{name:'편집할 맵',exact:true}).selectOption(map.id);
   await page.getByRole('button',{name:'선택한 칸을 도착점으로 연결',exact:true}).click();world=await download();assert.equal(world.maps[0].floors[0].cells.find(c=>c.x===map.start.x&&c.y===map.start.y).exit.target.mapId,world.maps[1].id);
   await page.getByRole('button',{name:'게임에서 시험',exact:true}).click();await page.getByTestId('position').waitFor();await page.getByRole('button',{name:'생성한 탐험 맵 2 이동',exact:true}).click();assert((await page.locator('.region-header').textContent()).includes('생성한 탐험 맵 2'));
   await page.getByRole('button',{name:'제작 화면으로',exact:true}).click();assert.deepEqual(await readSlot(page),original);
   await page.locator('.maker-enemies').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,`authoring-${width}.png`),fullPage:true});assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);
   results.push({width,rectanglePainting:true,exactZoneColors:true,roundMonsters:true,monsterDesignerImport:true,proceduralUniqueEnemies:true,levels8to9AndIndividual11:true,detachedWalkAndGameWork:true,clickExitEndpoints:true,existingSaveUnchanged:true,errors});
  }finally{await context.close();}
 }
 return results;
}
