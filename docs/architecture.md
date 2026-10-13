# architecture.md — The Last Vigil 구조 설계

시스템 구조, 모듈 의존성, 데이터 흐름, 게임 상태와 주요 인터페이스, 불변 조건을 정의한다. 게임 규칙과 수치는 `docs/game-design.md`, 실제 구현 현황은 `docs/features.md`가 기준이다.

## 0. 문서 상태와 표기

- **현재 상태: 설계 단계. 구현된 코드 없음(S0 착수 전).** 이 문서의 모든 내용은 계획이다.
- 각 항목의 상태 표기:
  - `[구현됨]` 코드와 테스트가 있다
  - `[설계]` 합의된 설계, 아직 구현하지 않음
  - `[초안]` 제안 단계, 사용자 승인 후 `[설계]`로 바꾼다
- 단계 번호(S0, S1 …)는 `docs/roadmap.md`가 기준이다.
- 코드가 이 문서와 달라지면 이 문서를 고친다. 구현 전 설계를 바꿀 때는 `docs/decisions.md`에 기록한다.

## 1. 전체 구조

### 1.1 계층과 책임 `[설계]`

| 계층 | 경로 | 책임 |
|---|---|---|
| 콘텐츠 | `src/content/` | JSON 콘텐츠, Zod 스키마, 로더, 교차 참조 검증 |
| 엔진 코어 | `src/engine/core/` | 상태 타입, `dispatch`, 효과 레지스트리, 수정치 계산, 시드 난수, ID 규칙 |
| 엔진 시스템 | `src/engine/systems/` | 시스템별 상태 조각, 행동 처리기, 규칙 계산 |
| 저장 | `src/persistence/` | 세이브 형식, 직렬화, 버전 변환, IndexedDB, 내보내기·가져오기 |
| 런타임 | `src/runtime/` | 브라우저 연결부: 게임 상태 보관(GameStore), 틱 루프, 일시정지, 하트비트, 자동 저장 예약 |
| UI | `src/ui/` | React 컴포넌트, 표시, 일시적 UI 상태, UI 시스템 문구 |
| 동기화 | `src/sync/` | 클라이언트 동기화 (서버 도입 단계부터) |
| 서버 | `server/` | Workers 런타임과 D1 마이그레이션 (서버 도입 단계부터) |

엔진은 브라우저 API를 쓸 수 없고 UI는 게임 규칙을 처리하면 안 되므로, 둘을 잇는 브라우저 의존 코드(틱 루프, `visibilitychange`, `performance.now()`)는 `src/runtime/`에 둔다(D-006).

### 1.2 의존 방향 `[설계]`

```
ui ──────▶ runtime ──────▶ engine ──────▶ content
 │            │                ▲
 │            └──▶ persistence ┘ (타입만)
 └──────────────▶ engine (타입과 조회 함수만)

sync ──▶ persistence          (서버 도입 단계)
server   클라이언트 코드를 import하지 않는다. 공유 타입은 별도 패키지 또는 복사본으로 둔다.
```

- `engine`은 `ui`, `runtime`, `persistence`, `sync`, React, DOM을 import하지 않는다.
- `engine/core`는 `engine/systems`를 import하지 않는다. 시스템이 코어에 등록된다.
- `content`는 Zod 외에 프로젝트 모듈을 import하지 않는다.
- `ui`는 게임 상태를 바꾸는 코드를 갖지 않는다. 상태 변경은 `runtime`의 `GameStore.dispatch`를 호출한다.

### 1.3 데이터 흐름 `[설계]`

```
[입력·버튼]          [틱 타이머·하트비트]
     │                       │
     ▼                       ▼
runtime/GameStore.dispatch(action)
     │  ctx = { content, now }   (now = 런타임이 읽은 Wall-clock ms)
     ▼
engine/dispatch(state, action, ctx) ──▶ { ok, state, events } 또는 { ok:false, reason }
     │
     ├──▶ GameStore 상태 교체 ──▶ UI 다시 그리기 (useSyncExternalStore)
     ├──▶ events ──▶ UI 기록창·알림
     └──▶ 자동 저장 예약 ──▶ persistence ──▶ IndexedDB

불러오기:
IndexedDB ──▶ persistence(형식 확인 → 버전 변환 → Zod 검증) ──▶ GameStore 초기화
          ──▶ dispatch(time/settle) 로 오프라인 정산 1회
```

