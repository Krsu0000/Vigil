# progress.md — The Last Vigil 작업 현황

현재 상태와 다음 작업을 기록한다. 과거 이력은 Git과 `docs/decisions.md`에서 확인한다. 이 문서는 짧게 유지한다.

**마지막 갱신:** 2026-10-14 (문서 체계 구축 직후, 코드 작업 전)

## 1. 현재 상태

- **현재 단계:** S0 착수 전 (`docs/roadmap.md`)
- **코드:** 없음. `package.json`, `src/`, 테스트 환경 모두 아직 없다.
- **Git:** 저장소 초기화 여부 확인 필요 (아직 확인하지 않음)
- **작업 환경:** Claude Code on the web(클라우드 세션) + GitHub 비공개 저장소. 결과는 작업 브랜치와 PR로 올리고, 사용자가 `main`에 병합한다. 사용자는 주로 폰에서 확인하며, 화면 확인은 Cloudflare Pages 미리보기로 한다 (D-015).
- **문서:** `CLAUDE.md`와 `docs/` 아래 문서 6개 중 5개 작성 완료. `docs/game-design.md`는 아직 배치되지 않았다 (3장 참고).

## 2. 완료된 작업

- 개발 운영 문서 작성: `CLAUDE.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/roadmap.md`, `docs/features.md`, `docs/progress.md`
- 기술 결정 D-001 ~ D-014 기록 (`docs/decisions.md`)
- 게임 기획: 통합 개발 명세서 v1.2 작성 (Claude Docs에 있음, 아직 Markdown으로 옮기지 않음)

## 3. S0 착수 전 준비 (사용자)

- [ ] 통합 개발 명세서 v1.2를 Markdown으로 내보내 `docs/game-design.md`로 저장
- [ ] 프로젝트 폴더에 `CLAUDE.md`와 `docs/` 배치
- [ ] GitHub 비공개 저장소 생성, 문서 업로드 (폰에서는 루트에 올리고 첫 세션에서 `docs/`로 정리)
- [ ] Claude 앱 Code 탭에서 GitHub 연결
- [ ] Cloudflare 계정 생성 (Pages 연결은 S0 첫 단위가 끝난 뒤)

## 4. 진행 중인 작업

없음

## 5. 다음 세션에서 시작할 작업

1. 문서 확인: `CLAUDE.md` 4절의 순서대로 읽는다. 문서 체계는 이미 있으므로 새로 만들지 않고, 실제 파일 상태와 이 문서가 맞는지만 확인한다.
2. 환경 확인: `git status`, Node·npm 버전, 3장 준비 항목이 끝났는지 확인하고 결과를 이 문서에 적는다.
3. S0 시작: `docs/roadmap.md`의 S0을 작은 단위로 나눠 첫 단위를 제안한다. 첫 단위가 끝나면 사용자에게 Cloudflare Pages 연결(빌드 명령 `npm run build`, 출력 폴더 `dist`)을 요청한다. 첫 단위 후보는 'Vite + React + TypeScript + Vitest + Zod 프로젝트 생성과 npm 명령 5개 구성'이다. 완료 기준은 `npm test`(빈 테스트 1개), `npm run typecheck`, `npm run build`가 통과하고 `npm run dev`로 빈 화면이 뜨는 것이다.

## 6. 미해결 오류

없음 (코드 없음)

## 7. 실행한 테스트와 결과

없음 (테스트 환경 없음)

## 8. 임시값

구현 중 고른 임시값을 적는다. 구조나 여러 시스템에 영향을 주는 값은 `docs/decisions.md`에 있다 (D-010 자동 저장, D-011 시간 값, D-014 스태미나 수치).

| 값 | 임시값 | 위치(파일) | 고른 이유 | 단계 | 상태 |
|---|---|---|---|---|---|
| | | | | | |

상태: `임시` 플레이테스트 전 / `조정됨` 플레이테스트 후 바꿈 / `확정` 사용자가 확정함

## 9. 사용자 결정 대기

다가오는 단계의 '착수 전 확인' 항목 (`docs/roadmap.md`):

- S3 착수 전: 즉시 귀환의 제약
- S5 착수 전: 전투 진입 조건, 전투 화면 배치, 도주 후 처리, 전투의 게임 시간 반영, 전투 중 스태미나 고갈, 원정마다 다시 굴려지는 것

## 10. 문서 간 불일치

- 명세서 11.4절과 19장은 효과·수정치 문법을 아직 '(제안)'과 미결로 적고 있지만, 수정치 계산 순서는 D-007로 승인되었다. 명세서 수정은 사용자 승인이 필요하다.
