import { z } from 'zod';
import { createEffectRegistry, defineEffect } from '../../core/effects.ts';
import { recoverStamina } from '../stamina/stamina.ts';

// 제품 효과 목록. 콘텐츠 로더·검증 CLI·아이템 실행이 같은 목록을 사용한다.
export const itemEffectRegistry = createEffectRegistry({
  'stamina/restore': defineEffect({
    params: z.strictObject({ amount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }),
    apply: (state, params) => {
      const character = state.character;
      if (!character) throw new Error('회복 대상 캐릭터가 없다');
      const stamina = recoverStamina(character.stamina, 1, params.amount);
      return { state: { ...state, character: { ...character, stamina,
        activity: stamina.current === stamina.max ? 'waiting' : character.activity,
      } }, events: [] };
    },
  }),
});