## 2. 게임 상태

### 2.1 영역과 소유권 `[설계]`

| 영역 | 내용 | 수명 | 캐릭터 사망 시 |
|---|---|---|---|
| 콘텐츠(ContentDb) | 맵·아이템·몬스터·시설·규칙 정의 | 콘텐츠 버전 단위 | 해당 없음. 세이브에 넣지 않는다 |
| `meta` | 캠페인 ID, 게임 시간, 난수 상태, 정산 시각 | 캠페인 전체 | 유지 |
| `campaign` | 탐사 기록, 길 지식, 거점·시설, 창고, 코덱스, 세계 퀘스트, 채집지, 방치 작업, 사망·구울 기록, 연대기 | 캠페인 전체 | 유지 |
| `character` | 능력치, 체력·스태미나·정신력·오염, 레벨, 장비, 휴대품, 상태이상, 위치, 현재 활동 | 캐릭터 생애 | 유해·구울 데이터로 변환 후 `null` |
| `expedition` | 이번 외출의 동적 상태: 적과 전리품 상태, 설치한 야영지, 진행 중 전투 | 위험지대 외출 1회 | 폐기 |
| 세션 런타임 | 일시정지 여부, 하트비트, 마지막 틱 시각 | 브라우저 세션 | 해당 없음. 세이브에 넣지 않는다 |
| UI 상태 | 열린 창, 선택 탭, 입력 중 텍스트 | 컴포넌트 | 해당 없음 |

- 각 필드는 정확히 한 시스템이 소유하고, 다른 시스템은 읽기만 한다. 소유 시스템은 6장 모듈 표에 적는다.
- 같은 정보를 두 곳에 저장하지 않는다. 파생 값(예: 현재 위치의 구역 종류)은 저장하지 않고 계산한다.

### 2.2 상태 타입의 최소형 `[설계]`

S0에서는 아래 뼈대만 만든다. 각 시스템의 필드는 그 시스템이 도입되는 단계에서 추가한다.

```ts
// src/engine/core/state.ts
export type GameState = {
  meta: StateMeta;
  campaign: CampaignState;            // 시스템별 조각을 단계마다 추가
  character: CharacterState | null;   // 사망 후 새 캐릭터 생성 전에는 null
  expedition: ExpeditionState | null; // 위험지대 외출 중에만 존재
};

export type StateMeta = {
  campaignId: string;    // UUID
  gameTime: number;      // Game Time, 틱 단위 정수. 시간 시스템만 변경
  rngState: number[];    // 시드 난수의 내부 상태 (알고리즘은 5장)
  lastActiveAt: number;  // Wall-clock ms. 마지막으로 실행이 확인된 시각
  settledUntil: number;  // Wall-clock ms. 오프라인 정산이 끝난 시각
};
```

- 상태는 JSON으로 직렬화할 수 있어야 한다. 함수, 클래스 인스턴스, `Map`, `Set`, `Date`를 넣지 않는다. 목록은 배열, 조회용 묶음은 `Record<string, T>`를 쓴다.
- 상태는 불변 객체로 다룬다. 새 상태는 바뀐 부분만 새로 만든다. 갱신 코드는 직접 작성한다(D-009). 갱신 코드가 지나치게 복잡해지면 Immer 도입을 다시 검토한다.

## 3. 행동 처리

### 3.1 dispatch `[설계]`

```ts
// src/engine/core/dispatch.ts
export type EngineContext = {
  content: ContentDb;
  now: number;            // 이번 행동 시점의 Wall-clock ms. 런타임이 주입
};

export type DispatchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; reason: RejectReason }; // state는 입력과 같은 참조

export function dispatch(state: GameState, action: Action, ctx: EngineContext): DispatchResult;
```

처리 순서:

