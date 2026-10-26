import {renderToString} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {MakerNavigation} from './maker-navigation.tsx';

describe('제작 도구 공통 내비게이션',()=>{
  it('구현된 맵·몬스터·마을 메이커만 링크로 제공하고 미래 기능은 비활성 안내로 표시한다',()=>{
    const html=renderToString(<MakerNavigation active="map"/>);
    expect(html).toContain('href="/map-maker.html"');
    expect(html).toContain('href="/monster-maker.html"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/town-maker.html"');
    expect(html).toContain('NPC · 퀘스트: 준비 중');
    expect(html).not.toContain('href="/quest-maker.html"');
  });
  it('마을 메이커를 현재 페이지로 정확히 표시한다',()=>{
    const html=renderToString(<MakerNavigation active="town"/>);
    expect(html).toContain('href="/town-maker.html" aria-current="page"');
  });
  it('몬스터 메이커를 현재 페이지로 정확히 표시한다',()=>{
    const html=renderToString(<MakerNavigation active="monster"/>);
    expect(html).toContain('href="/monster-maker.html" aria-current="page"');
  });
});
