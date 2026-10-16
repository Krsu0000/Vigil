import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { generateMap, parseMapSeed } from './map-generator.ts';
import { loadMakerMap, loadTerrainPreview } from './map-content.ts';
import maps from '../src/content/maps/s1-test.json' with { type:'json' };
import { MapDefinitionSchema } from '../src/content/schemas.ts';
import { runGenerator } from '../scripts/generate-map.ts';
import { reachableCells } from '../src/content/map-reachability.ts';

describe('제작자 맵 생성기 v1', () => {
  it('같은 시드·설정은 바이트 단위로 같고 호출자의 시드는 보존한다', () => {
    const seed:[number,number,number,number]=[1,2,3,4], copy=[...seed];
    const first=generateMap({ seed }), second=generateMap({ seed });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second)); expect(seed).toEqual(copy);
    expect(createHash('sha256').update(JSON.stringify(first.map)).digest('hex')).toBe('0c88c201c3c3eba00dd441fe06884647237117fff4fcac42065b60e466b01326');
  });
  it('다른 시드는 지형을 바꾼다', () => {
    expect(generateMap({ seed:[1,2,3,4] }).map.floors).not.toEqual(generateMap({ seed:[4,3,2,1] }).map.floors);
  });
  it.each(Array.from({ length:12 },(_,seed) => seed))('시드%s의 방·바닥은 모두 연결되고 외벽/안전한 시작점을 보존한다', seed => {
    const result=generateMap({ seed:[seed,0,0,0],width:32+seed%2,height:24+seed%2,rooms:6 });
    expect(result.stats.rooms).toBe(6); expect(loadMakerMap([result.map]).ok).toBe(true);
    const floor=result.map.floors[0]!;
    for (const cell of floor.cells) if (cell.x===0 || cell.y===0 || cell.x===floor.width-1 || cell.y===floor.height-1) expect(cell.tileId).toBe('tile.wall');
    const start=floor.cells[result.map.start.y*floor.width+result.map.start.x]!;
    expect(start).toMatchObject({ tileId:'tile.floor',zoneId:'zone.camp' });
  });
  it.each([[9,9,1],[10,10,1],[128,96,32],[512,512,128]])('%s×%s에서 지정한 방%s개와 연결된 지형을 만든다', (width,height,rooms) => {
    const result=generateMap({ width,height,rooms });
    expect(result.stats.rooms).toBe(rooms); expect(result.map.floors[0]!.cells.length).toBe(width*height);
    const walkable=Uint8Array.from(result.map.floors[0]!.cells,c => Number(c.tileId==='tile.floor'));
    expect(reachableCells(width,height,walkable,result.map.start.y*width+result.map.start.x).reduce((a,b) => a+b,0)).toBe(result.stats.walkable);
  });
  it('막다른 가지 유지0은 가지를 줄이고1은 남긴다', () => {
    const remove=generateMap({ deadEndRetention:0,extraConnections:0 }), keep=generateMap({ deadEndRetention:1,extraConnections:0 });
    expect(remove.stats.deadEnds).toBeLessThan(keep.stats.deadEnds);
    expect(remove.stats.walkable).toBeLessThan(keep.stats.walkable);
  });
  it('추가 연결은 기존 바닥을 유지하며 요청 수만큼 벽을 연다', () => {
    const initial=generateMap({ extraConnections:0 }), linked=generateMap({ extraConnections:40 });
    expect(linked.stats.walkable-initial.stats.walkable).toBe(linked.stats.extraConnections);
    expect(linked.stats.extraConnections).toBe(40);
    const after=linked.map.floors[0]!.cells;
    initial.map.floors[0]!.cells.forEach((cell,i) => { if (cell.tileId==='tile.floor') expect(after[i]!.tileId).toBe('tile.floor'); });
  });
  it('통로 직진 성향에 따라 지형이 달라진다', () => {
    expect(generateMap({ straightness:0 }).map.floors).not.toEqual(generateMap({ straightness:1 }).map.floors);
  });
  it.each([{ width:8 },{ width:513 },{ height:NaN },{ rooms:0 },{ rooms:1.5 },{ roomMin:10,roomMax:4 },
    { deadEndRetention:-0.1 },{ straightness:1.1 },{ extraConnections:257 },{ version:0 },{ id:'tile.bad' },{ seed:[1,2,3,-1] as [number,number,number,number] }])('잘못된 설정%s는 생성 전에 거부한다', options => {
    expect(() => generateMap(options)).toThrow();
  });
  it('작은 맵의 과도한 방 요구는 묵살하지 않고 거부한다', () => {
    expect(() => generateMap({ width:9,height:9,rooms:20 })).toThrow('배치할 수 없습니다');
  });
  it('시드는 32비트 정수4개만 허용한다', () => {
    expect(parseMapSeed(' 0, 1,2,4294967295 ')).toEqual([0,1,2,0xffff_ffff]);
    for (const text of ['','1,2,3','1,,2,3','1,2,3,4.5','1,2,3,-1','1,2,3,4294967296']) expect(() => parseMapSeed(text)).toThrow();
  });
  it('맵이 아닌 파일·여러 층·위험 구역 시작은 제작자 도구에서 거부한다', () => {
    expect(() => loadMakerMap({})).toThrow();
    expect(loadMakerMap([{ kind:'tile' }]).ok).toBe(false);
    const multi=generateMap().map,other=structuredClone(multi.floors[0]!);other.floor=1;multi.floors.push(other);
    expect(loadMakerMap([multi]).ok).toBe(false);
    const unsafe=generateMap().map;
    unsafe.floors[0]!.cells.find(c => c.x===unsafe.start.x && c.y===unsafe.start.y)!.zoneId='zone.ruins';
    expect(loadMakerMap([unsafe]).ok).toBe(false);
  });
  it('지형 이동 시험은 상자·적 배치 원본을 보존하고 시험용 복사본에서만 제외한다', () => {
    const map=MapDefinitionSchema.parse(maps[0]), before=JSON.stringify(map),loaded=loadTerrainPreview(map);
    expect(loaded.ok).toBe(true);expect(JSON.stringify(map)).toBe(before);
    if (loaded.ok) {
      const result=loaded.content.byId[map.id];
      if (!result || !('kind' in result) || result.kind!=='map') throw new Error('맵 없음');
      expect(result.floors[0]!.cells.every(c => !c.chestId && !c.encounterId)).toBe(true);
      expect(result.floors[0]!.cells.map(c => c.tileId)).toEqual(map.floors[0]!.cells.map(c => c.tileId));
    }
  });
  it('실제 CLI 출력은 기존 맵 형식이며 검증 CLI를 통과하고 기존 파일을 덮어쓰지 않는다', () => {
    const dir=mkdtempSync(join(tmpdir(),'vigil-maker-')),file=join(dir,'map.json');
    const run=(script:string,args:string[]) => spawnSync(process.execPath,[script,...args],{ encoding:'utf8',timeout:10000 });
    try {
      const args=['--seed','1,2,3,4','--width','24','--height','24','--rooms','4','--out',file];
      expect(run('scripts/generate-map.ts',args).status).toBe(0);
      const before=readFileSync(file,'utf8'); expect(loadMakerMap(JSON.parse(before)).ok).toBe(true);
      expect(run('scripts/validate-content.ts',['--map',file]).status).toBe(0);
      expect(run('scripts/generate-map.ts',args).status).toBe(1); expect(readFileSync(file,'utf8')).toBe(before);
      expect(() => runGenerator(['--width','no','--out',join(dir,'bad.json')])).toThrow();
      expect(existsSync(join(dir,'bad.json'))).toBe(false);
      expect(() => runGenerator(['--unknown'])).toThrow();
    } finally { rmSync(dir,{ recursive:true,force:true }); }
  },15000); // 여러 Node 프로세스의 시작 비용은 전체 병렬 검사에서 더 커질 수 있다.
});