1. 행동 종류로 처리기를 찾는다. 없으면 `{ ok: false, reason: 'unknown_action' }`.
2. `validate`: 실행 조건과 필요한 자원을 확인한다. 실패하면 상태를 바꾸지 않고 거부한다.
3. 상태의 `rngState`로 난수 생성기를 만든다.
4. `execute`: 효과를 계산하고, 새 상태와 사건을 만든다.
5. 난수 생성기의 새 내부 상태를 새 상태의 `meta.rngState`에 기록한다.

```ts
// src/engine/core/actions.ts
export type ActionHandler<A extends Action> = {
  validate(state: GameState, action: A, ctx: EngineContext): RejectReason | null;
  execute(state: GameState, action: A, ctx: EngineContext, rng: Rng):
    { state: GameState; events: GameEvent[] };
};
```

- 처리기 목록은 시작 시점에 고정된 객체로 만든다. 실행 중에 처리기를 추가·제거하는 플러그인 구조는 만들지 않는다.
- `Action`과 `GameEvent`는 `type` 문자열로 구분하는 유니온 타입이다. 이름 형식은 `영역/동작` (예: `move/step`, `time/tick`, `rest/start`).
- 거부와 실패를 구분한다. 거부(조건 불충족)는 상태와 자원을 바꾸지 않는다. 실행된 뒤의 실패(공격 빗나감 등)는 `execute` 안에서 명세대로 비용을 처리한다.

### 3.2 dispatch를 거치지 않는 경로 `[설계]`

| 경로 | 위치 | 용도 |
|---|---|---|
| `createCampaign(content, seed, now)` | `engine/core` | 새 캠페인 초기 상태 생성 |
| `restoreSave(raw)` | `persistence` | 형식 확인 → 버전 변환 → Zod 검증 → `GameState` |
| 버전 변환 함수 | `persistence/migrations/` | 이전 스키마의 세이브를 다음 버전으로 변환 |

새 캐릭터 생성은 게임 안의 행동이므로 `dispatch`를 거친다.

## 4. 시간

### 4.1 두 종류의 시간 `[설계]`

| 시간 | 단위 | 저장 위치 | 바꾸는 곳 | 쓰임 |
|---|---|---|---|---|
| Game Time | 틱(정수) | `meta.gameTime` | 시간 시스템의 `advanceTime`만 | 회복, 습격 판정, 음식 버프, 퀘스트 제한 시간, 야영지 보호 시간 |
| Wall-clock Time | ms (epoch) | 방치 작업의 시작·종료 시각, `lastActiveAt`, `settledUntil` | 런타임이 `ctx.now`로 주입 | 방치 작업 타이머, 오프라인 경과 계산, 저장 시각 |

변환 규칙:

- 진행 상태에서 런타임은 1틱 길이(콘텐츠의 시간 규칙 값, 임시값 10초. D-011)만큼 실행 시간이 지날 때마다 `time/tick`을 보낸다.
- 스태미나와 모든 회복량·비용은 정수다. 최대치와 틱당 회복량을 정수 단위로 맞춘다(D-014, 임시).
- 정지 상태에서는 `time/tick`을 보내지 않는다. 방치 작업은 Wall-clock 기준이라 정지와 무관하게 끝난다.
- 오프라인 경과 시간을 틱으로 바꾸는 것은 `time/settle`뿐이다 (4.3절).

### 4.2 시간 시스템 `[설계]`

```ts
// src/engine/systems/time/advance.ts
export function advanceTime(state: GameState, ticks: number, ctx: EngineContext, rng: Rng):
  { state: GameState; events: GameEvent[] };
```

- 실시간 틱과 오프라인 정산이 같은 함수를 쓴다. 오프라인 전용 계산을 따로 만들지 않는다.
- 많은 틱을 한꺼번에 처리할 때, 난수가 없는 구간(거점의 회복)은 한 번에 계산하고 난수가 있는 구간(위험지대 습격 판정)만 틱 단위로 처리한다. 두 방식의 결과가 같다는 것을 테스트로 고정한다.
- 한 행동에서 시간을 두 번 진행시키지 않는다. 시간을 쓰는 행동(예: 야영지 설치)은 처리기 안에서 `advanceTime`을 한 번만 호출한다.

### 4.3 오프라인 정산 `[설계]`

