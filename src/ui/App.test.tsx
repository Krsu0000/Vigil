import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { strings } from './strings/index.ts';

describe('App', () => {
  it('게임 제목을 표시한다', () => {
    const html = renderToString(<App />);
    expect(html).toContain(strings.gameTitle);
  });
});
