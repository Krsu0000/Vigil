# progress.md — The Last Vigil 작업 현황

현재 상태와 다음 작업을 기록한다. 과거 이력은 Git과 `docs/decisions.md`에서 확인한다. 이 문서는 짧게 유지한다.

**마지막 갱신:** 2026-10-14 (S0 두 번째 단위 '코어 기초' 완료)

## 1. 현재 상태

- **현재 단계:** S0 진행 중. 단위 ① 프로젝트 뼈대, ② 코어 기초 완료.
- **코드:** 프로젝트 뼈대(npm 명령 5개, 제목만 있는 화면)와 `src/engine/core/`의 `rng.ts`(sfc32), `modifiers.ts`(`computeValue`), `id.ts`(UUID). 게임 상태·`dispatch`·콘텐츠·저장 코드는 아직 없다.
- **Git:** GitHub 비공개 저장소 `Krsu0000/Vigil`, 기본 브랜치 `main`. 클라우드 세션 작업 브랜치는 `ccr-46c2294a-5xn9dw`(PR #1 병합 후 최신 `main`에서 다시 시작).
- **작업 환경:** Claude Code on the web(클라우드 세션) + GitHub 비공개 저장소. 결과는 작업 브랜치와 PR로 올리고, 사용자가 `main`에 병합한다. 화면 확인은 Cloudflare Pages(`main` 빌드, 다른 브랜치는 미리보기)로 한다 (D-015).
- **실행 환경:** Node v22.22.0(`.node-version`에 고정, `engines`는 22.18 이상), npm 10.9.4.
- **패키지(정확한 버전 고정):** react·react-dom 19.3.0, zod 4.6.7 / 개발용: typescript 7.0.2, vite 8.3.4, @vitejs/plugin-react 6.1.2, vitest 5.0.4, @types/react·@types/react-dom 19.3.0, @types/node 22.20.5

## 2. 완료된 작업

- 문서 체계: `CLAUDE.md`(루트), `docs/` 아래 6개. 기술 결정 D-001 ~ D-016.
- S0 ① 프로젝트 뼈대 (PR #1 병합). Cloudflare Pages 연결, 폰에서 제목 표시 확인 (사용자, 2026-10-14)
- S0 ② 코어 기초 (2026-10-14)
  - `rng.ts`: `seedRngState`(시드 4개, 처음 15개 출력 버림), `createRng` → `nextUint32`·`nextFloat`·`nextInt`·`getState`
  - `modifiers.ts`: `computeValue`. `add`·`mul` 값을 정렬한 뒤 계산해 INV-18 보장
  - `id.ts`: `createUuid(rng)`, 시드 난수로 UUID v4
  - `src/engine/purity.test.ts`: 엔진의 금지 API·import 검사
  - 문서: architecture 0·1.2·5·6·7.2·12장(7.2절 예시를 D-014 값으로 수정)

## 3. S0 착수 전 준비 (사용자)

- [x] 모두 완료 (명세서·문서 배치, GitHub, Cloudflare Pages 연결)

## 4. 진행 중인 작업

없음

## 5. 다음 작업

1. S0 세 번째 단위 **코어 계약**: `GameState` 뼈대(architecture 2.2절), `Action`·`GameEvent`·`RejectReason` 타입, `dispatch`와 처리기 목록(3.1절), `createCampaign`(3.2절), 효과 레지스트리와 테스트용 효과 1개(7.1절). INV-02, INV-04, INV-05 테스트. 착수 전에 범위와 완료 기준을 제안한다.
2. 이후 단위: ④ 콘텐츠(매니페스트, 로더, 교차 참조 검증, 시간 규칙 JSON, `validate:content`를 실제 검증 코드에 연결) → ⑤ 저장(`SaveFile` v1, 변환 체인 구조, `CombatLog` 타입) → ⑥ S0 정리와 문서 갱신.

## 6. 미해결 오류

없음

## 7. 실행한 테스트와 결과 (2026-10-14, S0 ② 코어 기초)

| 검증 | 결과 |
|---|---|
| `npm test` | 통과: 테스트 파일 6개, 테스트 32개 (기존 4개 + rng 12개, modifiers 10개, id 4개, purity 2개) |
| `npm run typecheck` | 통과 |
| `npm run build` | 통과 |
| `npm run validate:content` | 통과 (JSON 0개) |
| sfc32 참조값 | PractRand 원본 C 식을 Python으로 따로 구현해 계산한 출력·상태와 일치 |
| INV-18 테스트의 판별력 | 정렬을 빼면 이 테스트가 실패하는 것을 확인 (확인 후 원복) |
| 화면 | 변경 없음. 직접 확인 항목 없음 |

## 8. 임시값

구현 중 고른 임시값을 적는다. 구조나 여러 시스템에 영향을 주는 값은 `docs/decisions.md`에 있다 (D-010 자동 저장, D-011 시간 값, D-014 스태미나 수치).

| 값 | 임시값 | 위치(파일) | 고른 이유 | 단계 | 상태 |
|---|---|---|---|---|---|
| `computeValue`의 `round` 모드 | 0.5는 올림 (`Math.round`) | `src/engine/core/modifiers.ts` | JS 기본 동작이고 결정론에는 영향 없음. 음수 -2.5는 -2가 된다 | S0 | 임시 |

상태: `임시` 플레이테스트 전 / `조정됨` 플레이테스트 후 바꿈 / `확정` 사용자가 확정함

## 9. 사용자 결정 대기

- 없음 (S0 세 번째 단위 제안 예정)

다가오는 단계의 '착수 전 확인' 항목 (`docs/roadmap.md`):

- S3 착수 전: 즉시 귀환의 제약
- S5 착수 전: 전투 진입 조건, 전투 화면 배치, 도주 후 처리, 전투의 게임 시간 반영, 전투 중 스태미나 고갈, 원정마다 다시 굴려지는 것

## 10. 문서 간 불일치

- 명세서 11.4절과 19장은 효과·수정치 문법을 아직 '(제안)'과 미결로 적고 있지만, 수정치 계산 순서는 D-007로 승인되었다. 명세서 수정은 사용자 승인이 필요하다.