불러오기 직후, 또는 화면이 다시 보일 때 런타임이 `{ type: 'time/settle', to: now }`를 한 번 보낸다.

1. `from = meta.settledUntil`, `elapsed = to - from`.
2. `elapsed <= 0`이면 아무것도 하지 않는다. 기기 시각이 뒤로 간 경우도 여기에 해당하며, 자원과 타이머를 되돌리지 않는다.
3. `elapsed`를 최대 인정 시간(콘텐츠 값, 임시값 24시간. D-011)으로 자른다. 방치 작업의 완료 여부는 이 상한과 무관하게 종료 시각으로 판단한다.
4. 위치가 거점 또는 보호 중인 야영지면 `elapsed`를 틱으로 바꿔 `advanceTime`을 호출한다. 야영지 보호가 도중에 끝나면 그 틱에서 멈춘다. 위험지대면 0틱이다.
5. 종료 시각이 `to` 이전인 방치 작업을 완료 처리한다. 각 작업은 완료 표시가 있어 결과를 두 번 지급하지 않는다.
6. `settledUntil = to`로 갱신한다.

같은 `to`로 두 번 호출해도 두 번째는 아무것도 하지 않는다(멱등). 과도한 시간 점프는 3번의 상한으로 제한한다.

### 4.4 런타임의 시간 처리 `[설계]`

```ts
// src/runtime/clock.ts
export type Clock = { wallNow(): number; monotonicNow(): number };
```

- 실시간 틱은 `monotonicNow()`(= `performance.now()`) 차이로 센다.
- 하트비트: 실행 중에는 일정 간격(임시값 15초)으로 `lastActiveAt`을 갱신하는 행동을 보낸다. 다음 하트비트까지의 간격이 유예 시간(임시값 2분)보다 길면, 위험지대에서는 그 공백을 정지로 처리하고 틱을 보내지 않는다(D-011).
- 테스트에서는 가짜 `Clock`을 주입한다.

## 5. 난수 `[설계]`

- 의존성 없이 직접 구현하는 작은 시드 난수 생성기를 `src/engine/core/rng.ts`에 둔다. sfc32(내부 상태 32비트 정수 4개)를 쓴다(D-008).
- 생성기의 내부 상태는 `meta.rngState`에 저장한다. 그래서 저장 후 불러와도 같은 난수 흐름이 이어진다.
- 새 캠페인의 시드는 런타임이 `crypto.getRandomValues`로 만들어 `createCampaign`에 넘긴다.
- 전투 기록(`CombatLog`)은 전투 시작 시점의 `rngState`와 플레이어가 고른 행동 목록을 담는다. 같은 콘텐츠 버전에서 재생하면 같은 결과가 나와야 한다.

## 6. 콘텐츠 `[설계]`

- 종류별 JSON 파일과 Zod 스키마를 `src/content/`에 둔다. 예: `items.json`, `monsters.json`, `maps/*.json`, `time-rules.json`.
- 시작 시 모든 파일을 읽어 1차로 스키마를 검증하고, 2차로 교차 참조(존재하지 않는 ID, 순환 의존)를 검증한 뒤 ID별 조회가 가능한 `ContentDb`를 만든다. 검증에 실패하면 게임을 시작하지 않고 오류를 보여 준다.
- `npm run validate:content`는 같은 검증 코드를 Node에서 실행한다.
- 콘텐츠 ID는 `종류.이름` 형식의 소문자 영문이다 (예: `item.dried_ration`, `monster.genlock`). 한 번 배포한 ID는 바꾸지 않는다. 세이브가 참조하는 ID를 지우거나 바꾸려면 세이브 버전 변환이 필요하다.
- 캐릭터, 캠페인, 사망 기록처럼 실행 중에 생기는 개체는 UUID를 쓴다. 서버 도입 시 ID가 겹치지 않게 하기 위해서다.
- 콘텐츠 매니페스트에 `contentVersion`을 둔다.
- 버튼 문구, 오류 메시지 같은 UI 시스템 문구는 콘텐츠가 아니라 `src/ui/strings/`에 둔다.

## 7. 효과와 수정치

### 7.1 효과 레지스트리 `[설계]`

