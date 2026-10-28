import {describe,it,expect} from 'vitest';
import innkeeper from '../world/npcs/innkeeper.json' with {type:'json'};
import {parseNpc} from './npc-schema.ts';

describe('NPC 대화 콘텐츠',()=>{
  it('여관 주인 대화 선택지와 연결을 검증한다',()=>{
    const npc=parseNpc(innkeeper);
    expect(npc.id).toBe('npc.innkeeper');
    expect(npc.nodes).toHaveLength(2);
    expect(npc.nodes[0]!.choices[0]!.nextNodeId).toBe('dialogue.about');
  });
  it('연결이 없거나 중복 노드이면 거부한다',()=>{
    const bad=structuredClone(innkeeper);
    bad.nodes[0]!.choices[0]!.nextNodeId='dialogue.missing';
    expect(()=>parseNpc(bad)).toThrow('연결 노드');
    bad.nodes[0]!.choices[0]!.nextNodeId='dialogue.about';
    bad.nodes.push(structuredClone(bad.nodes[0]!));
    expect(()=>parseNpc(bad)).toThrow('중복된');
  });
  it('도달할 수 없는 대화 노드와 잘못된 시작점을 거부한다',()=>{
    const bad=structuredClone(innkeeper);
    bad.nodes[0]!.choices[0]!.nextNodeId=undefined as unknown as string;
    bad.nodes[1]!.choices[0]!.nextNodeId=undefined as unknown as string;
    expect(()=>parseNpc(bad)).toThrow('도달할 수 없는');
    bad.startNodeId='dialogue.unknown';
    expect(()=>parseNpc(bad)).toThrow('시작 대화');
  });
});
