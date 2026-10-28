import {describe,it,expect} from 'vitest';
import {availableTowns} from './towns.ts';
import {findNpc,registeredNpcs,validateRegisteredTownNpcs} from './npcs.ts';

describe('T2-C3 NPC 배포 참조',()=>{
  it('첫 마을 여관의 여관 주인 고정 배치를 확인한다',()=>{
    const town=availableTowns[0]!;
    expect(registeredNpcs.map(n=>n.id)).toEqual(['npc.innkeeper']);
    expect(findNpc('npc.innkeeper')?.name).toBe('여관 주인');
    expect(()=>validateRegisteredTownNpcs(town)).not.toThrow();
  });
  it('등록되지 않은 NPC ID는 실제 마을 입장 전 거부한다',()=>{
    const town=structuredClone(availableTowns[0]!);
    const inn=town.scenes.find(s=>s.id==='scene.inn')!;
    const spot=inn.hotspots.find(h=>h.target.type==='npc')!;
    spot.target={type:'npc',npcId:'npc.missing'};
    expect(()=>validateRegisteredTownNpcs(town)).toThrow('등록되지 않은');
  });
});
