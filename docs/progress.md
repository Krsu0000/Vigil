# progress.md — The Last Vigil 작업 현황

현재 상태와 다음 작업을 기록한다. 과거 이력은 Git과 `docs/decisions.md`에서 확인한다. 이 문서는 짧게 유지한다.

**마지막 갱신:** 2026-10-14 (S0 첫 단위 '프로젝트 뼈대' 완료)

## 1. 현재 상태

- **현재 단계:** S0 진행 중. 첫 단위(프로젝트 뼈대) 완료, Cloudflare Pages 연결 대기.
- **코드:** Vite + React + TypeScript + Vitest + Zod 뼈대. npm 명령 5개 동작. 화면은 게임 제목만 표시한다. 엔진·콘텐츠·저장 코드는 아직 없다.
- **Git:** GitHub 비공개 저장소 `Krsu0000/Vigil`, 기본 브랜치 `main`. 클라우드 세션 작업 브랜치는 `ccr-46c2294a-5xn9dw`.
- **작업 환경:** Claude Code on the web(클라우드 세션) + GitHub 비공개 저장소. 결과는 작업 브랜치와 PR로 올리고, 사용자가 `main`에 병합한다. 사용자는 주로 폰에서 확인하며, 화면 확인은 Cloudflare Pages 미리보기로 한다 (D-015).
- **실행 환경:** Node v22.22.0(`.node-version`에 고정, `engines`는 22.18 이상), npm 10.9.4.
- **패키지(정확한 버전 고정):** react·react-dom 19.3.0, zod 4.6.7 / 개발용: typescript 7.0.2, vite 8.3.4, @vitejs/plugin-react 6.1.2, vitest 5.0.4, @types/react·@types/react-dom 19.3.0, @types/node 22.20.5

## 2. 완료된 작업

- 문서 체계: `CLAUDE.md`(루트), `docs/` 아래 6개. 기술 결정 D-001 ~ D-016.
- S0 첫 단위 '프로젝트 뼈대' (2026-10-14)
  - npm 명령 5개, `tsconfig.json`(D-016 규칙 강제), `vite.config.ts`(테스트 환경 Node)
  - `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/strings/index.ts`
  - `scripts/validate-content.ts`: `src/content/` 아래 JSON 구문 검사. 폴더가 없으면 0개로 통과
  - 문서: `CLAUDE.md` 2·3절, architecture 0·1.1·1.2·1.4·6장, D-016

## 3. S0 착수 전 준비 (사용자)

- [x] 명세서 `docs/game-design.md` 배치, `CLAUDE.md`와 `docs/` 배치, GitHub 비공개 저장소와 연결
- [ ] Cloudflare 계정 생성과 Pages 연결 (5장 1번)

## 4. 진행 중인 작업

없음

## 5. 다음 작업

1. **사용자: Cloudflare Pages 연결.** 저장소 `Krsu0000/Vigil` 연결, 빌드 명령 `npm run build`, 출력 폴더 `dist`. Node 버전은 `.node-version`(22.22.0)을 읽는다. 연결 후 미리보기 주소에서 'The Last Vigil' 제목이 보이는지 폰에서 확인한다.
2. S0 두 번째 단위 **코어 기초**: sfc32 난수와 상태 저장·복원(architecture 5장, D-008), `computeValue`(7.2절, D-007, INV-18), UUID 생성. 착수 전에 범위와 완료 기준을 제안한다.
3. 이후 단위: ③ 코어 계약(`GameState`, `Action`·`GameEvent`, `dispatch`, 효과 레지스트리) → ④ 콘텐츠(매니페스트, 로더, 교차 참조 검증, 시간 규칙 JSON, `validate:content`를 실제 검증 코드에 연결) → ⑤ 저장(`SaveFile` v1, 변환 체인 구조, `CombatLog` 타입) → ⑥ S0 정리와 문서 갱신.

## 6. 미해결 오류

없음

## 7. 실행한 테스트와 결과 (2026-10-14, S0 첫 단위)

| 검증 | 결과 |
|---|---|
| `npm test` | 통과: 테스트 파일 2개, 테스트 4개 (`src/ui/App.test.tsx`, `scripts/validate-content.test.ts`) |
| `npm run typecheck` | 통과 (종료 코드 0) |
| `npm run build` | 통과, `dist/` 생성 |
| `npm run validate:content` | 통과: JSON 0개, 오류 0개. 깨진 JSON을 임시로 넣으면 종료 코드 1 (확인 후 삭제) |
| D-016 규칙 강제 | 확장자 없는 import, `enum`, 속성 없는 JSON import가 typecheck 오류가 되는 것을 임시 파일로 확인 (확인 후 삭제) |
| 화면 (자동, headless Chromium) | `npm run dev`와 `dist` 미리보기 모두 `#root`에 제목이 그려짐. 390px 폭 스크린숏 확인 |
| 화면 (직접, 폰) | 실행하지 않음 — Pages 연결 후 사용자가 확인 |

## 8. 임시값

구현 중 고른 임시값을 적는다. 구조나 여러 시스템에 영향을 주는 값은 `docs/decisions.md`에 있다 (D-010 자동 저장, D-011 시간 값, D-014 스태미나 수치).

| 값 | 임시값 | 위치(파일) | 고른 이유 | 단계 | 상태 |
|---|---|---|---|---|---|
| | | | | | |

상태: `임시` 플레이테스트 전 / `조정됨` 플레이테스트 후 바꿈 / `확정` 사용자가 확정함

## 9. 사용자 결정 대기

- Cloudflare Pages 연결 (5장 1번)

다가오는 단계의 '착수 전 확인' 항목 (`docs/roadmap.md`):

- S3 착수 전: 즉시 귀환의 제약
- S5 착수 전: 전투 진입 조건, 전투 화면 배치, 도주 후 처리, 전투의 게임 시간 반영, 전투 중 스태미나 고갈, 원정마다 다시 굴려지는 것

## 10. 문서 간 불일치

- `computeValue` 예시의 기본값: architecture 7.2절은 명세 예시값(이동 비용 2 → 결과 1), roadmap S0 완료 기준은 D-014 값(6 → 3)을 쓴다. 계산 순서는 같으므로 S0 테스트는 roadmap 값으로 만든다. architecture 예시를 D-014 값으로 맞출지는 사용자가 정한다.
- 명세서 11.4절과 19장은 효과·수정치 문법을 아직 '(제안)'과 미결로 적고 있지만, 수정치 계산 순서는 D-007로 승인되었다. 명세서 수정은 사용자 승인이 필요하다.