```ts
// src/engine/core/effects.ts
export type EffectInstance = { type: string; params: unknown };

export type EffectHandler<P> = {
  params: z.ZodType<P>;   // 이 효과의 매개변수 스키마
  apply(state: GameState, params: P, ctx: EngineContext, rng: Rng):
    { state: GameState; events: GameEvent[] };
};
```

- 효과 처리기는 효과 유형 이름을 키로 하는 고정된 객체에 등록한다.
- 콘텐츠를 불러올 때 모든 효과의 `type`이 등록되어 있는지, `params`가 해당 스키마에 맞는지 검증한다. 등록되지 않은 효과는 실행 단계까지 가지 않는다.
- 효과 유형은 필요한 단계에서 하나씩 추가한다. S0에서는 레지스트리와 테스트용 효과 하나만 만든다.

### 7.2 수치 수정치 `[설계]`

```ts
// src/engine/core/modifiers.ts
export type Modifier = {
  target: string;          // 예: 'move_cost', 'stamina_regen_rest'
  op: 'add' | 'mul';
  value: number;
  source: string;          // 출처 ID (장비, 상태이상, 시설, 지형 등)
};

export type ValueRule = {  // target별로 콘텐츠에 정의
  round: 'none' | 'floor' | 'round' | 'ceil';
  min?: number;
  max?: number;
};

export function computeValue(base: number, mods: Modifier[], rule: ValueRule): number;
```

계산 순서:

1. 기본값
2. `add` 값을 모두 더한다
3. `mul` 값을 모두 곱한다 (예: 50% 감면은 `0.5`. 두 개가 겹치면 `0.25`)
4. `rule.round`로 반올림한다
5. `rule.min`, `rule.max`로 자른다

예: 이동 비용 기본 2, 장비 `add -1`, 과적 `add +1`, 탐사 경로 `mul 0.5` → (2 − 1 + 1) × 0.5 = 1 → 반올림 1 → 최소 0 적용 → **1**.

- 수정치를 모으는 함수는 시스템별로 하나씩 두고(장비, 상태이상, 시설, 지형·길 지식), `computeValue`에 넘기기 전에 합친다.
- 모든 수치 계산은 `computeValue`를 거친다. 시스템 안에서 따로 더하거나 곱하지 않는다.
- 이 순서는 D-007로 승인되었다. `core/modifiers.test.ts`로 고정한다.

## 8. 저장

### 8.1 세이브 형식 `[설계]`

```ts
// src/persistence/save-file.ts
export type SaveFile = {
  format: 'last-vigil-save';
  schemaVersion: number;    // 세이브 구조 버전. 구조를 바꾸면 올린다
  contentVersion: string;   // 저장 당시 콘텐츠 버전
  saveId: string;           // UUID
  revision: number;         // 저장할 때마다 1씩 증가. 기기 간 비교에 사용
  savedAt: number;          // Wall-clock ms
  state: GameState;
};
```

- 세이브에 넣지 않는 것: `ContentDb`, 세션 런타임, UI 상태.
- 내보내기·가져오기는 같은 `SaveFile` JSON을 쓰고, 가져올 때도 같은 검증 경로를 거친다.

### 8.2 저장과 불러오기 `[설계]`

- 저장 시점: 행동이 처리될 때마다 짧은 지연(디바운스)을 두고 저장하고, 화면이 가려질 때(`visibilitychange`) 즉시 저장한다. 지연 시간은 임시값 1초다(D-010).
- 새 세이브를 쓰기 전에 직전 세이브를 백업 슬롯 하나에 보관한다. 새 세이브를 읽지 못하면 백업을 불러온다(D-010).
- 불러오기 순서: 형식 확인 → 버전 변환 → Zod 검증 → `GameStore` 초기화 → `time/settle` 1회.
- 저장과 불러오기 자체는 게임 시간을 바꾸지 않는다. 시간 변화는 그 뒤의 `time/settle`에서만 일어난다.

### 8.3 버전 변환 `[설계]`

- `persistence/migrations/`에 `v1ToV2`, `v2ToV3`처럼 한 단계씩 변환하는 순수 함수를 둔다. 불러올 때 현재 버전까지 차례로 적용한다.
- 변환 함수마다 이전 버전의 실제 세이브 예시 파일과 변환 테스트를 함께 둔다.
- 세이브 구조 변경은 사용자 승인이 필요하다.

