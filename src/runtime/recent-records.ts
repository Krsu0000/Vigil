import type { ContentDb } from '../content/types.ts';
import type { GameState, RecentRecord } from '../engine/core/state.ts';
import { findChest, findItem } from '../engine/systems/inventory/selectors.ts';
import type { RuntimeEvent } from './store.ts';

// UI 마운트/팝업 열림과 무관하게 성공한 게임 사건에서만 기록한다.
// 이동·시간·자동 회복·거부된 입력은 기록하지 않는다.
export function recordEvents(state: GameState, events: readonly RuntimeEvent[], content: ContentDb, at: number): GameState {
  const records: RecentRecord[] = [];
  const add = (text: string) => records.push({ at, text });
  for (const event of events) {
    switch (event.type) {
      case 'inventory/looted': {
        const chest = findChest(content, event.chestId)!;
        add(`${chest.name}에서 물품을 획득했습니다. ${chest.loot.map(entry => `${findItem(content, entry.itemId)!.name} ×${entry.quantity}`).join(', ')}`);
        break;
      }
      case 'inventory/used': add(`${findItem(content, event.itemId)!.name} 사용 · 스태미나 ${event.recovered} 회복`); break;
      case 'inventory/equipped': add(`${findItem(content, event.itemId)!.name} 장착`); break;
      case 'inventory/unequipped': add(`${findItem(content, event.itemId)!.name} 해제`); break;
      case 'rest/started': add('휴식을 시작했습니다.'); break;
      case 'rest/stopped': add('휴식을 중지했습니다.'); break;
      case 'map/returned': add('거점으로 귀환했습니다.'); break;
      case 'ambush/triggered': add('습격을 받았습니다.'); break;
      case 'combat/started': add('전투를 시작했습니다.'); break;
      case 'combat/acted': {
        const combat = state.expedition!.combat!;
        if (event.status === 'victory') add(`전투 승리 · ${combat.loot.map(entry => `${findItem(content, entry.itemId)!.name} ×${entry.quantity}`).join(', ')} 획득`);
        if (event.status === 'escaped') add('전투에서 도주했습니다.');
        if (event.status === 'defeat') add('체력이 다했습니다. 감시자의 여정이 끝났습니다.');
        break;
      }
    }
  }
  if (!records.length) return state;
  if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000) throw new Error('기록 시각은 유효한 현실 시각이어야 한다');
  return { ...state, campaign: { ...state.campaign, recentRecords: [...(state.campaign.recentRecords ?? []), ...records].slice(-100) } };
}
