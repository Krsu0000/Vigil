# architecture.md — The Last Vigil 구조 설계

시스템 구조, 모듈 의존성, 데이터 흐름, 게임 상태와 주요 인터페이스, 불변 조건을 정의한다. 게임 규칙과 수치는 `docs/game-design.md`, 실제 구현 현황은 `docs/features.md`가 기준이다.

## 0. 문서 상태와 표기

- **현재 상태: S0 완료, S1 진행 중.** 맵 콘텐츠·배치 검증에 이어 위치·탐사 기록·이동·A안 안개 조회와 SaveFile v2·v1 변환이 구현됐다. GameStore·맵 UI·조작 연결, IndexedDB·자동 저장·전투 재현은 아직 없다. `[구현됨]` 표시가 없는 항목은 계획이다.
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
| 스크립트 | `scripts/` | Node에서 직접 실행하는 개발 도구: 콘텐츠 검증 CLI(`validate-content.ts`), 제작자 맵 생성기(T1). 게임 실행 코드에 포함되지 않는다 |

엔진은 브라우저 API를 쓸 수 없고 UI는 게임 규칙을 처리하면 안 되므로, 둘을 잇는 브라우저 의존 코드(틱 루프, `visibilitychange`, `performance.now()`)는 `src/runtime/`에 둔다(D-006).

### 1.2 의존 방향 `[설계]`

```
ui ──────▶ runtime ──────▶ engine ──────▶ content
 │            │                ▲
 │            └──▶ persistence ┘ (타입만)
 └──────────────▶ engine (타입과 조회 함수만)

sync ──▶ persistence          (서버 도입 단계)
scripts ──▶ content, engine    (Node 실행. src는 scripts를 import하지 않는다)
server   클라이언트 코드를 import하지 않는다. 공유 타입은 별도 패키지 또는 복사본으로 둔다.
```

- `engine`은 `ui`, `runtime`, `persistence`, `sync`, React, DOM을 import하지 않는다.
- `engine/core`는 `engine/systems`를 import하지 않는다. 시스템이 코어에 등록된다.
- `content`는 같은 계층의 모듈과 JSON, Zod만 import한다. 엔진·UI·런타임 등 다른 프로젝트 계층은 import하지 않는다. 효과 검증 함수는 연결부가 인수로 전달한다.
- `persistence`는 엔진의 상태 타입만 import한다. 저장 경계의 Zod 상태 검증은 `persistence/save-file.ts`에 두며 콘텐츠 버전 문자열은 content의 같은 스키마를 사용한다. 엔진에서 저장 계층을 역으로 import하지 않는다.
- `ui`는 게임 상태를 바꾸는 코드를 갖지 않는다. 상태 변경은 `runtime`의 `GameStore.dispatch`를 호출한다.
- `[구현됨]` `src/engine/purity.test.ts`가 엔진의 금지 사항을 문자열 검색으로 검사한다: `Math.random`·`Date.now`·`new Date`·`performance`·`window`·`document`·`crypto` 사용, React·`node:` import, `ui`·`runtime`·`persistence`·`sync` import, `core`에서 `systems` import. 주석에 같은 표기를 쓰면 오탐이 나므로 주석에서는 다른 표기를 쓴다.
- `scripts`는 `content`와 `engine`을 import할 수 있다. 콘텐츠 검증은 효과 레지스트리(`engine/core`, 7.1절)도 써야 하므로 검증 CLI는 `content`가 아니라 `scripts`에 둔다. `src/` 아래 모듈은 `scripts`를 import하지 않는다.

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

### 1.4 TypeScript 작성 규칙 `[구현됨]`

`scripts/`는 Node 내장 TypeScript 실행(Node 22.18 이상, 별도 실행 도구 없음)으로 돌리고 `src/`의 코드를 그대로 import한다(D-016). Node는 타입만 제거하고 실행하므로 모든 코드가 다음을 지킨다. `tsconfig.json`이 이를 강제해 어기면 `npm run typecheck`가 실패한다.

| 규칙 | 강제하는 설정 |
|---|---|
| 상대 경로 import에 확장자를 붙인다 (`./rng.ts`, `./App.tsx`) | `module`·`moduleResolution: nodenext`, `allowImportingTsExtensions` |
| 타입만 가져올 때는 `import type`을 쓴다 | `verbatimModuleSyntax` |
| `enum`, `namespace`, 생성자 매개변수 프로퍼티를 쓰지 않는다 | `erasableSyntaxOnly` |
| JSON을 import할 때는 `with { type: 'json' }`을 붙인다 | `module: nodenext` |

- 빌드는 Vite가 하고 `tsc`는 타입 검사만 한다(`noEmit`).
- 테스트 환경은 Node다(`vite.config.ts`의 `test.environment`). 브라우저 API를 흉내 내는 테스트 환경은 쓰지 않는다(INV-17).

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

- 각 필드는 정확히 한 시스템이 소유하고, 다른 시스템은 읽기만 한다. 소유 시스템은 11장 모듈 표에 적는다.
- 같은 정보를 두 곳에 저장하지 않는다. 파생 값(예: 현재 위치의 구역 종류)은 저장하지 않고 계산한다.

