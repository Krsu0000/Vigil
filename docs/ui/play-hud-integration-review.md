# Play HUD 목업 → 기존 게임 UI 통합 점검 (2026-10-26)

## 원본 및 기준
- 사용자 첨부: `CurrentPC.dc.html`, `CurrentMobile.dc.html`, `Play HUD.dc.html`, `MapGrid.dc.html`, `Play UI Redesign.dc.html`, `Wireframes.dc.html`, `support.js`.
- 코드 기준: 2026-10-26 작업 시작 당시 `main` SHA `476121f5824311a21471d08589f6ebc306b82716`.
- `*.dc.html`은 `<x-dc>`, `<dc-import>`, `sc-if/sc-for`, `DCLogic`을 사용하는 **목업용 디자인 형식**이다. Vite/React 게임 엔트리에서 직접 임포트해 실행할 수 있는 TSX 컴포넌트가 아니다. `support.js`도 DC 전용 런타임이므로 게임 번들에 넣지 않는다. 별도 리액트 UI로 옮기는 것이 올바른 통합 경로이다.

## 실제 연결/변경 (이 PR)
| 목업 변경 요청 | 적용 위치 | 결과 |
|---|---|---|
| 상자·출입구가 나타날 때 하단 UI가 밀리지 않음 | `MapScreen.tsx`의 `interaction-slot` | 조건부 버튼 대신 **항상 같은 크기의 슬롯** 사용. 상자/출입구/이미 열림/대상 없음 상태를 구분 |
| 위치·행동 안내 두 줄 이상 | `MapScreen.tsx`의 `situation-lines` | 구역 안내와 실제 동작 결과 `message`를 분리; 상자 획득 시 실제 품목·수량 표시 |
| 지도 아래 기록 + 행동 독 | `MapScreen.tsx`의 `hud-lower`, `action-dock`, `styles.css` | PC 기록/명령 병렬, 모바일 상황→기록→고정 독 순서 |
| 모바일 오른쪽 이동 패드 | `action-dock`와 `.movement-controls` | 오른쪽 위치. **기존 포인터 1회 이동 핸들러** 재사용 |
| 전체 기록 진입 | `showRecords` | `characterTab='기록'`, `tab='character'`를 통해 기존 기록으로 이동 |
| 현재 상태 칩과 저장 상태 시각 분리 | `session-chip` 스타일 | 상태 문구는 기존의 진행/정지/조우/전투 판정 유지 |
| 기존 정보와 저장 | 기존 `StatusPanel`, `InventoryPanel`, `SaveStatus` | 코드 로직 미변경; 미구현 정신력/오염/퀘스트 등을 가상 수치로 대체하지 않음 |
| 지도와 전투/입력 엔진 | 기존 `MapView`, `CombatPanel`, `loop` | 로직 수정 없음; 대형 지도 가상화·안개·전투 판정 유지 |

## 발견한 위험과 해결
1. DC 목업의 버튼은 실제 게임 액션이 연결되어 있지 않음 → 엔진 `loop.move/interact/rest/returnToCamp` 연결을 유지한 실제 React 구조로 옮김.
2. 목업 값 `1284틱`, `642/900`, 가상 적/지도는 실제 게임 데이터가 아님 → 기존 GameStore 스냅샷만 표시.
3. 기존 UI의 `chest-controls`는 상자/출입구 때 행이 생겨 지도 크기가 바뀜 → 고정 `interaction-slot`으로 교체.
4. 모바일 flex `order`에 의해 기록/행동 순서가 바뀔 위험 → CSS에서 기록(0)→독(1)로 정정.
5. 전투 목업은 **화면 중간 타깃 카드 + 공용 하단 행동 독**의 구조적 변경을 요구하지만, 현재 전투는 기존 `CombatPanel` 오버레이 방식으로 유지. 전투 중 일반 입력 차단/대상 전열 제한·전투 저장·행동 버튼/아이템이 손상되지 않도록 **2차 작업으로 분리**. 새 전투 디자인의 완전 구현을 의미하지 않는다.
6. 초상화, 상점, 방치 작업, 퀘스트/코덱스 등 콘텐츠 미구현은 목업 그대로 동작하지 않음 → UI 임시 숫자·가짜 조작 추가 없음.

## 검증 상태 (구분 필수)
- **정적 확인 완료:** 저장소 기준 소스·브라우저 테스트의 기존 선택자/버튼 계약 확인, GitHub 브랜치 내 JSX/CSS 파일 생성 및 재확인.
- **직접 실행하지 못함:** `npm ci`, TypeScript 타입 검사, Vitest 전체/관련 테스트, Vite 빌드, Chromium Playwright 테스트, 실제 스마트폰 화면. 이 환경에서는 GitHub 원본 소스를 로컬 git clone할 수 없어서 실행하지 못했다. **통과라고 간주하지 말 것.**
- **반드시 실행할 검사:** `npm ci && npm run typecheck && npm test && npm run build`, 그 후 `npm run test:browser` (최소 `scripts/browser-mobile.mjs`, `browser-combat.mjs`, `browser-records.mjs`, `browser-inventory.mjs`, `browser-walls.mjs`). 기존 브라우저 테스트가 `.recent-log`, `.chest-controls`와 버튼의 위치를 검증하므로 CSS 변동 시 자세히 확인한다.
- **수동:** PC 1440×900, 모바일 390×844·320px, 짧은 가로, 노치/주소창 변동, 상자 없는 칸↔상자↔출입구에서 지도 높이 유지, 가로 스크롤/실제 기본 페이지 스크롤 없음, 전투/설정/소지품 복귀·저장 파일 왕복.
- **병합 권고:** 실제 빌드·브라우저 회귀 테스트 및 모바일 캡처 확인 전에는 미검증 UI PR로 취급한다.

## 후속 작업
- `Play HUD.dc.html`의 전투 UI(대상 선택 카드·공용 전투 독·모바일 전투 정보 압축) 완성은 별도 PR로 진행하며 **기존 `CombatPanel`의 단일 액션 경로/전열·후열 선택·전투 결과 UI를 재사용**한다.
- 작은 기기에서 공간이 모자라면 지도 높이 최소와 44px 터치 버튼을 먼저 유지하고 기록 미리보기 줄 수를 조절한다. 기록 자체는 캠페인에 저장된 100개를 그대로 유지한다.
