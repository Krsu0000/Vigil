import { describe, expect, it } from 'vitest';
import { reachableCells } from './map-reachability.ts';
import { mapSources, rejectEffects } from './test-fixtures.ts';
import { loadContent } from './load.ts';

describe('맵 도달 가능성', () => {
  it('대각선과 행 끝을 이어 붙이지 않는다', () => {
    expect([...reachableCells(2,2,Uint8Array.from([0,1,1,0]),1)]).toEqual([0,1,0,0]);
  });
  it('벽인 시작점에서는 방문하지 않는다', () => {
    expect([...reachableCells(2,2,Uint8Array.from([0,1,1,1]),0)]).toEqual([0,0,0,0]);
  });
  it('고립된 바닥을 파일·층·첫 좌표와 함께 거부한다', () => {
    const sources=mapSources(),cell=sources['maps/s1-test.json'][0]!.floors[0]!.cells.find(c => c.x===4 && c.y===0)!;
    cell.tileId='tile.floor';
    const loaded=loadContent(sources,rejectEffects);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.errors).toContainEqual(expect.objectContaining({ code:'unreachable_cells',file:'maps/s1-test.json',path:'0.floors.0.cells',message:expect.stringContaining('4, 0') }));
  });
  it('수동 JSON의 셀 배열 순서에 의존하지 않는다', () => {
    const sources=mapSources(); sources['maps/s1-test.json'][0]!.floors[0]!.cells.reverse();
    expect(loadContent(sources,rejectEffects).ok).toBe(true);
  });
  it('시작 층 외의 층도 내부에서 고립된 바닥을 검사한다', () => {
    const sources=mapSources(),map=sources['maps/s1-test.json'][0]!,other=structuredClone(map.floors[0]!);
    other.floor=1;other.cells.find(c => c.x===4 && c.y===0)!.tileId='tile.floor';map.floors.push(other);
    const loaded=loadContent(sources,rejectEffects);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.errors.some(e => e.code==='unreachable_cells' && e.path==='0.floors.1.cells')).toBe(true);
  });
});