### 2.2 상태 타입의 최소형 `[구현됨]`

S0의 뼈대에 S1의 위치·탐사 기록을 추가했다(D-022). 다른 시스템의 필드는 해당 단계에서 추가한다.

```ts
// src/engine/core/state.ts
export type MapPosition = Readonly<{ mapId: string; floor: number; x: number; y: number }>;
export type MapExploration = Readonly<{
  mapVersion: number;
  visited: Readonly<Record<string, true>>; // 정규 좌표 키 floor:x:y
}>;
export type CampaignState = Readonly<{
  exploration: Readonly<Record<string, MapExploration>>;
}>;
export type CharacterState = Readonly<{ position: MapPosition | null }>;
export type ExpeditionState = Readonly<Record<string, never>>;

export type GameState = Readonly<{
  meta: StateMeta;
  campaign: CampaignState;
  character: CharacterState | null;
  expedition: ExpeditionState | null;
}>;

export type StateMeta = Readonly<{
  campaignId: string;    // UUID
  gameTime: number;      // Game Time, 틱 단위 정수. 시간 시스템만 변경
  rngState: readonly number[];
  lastActiveAt: number;  // Wall-clock ms
  settledUntil: number;  // Wall-clock ms
}>;
```

- 현재 위치는 character에, 밟은 칸과 맵 버전은 campaign.exploration에 둔다. 현재 시야·구역의 안전 여부는 계산 값이며 저장하지 않는다. 캐릭터가 없어져도 캠페인 탐사 기록은 유지된다.
- character가 null이면 캐릭터 없음, position이 null이면 미배치다. 이전 v1의 빈 캐릭터는 미배치로 변환한다. expedition은 아직 빈 객체 또는 null이다.
- 상태는 JSON으로 직렬화할 수 있어야 한다. 함수, 클래스 인스턴스, `Map`, `Set`, `Date`를 넣지 않는다. 목록은 배열, 조회용 묶음은 `Record<string, T>`를 쓴다.
- 상태는 불변 객체로 다룬다. 타입의 `Readonly`는 직접 대입을 제한하고, 테스트에서 중첩 객체를 동결해 원본 변경을 검출한다. 제품 실행마다 상태 전체를 복사·동결하는 로직은 추가하지 않는다.
- 새 상태는 바뀐 부분만 새로 만든다. 갱신 코드는 직접 작성한다(D-009). 복잡해지면 Immer 도입을 다시 검토한다.

## 3. 행동 처리

### 3.1 dispatch `[구현됨]`

```ts
// src/engine/core/context.ts
export type EngineContext = Readonly<{
  content: ContentDb;
  now: number; // 이번 행동 시점의 Wall-clock ms. 호출자가 주입
}>;

// src/engine/core/actions.ts
export type Action = Readonly<{ type: `${string}/${string}` }>;
export type RejectReason =
  | 'unknown_action' | 'invalid_action'
  | 'condition_not_met' | 'insufficient_resources';
export type ExecutionResult<E extends GameEvent = GameEvent> = {
  state: GameState;
  events: E[];
};
export type DispatchResult<E extends GameEvent = GameEvent> =
  | ({ ok: true } & ExecutionResult<E>)
  | { ok: false; state: GameState; reason: RejectReason };

export type ActionHandler<A extends Action, E extends GameEvent = GameEvent> = Readonly<{
  validate: (state: GameState, action: A, ctx: EngineContext) => RejectReason | null;
  execute: (state: GameState, action: A, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;
export type ActionHandlers<A extends Action, E extends GameEvent = GameEvent> = {
  readonly [Type in A['type']]?: ActionHandler<Extract<A, { type: Type }>, E>;
};

// src/engine/core/events.ts
export type GameEvent = Readonly<{ type: `${string}/${string}` }>;

// src/engine/core/dispatch.ts
export type Dispatcher<A extends Action = Action, E extends GameEvent = GameEvent> =
  (state: GameState, action: A, ctx: EngineContext) => DispatchResult<E>;
export function createDispatcher<A extends Action, E extends GameEvent = GameEvent>(
  handlers: ActionHandlers<A, E>,
): Dispatcher<A, E>;
export const dispatch: Dispatcher; // S0에서는 게임 처리기가 없는 기본 함수
```

처리 순서:

1. 행동 종류로 처리기를 찾는다. 없으면 `{ ok: false, state, reason: 'unknown_action' }`.
2. `validate`: 실행 조건과 필요한 자원을 확인한다. 실패하면 입력과 같은 상태 참조를 반환한다.
3. 상태의 `rngState`로 난수 생성기를 만든다. 거부된 행동에서는 만들지 않는다.
4. `execute`: 효과를 계산하고, 새 상태와 사건을 만든다.
5. 난수 생성기의 실제 최종 상태를 결과 상태의 `meta.rngState`에 기록한다. 원본 상태는 수정하지 않는다.

