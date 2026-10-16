import { z } from 'zod';
import { ContentIdSchema, MapDefinitionSchema } from '../src/content/schemas.ts';
import type { MapDefinition } from '../src/content/schemas.ts';
import { createRng, seedRngState } from '../src/engine/core/rng.ts';

const uint32 = z.number().int().min(0).max(0xffff_ffff);
export const GeneratorOptionsSchema = z.strictObject({
  seed: z.tuple([uint32,uint32,uint32,uint32]).default([1,2,3,4]),
  width: z.number().int().min(9).max(512).default(64),
  height: z.number().int().min(9).max(512).default(48),
  rooms: z.number().int().min(1).max(128).default(12),
  roomMin: z.number().int().min(3).max(31).default(3),
  roomMax: z.number().int().min(3).max(63).default(9),
  straightness: z.number().min(0).max(1).default(0.6),
  deadEndRetention: z.number().min(0).max(1).default(0.35),
  extraConnections: z.number().int().min(0).max(256).default(6),
  id: ContentIdSchema.refine(id => id.startsWith('map.')).default('map.generated'),
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
}).refine(o => o.roomMin <= o.roomMax && o.roomMin <= Math.min(o.width,o.height)-2,
  { message:'방의 최소·최대 크기를 맵 내부에 맞춰 주세요.',path:['roomMin'] });
export type GeneratorOptions = z.infer<typeof GeneratorOptionsSchema>;
type Rect = { x:number; y:number; width:number; height:number };
export type GeneratedMap = {
  map:MapDefinition;
  options:GeneratorOptions;
  stats:{ rooms:number; walkable:number; deadEnds:number; extraConnections:number };
};

export function parseMapSeed(text:string):[number,number,number,number] {
  if (!/^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(text)) throw new Error('시드는 쉼표로 구분한 0~4294967295 정수4개입니다.');
  return z.tuple([uint32,uint32,uint32,uint32]).parse(text.split(',').map(Number));
}

