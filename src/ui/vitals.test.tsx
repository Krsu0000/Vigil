import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Vitals } from './StatusPanel.tsx';
import { GameStateSchema } from '../persistence/save-file.ts';
import { startedState } from '../engine/systems/map/test-fixtures.ts';

describe('직업별 자원 표시', () => {
  it.each([undefined, 'warrior', 'rogue'] as const)('%s는 기본 자원 네 개만 표시한다', archetype => {
    const base = startedState(); const state = { ...base, character: { ...base.character!, ...(archetype ? { archetype } : {}) } };
    const html = renderToStaticMarkup(<Vitals state={state}/>);
    for (const label of ['체력', '스태미나', '정신력', '오염도']) expect(html).toContain(label);
    expect(html.match(/class="vital"/g)).toHaveLength(4); expect(html).not.toContain('마나');
  });
  it('마법사는 실제 마나를 다섯 번째 자원으로 표시하고 저장한다', () => {
    const base = startedState(); const state = { ...base, character: { ...base.character!, archetype: 'mage' as const, mana: { current: 23, max: 80 } } };
    expect(GameStateSchema.parse(state)).toEqual(state);
    const html = renderToStaticMarkup(<Vitals state={state}/>);
    expect(html).toContain('마나'); expect(html).toContain('23 / 80'); expect(html.match(/class="vital"/g)).toHaveLength(5);
  });
  it('아직 마나 수치가 없는 마법사는 값을 만들어 넣지 않는다', () => {
    const base = startedState(); const state = { ...base, character: { ...base.character!, archetype: 'mage' as const } };
    expect(renderToStaticMarkup(<Vitals state={state}/>)).toContain('data-testid="mana">—');
  });
  it('마법사가 아닌 캐릭터의 마나 저장을 거부한다', () => {
    const base = startedState(); expect(() => GameStateSchema.parse({ ...base, character: { ...base.character!, archetype: 'rogue', mana: { current: 1, max: 1 } } })).toThrow();
  });
});
