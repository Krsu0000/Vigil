import { z } from 'zod';
import { createEffectRegistry, defineEffect } from '../../core/effects.ts';
import { computeValue } from '../../core/modifiers.ts';
export const combatEffects=createEffectRegistry({
  'health/change':defineEffect({params:z.strictObject({amount:z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)}),
    apply(state,params){
      if(!state.character)throw new Error('체력 변경 대상이 없다');
      const health=state.character.health;
      return {state:{...state,character:{...state.character,health:{...health,current:computeValue(health.current,
        [{target:'health',op:'add',value:params.amount,source:'combat'}],{round:'round',min:0,max:health.max})}}},events:[]};
    },
  }),
});
