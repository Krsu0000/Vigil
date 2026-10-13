# progress.md — The Last Vigil 작업 현황

현재 상태와 다음 작업을 기록한다. 과거 이력은 Git과 `docs/decisions.md`에서 확인한다. 이 문서는 짧게 유지한다.

**마지막 갱신:** 2026-10-14 (첫 클라우드 세션: 문서 정리, 환경 확인, S0 첫 단위 제안)

## 1. 현재 상태

- **현재 단계:** S0 착수 전. 첫 구현 단위를 제안했고 사용자 승인을 기다린다 (5장).
- **코드:** 없음. `package.json`, `src/`, 테스트 환경 모두 아직 없다.
- **Git:** GitHub 비공개 저장소 `Krsu0000/Vigil`, 기본 브랜치 `main`. 클라우드 세션 작업 브랜치는 `ccr-46c2294a-5xn9dw`.
- **작업 환경:** Claude Code on the web(클라우드 세션) + GitHub 비공개 저장소. 결과는 작업 브랜치와 PR로 올리고, 사용자가 `main`에 병합한다. 사용자는 주로 폰에서 확인하며, 화면 확인은 Cloudflare Pages 미리보기로 한다 (D-015).
- **문서:** `CLAUDE.md`는 루트, 나머지는 `docs/`에 있다. `docs/` 아래 계획된 6개 중 5개만 있고 **`docs/architecture.md`가 저장소에 없다** (10장).

### 환경 확인 결과 (2026-10-14)

| 항목 | 결과 |
|---|---|
| `git status` | 작업 트리 깨끗함. 미커밋 변경 없음 |
| Node | v22.22.0 (TypeScript 파일을 플래그 없이 직접 실행할 수 있음을 확인) |
| npm | 10.9.4, npm 레지스트리 접근 가능 |
| 테스트 환경 | 없음. `package.json`이 없어 `npm test`를 실행할 수 없다. S0 첫 단위에서 구축한다 |
| 확인 시점 최신 안정판 | react 19.3.0, vite 8.3.4, @vitejs/plugin-react 6.1.2, vitest 5.0.4, zod 4.6.7, typescript 7.0.2 |

## 2. 완료된 작업

- 개발 운영 문서 작성: `CLAUDE.md`, `docs/decisions.md`, `docs/roadmap.md`, `docs/features.md`, `docs/progress.md`. `docs/architecture.md`는 작성되었다고 기록되어 있으나 저장소에 올라오지 않았다.
- 기술 결정 D-001 ~ D-015 기록 (`docs/decisions.md`)
- 게임 기획: 통합 개발 명세서 v1.2를 Markdown으로 옮겨 `docs/game-design.md`로 배치
- 루트에 올린 문서 5개를 `docs/`로 이동 (2026-10-14)

## 3. S0 착수 전 준비 (사용자)

- [x] 통합 개발 명세서 v1.2를 Markdown으로 내보내 `docs/game-design.md`로 저장
- [ ] 프로젝트 폴더에 `CLAUDE.md`와 `docs/` 배치 — `docs/architecture.md`만 남음
- [x] GitHub 비공개 저장소 생성, 문서 업로드, `docs/`로 정리
- [x] Claude 앱 Code 탭에서 GitHub 연결 (이 세션이 저장소를 받아 동작함)
- [ ] Cloudflare 계정 생성 (세션에서 확인할 수 없음. Pages 연결은 S0 첫 단위가 끝난 뒤)

## 4. 진행 중인 작업

없음 (S0 첫 단위 제안, 승인 대기)

## 5. 다음 세션에서 시작할 작업

1. 사용자: `docs/architecture.md`를 저장소에 올린다. S0의 두 번째 단위(코어 계약)부터 이 문서의 인터페이스 정의가 필요하다.
2. S0 첫 단위(승인되면 구현): **프로젝트 뼈대.** Vite + React + TypeScript + Vitest + Zod 프로젝트와 npm 명령 5개, 빈 화면.
   - 완료 기준: `npm test`(스모크 테스트 1개), `npm run typecheck`, `npm run build`, `npm run validate:content`(검증할 콘텐츠 0개) 통과, `npm run dev`로 빈 화면.
   - 승인 받을 선택: `validate:content` 실행 방식 (9장). 패키지는 설치 시점 최신 안정판을 쓰고 호환 문제가 있으면 한 단계 낮춘다.
3. 첫 단위가 끝나면 사용자에게 Cloudflare Pages 연결(빌드 명령 `npm run build`, 출력 폴더 `dist`)을 요청한다.
4. S0 나머지 단위 안: ② 코어 기초(sfc32, `computeValue`, UUID) → ③ 코어 계약(`GameState`, `Action`·`GameEvent`, `dispatch`, 효과 레지스트리) → ④ 콘텐츠(매니페스트, 로더, 교차 참조 검증, 시간 규칙 JSON) → ⑤ 저장(`SaveFile` v1, 변환 체인 구조, `CombatLog` 타입) → ⑥ S0 정리와 문서 갱신. ②~⑤는 `docs/architecture.md`의 해당 절을 기준으로 한다.

## 6. 미해결 오류

없음 (코드 없음)

## 7. 실행한 테스트와 결과

없음 (테스트 환경 없음, `npm test` 실행하지 않음)

## 8. 임시값

구현 중 고른 임시값을 적는다. 구조나 여러 시스템에 영향을 주는 값은 `docs/decisions.md`에 있다 (D-010 자동 저장, D-011 시간 값, D-014 스태미나 수치).

| 값 | 임시값 | 위치(파일) | 고른 이유 | 단계 | 상태 |
|---|---|---|---|---|---|
| | | | | | |

상태: `임시` 플레이테스트 전 / `조정됨` 플레이테스트 후 바꿈 / `확정` 사용자가 확정함

## 9. 사용자 결정 대기

- S0 첫 단위 승인과 `validate:content` 실행 방식: Node 내장 TypeScript 실행(추천, 의존성 없음) / Vitest로 실행 / `tsx` 추가(새 의존성)
- `docs/architecture.md` 업로드

다가오는 단계의 '착수 전 확인' 항목 (`docs/roadmap.md`):

- S3 착수 전: 즉시 귀환의 제약
- S5 착수 전: 전투 진입 조건, 전투 화면 배치, 도주 후 처리, 전투의 게임 시간 반영, 전투 중 스태미나 고갈, 원정마다 다시 굴려지는 것

## 10. 문서 간 불일치

- **`docs/architecture.md` 없음.** `CLAUDE.md`(6절 10·13항, 11절), `docs/roadmap.md`(S0의 2.2·3.1·5·7.1·10절, S1~S7), `docs/features.md`(불변 조건 12장)가 이 문서를 참조한다. 저장소 이력에도 없다. 내용을 추측해 새로 만들지 않고 사용자 업로드를 기다린다.
- 명세서 11.4절과 19장은 효과·수정치 문법을 아직 '(제안)'과 미결로 적고 있지만, 수정치 계산 순서는 D-007로 승인되었다. 명세서 수정은 사용자 승인이 필요하다.
