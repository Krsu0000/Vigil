import { describe, expect, it, vi } from 'vitest';
import { loadContent } from './load.ts';
import { rejectEffects, testSources } from './test-fixtures.ts';
import type { ContentLoadResult } from './types.ts';

function expectFailure(result: ContentLoadResult, code: string, file?: string): void {
  expect(result.ok).toBe(false);
  expect('content' in result).toBe(false);
  if (result.ok) throw new Error('잘못된 콘텐츠가 통과함');
  expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code, ...(file ? { file } : {}) })]));
}

describe('콘텐츠 로더', () => {
  it('실제 초기 데이터와 D-011·D-014의 값을 불러온다', () => {
    const result = loadContent(testSources(), rejectEffects);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('기본 데이터 검증 실패');
    expect(result.content.contentVersion).toBe('0.2.4');
    expect(result.content.timeRules).toMatchObject({
      id: 'rules.time', tickMs: 2_000, minimumMoveIntervalMs: 200, maxOfflineMs: 86_400_000,
      heartbeatIntervalMs: 15_000, heartbeatGraceMs: 120_000,
      ambush: { waitChancePerTick: 0.02, restChancePerTick: 0.1 },
      stamina: { recoveryIntervalMs: 2_000, max: 900, safeRegenPerTick: 1, waitRegenPerTick: 1, restRegenPerTick: 5,
        unexploredMoveCost: 6, exploredMoveCost: 3, safeMoveCost: 0 },
    });
    expect(result.content.definitions).toEqual([]);
    expect(result.content.byId['rules.time']).toBe(result.content.timeRules);
    expect(result.content.byId['toString']).toBeUndefined();
  });

  it('ID별 조회를 만들고 생략된 메타데이터 목록을 빈 배열로 초기화한다', () => {
    const result = loadContent(testSources([{ id: 'item.test' }]), rejectEffects);
    if (!result.ok) throw new Error('정의 로딩 실패');
    expect(result.content.byId['item.test']).toEqual({ id: 'item.test', references: [], dependsOn: [], effects: [] });
    expect(result.content.byId['item.test']).toBe(result.content.definitions[0]);
  });

  it('필수 매니페스트가 없으면 실패한다', () => {
    expectFailure(loadContent({}, rejectEffects), 'missing_file', 'manifest.json');
  });

  it('매니페스트 버전·필수 필드·추가 필드가 잘못됐으면 실패한다', () => {
    for (const manifest of [{}, { contentVersion: '', timeRulesFile: 'time-rules.json', definitionFiles: [] },
      { contentVersion: '0.1.0', timeRulesFile: 'time-rules.json', definitionFiles: [], extra: true }]) {
      expectFailure(loadContent({ ...testSources(), 'manifest.json': manifest }, rejectEffects), 'invalid_schema', 'manifest.json');
    }
  });

  it('참조 파일 경로의 상위 이동·절대 경로·역슬래시·다른 확장자를 거부한다', () => {
    for (const path of ['../time-rules.json', '/time-rules.json', 'maps\\test.json', 'rules.ts']) {
      const sources = testSources();
      sources['manifest.json'].timeRulesFile = path;
      expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'manifest.json');
    }
  });

  it('목록의 중복과 매니페스트 자기 참조를 거부한다', () => {
    const sources = testSources([]);
    sources['manifest.json'].definitionFiles.push('definitions.json');
    expectFailure(loadContent(sources, rejectEffects), 'duplicate_file', 'manifest.json');
    const self = testSources();
    self['manifest.json'].timeRulesFile = 'manifest.json';
    expectFailure(loadContent(self, rejectEffects), 'duplicate_file', 'manifest.json');
  });

  it('매니페스트가 가리키는 파일이 없으면 실패한다', () => {
    const sources = testSources();
    sources['manifest.json'].definitionFiles.push('missing.json');
    expectFailure(loadContent(sources, rejectEffects), 'missing_file', 'missing.json');
  });

  it('매니페스트에 없는 파일을 검증에서 누락하지 않는다', () => {
    expectFailure(loadContent({ ...testSources(), 'extra.json': [] }, rejectEffects), 'unlisted_file', 'extra.json');
  });

  it('시간 규칙의 단위 값은 양의 안전한 정수여야 한다', () => {
    for (const key of ['tickMs', 'minimumMoveIntervalMs', 'maxOfflineMs', 'heartbeatIntervalMs', 'heartbeatGraceMs'] as const) {
      for (const invalid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const sources = testSources();
        sources['time-rules.json'][key] = invalid;
        expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
      }
    }
  });

  it('스태미나 최대치는 양수, 회복량·비용은 0 이상의 안전한 정수다', () => {
    for (const key of Object.keys(testSources()['time-rules.json'].stamina) as (keyof ReturnType<typeof testSources>['time-rules.json']['stamina'])[]) {
      for (const invalid of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const sources = testSources();
        sources['time-rules.json'].stamina[key] = invalid;
        expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
      }
    }
    const zero = testSources();
    zero['time-rules.json'].stamina.max = 0;
    expectFailure(loadContent(zero, rejectEffects), 'invalid_schema', 'time-rules.json');
    const zeroInterval = testSources(); zeroInterval['time-rules.json'].stamina.recoveryIntervalMs = 0;
    expectFailure(loadContent(zeroInterval, rejectEffects), 'invalid_schema', 'time-rules.json');
  });

  it('하트비트 간격보다 짧은 유예 시간은 실패한다', () => {
    const sources = testSources();
    sources['time-rules.json'].heartbeatGraceMs = 14_999;
    expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
  });

  it.each([-0.01,1.01,NaN,Infinity])('범위 밖 습격 확률 %s를 거부한다', (chance) => {
    for (const key of ['waitChancePerTick','restChancePerTick'] as const) {
      const sources = testSources(); sources['time-rules.json'].ambush[key] = chance;
      expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
    }
  });

  it('휴식 습격 확률이 대기보다 낮으면 거부한다', () => {
    const sources = testSources(); sources['time-rules.json'].ambush.restChancePerTick = 0.01;
    expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
  });

  it('규칙의 ID 형식·종류와 정의의 ID 형식이 올바르지 않으면 실패한다', () => {
    for (const id of ['rules', 'Rules.time', 'rules.bad-name', 'item.time']) {
      const sources = testSources();
      sources['time-rules.json'].id = id;
      expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'time-rules.json');
    }
    expectFailure(loadContent(testSources([{ id: 'bad id' }]), rejectEffects), 'invalid_schema', 'definitions.json');
  });

  it('정의 배열과 메타데이터 형식·추가 필드를 검증한다', () => {
    for (const definitions of [[{ id: 'item.test', references: 'rules.time' }], [{ id: 'item.test', extra: true }], [null]]) {
      expectFailure(loadContent(testSources(definitions), rejectEffects), 'invalid_schema', 'definitions.json');
    }
    const sources = testSources([]);
    sources['definitions.json'] = {};
    expectFailure(loadContent(sources, rejectEffects), 'invalid_schema', 'definitions.json');
  });

  it('같은 파일·다른 파일·시간 규칙과의 ID 중복을 모두 거부한다', () => {
    expectFailure(loadContent(testSources([{ id: 'item.test' }, { id: 'item.test' }]), rejectEffects), 'duplicate_id');
    expectFailure(loadContent(testSources([{ id: 'rules.time' }]), rejectEffects), 'duplicate_id');
    const sources = testSources([{ id: 'item.test' }]);
    sources['manifest.json'].definitionFiles.push('second.json');
    sources['second.json'] = [{ id: 'item.test' }];
    expectFailure(loadContent(sources, rejectEffects), 'duplicate_id', 'second.json');
  });

  it('파일 순서와 무관하게 실제 존재하는 참조를 찾는다 (INV-15)', () => {
    const sources = testSources([{ id: 'item.first', references: ['item.second', 'rules.time'] }]);
    sources['manifest.json'].definitionFiles.push('second.json');
    sources['second.json'] = [{ id: 'item.second' }];
    expect(loadContent(sources, rejectEffects).ok).toBe(true);
  });

  it('일반 참조와 선행 의존의 누락을 위치와 함께 보고한다 (INV-15)', () => {
    const result = loadContent(testSources([{ id: 'item.test', references: ['item.missing'], dependsOn: ['item.other'] }]), rejectEffects);
    expectFailure(result, 'missing_reference', 'definitions.json');
    if (result.ok) throw new Error('누락 참조가 통과함');
    expect(result.errors.map((error) => error.path)).toEqual(['0.references.0', '0.dependsOn.0']);
  });

  it('일반 참조의 상호 연결은 허용한다', () => {
    expect(loadContent(testSources([
      { id: 'item.first', references: ['item.second'] },
      { id: 'item.second', references: ['item.first'] },
    ]), rejectEffects).ok).toBe(true);
  });

  it('자기 의존과 여러 정의의 순환 의존을 거부한다', () => {
    expectFailure(loadContent(testSources([{ id: 'item.self', dependsOn: ['item.self'] }]), rejectEffects), 'dependency_cycle');
    const result = loadContent(testSources([
      { id: 'item.first', dependsOn: ['item.second'] },
      { id: 'item.second', dependsOn: ['item.third'] },
      { id: 'item.third', dependsOn: ['item.first'] },
    ]), rejectEffects);
    expectFailure(result, 'dependency_cycle');
    if (result.ok) throw new Error('순환 의존이 통과함');
    expect(result.errors[0]?.message).toContain('item.first → item.second → item.third → item.first');
  });

  it('공유 선행 조건과 긴 의존 관계를 순환으로 오인하지 않는다', () => {
    const definitions = Array.from({ length: 3000 }, (_, index) => ({
      id: `item.n${index}`, dependsOn: index < 2999 ? [`item.n${index + 1}`, 'rules.time'] : ['rules.time'],
    }));
    expect(loadContent(testSources(definitions), rejectEffects).ok).toBe(true);
  });

  it('모든 효과를 전달받은 검증기로 검사하고 실행은 하지 않는다 (INV-16)', () => {
    const validate = vi.fn(rejectEffects);
    const result = loadContent(testSources([{ id: 'item.test', effects: [{ type: 'test/missing', params: {} }] }]), validate);
    expectFailure(result, 'unknown_effect', 'definitions.json');
    expect(validate).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledWith({ type: 'test/missing', params: {} });
  });

  it('효과 외피와 JSON이 아닌 매개변수는 효과 검증 전 실패한다', () => {
    const validate = vi.fn(rejectEffects);
    for (const effect of [{ type: '', params: {} }, { type: 'test/emit' }, { type: 'test/emit', params: () => 1 }]) {
      expectFailure(loadContent(testSources([{ id: 'item.test', effects: [effect] }]), validate), 'invalid_schema');
    }
    expect(validate).not.toHaveBeenCalled();
  });

  it('결과는 중첩까지 고정하고 입력이나 효과 매개변수와 객체를 공유하지 않는다', () => {
    const params = { nested: { values: [1, 2] } };
    const definition = { id: 'item.test', references: ['rules.time'], effects: [{ type: 'test/json', params }] };
    const sources = testSources([definition]);
    const before = structuredClone(sources);
    const result = loadContent(sources, () => ({ ok: true }));
    if (!result.ok) throw new Error('정의 로딩 실패');
    expect(sources).toEqual(before);
    expect(Object.isFrozen(params)).toBe(false);
    expect(Object.isFrozen(definition)).toBe(false);
    expect(Object.isFrozen(result.content.timeRules.stamina)).toBe(true);
    expect(Object.isFrozen(result.content.definitions[0]?.effects[0])).toBe(true);
    const saved = result.content.definitions[0]?.effects[0]?.params as typeof params;
    expect(Object.isFrozen(saved.nested.values)).toBe(true);
    params.nested.values.push(3);
    definition.references.push('item.absent');
    expect(saved.nested.values).toEqual([1, 2]);
    expect(result.content.definitions[0]?.references).toEqual(['rules.time']);
  });

  it('같은 입력은 같은 DB와 검증 결과를 만든다', () => {
    const sources = testSources([{ id: 'item.test', references: ['rules.time'] }]);
    expect(loadContent(sources, rejectEffects)).toEqual(loadContent(sources, rejectEffects));
  });
});
