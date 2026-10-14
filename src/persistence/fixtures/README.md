# v1 세이브 예시

두 JSON은 v2 구현 전에 main `401750318147143a15b61f35dee33f3600e8037d`의
`createCampaign` → `createSaveFile` → `serializeSave` 경로로 생성했다.
실제 사용자 플레이 기록이 아니라, 공개된 v1 작성 코드로 만든 변환 테스트용 예시다.

- 콘텐츠: 당시 실제 콘텐츠 0.2.0.
- 시드: `[1, 2, 3, 4]`, 초기 시각: `1700000000000`.
- 저장 전 gameTime을 123, settledUntil을 `1699999999900`으로 설정했다.
- saveId: `00112233-4455-4677-8899-aabbccddeeff`, revision: 7, savedAt: `1700000001000`.
- `v1-empty.json`: character·expedition이 null.
- `v1-placeholders.json`: character·expedition이 당시 허용된 빈 객체.

v1 스키마로 원본을 검증한 뒤 v2로 변환한다. 기존 값·입력 보존, 미배치 캐릭터,
명시적 첫 배치, 난수 연속성과 저장 왕복을 테스트한다. 이 파일들은 새 형식에 맞춰 바꾸지 않는다.

## v2 예시 3개

S2 상태 변경 전에 main `44b419e11c8bb437c4bfaed17af67f2d51da0e2e`의 실제
`createCampaign`·맵 행동·`createSaveFile`·`serializeSave` 경로로 생성했다.
콘텐츠 0.2.0, 시드 `[1, 2, 3, 4]`, 초기 시각 `1700000000000`,
위와 같은 saveId·revision 7·savedAt `1700000001000`을 사용했다.

- `v2-empty.json`: 캐릭터·원정이 null인 빈 캠페인.
- `v2-unplaced.json`: position이 null인 기존 캐릭터·빈 원정.
- `v2-explored.json`: 최초 배치 후 east·east·south·south·east로 이동해 위험 구역 (4, 3)에 위치.

실제 사용자 기록이 아니라 이전 버전 작성 코드로 만든 변환 테스트 예시다.
v2 전체를 보존된 스키마로 검증한 뒤 스태미나 900/900·이동 표시 false를 추가한다.
null 캐릭터·위치·탐사 기록·시간·난수·저장 메타데이터는 보존한다.
v1→v2→v3 체인, v3 왕복과 복원 후 이동·틱·안개 연속성을 검사한다.


## v3 예시 1개

`v3-explored.json`은 v4 구현 전 작성 코드인 PR #13 준비 커밋
`6b1291e79a34d19817c4f5302a20a18013be1ccd`의 로컬 동등 트리에서
`loadContent` → `createNewGameStore` → 행동 → `createSaveFile` → `serializeSave`로 생성했다.
실제 사용자 기록이 아니며, 새 v4 구조를 v3로 수동 편집한 파일도 아니다.

- 당시 실제 콘텐츠 0.2.4, 시드 `[1, 2, 3, 4]`, 초기 시각 `1700000000000`.
- 위와 같은 saveId·revision 7·savedAt `1700000001000`.
- east·east·south·south·east → time/tick → stamina/recover 1 → east.
- 위험 구역 (5, 3), gameTime=1, 스태미나 889/900, movedSinceLastTick=true, 원정 null.
- 보존된 v3 전체 스키마를 통과한 뒤 activity=waiting을 추가한다.
  변환·메타데이터/자원/기록/난수 보존·null 경계·v4 왕복을 검사한다.
  기존 v1/v2 예시는 변경하지 않았다. 전체 지원 체인은 v1→v2→v3→v4다.