// 제작 시에만 실행한다. 게임 난수 상태·시각·기존 맵을 참조하거나 변경하지 않는다.
export function generateMap(input:Partial<GeneratorOptions> = {}):GeneratedMap {
  const o = GeneratorOptionsSchema.parse(input), rng = createRng(seedRngState(o.seed));
  // BSP로 방의 자리부터 나눈다. 시도 횟수에 따라 방 개수가 조용히 줄어들지 않는다.
  const regions:Rect[] = [{ x:1,y:1,width:o.width-2,height:o.height-2 }];
  while (regions.length < o.rooms) {
    let chosen = -1, area = -1;
    regions.forEach((r,i) => {
      if ((r.width >= o.roomMin*2+1 || r.height >= o.roomMin*2+1) && r.width*r.height > area) { chosen=i; area=r.width*r.height; }
    });
    if (chosen < 0) throw new Error('지정한 방 개수를 배치할 수 없습니다. 방 개수/최소 크기를 줄이거나 맵을 넓혀 주세요.');
    const r = regions[chosen]!;
    const vertical = r.width >= o.roomMin*2+1 && (r.height < o.roomMin*2+1 || r.width >= r.height);
    const length = vertical ? r.width : r.height;
    // 극단적으로 작은 분할을 반복하지 않도록 가능한 중앙 절반에서 나눈다.
    const low = Math.max(o.roomMin,Math.floor(length/3));
    const high = Math.min(length-o.roomMin-1,Math.floor(length*2/3));
    const split = rng.nextInt(low,Math.max(low,high));
    const first = vertical ? { ...r,width:split } : { ...r,height:split };
    const second = vertical ? { ...r,x:r.x+split+1,width:r.width-split-1 } : { ...r,y:r.y+split+1,height:r.height-split-1 };
    regions.splice(chosen,1,first,second);
  }
  const rooms = regions.map(r => {
    const width=rng.nextInt(o.roomMin,Math.min(o.roomMax,r.width)), height=rng.nextInt(o.roomMin,Math.min(o.roomMax,r.height));
    return { x:rng.nextInt(r.x,r.x+r.width-width),y:rng.nextInt(r.y,r.y+r.height-height),width,height };
  });
  const total=o.width*o.height, floor=new Uint8Array(total), protectedRoom=new Uint8Array(total);
  const directions = [[0,-2],[2,0],[0,2],[-2,0]] as const;
  const stack = [{ x:1,y:1,direction:-1 }]; floor[o.width+1]=1;
  // 명시적 스택의 깊이 우선 미로: 홀수 격자를 모두 연결하므로 모든 방이 이 통로와 만난다.
  while (stack.length) {
    const current=stack[stack.length-1]!;
    const choices=directions.flatMap(([dx,dy],i) => {
      const x=current.x+dx,y=current.y+dy;
      return x>0 && y>0 && x<o.width-1 && y<o.height-1 && !floor[y*o.width+x] ? [i] : [];
    });
    if (!choices.length) { stack.pop(); continue; }
    const d=choices.includes(current.direction) && rng.nextFloat()<o.straightness ? current.direction : choices[rng.nextInt(0,choices.length-1)]!;
    const [dx,dy]=directions[d]!, x=current.x+dx,y=current.y+dy;
    floor[(current.y+dy/2)*o.width+current.x+dx/2]=1; floor[y*o.width+x]=1;
    stack.push({ x,y,direction:d });
  }
  for (const r of rooms) for (let y=r.y;y<r.y+r.height;y++) for (let x=r.x;x<r.x+r.width;x++) {
    floor[y*o.width+x]=1; protectedRoom[y*o.width+x]=1;
  }
  const neighbors = (i:number) => [i-o.width,i+1,i+o.width,i-1].filter(n => floor[n]);
  const leaves:number[]=[];
  for (let i=0;i<total;i++) if (floor[i] && !protectedRoom[i] && neighbors(i).length===1) leaves.push(i);
  for (const leaf of leaves) {
    if (rng.nextFloat()<o.deadEndRetention) continue;
    let current=leaf;
    while (floor[current] && !protectedRoom[current]) {
      const next=neighbors(current); if (next.length!==1) break;
      floor[current]=0; current=next[0]!;
    }
  }
  // 이미 연결된 두 바닥 사이의 벽을 열어 순환 경로를 추가한다.
  const candidates:number[]=[];
  for (let y=1;y<o.height-1;y++) for (let x=1;x<o.width-1;x++) {
    const i=y*o.width+x;
    if (!floor[i] && ((floor[i-1] && floor[i+1]) || (floor[i-o.width] && floor[i+o.width]))) candidates.push(i);
  }
  const connections=Math.min(o.extraConnections,candidates.length);
  for (let k=0;k<connections;k++) {
    const j=rng.nextInt(k,candidates.length-1);
    [candidates[k],candidates[j]]=[candidates[j]!,candidates[k]!]; floor[candidates[k]!]=1;
  }
  const camp=rooms[0]!, start={ floor:0,x:camp.x+Math.floor(camp.width/2),y:camp.y+Math.floor(camp.height/2) };
  let walkable=0,deadEnds=0;
  const cells=Array.from({ length:total },(_,i) => {
    const x=i%o.width,y=Math.floor(i/o.width);
    if (floor[i]) { walkable++; if (neighbors(i).length===1) deadEnds++; }
    return { x,y,tileId:floor[i]?'tile.floor':'tile.wall',zoneId:x>=camp.x && x<camp.x+camp.width && y>=camp.y && y<camp.y+camp.height?'zone.camp':'zone.ruins' };
  });
  const map=MapDefinitionSchema.parse({ kind:'map',id:o.id,version:o.version,name:'생성한 탐험 맵',
    description:`T1 생성기 v1 · 시드 ${o.seed.join(',')} · 제작자가 검토할 지형 초안입니다.`,start,
    floors:[{ floor:0,width:o.width,height:o.height,cells }] });
  return { map,options:o,stats:{ rooms:rooms.length,walkable,deadEnds,extraConnections:connections } };
}
