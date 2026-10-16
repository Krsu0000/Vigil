import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {inventorySources} from '../src/content/test-fixtures.ts';
import {checkContentFiles} from './validate-content.ts';
import {planWorldRegistration,registerWorld} from './register-world.ts';
import {importMonsters,placeMonster} from '../tools/monster-tools.ts';
import {MonsterDefinitionSchema} from '../src/content/schemas.ts';
import {connectedWorld} from '../tools/world-test-fixtures.ts';
import {createNewGameStore,createGameStore} from '../src/runtime/store.ts';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'vigil-world-')),root=join(dir,'content'),sources=inventorySources();
  for(const [file,value]of Object.entries(sources)){const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
  return {dir,root};
}
describe('배포용 맵 묶음 등록',()=>{
  it('사용자 몬스터·레벨 변형·개별 조우를 함께 등록하고 기존 정의 덮어쓰기를 거부한다',()=>{
    const {dir,root}=fixture();try{
      const old=checkContentFiles(root).content!,saved=createNewGameStore(old,[1,2,3,4],()=>0).getSnapshot();
      const monster=MonsterDefinitionSchema.parse({kind:'monster',id:'monster.imported',name:'새 적',description:'사용자 적',glyph:'X',level:2,health:30,damageMin:4,damageMax:8,hitChance:1,intent:'기다린다',loot:[],behavior:[{type:'wait',text:'힘을 모은다'},{type:'attack',text:'내리친다',multiplier:2}]});
      const world=placeMonster(importMonsters(connectedWorld(),[monster]),{mapId:'map.second',floor:0,x:2,y:1},monster.id,8);
      const plan=planWorldRegistration(root,world);expect(plan['monsters.json']).toBeDefined();expect(plan['encounters.json']).toBeDefined();
      registerWorld(root,world,join(dir,'backups'));const loaded=checkContentFiles(root);expect(loaded.errors).toEqual([]);expect(loaded.content!.byId['monster.imported_lv_8']).toMatchObject({health:120,damageMax:32,level:8});
      expect(createGameStore(loaded.content!,saved,()=>0).getSnapshot()).toEqual(saved);expect(registerWorld(root,world,join(dir,'backups'))).toBeNull();
      const before=readFileSync(join(root,'monsters.json'),'utf8'),changed=structuredClone(world);changed.monsters![0]!.health++;
      expect(()=>registerWorld(root,changed,join(dir,'backups'))).toThrow('덮어쓸');expect(readFileSync(join(root,'monsters.json'),'utf8')).toBe(before);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

  it('기본 검증은 파일을 쓰지 않고, 적용은 백업 후 등록하며 구형 진행 중 전투도 복원한다',()=>{
    const {dir,root}=fixture();try{
      const before=checkContentFiles(root).content!;const store=createNewGameStore(before,[1,2,3,4],()=>1000);
      for(const direction of ['east','east','south','south','east','east','north','north'] as const)expect(store.dispatch({type:'move/step',direction}).ok).toBe(true);
      expect(store.dispatch({type:'combat/start'}).ok).toBe(true);const old=store.getSnapshot();
      const manifest=readFileSync(join(root,'manifest.json'),'utf8'),items=readFileSync(join(root,'items.json'),'utf8');
      const plan=planWorldRegistration(root,connectedWorld());expect(Object.keys(plan)).toEqual(expect.arrayContaining(['manifest.json','maps/s1-test.json','maps/registered-world.json']));
      expect(readFileSync(join(root,'manifest.json'),'utf8')).toBe(manifest);
      const backup=registerWorld(root,connectedWorld(),join(dir,'backups'))!;const saved=JSON.parse(readFileSync(join(backup,'before.json'),'utf8'));
      expect(saved['manifest.json']).toBe(manifest);expect(saved['maps/registered-world.json']).toBeNull();
      const after=checkContentFiles(root);expect(after.errors).toEqual([]);expect(after.content!.startMapId).toBe('map.s1_test');
      expect(readFileSync(join(root,'items.json'),'utf8')).toBe(items);expect(after.content!.contentVersion).toBe(before.contentVersion);
      expect(createGameStore(after.content!,old,()=>1000).getSnapshot()).toEqual(old);
      expect(createNewGameStore(after.content!,[1,2,3,4],()=>1000).getSnapshot().character!.position!.mapId).toBe('map.s1_test');
      expect(registerWorld(root,connectedWorld(),join(dir,'backups'))).toBeNull();
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('호환되지 않거나 끊어진 맵 묶음은 적용 전에 거부하고 파일을 보존한다',()=>{
    const {dir,root}=fixture();try{
      const before=readFileSync(join(root,'maps/s1-test.json'),'utf8');
      const bad=connectedWorld();bad.maps[0]!.version++;
      expect(()=>registerWorld(root,bad,join(dir,'backups'))).toThrow();
      const broken=connectedWorld();delete broken.maps[1]!.floors[0]!.cells.find(c=>c.exit)!.exit;
      expect(()=>registerWorld(root,broken,join(dir,'backups'))).toThrow();expect(readFileSync(join(root,'maps/s1-test.json'),'utf8')).toBe(before);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('실제 CLI는 기본 검증과 --apply를 구분한다',()=>{
    const {dir,root}=fixture();try{
      const file=join(dir,'world.json');writeFileSync(file,JSON.stringify(connectedWorld()));
      const args=['scripts/register-world.ts','--file',file,'--content-dir',root];
      expect(spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000}).status).toBe(0);expect(checkContentFiles(root).content!.startMapId).toBeUndefined();
      expect(spawnSync(process.execPath,[...args,'--apply','--backup-dir',join(dir,'backup')],{encoding:'utf8',timeout:10000}).status).toBe(0);expect(checkContentFiles(root).content!.startMapId).toBe('map.s1_test');
    }finally{rmSync(dir,{recursive:true,force:true});}
  },15000);
});
