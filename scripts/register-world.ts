import { mkdirSync,mkdtempSync,readFileSync,writeFileSync,renameSync,rmSync,existsSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkContentFiles } from './validate-content.ts';
import { parseWorld,assertCompatibleWorld } from '../tools/world-editor.ts';
import { loadContent } from '../src/content/load.ts';
import { ManifestSchema } from '../src/content/schemas.ts';
import { itemEffectRegistry } from '../src/engine/systems/inventory/effects.ts';

export function planWorldRegistration(root:string,raw:unknown):Record<string,string> {
  const base=checkContentFiles(root);
  if(!base.content||base.errors.length)throw new Error('현재 콘텐츠 검증을 먼저 통과해야 합니다.');
  const world=parseWorld(raw);assertCompatibleWorld(base.content,world);
  const sources:Record<string,unknown>=Object.fromEntries(base.checkedFiles.map(file=>[file,JSON.parse(readFileSync(join(root,file),'utf8'))]));
  const manifest=ManifestSchema.parse(sources['manifest.json']),registered=new Set<string>(),touched=new Set(['manifest.json']);
  for(const file of manifest.definitionFiles){
    const entries=sources[file] as {kind?:string;id:string}[];
    sources[file]=entries.map(entry=>{
      if(entry.kind!=='map')return entry;
      touched.add(file);registered.add(entry.id);return world.maps.find(m=>m.id===entry.id)!;
    });
  }
  const added=world.maps.filter(m=>!registered.has(m.id));
  if(added.length){const file='maps/registered-world.json';touched.add(file);sources[file]=[...(sources[file] as unknown[]??[]),...added];if(!manifest.definitionFiles.includes(file))manifest.definitionFiles.push(file);}
  manifest.startMapId=world.startMapId;sources['manifest.json']=manifest;
  const loaded=loadContent(sources,itemEffectRegistry.validate);
  if(!loaded.ok)throw new Error(loaded.errors.map(e=>`${e.file} ${e.path}: ${e.message}`).join('\n'));
  const writes:Record<string,string>={};
  for(const [file,value] of Object.entries(sources)){
    if(!touched.has(file))continue;
    const body=JSON.stringify(value,null,2)+'\n';
    if(!existsSync(join(root,file))||readFileSync(join(root,file),'utf8')!==body)writes[file]=body;
  }
  return writes;
}
export function registerWorld(root:string,raw:unknown,backupRoot:string):string|null {
  const writes=planWorldRegistration(root,raw);if(!Object.keys(writes).length)return null;
  mkdirSync(backupRoot,{recursive:true});const backup=mkdtempSync(join(backupRoot,'world-'));
  const before:Record<string,string|null>=Object.fromEntries(Object.keys(writes).map(file=>[file,existsSync(join(root,file))?readFileSync(join(root,file),'utf8'):null]));
  writeFileSync(join(backup,'before.json'),JSON.stringify(before,null,2)+'\n',{flag:'wx'});
  const ordered=Object.keys(writes).sort((a,b)=>Number(a==='manifest.json')-Number(b==='manifest.json'));
  try{
    for(const file of ordered){const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.world-tmp',writes[file]!);renameSync(path+'.world-tmp',path);}
  }catch(error){
    for(const [file,body]of Object.entries(before)){const path=join(root,file);if(body===null)rmSync(path,{force:true});else writeFileSync(path,body);rmSync(path+'.world-tmp',{force:true});}
    throw error;
  }
  return backup;
}
if(import.meta.main)try{
  const {values}=parseArgs({options:{file:{type:'string'},'content-dir':{type:'string'},apply:{type:'boolean'},'backup-dir':{type:'string'}},strict:true,allowPositionals:false});
  if(!values.file)throw new Error('사용법: npm run register:world -- --file 맵묶음.json [--apply]');
  const root=resolve(values['content-dir']??fileURLToPath(new URL('../src/content',import.meta.url))),raw=JSON.parse(readFileSync(values.file,'utf8'));
  if(values.apply){const backup=registerWorld(root,raw,resolve(values['backup-dir']??'artifacts/world-backups'));console.log(backup?`맵 묶음 등록 완료. 변경 전 백업: ${backup}`:'이미 같은 맵 묶음이 등록되어 있습니다.');}
  else console.log(`맵 묶음 검증 통과. 반영 예정 파일 ${Object.keys(planWorldRegistration(root,raw)).length}개. --apply를 붙이면 콘텐츠에 등록합니다.`);
}catch(error){console.error(`맵 등록 실패: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