- 연결부가 시작 시 `createDispatcher(handlers)`를 호출하고, 반환된 함수를 `dispatch(state, action, ctx)` 형태로 사용한다(D-017). 코어는 시스템을 import하지 않는다.
- 처리기 목록과 각 처리기를 얕게 복사·동결한다. 원본 목록·처리기를 나중에 바꿔도 이미 만든 함수는 영향받지 않는다. 실행 중 등록·제거 API는 없다.
- 코어의 `Action`·`GameEvent`는 공통 형태다. 구체적인 행동·사건은 시스템별로 `type`으로 구분하는 유니온으로 정의하고 생성 함수의 타입 인수로 전달한다. `ActionHandlers`가 행동 종류별 매개변수 타입을 연결한다.
- 이름 형식은 `영역/동작` (예: `move/step`, `time/tick`, `rest/start`). 거부 사유는 실제 시스템이 필요로 할 때 추가한다.
- 거부와 실행 후 실패를 구분한다. 거부는 상태·자원을 바꾸지 않고, 공격 빗나감 같은 실행 후 실패는 처리기 안에서 명세대로 비용을 처리한다.
- 처리기나 검증기의 코드 예외는 그대로 전달한다. 일반적인 행동 거부로 숨기지 않는다.
- 테스트용 행동·효과는 `core/test-fixtures.ts`에서만 구성하고 제품의 기본 목록에는 등록하지 않는다.

### 3.2 dispatch를 거치지 않는 경로 `[초기화·복원 구현됨]`

| 경로 | 위치 | 용도 | 상태 |
|---|---|---|---|
| `createCampaign(content, seed, now)` | `engine/core/campaign.ts` | 새 캠페인 초기 상태 생성 | `[구현됨]` |
| `restoreSave(raw)` | `persistence/save-file.ts` | 형식 확인 → 버전 변환 → Zod 검증 → `GameState` | `[구현됨]` |
| 버전 변환 체인 | `persistence/migrations/` | 이전 스키마의 세이브를 다음 버전으로 변환 | `[구현됨]` v1 → v2 포함 |

- `createCampaign`은 `seedRngState(seed)`로 시드 정수 4개를 검증·초기화하고, `createUuid(rng)`로 캠페인 ID를 만든 뒤 그 이후의 난수 상태를 저장한다.
- 초기 `gameTime`은 0, `lastActiveAt`·`settledUntil`은 전달받은 `now`, `campaign.exploration`은 빈 객체, `character`·`expedition`은 `null`이다.
- `now`는 0 이상의 안전한 정수(epoch ms)여야 한다. 잘못된 입력은 예외로 처리한다.
- `createCampaign`은 content를 초기화 계산에 사용하지 않는다. 최초 프로토타입 배치는 아래 map/start 행동으로 한다. 콘텐츠 정의는 상태에 복사하지 않는다.
- 새 캐릭터 생성은 이후 게임 안의 행동으로 구현하며 `dispatch`를 거친다.

### 3.3 맵 배치·이동·A안 안개 `[구현됨]`

- `engine/systems/map/actions.ts`의 mapHandlers를 연결부가 `createDispatcher<MapAction, MapEvent>`에 주입한다. 코어가 시스템을 import하지 않으며 기본 dispatch의 빈 목록은 유지한다.
- `map/start { mapId }`는 최초 프로토타입 배치 행동이다. 캐릭터가 없거나 미배치이며 탐사 기록이 비어 있을 때만 허용한다. 콘텐츠의 start에 배치하고 그 칸만 기록한다. 기존 위치·기록을 초기화하거나 캐릭터를 부활시키지 않는다.
- `move/step { direction }`은 north·south·east·west로 한 칸 이동한다. 캐릭터 없음·미배치·벽·경계는 condition_not_met, 잘못된 방향은 invalid_action으로 거부한다. 거부 시 같은 상태 참조·자원·난수 상태를 보존한다.
- 성공하면 위치와 처음 밟은 칸의 기록을 갱신하고 move/stepped 사건에 from·to·newlyExplored를 담는다. S1에서는 시간·스태미나·난수를 소비하지 않는다. 비용·시간 연결은 S2다.
- `getTileVisibility(state, target, content)`는 visible·explored·unexplored를 반환한다. 현재 칸·상하좌우 인접 칸은 visible, 그 밖의 밟은 칸은 explored, 나머지는 unexplored다. 벽·보기만 한 칸·다른 맵/층을 영구 탐사로 만들지 않는다. 조회는 상태를 변경하지 않는다.
- `validateMapState(state, content)`는 복원 후 맵 존재·버전·탐사 칸·현재 위치를 실제 콘텐츠와 대조한다. 좌표·맵 버전 불일치는 코드/호환성 오류로 던지며 재배치·기록 삭제·일반 이동 거부로 숨기지 않는다. GameStore 연결은 다음 단위다.

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

## 5. 난수 `[생성기·기록 타입 구현됨 / 런타임 연결 설계]`

`[구현됨]` 생성기와 상태 저장·복원: `src/engine/core/rng.ts`. `seedRngState(seed)`는 시드 정수 4개로 초기 상태를 만들고 처음 출력 15개를 버린다. `createRng(state)`는 `nextUint32()`, `nextFloat()`(0 이상 1 미만), `nextInt(min, max)`(양끝 포함, 치우침 없는 재추첨), `getState()`를 가진 생성기를 만들며 입력 배열을 바꾸지 않는다. 출력식은 PractRand 원본 sfc32(`tmp = a + b + counter++`)와 같고, 참조값 테스트로 고정한다. 런타임 시드 생성은 아직 없다.


