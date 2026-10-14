// 실행 중에 생기는 개체(캠페인, 캐릭터, 사망 기록 등)의 UUID (architecture 6장).
// 같은 입력에서 같은 결과를 내야 하므로(INV-04) 시드 난수로 만든다. 난수 4개를 소비한다.
import type { Rng } from './rng.ts';

export function createUuid(rng: Rng): string {
  const bytes: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const word = rng.nextUint32();
    bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // 버전 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 변형

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
