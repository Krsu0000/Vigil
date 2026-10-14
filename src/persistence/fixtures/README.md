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