- 의존성 없이 직접 구현하는 작은 시드 난수 생성기를 `src/engine/core/rng.ts`에 둔다. sfc32(내부 상태 32비트 정수 4개)를 쓴다(D-008).
- 생성기의 내부 상태는 `meta.rngState`에 저장한다. 그래서 저장 후 불러와도 같은 난수 흐름이 이어진다.
- 새 캠페인의 시드는 런타임이 `crypto.getRandomValues`로 만들어 `createCampaign`에 넘긴다.
- 전투 기록(`CombatLog`)은 전투 시작 시점의 `rngState`와 플레이어가 고른 행동 목록을 담는다. 같은 콘텐츠 버전에서 재생하면 같은 결과가 나와야 한다.
- `[구현됨]` `core/combat-log.ts`의 `CombatLog<A extends Action = Action>`는 읽기 전용 `contentVersion`, `rngState`, `actions` 타입만 정의한다. 실제 전투 행동·초기 전투 상태와 재현 실행기는 S5에서 정의한다. 지금 타입만으로 완전한 전투 재현을 제공하지 않는다.

## 6. 콘텐츠 `[구현됨]`

- `src/content/manifest.json`은 `contentVersion`, 시간 규칙 파일 경로 `timeRulesFile`, 정의 파일 경로 목록 `definitionFiles`를 갖는다. 현재 버전은 `0.2.0`, 실제 JSON은 매니페스트·시간 규칙·타일·구역·맵의 5개다. 정의 파일은 `tiles.json`, `zones.json`, `maps/s1-test.json`이다.
- 매니페스트의 파일 목록은 명시적이다. 필수 파일 누락, 중복 파일, 매니페스트 자기 참조, 목록에 없는 JSON도 오류다. 경로는 소문자 영문·숫자·밑줄·하이픈으로 된 상대 JSON 경로만 허용한다.
- `time-rules.json`에 D-011·D-014의 임시값을 넣었다. 시간은 ms, 스태미나는 정수 단위다. 하트비트 값도 JSON 설정으로 저장하며 런타임이 도입되면 여기서 읽는다.
- 시간 규칙의 시간 값과 최대 스태미나는 양의 안전한 정수, 회복량·이동 비용은 0 이상의 안전한 정수다. 하트비트 유예 시간은 간격 이상이어야 한다. 실제 시간 진행·스태미나 계산은 S2다.
- `schemas.ts`의 Zod 스키마가 매니페스트·시간 규칙·공통 외피·맵·타일·구역의 기준이며 TypeScript 타입은 스키마에서 추론한다. `resolveJsonModule` 설정을 켜 JSON import 타입 검사도 수행한다.

```ts
// src/content/types.ts
export type DeepReadonly<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;
export type ContentEntry = DeepReadonly<TimeRules> | DeepReadonly<ContentDefinition>;
export type ContentDb = Readonly<{
  contentVersion: string;
  timeRules: DeepReadonly<TimeRules>;
  definitions: readonly DeepReadonly<ContentDefinition>[];
  byId: Readonly<Record<string, ContentEntry>>;
}>;
export type ContentError = Readonly<{
  file: string;
  path: string;
  code: string;
  message: string;
}>;
export type EffectValidator = (effect: Readonly<{ type: string; params: unknown }>) =>
  | { ok: true }
  | { ok: false; reason: string; message: string };
export type ContentLoadResult =
  | { ok: true; content: ContentDb }
  | { ok: false; errors: ContentError[] };

// src/content/load.ts
export type ContentSources = Readonly<Record<string, unknown>>;
export function loadContent(sources: ContentSources, validateEffect: EffectValidator): ContentLoadResult;
```

로딩 순서:

1. 매니페스트 스키마와 파일 목록을 검증한다.
2. 시간 규칙과 각 정의 파일의 배열 스키마를 검증한다.
3. 모든 ID를 모으고 중복·누락 참조를 검증한다.
4. 모든 효과를 주입된 검증 함수로 확인한다. 로딩 중 효과를 실행하지 않는다.
5. 맵의 실제 배치 참조·층·좌표·시작 위치를 검증한다.
6. 선행 의존 목록의 순환을 검사한다. 깊은 관계도 호출 스택을 늘리지 않는 방식으로 검사한다.
7. 모두 통과한 경우에만 읽기 전용 ContentDb를 만든다. 하나라도 실패하면 오류 목록만 반환하고 부분 DB는 반환하지 않는다.

공통 정의 외피와 검증:

