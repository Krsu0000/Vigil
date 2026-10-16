import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function checkImports({browser,url,artifacts}){
  const results=[];
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});
    try{
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      const upload=(name,value)=>({name,mimeType:'application/json',buffer:Buffer.from(value)});
      await page.goto(new URL('/monster-maker.html',url).href);
      const download=page.waitForEvent('download');await page.getByRole('button',{name:'몬스터 JSON 내보내기',exact:true}).click();
      const pack=JSON.parse(await fs.readFile(await(await download).path(),'utf8'));pack.monsters[0].id='monster.import_check';pack.monsters[0].name='파일 확인 몬스터';
      const input=page.getByLabel('몬스터 JSON 불러오기',{exact:true}),panel=page.locator('.maker-file-import');
      const monster=upload('monster-bom.json','\uFEFF'+JSON.stringify(pack));
      await input.setInputFiles(monster);
      await panel.getByRole('status').filter({hasText:'불러오기 완료 · 파일 확인 몬스터'}).waitFor();
      assert.match(await input.inputValue(),/monster-bom\.json$/);assert.equal(await page.locator('input[name=name]').inputValue(),'파일 확인 몬스터');
      await page.locator('input[name=name]').fill('수정한 이름');await panel.getByRole('button',{name:'같은 파일 다시 불러오기'}).click();
      await page.waitForFunction(()=>document.querySelector('input[name=name]').value==='파일 확인 몬스터');
      for(const [name,value,expected] of [['empty.json','','빈 파일'],['broken.json','{','JSON 형식'],['wrong.json','{}','불러오기 실패'],['large.json',' '.repeat(2*1024*1024+1),'2MB 이하']]){
        await input.setInputFiles(upload(name,value));await panel.getByRole('alert').filter({hasText:expected}).waitFor();
        assert.equal(await page.locator('input[name=name]').inputValue(),'파일 확인 몬스터');assert.match(await input.inputValue(),new RegExp(name.replace('.','\\.')+'$'));
      }
      await input.setInputFiles(monster);await panel.getByRole('status').filter({hasText:'불러오기 완료'}).waitFor();assert.equal(await panel.getByRole('alert').count(),0);
      await page.goto(new URL('/map-maker.html',url).href);
      const worldDownload=page.waitForEvent('download');await page.getByRole('button',{name:'배포용 맵 묶음 내보내기'}).click();
      const world=JSON.parse(await fs.readFile(await(await worldDownload).path(),'utf8'));world.maps[0].name='불러온 지도';
      const worldPanel=page.locator('.maker-file'),worldInput=worldPanel.locator('input');
      await worldInput.setInputFiles(upload('world-bom.json','\uFEFF'+JSON.stringify(world)));
      await worldPanel.getByRole('status').filter({hasText:'불러오기 완료 · 맵 1개 · 불러온 지도'}).waitFor();assert.match(await worldInput.inputValue(),/world-bom\.json$/);
      await worldInput.setInputFiles(upload('broken-world.json','{}'));await worldPanel.getByRole('alert').waitFor();assert.match(await page.locator('.maker-result>h2').textContent(),/불러온 지도/);
      await worldPanel.getByRole('button',{name:'같은 파일 다시 불러오기'}).click();await worldPanel.getByRole('alert').waitFor();
      const monsterInput=page.getByLabel('몬스터 불러오기',{exact:true}),monsterPanel=page.locator('.maker-file-import').filter({has:monsterInput});
      await monsterInput.setInputFiles(monster);await monsterPanel.getByRole('status').filter({hasText:'불러오기 완료'}).waitFor();
      assert.equal(await page.getByLabel('배치할 몬스터',{exact:true}).inputValue(),'monster.import_check');assert.match(await monsterInput.inputValue(),/monster-bom\.json$/);
      await monsterPanel.getByRole('button',{name:'같은 파일 다시 불러오기'}).click();await monsterPanel.getByRole('status').filter({hasText:'불러오기 완료'}).waitFor();
      // A slower first read must not replace a newer selection.
      await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow.json')await new Promise(r=>setTimeout(r,300));return original.call(this);};});
      const slow=structuredClone(world);slow.maps[0].name='이전 파일';world.maps[0].name='최신 파일';
      await worldInput.setInputFiles(upload('slow.json',JSON.stringify(slow)));await worldInput.setInputFiles(upload('latest.json',JSON.stringify(world)));
      await worldPanel.getByRole('status').filter({hasText:'불러오기 완료 · 맵 1개 · 최신 파일'}).waitFor();await page.waitForTimeout(400);
      assert.match(await page.locator('.maker-result>h2').textContent(),/최신 파일/);assert.match(await worldInput.inputValue(),/latest\.json$/);
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);
      await worldPanel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,`imports-${width}.png`)});
      results.push({width,fileImport:true,filenameRetained:true,retry:true,bom:true,invalidPreservesDraft:true,latestReadWins:true,errors});
    }finally{await context.close();}
  }
  return results;
}
