// npm run generate:map -- --help. Node 22.18+ 내장 TypeScript 실행.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateMap, parseMapSeed } from '../tools/map-generator.ts';
import { loadMakerMap } from '../tools/map-content.ts';
import type { GeneratorOptions } from '../tools/map-generator.ts';

export function runGenerator(args:string[]):void {
  const numeric = { width:'width',height:'height',rooms:'rooms','room-min':'roomMin','room-max':'roomMax',
    straightness:'straightness','dead-end-retention':'deadEndRetention','extra-connections':'extraConnections',version:'version' } as const;
  const parsed=parseArgs({ args,options:{
    ...Object.fromEntries(Object.keys(numeric).map(key => [key,{ type:'string' as const }])),
    seed:{ type:'string' },id:{ type:'string' },out:{ type:'string' },help:{ type:'boolean' },
  },strict:true,allowPositionals:false });
  const values:Record<string,string|boolean|undefined>=parsed.values;
  if (values.help) {
    console.log('사용법: npm run generate:map -- --seed 1,2,3,4 --width 64 --height 48 --rooms 12 --out artifacts/generated-map.json\n옵션: --room-min 3 --room-max 9 --straightness 0.6 --dead-end-retention 0.35 --extra-connections 6 --id map.generated --version 1\n출력 파일이 이미 있으면 덮어쓰지 않습니다.'); return;
  }
  const options:Partial<GeneratorOptions>={};
  for (const [flag,key] of Object.entries(numeric)) if (values[flag]!==undefined) {
    const raw=values[flag];
    if (typeof raw!=='string' || !raw.trim()) throw new Error(`${flag}에는 숫자가 필요합니다.`);
    options[key]=Number(raw);
  }
  if (typeof values.seed==='string') options.seed=parseMapSeed(values.seed);
  if (typeof values.id==='string') options.id=values.id;
  const result=generateMap(options), loaded=loadMakerMap([result.map]);
  if (!loaded.ok) throw new Error(loaded.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  const output=resolve(typeof values.out==='string'?values.out:'artifacts/generated-map.json');
  mkdirSync(dirname(output),{ recursive:true });
  writeFileSync(output,JSON.stringify([result.map],null,2)+'\n',{ flag:'wx' });
  console.log(`맵 생성/검증 완료: ${output}\n${result.options.width}×${result.options.height} · 방 ${result.stats.rooms}개 · 바닥 ${result.stats.walkable}칸 · 막다른 끝 ${result.stats.deadEnds}개 · 추가 연결 ${result.stats.extraConnections}개`);
}

if (import.meta.main) try { runGenerator(process.argv.slice(2)); }
catch (error) { console.error(`맵 생성 실패: ${error instanceof Error?error.message:String(error)}`); process.exitCode=1; }
