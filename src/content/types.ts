// S0의 연결용 최소 타입. 로더와 종류별 조회 구조는 콘텐츠 단위에서 추가한다.
export type ContentDb = Readonly<{
  contentVersion: string;
}>;
