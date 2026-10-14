import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { strings } from './strings/index.ts';
import { createNewGameStore } from '../runtime/store.ts';
import { mapContext } from '../engine/systems/map/test-fixtures.ts';

describe('App', () => {
  it('게임 제목을 표시한다', () => {
    const html = renderToString(<App />);
    expect(html).toContain(strings.gameTitle);
  });

  it('콘텐츠 오류가 없으면 오류 화면을 표시하지 않는다', () => {
    expect(renderToString(<App contentErrors={[]} />)).not.toContain('role="alert"');
  });

  it('콘텐츠 실패는 오류 위치와 안내를 표시하고 문구를 HTML로 실행하지 않는다', () => {
    const html = renderToString(<App contentErrors={[{
      file: 'definitions.json', path: '0.references.0', code: 'missing_reference', message: '<script>오류</script>',
    }]} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(strings.contentLoadFailed);
    expect(html).toContain('definitions.json');
    expect(html).toContain('0.references.0');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('시작 실패 시 맵을 표시하지 않고 안내한다', () => {
    const html = renderToString(<App startupError />);
    expect(html).toContain(strings.startupFailed);
    expect(html).not.toContain('role="grid"');
  });

  it('맵·모바일 이동 버튼을 표시하고 가려진 지형을 DOM에 넣지 않는다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, [1, 2, 3, 4], () => ctx.now);
    const html = renderToString(<App store={store} />);
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="오른쪽으로 이동"');
    const hidden = html.match(/<div role="gridcell"[^>]*data-x="4"[^>]*data-y="1"[^>]*>.*?<\/div>/)?.[0];
    expect(hidden).toBeDefined();
    expect(hidden).toContain('미탐사');
    expect(hidden).not.toContain('is-wall');
    expect(hidden).not.toContain('벽');
    expect(hidden).not.toContain('tile.wall');
  });
});
