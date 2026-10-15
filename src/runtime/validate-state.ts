import type { ContentDb } from '../content/types.ts';
import type { GameState } from '../engine/core/state.ts';
import { validateMapState } from '../engine/systems/map/selectors.ts';
import { validateActivityState } from '../engine/systems/rest/actions.ts';

// 형식 검증 뒤, 상태를 교체하기 전에 모든 복원 경로에서 호출한다.
// 새 시스템의 콘텐츠 대조도 여기에 등록한다. 형식 변환이나 상태 변경은 하지 않는다.
export function validateStateContent(state: GameState, content: ContentDb): void {
  validateMapState(state, content);
  validateActivityState(state, content);
}