## 9. 런타임과 UI 연결 `[설계]`

- `GameStore`는 현재 `GameState`를 보관하고, `dispatch(action)`이 호출되면 엔진의 `dispatch`에 `ctx`를 붙여 넘긴 뒤 결과로 상태를 교체하고 구독자에게 알린다.
- React는 `useSyncExternalStore`로 `GameStore`를 구독한다. 새 상태 관리 라이브러리는 쓰지 않는다.
- 엔진이 돌려준 사건은 UI의 기록창과 알림에 쓴다. UI는 사건을 보고 게임 상태를 따로 고치지 않는다.
- 게임 내 창(코덱스, 인벤토리 등)이 열려 있어도 틱 루프는 멈추지 않는다. 일시정지 버튼과 설정창만 런타임의 일시정지 플래그를 켠다.

## 10. 서버 경계 `[설계]`

서버 기능은 서버 도입 단계에서 구현한다. 지금 정해 두는 것은 클라이언트 데이터가 갖춰야 할 조건뿐이다.

- 실행 중 생기는 개체는 UUID를 쓴다 (6장).
- 세이브에 `revision`과 `savedAt`이 있다 (8.1절).
- 전투 기록 형식은 5장을 따른다. 구울 토벌 신고에는 구울 ID와 버전, 전투 기록을 담는다.
- API 경로, D1 테이블, 계정 처리는 서버 도입 단계에서 설계한다.

## 11. 모듈 목록 `[설계]`

| 모듈 | 경로 | 소유하는 상태 | 도입 단계 | 상태 |
|---|---|---|---|---|
| Core | `src/engine/core/` | `meta.rngState` | S0 | 설계 |
| Content | `src/content/` | 없음(ContentDb) | S0 | 설계 |
| Persistence | `src/persistence/` | 없음(SaveFile) | S0 설계, S3 구현 | 설계 |
| Map & Visibility | `src/engine/systems/map/` | `campaign` 탐사 기록·길 지식, `character` 위치 | S1 | 설계 |
| Time | `src/engine/systems/time/` | `meta.gameTime`, `meta.lastActiveAt`, `meta.settledUntil` | S2 | 설계 |
| Stamina & Rest | `src/engine/systems/stamina/` | `character` 스태미나, 현재 활동 | S2 | 설계 |
| Ambush | `src/engine/systems/ambush/` | 없음(판정만) | S2 | 설계 |
| Runtime | `src/runtime/` | 세션 런타임 | S2 | 설계 |
| Inventory & Items | `src/engine/systems/inventory/` | `character` 휴대품·장비, `campaign` 창고 | S4 | 설계 |
| Combat | `src/engine/systems/combat/` | `expedition` 진행 중 전투 | S5 | 설계 |
| Character & Corruption | `src/engine/systems/character/` | `character` 능력치·오염·정신력 | S6 | 설계 |
| Codex & Quest | `src/engine/systems/codex/`, `quest/` | `campaign` 코덱스·퀘스트 | S6 | 설계 |
| Settlement & Crafting | `src/engine/systems/settlement/`, `crafting/` | `campaign` 거점·시설·제작 작업 | S7 | 설계 |
| Idle Tasks & Events | `src/engine/systems/idle/`, `events/` | `campaign` 채집지·방치 작업 | S8 | 설계 |
| Sync | `src/sync/` | 없음 | 서버 도입 단계 | 설계 |
| Server | `server/` | 서버 공유 기록 | 서버 도입 단계 | 설계 |

## 12. 불변 조건

`확정`은 명세나 `CLAUDE.md`에 근거가 있는 조건이다. `검토`는 사용자 확인이 필요하다. 테스트 열은 계획이며, 테스트를 만들면 `[구현됨]`으로 바꾼다.

