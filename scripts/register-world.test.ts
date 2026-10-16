import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
import {inventorySources} from '../src/content/test-fixtures.ts';
import {checkContentFiles} from './validate-content.ts';
import {planWorldRegistration,registerWorld} from './register-world.ts';
import {connectedWorld} from '../tools/world-test-fixtures.ts';
import {createNewGameStore,createGameStore} from '../src/runtime/store.ts';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'vigil-world-')),root=join(dir,'content'),sources=inventorySources();
  for(const [file,value]of Object.entries(sources)){const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
  return {dir,root};
}
describe('배포용 맵 묶음 등록',()=>{
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