- 정의 파일은 배열이며 `{ id, references?, dependsOn?, effects? }` 공통 외피를 유지한다. 생략한 목록은 빈 배열로 만든다. S1의 맵·타일·구역에는 kind와 구체적인 필드가 추가됐다. 다른 종류는 S0 공통 외피만 지원하며 실제 스키마는 각 시스템에서 추가한다.
- `ContentDefinitionSchema`는 kind로 구체 스키마를 선택한다. kind가 없는 공통 외피는 map·tile·zone ID를 사용할 수 없다. 구체 정의의 누락된 필드가 공통 외피로 처리되어 검증을 우회하지 못하게 한다.
- `references`는 존재 확인용 일반 참조다. 상호 참조도 허용한다. `dependsOn`은 순환을 허용하지 않는 선행 의존 목록이다. 둘 다 실제 존재하는 ID만 가리켜야 한다(D-019).
- 효과 외피는 `{ type, params }`다. 매개변수는 JSON 값이어야 하며 복사해 입력과 객체를 공유하지 않는다. 실제 매개변수 제약은 엔진의 효과 스키마가 검증한다.
- 콘텐츠 ID는 `종류.이름` 형식의 소문자 영문·숫자·밑줄이다 (예: `item.dried_ration`, `monster.genlock`). 각 부분은 영문자로 시작한다. 시간 규칙은 `rules.` 종류를 쓴다.
- ID별 조회는 `byId[id]`로 한다. 사전의 프로토타입은 없으므로 미등록 ID와 프로토타입 이름은 `undefined`다. 읽기 전용 타입과 중첩 동결을 적용한다.
- 콘텐츠는 새로 파싱·복사한 객체로 구성하며 원본 입력을 수정하거나 동결하지 않는다. DB를 세이브에 넣지 않는다.
- 한 번 배포한 ID는 바꾸지 않는다. 세이브가 참조하는 ID를 지우거나 바꾸려면 세이브 버전 변환이 필요하다.
- 실행 중 개체의 ID는 기존 `createUuid(rng)`를 사용한다. 캠페인·캐릭터·사망 기록과 콘텐츠 ID는 구분한다.

실행 환경의 연결:

- 브라우저의 `runtime/content.ts`는 Vite의 JSON 수집 기능으로 `src/content/` 아래 전체 JSON을 모아 `loadContent`에 전달하고, 제품의 효과 레지스트리 검증 함수를 주입한다. 파일 추가 시 엔진 코드를 수정하지 않는다.
- React 진입점은 콘텐츠를 먼저 검증한다. 성공하면 기존 화면을 표시하고, 파싱된 데이터의 검증이 실패하면 파일·필드 위치가 포함된 오류 안내를 표시한다. 브라우저용 JSON 구문 오류는 Vite 변환·빌드 단계에서 차단된다. 아직 GameStore나 플레이 상태를 생성하지 않는다.
- `scripts/validate-content.ts`는 파일 시스템에서 전체 JSON을 읽어 구문을 검사한 뒤 같은 로더와 제품 효과 검증 함수를 쓴다. 오류 시 종료 코드는 1, 성공 시 0이다. 선택 인수로 검사할 콘텐츠 디렉터리를 받을 수 있다.
- `npm run validate:content`는 구문뿐 아니라 스키마·ID·참조·의존·효과 검증을 모두 수행한다. 브라우저와 CLI의 파일 읽기만 다르고 검증 로직은 같다.
- 버튼 문구·콘텐츠 실패 안내 같은 UI 시스템 문구는 `src/ui/strings/`에 둔다.

### 6.1 맵·타일·구역 계약 `[구현됨]`

`schemas.ts`의 `MapDefinition`·`TileDefinition`·`ZoneDefinition`은 해당 Zod 스키마에서 추론한다(D-021). GameState·SaveFile 구조와 구분하며 현재 게임 상태에는 복사하지 않는다.

| 정의 | 주요 필드 |
|---|---|
| 타일 | kind: tile, tile.* ID, name, glyph, walkable, blocksSight |
| 구역 | kind: zone, zone.* ID, name, description, safety: safe 또는 danger |
| 맵 | kind: map, map.* ID, name, description, 양의 정수 version, start, floors |
| 시작 위치 | floor, x, y. 소속 맵 ID는 맵 정의에서 정해진다 |
| 층 | floor, width, height, cells |
| 배치 칸 | x, y, tileId, zoneId |

- x·y는 좌상단 (0, 0)부터 시작하며 width·height 미만인 0 이상의 안전한 정수다. 층 번호는 음수를 포함한 안전한 정수다. 공통 위치는 맵 ID·층·x·y의 조합으로 식별하며 배열 순서를 좌표로 사용하지 않는다.
- 각 층의 직사각형 전체를 한 번씩 배치한다. 벽도 명시한다. `map-validation.ts`는 층·좌표 중복, 범위 밖·누락 칸, 안전한 정수 범위를 넘는 칸 수를 거부한다. 실제 칸 수에 비례해 검사하고 전체 범위만큼 반복하거나 메모리를 할당하지 않는다.
- 실제 tileId·zoneId의 존재와 종류를 검증한다. 제작자가 같은 ID를 references에 다시 적을 필요는 없다. 시작 위치는 존재하는 층·칸이어야 하고 타일의 walkable이 true여야 한다.
- 이동 가능 여부와 시야 차단 여부는 독립 속성이다. 콘텐츠 로더는 데이터를 검증하며 이동·시야 계산·안전/위험 효과를 실행하지 않는다. 이동·안개 조회는 3.3절의 맵 시스템이 담당한다.
- 수동 맵 `map.s1_test`는 version 1, 0층 9×7, 시작 (1, 1)이다. 타일 2개·구역 2개를 참조한다. 시작점에서 안전·위험 구역 모두 상하좌우로 도달할 수 있음을 콘텐츠 테스트에서 확인했다. 맵 크기·기호·배치는 테스트용이며 최종 레벨 디자인이 아니다.
- Vite 콘텐츠 연결과 실제 Node CLI가 같은 검증을 사용한다. 실패 시 파일·필드 위치와 오류 코드를 보고하고 부분 DB를 반환하지 않는다. 성공한 맵·층·칸도 입력과 분리해 중첩까지 동결한다.

