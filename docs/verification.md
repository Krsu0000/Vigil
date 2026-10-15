# 반복 실행 가능한 검증

## 명령

```sh
npm ci
npm run typecheck
npm test
npm run validate:content
npm run build
npm run test:browser
npm run bench:map
```

개발 중에는 관련 테스트와 필요한 브라우저 시나리오만 실행하고 최종 전체 검사는 한 번 실행한다. 통과 후 코드 변경이나 새 우려가 없으면 반복하지 않는다.

## 브라우저 검사 준비

제품에는 브라우저 검사 도구를 포함하지 않는다. 별도 검사 환경에서 Playwright 1.62.1과 Chromium을 준비한다. 프로젝트 설치 후 아래 명령으로 로컬 검사 도구만 추가할 수 있다. package.json/잠금 파일은 변경하지 않는다.

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
npm run build
npm run test:browser
```

Codex의 준비된 실행 환경에서는 `CODEX_PRIMARY_RUNTIME_NODE_MODULES`의 Playwright도 사용할 수 있다. 별도 Chromium 바이너리를 쓸 때는 `BROWSER_CHROMIUM_EXECUTABLE`을 지정한다. 한국어 시스템 폰트가 없는 검사 환경에서는 Nanum Gothic fontsource 디렉터리를 `BROWSER_FONT_DIR`로 전달할 수 있다. 이 디렉터리에는 korean-400.css, korean-700.css와 해당 글꼴 파일이 있어야 한다.

결과 JSON과 스크린샷은 Git에서 제외한 `artifacts/browser/`에 생성한다. `BROWSER_ARTIFACTS`로 출력 위치를 바꿀 수 있다. `BROWSER_SUITE=map`은 큰 맵 검사만 실행한다.

## 검사 범위

- **제품 배포 빌드, 1280/390/320px:** 99/100ms 입력 경계, 게임 자동 반복 없음, 화면 버튼·Space/Enter, 정지 차단, 연속 조작 중 실제 IndexedDB 저장, 파일 내보내기/가져오기 왕복, 가로 넘침·콘솔 오류.
- **개발 전용 합성 맵, 128×128/512×512:** 표시 DOM 칸 수 상한, 실제 좌표/접근성 인덱스, 먼 좌표 스크롤, 미탐사 정보 숨김, 확인한 벽 유지, 이동 시 플레이어 추적, 화면 크기 변경.
- 합성 맵 진입점은 `tests/browser/fixture.html`이다. 제품의 index.html 및 빌드 진입점에서 참조하지 않는다. 검사에 쓰는 store/loop 노출은 이 진입점에만 있다.
- 브라우저 검사와 모바일 크기 검사는 사용자의 실제 기기 확인을 대체하지 않는다. 제품 시나리오는 가짜 시계를 사용하고, 큰 맵 시나리오는 실제 ResizeObserver/스크롤/레이아웃을 사용한다.

## 큰 맵 측정

`npm run bench:map`은 32/128/512 한 변 크기의 합성 맵을 실제 콘텐츠 로더로 고정한 뒤, 최초 로딩/좌표 인덱스 생성/10만 번 조회/전체 탐사 기록 검증/화면 표시 범위 계산 시간을 각각 출력한다. 시간값은 환경 의존 관측치이며 통과 기준으로 쓰지 않는다.

좌표 인덱스 생성과 콘텐츠 로딩은 전체 칸 수에 비례한다. 인덱스 이후 한 칸 조회는 상수 시간이고, 화면 계산·DOM 수는 표시 범위에 비례한다. 전체 저장 직렬화·복원 검증 및 새 탐사 기록의 불변 복사 비용은 여전히 기록 크기에 비례한다. 더 큰 실제 콘텐츠가 준비되면 최초 로딩과 저장 지연을 실제 폰에서도 측정한다. 이번 검증으로 임의 크기 지도의 성능을 보장하지 않는다.


## S4 아이템 회귀

`test:browser`는 `scripts/browser-inventory.mjs`도 실행한다. 제품 배포 빌드의 입력으로 보급 상자 획득, 소지품 내 키 입력, 최대치 음식 차단, 장착/해제 비용 표시와 실제 이동 차감, 창을 열어 둔 시간/회복, 음식 한 개 소모/총중량, IndexedDB 저장 후 새로고침/중복 상자 차단을 1280/390/320px에서 검사한다. 제품 전역에 검사 API를 추가하지 않는다.

S4 엔진/콘텐츠/저장 회귀는 `src/engine/systems/inventory/actions.test.ts`, `src/content/items.test.ts`, `src/runtime/inventory.test.ts`에 있다. 제품 JSON을 사용하는 회귀와 기존 맵만의 독립 검사를 구분한다. 실제 폰 플레이에서는 (3,1) 보급 상자 → 소지품 장화 장착 → (4,3) 위험 구역 → 음식 → 귀환 → 새로고침을 확인한다.
