// 저장에는 절대 시각을 보관하고, 화면에는 플레이어 기기의 현지 시각을 24시간제로 표시한다.
export function formatRecordTime(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