## 7. 효과와 수정치

### 7.1 효과 레지스트리 `[구현됨]`

```ts
// src/engine/core/effects.ts
export type EffectInstance = Readonly<{ type: string; params: unknown }>;
export type EffectHandler<P, E extends GameEvent = GameEvent> = Readonly<{
  params: z.ZodType<P>;
  apply: (state: GameState, params: P, ctx: EngineContext, rng: Rng) => ExecutionResult<E>;
}>;
export type EffectValidationResult =
  | { ok: true }
  | { ok: false; reason: 'unknown_effect' | 'invalid_effect_params'; type: string; message: string };

export function defineEffect<P, E extends GameEvent = GameEvent>(
  handler: EffectHandler<P, E>,
): EffectDefinition<E>;
export function createEffectRegistry<E extends GameEvent = GameEvent>(
  handlers: Readonly<Record<string, EffectDefinition<E>>>,
): EffectRegistry<E>;
export const effectRegistry: EffectRegistry; // S0에서는 제품의 효과 목록이 비어 있다
```

- `defineEffect`는 Zod 스키마와 적용 함수를 묶고, 파싱된 매개변수만 적용 함수에 넘긴다. 서로 다른 매개변수 타입의 효과도 원시 데이터를 강제 형 변환하지 않고 한 목록에 담는다.
- `createEffectRegistry`는 효과 유형 이름을 키로 하는 고정 객체를 만든다. 목록과 정의를 얕게 복사·동결하며 실행 중 등록·제거 API는 없다.
- 레지스트리의 `validate(effect)`는 위 검증 결과를 반환하고, `apply(state, effect, ctx, rng)`는 검증 후 효과를 실행해 `{ state, events }`를 반환한다. 직접 적용하더라도 미등록 유형·잘못된 매개변수는 실행 전에 예외로 처리한다.
- 효과의 적용 함수가 던지는 코드 예외는 검증 오류나 행동 거부로 변환하지 않는다.
- 난수의 최종 상태 기록은 `dispatch`가 담당한다. 효과는 전달받은 같은 난수 생성기를 사용한다.
- S0의 테스트용 효과 `test/emit`는 사건을 생성하고 선택적으로 난수를 소비한다. 제품의 목록에는 등록하지 않는다. 실제 게임 효과는 필요한 단계에서 추가한다.
- 콘텐츠 로더에 레지스트리의 `validate`를 주입해 모든 효과 유형·매개변수를 검증한다. `runtime/content.test.ts`와 검증 CLI 테스트에서 등록·미등록·잘못된 매개변수의 연결 검증을 완료했다(INV-16). 제품의 효과 목록은 실제 게임 효과 도입 전까지 비어 있다.

### 7.2 수치 수정치 `[구현됨]`

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

예: 이동 비용 기본 6(D-014), 장비 `add -1`, 과적 `add +1`, 탐사 경로 `mul 0.5` → (6 − 1 + 1) × 0.5 = 3 → 반올림 3 → 최소 0 적용 → **3**.

- 수정치를 모으는 함수는 시스템별로 하나씩 두고(장비, 상태이상, 시설, 지형·길 지식), `computeValue`에 넘기기 전에 합친다.
- 모든 수치 계산은 `computeValue`를 거친다. 시스템 안에서 따로 더하거나 곱하지 않는다.
- 이 순서는 D-007로 승인되었다. `core/modifiers.test.ts`로 고정한다.
- 소수의 덧셈·곱셈은 순서에 따라 결과가 미세하게 다르므로, `add`와 `mul` 값을 각각 크기순으로 정렬한 뒤 계산한다. 그래서 수정치 목록의 순서와 상관없이 결과가 비트 단위까지 같다(INV-18).
- `computeValue`는 받은 수정치를 모두 적용한다. 같은 `target`의 수정치만 골라 넘기는 것은 호출자(수집 함수)의 책임이다.
- 기본값, 수정치 값, `min`·`max`, 결과가 유한한 수가 아니거나 `min > max`이면 오류를 던진다(콘텐츠나 코드 결함). `round`는 0.5를 올린다(`Math.round`, 임시값). 결과의 `-0`은 `0`으로 돌려준다.

## 8. 저장

### 8.1 세이브 형식 `[구현됨]`

