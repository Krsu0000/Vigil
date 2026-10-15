import { describe, expect, it } from 'vitest';
import { formatRecordTime } from './record-time.ts';

describe('기록의 24시간 시각', () => {
  it.each([[0, 5, '00:05'], [9, 7, '09:07'], [17, 49, '17:49'], [23, 59, '23:59']])('현지 시각 %s:%s를 %s로 표시한다', (hour, minute, expected) => {
    expect(formatRecordTime(new Date(2026, 9, 15, Number(hour), Number(minute)).getTime())).toBe(expected);
  });
});