| ID | 조건 | 상태 | 테스트(계획) |
|---|---|---|---|
| INV-01 | 스태미나는 0 이상, 최대치 이하다 | 확정 | `stamina/*.test.ts` |
| INV-02 | 거부된 행동은 입력과 같은 상태 참조를 돌려주고, 자원과 난수 상태를 바꾸지 않는다 | 확정 | `core/dispatch.test.ts` |
| INV-03 | `meta.gameTime`은 `advanceTime`으로만 증가하고, 한 행동에서 두 번 진행되지 않는다 | 확정 | `time/advance.test.ts` |
| INV-04 | 같은 상태, 같은 행동, 같은 `ctx`에서 `dispatch`는 같은 결과를 돌려준다 | 확정 | `core/dispatch.test.ts` |
| INV-05 | `GameState`는 JSON 직렬화 후 복원해도 같다 | 확정 | `core/state.test.ts` |
| INV-06 | 저장 후 불러오기 왕복 시 상태가 같고, 게임 시간이 바뀌지 않는다 | 확정 | `persistence/*.test.ts` |
| INV-07 | 오프라인 정산은 멱등이다. 같은 `to`로 두 번 정산해도 결과는 한 번 정산한 것과 같다 | 확정 | `time/settle.test.ts` |
| INV-08 | 기기 시각이 뒤로 가도 자원, 타이머, 게임 시간이 줄거나 늘지 않는다 | 확정 | `time/settle.test.ts` |
| INV-09 | 위험지대에서 실행되지 않은 시간(창 닫힘, 하트비트 공백)에는 회복도 습격 판정도 없다 | 확정 | `time/settle.test.ts`, `runtime/*.test.ts` |
| INV-10 | 정지 중에는 Game Time 기반 효과가 진행되지 않고, 방치 작업만 진행된다 | 확정 | `runtime/*.test.ts` |
| INV-11 | 방치 작업의 결과는 한 번만 지급된다 | 확정 | `idle/*.test.ts` |
| INV-12 | 방치 작업의 결과로 영구 사망이 일어나지 않는다 | 확정 | `idle/*.test.ts` |
| INV-13 | 오염도는 명세된 효과 외에는 감소하지 않는다 | 확정 | `character/*.test.ts` |
| INV-14 | 캐릭터가 사망해도 `campaign` 영역(지도, 거점, 채집지, 코덱스)은 유지된다 | 확정 | `character/*.test.ts` |
| INV-15 | 콘텐츠의 모든 ID 참조는 존재하는 대상을 가리킨다 | 확정 | `content/*.test.ts` |
| INV-16 | 등록되지 않은 효과 유형이나 잘못된 매개변수는 콘텐츠 검증에서 실패한다 | 확정 | `content/*.test.ts` |
| INV-17 | `src/engine/`은 브라우저 API 없이 Node 테스트 환경에서 실행된다 | 확정 | 전체 엔진 테스트 |
| INV-18 | 같은 수정치 목록이면 순서와 상관없이 `computeValue` 결과가 같다 | 확정 | `core/modifiers.test.ts` |
| INV-19 | 스태미나와 그 회복량·비용은 항상 정수다 | 확정 | `stamina/*.test.ts` |

게임 규칙상 예외가 생기면 해당 조건 아래에 예외와 근거를 적는다.

## 13. 승인된 결정과 임시값

아래 결정은 승인되었다. 세부 값은 임시값이며, 프로토타입에서 플레이해 본 뒤 확정한다. 근거와 재검토 조건은 `docs/decisions.md`에 있다.

| 항목 | 결정 | 기록 |
|---|---|---|
| 런타임 디렉터리 | `src/runtime/` 신설 | D-006 |
| 수치 수정치 계산 순서 | 기본값 → 합산 → 곱셈 → 반올림 → 최소·최대 | D-007 |
| 난수 알고리즘 | sfc32, 직접 구현 | D-008 |
| 불변 상태 갱신 | 직접 작성 | D-009 |
| 자동 저장 | 디바운스 1초, 화면이 가려질 때 즉시, 백업 1개 | D-010 (값은 임시) |
| 시간 값 | 1틱 10초, 하트비트 15초, 유예 2분, 최대 오프라인 인정 24시간 | D-011 (임시) |
| 스태미나 수치 | 정수 유지. 최대 900, 거점·대기 틱당 1, 휴식 틱당 5, 이동 비용 6/3/0 | D-014 (임시) |