```ts
// src/persistence/save-file.ts
// 실제 타입은 SaveFileSchema에서 추론하며 state는 코어 GameState 계약을 사용한다.
export type SaveFile = Readonly<{
  format: 'last-vigil-save';
  schemaVersion: 2;         // 위치·캠페인 탐사 기록 추가
  contentVersion: string;   // 저장 당시 콘텐츠 버전
  saveId: string;           // UUID
  revision: number;         // 저장할 때마다 1씩 증가. 기기 간 비교에 사용
  savedAt: number;          // Wall-clock ms
  state: GameState;
}>;
```

- 세이브에 넣지 않는 것: `ContentDb`, 세션 런타임, UI 상태.
- 내보내기·가져오기는 같은 `SaveFile` JSON을 쓰고, 가져올 때도 같은 검증 경로를 거친다.
- `SaveFileSchema`·`GameStateSchema`는 모든 객체에서 미정의 필드를 거부한다. UUID, 0 이상의 안전한 정수인 revision·시각·게임 시간, uint32 4개인 난수 상태와 위치·탐사 기록을 검증한다. 좌표 키는 정규 floor:x:y이고 값은 true만 허용한다. 현재 위치가 탐사 기록에 있어야 한다.
- 구조 검증은 콘텐츠를 읽지 않는다. 실제 칸·맵 버전 대조는 복원 후 validateMapState로 수행한다. 맵 버전 변경에 따른 기록 이전은 아직 없다.
- `parseSave`는 먼저 JSON 데이터만 허용해 입력과 분리한 뒤 검증한다. 함수·Date·Map·Set·undefined·NaN·무한대를 JSON 변환으로 조용히 손실시키지 않는다. `GameStateSchema`는 기존 코어 타입과 호환되는지 TypeScript로 검사한다.
- 콘텐츠 버전은 매니페스트와 같은 문자열 스키마로 검증하고 저장된 값을 보존한다. 콘텐츠 버전별 호환성 정책·콘텐츠 변환은 아직 없으며 구조 버전 변환과 구분한다.

### 8.2 저장과 불러오기 `[메모리 계약 구현됨 / 브라우저 저장 설계]`

- `createSaveFile(state, metadata)`: contentVersion·saveId·revision·savedAt을 호출부에서 받아 검증된 독립 스냅샷을 만든다. ID나 시간을 내부에서 생성하지 않으며 게임 난수를 소비하지 않는다.
- `serializeSave(save)`·`deserializeSave(json)`: 같은 검증 경로로 JSON 문자열을 쓰고 읽는다. `parseSave(raw)`는 객체를 받고, `restoreSave(raw)`는 객체 또는 JSON 문자열에서 `GameState`만 반환한다.
- 객체·JSON 불러오기 순서: JSON 데이터·형식 확인 → 버전 변환 → 최종 Zod 검증. 실패하면 예외를 내고 부분 상태를 반환하지 않는다.
- 저장·복원은 gameTime·lastActiveAt·settledUntil·rngState·revision·savedAt을 그대로 보존한다. 실제 저장마다 revision을 증가시키는 책임은 S3의 호출부에 있다. 왕복만으로 revision을 올리지 않는다.

다음은 S3에서 연결할 브라우저 저장 규칙이다. 현재 IndexedDB·자동 저장·백업·GameStore·오프라인 정산 연결은 없다.

- 저장 시점: 행동이 처리될 때마다 짧은 지연(디바운스)을 두고 저장하고, 화면이 가려질 때(`visibilitychange`) 즉시 저장한다. 지연 시간은 임시값 1초다(D-010).
- 새 세이브를 쓰기 전에 직전 세이브를 백업 슬롯 하나에 보관한다. 새 세이브를 읽지 못하면 백업을 불러온다(D-010).
- 불러오기 순서: 형식 확인 → 버전 변환 → Zod 검증 → `GameStore` 초기화 → `time/settle` 1회.
- 저장과 불러오기 자체는 게임 시간을 바꾸지 않는다. 시간 변화는 그 뒤의 `time/settle`에서만 일어난다.

### 8.3 버전 변환 `[체인 구조 구현됨]`

