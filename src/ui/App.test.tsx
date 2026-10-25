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

  it('이동 후 길의 벽 경계를 표시하되 탐사한 칸 수에는 추가하지 않는다', () => {
    const ctx = mapContext();
    const store = createNewGameStore(ctx.content, [1, 2, 3, 4], () => ctx.now);
    store.dispatch({ type: 'move/step', direction: 'east' });
    store.dispatch({ type: 'move/step', direction: 'east' });
    const html = renderToString(<App store={store} />);
    const wall = html.match(/<div role="gridcell"[^>]*data-x="1"[^>]*data-y="0"[^>]*>.*?<\/div>/)?.[0];
    expect(wall).toBeDefined();
    expect(wall).toContain('is-explored is-wall');
    expect(wall).toContain('wall-object');
    expect(wall).toContain('벽 (1, 0)');
    expect(Object.keys(store.getSnapshot().campaign.exploration['map.s1_test']!.visited)).toHaveLength(3);
  });

  it('엔진 자원·시간을 표시하고 상단 정지 버튼·위치별 시간 설명을 제외한다', () => {
    const ctx = mapContext(); const store = createNewGameStore(ctx.content, [1,2,3,4], () => ctx.now);
    for (const direction of ['east','east','south','south','east'] as const) store.dispatch({ type: 'move/step', direction });
    store.dispatch({ type: 'time/tick' });
    const html = renderToString(<App store={store} />);
    const textHtml = html.replaceAll('<!-- -->', '');
    expect(textHtml).toContain('data-testid="stamina">894 / 900');
    expect(textHtml).toContain('data-testid="game-time">1틱');
    expect(textHtml).toContain('data-testid="health">100 / 100');
    expect(textHtml).toContain('data-testid="sanity">—');
    expect(textHtml).toContain('data-testid="corruption">—');
    expect(html).toContain(strings.settings);
    expect(html).not.toContain('>일시정지<');
    expect(html).not.toContain('>재개<');
    expect(html).not.toContain(strings.offlineRecovery);
    expect(html).not.toContain('틱 간격 2초');
    expect(html).toContain('미니맵');
    expect(html).toContain('주 메뉴');
  });
});

describe('Play HUD 레이아웃 계약', () => {
  it('상호작용 대상이 없는 칸에는 빈 안내와 버튼 공간을 만들지 않는다', () => {
    const ctx = mapContext(), store = createNewGameStore(ctx.content, [1,2,3,4], () => ctx.now);
    const html = renderToString(<App store={store} />).replaceAll('<!-- -->','');
    expect(html).not.toContain('이 칸에는 상호작용할 대상이 없습니다.');
    expect(html).not.toContain('class="interaction-slot"');
    expect(html).toContain('class="action-dock"');
    expect(html).toContain('전체 기록');
    expect(html).not.toContain('session-chip');
    expect(html).toContain('data-testid="session-status"');
  });
});

describe('휴식·습격 표시', () => {
  it('휴식 중 상태와 중지 버튼·위험 안내를 엔진 상태에서 표시한다', () => {
    const ctx = mapContext(); const store = createNewGameStore(ctx.content,[1,2,3,4],() => ctx.now);
    for (const direction of ['east','east','south','south','east'] as const) store.dispatch({ type: 'move/step', direction });
    store.dispatch({ type: 'rest/start' });
    const html = renderToString(<App store={store} />).replaceAll('<!-- -->','');
    expect(html).toContain(strings.stopRest);
    expect(html).toContain('휴식 중');
    expect(html).not.toContain('회복↑ 습격↑');
    expect(html).toContain('class="command-shortcut" aria-hidden="true">R');
    expect(html).toContain('class="command-shortcut" aria-hidden="true">B');
  });

  it('미처리 습격은 안내·재열기 버튼을 유지하고 모든 이동 버튼을 비활성화한다', () => {
    const ctx = mapContext(); const store = createNewGameStore(ctx.content,[1,2,3,4],() => ctx.now);
    for (const direction of ['east','east','south','south','east'] as const) store.dispatch({ type: 'move/step', direction });
    const state = store.getSnapshot();
    const pending = { ...state, character: { ...state.character!, activity: 'waiting' as const },
      expedition: { pendingAmbush: { triggeredAt: 0, activityAtTrigger: 'resting' as const } } };
    const save = { format: 'last-vigil-save',schemaVersion: 6,contentVersion: '0.2.4',saveId: state.meta.campaignId,revision: 0,savedAt: ctx.now,state: pending };
    store.restore(save);
    const html = renderToString(<App store={store} />);
    expect(html).toContain('data-testid="session-status">조우');
    expect(html).toContain('미처리 조우 · 다시 열기');
    for (const direction of ['north','south','east','west']) expect(html).toMatch(new RegExp(`class="move-${direction}"[^>]*disabled`));
  });
});
