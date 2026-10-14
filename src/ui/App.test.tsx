import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { strings } from './strings/index.ts';

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
});