- `persistence/format.ts`의 현재 버전은 2다. 고정 변환 목록에는 v1ToV2가 등록돼 있다. `schemas-v1.ts`는 공개된 v1 계약을 보존하며 v1 전체를 검증한 뒤 변환한다.
- `runMigrations(raw, targetVersion, migrations)`는 입력 JSON 복사본에서 fromVersion별 변환을 버전 순서대로 연결한다. 단계마다 형식·JSON 값·정확한 1버전 증가를 검사한다. 누락·중복 단계·미래 버전·잘못된 변환 결과를 거부하고 코드 예외를 숨기지 않는다.
- `migrateSave(raw)`는 v1을 현재 v2로 변환하고 v2는 그대로 검증 경로에 넘긴다. v1의 campaign은 exploration: {}로, 빈 character는 position: null로 바꾸며 null character·expedition과 모든 기존 메타데이터를 보존한다. 변환 중 캐릭터 생성·위치 배치·시간 진행은 없다.
- `fixtures/v1-empty.json`·`v1-placeholders.json`은 v2 변경 전 main의 v1 작성 코드로 생성한 테스트 예시다. 출처·입력은 fixtures/README.md에 기록했다. 변환·난수 보존·v2 저장 왕복·후속 이동·안개 동일성을 검사한다. 실제 지원 형식은 v1·v2이며 버전 3 체인 예시는 테스트용이다.
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
| Core | `src/engine/core/` | `meta.rngState` | S0 | 코어 기초·계약·CombatLog 타입 구현됨 |
| Content | `src/content/` | 없음(ContentDb) | S0 기반, S1 맵 정의 | 기반·맵/타일/구역·배치 검증 구현됨 |
| Persistence | `src/persistence/` | 없음(SaveFile) | S0 계약, S1 확장, S3 브라우저 저장 | v2 스키마·메모리 왕복·v1 변환 구현됨 |
| Map & Visibility | `src/engine/systems/map/` | `campaign.exploration`, `character.position` | S1 | 배치·이동·A안 안개·실제 콘텐츠 대조 구현됨 |
| Time | `src/engine/systems/time/` | `meta.gameTime`, `meta.lastActiveAt`, `meta.settledUntil` | S2 | 설계 |
| Stamina & Rest | `src/engine/systems/stamina/` | `character` 스태미나, 현재 활동 | S2 | 설계 |
| Ambush | `src/engine/systems/ambush/` | 없음(판정만) | S2 | 설계 |
| Runtime | `src/runtime/` | 세션 런타임 | S0 콘텐츠, S1 상태, S2 시간 | 콘텐츠 연결만 구현됨. GameStore(S1)·시간 루프(S2)는 설계 |
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
| INV-02 | 거부된 행동은 입력과 같은 상태 참조를 돌려주고, 자원과 난수 상태를 바꾸지 않는다 | 확정 | `[구현됨]` `core/dispatch.test.ts` |
| INV-03 | `meta.gameTime`은 `advanceTime`으로만 증가하고, 한 행동에서 두 번 진행되지 않는다 | 확정 | `time/advance.test.ts` |
| INV-04 | 같은 상태, 같은 행동, 같은 `ctx`에서 `dispatch`는 같은 결과를 돌려준다 | 확정 | `[구현됨]` `core/dispatch.test.ts` |
| INV-05 | `GameState`는 JSON 직렬화 후 복원해도 같다 | 확정 | `[구현됨]` `core/state.test.ts` |
| INV-06 | 저장 후 불러오기 왕복 시 상태가 같고, 게임 시간이 바뀌지 않는다 | 확정 | `[구현됨]` `persistence/save-file.test.ts`, `migration-roundtrip.test.ts` |
| INV-07 | 오프라인 정산은 멱등이다. 같은 `to`로 두 번 정산해도 결과는 한 번 정산한 것과 같다 | 확정 | `time/settle.test.ts` |
| INV-08 | 기기 시각이 뒤로 가도 자원, 타이머, 게임 시간이 줄거나 늘지 않는다 | 확정 | `time/settle.test.ts` |
| INV-09 | 위험지대에서 실행되지 않은 시간(창 닫힘, 하트비트 공백)에는 회복도 습격 판정도 없다 | 확정 | `time/settle.test.ts`, `runtime/*.test.ts` |
| INV-10 | 정지 중에는 Game Time 기반 효과가 진행되지 않고, 방치 작업만 진행된다 | 확정 | `runtime/*.test.ts` |
| INV-11 | 방치 작업의 결과는 한 번만 지급된다 | 확정 | `idle/*.test.ts` |
| INV-12 | 방치 작업의 결과로 영구 사망이 일어나지 않는다 | 확정 | `idle/*.test.ts` |
| INV-13 | 오염도는 명세된 효과 외에는 감소하지 않는다 | 확정 | `character/*.test.ts` |
| INV-14 | 캐릭터가 사망해도 `campaign` 영역(지도, 거점, 채집지, 코덱스)은 유지된다 | 확정 | `character/*.test.ts` |
| INV-15 | 콘텐츠의 모든 ID 참조는 존재하는 대상을 가리킨다 | 확정 | `[구현됨]` `content/load.test.ts`, `content/map-validation.test.ts`, 검증 CLI 테스트. 맵의 실제 배치 참조 포함. 다른 정의 참조는 각 시스템에서 추가 |
| INV-16 | 등록되지 않은 효과 유형이나 잘못된 매개변수는 콘텐츠 검증에서 실패한다 | 확정 | `[구현됨]` `core/effects.test.ts`, `runtime/content.test.ts`, 검증 CLI 테스트 |
| INV-17 | `src/engine/`은 브라우저 API 없이 Node 테스트 환경에서 실행된다 | 확정 | `[구현됨]` 전체 엔진 테스트(Node 환경), `engine/purity.test.ts` |
| INV-18 | 같은 수정치 목록이면 순서와 상관없이 `computeValue` 결과가 같다 | 확정 | `[구현됨]` `core/modifiers.test.ts` |
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

- 코어 처리기 연결은 D-017에 따라 시작 시 목록을 주입해 고정한다.
