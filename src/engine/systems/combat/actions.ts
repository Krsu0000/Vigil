import type { ActionHandlers, ExecutionResult } from '../../core/actions.ts';
import type { CombatState, CombatTurnAction, CombatLine } from '../../core/combat-log.ts';
import type { GameState } from '../../core/state.ts';
import { computeValue } from '../../core/modifiers.ts';
import { findItem, inventoryWeight } from '../inventory/selectors.ts';
import { addLoot, inventoryHandlers } from '../inventory/actions.ts';
import { consumeStamina } from '../stamina/stamina.ts';
import { advanceCombatTime } from '../time/advance.ts';
import { combatEffects } from './effects.ts';
import { findEncounter, livingFront, requireMonster, monsterBehavior } from './selectors.ts';

export type CombatAction=Readonly<{type:'combat/start'}> | CombatTurnAction | Readonly<{type:'combat/close'}>;
type CombatProgressEvent=Readonly<{type:'combat/started'|'combat/acted'|'combat/closed';status:CombatState['status']}>;
export type CombatEvent=CombatProgressEvent | Readonly<{type:'character/died';encounterId:string}>;
const result=(state:GameState,type:CombatProgressEvent['type']):ExecutionResult<CombatEvent>=>({state,events:[{type,status:state.expedition?.combat?.status??'active'}]});
export const combatHandlers:ActionHandlers<CombatAction,CombatEvent>={
  'combat/start':{
    validate(state,_action,ctx){
      const pending=state.expedition?.pendingAmbush;
      if(!pending || !state.character?.position || state.character.health.current===0 || state.expedition?.combat)return 'condition_not_met';
      return findEncounter(ctx.content,pending.encounterId??ctx.content.timeRules.combat.ambushEncounterId)?null:'invalid_action';
    },
    execute(state,_action,ctx,rng){
      const pending=state.expedition!.pendingAmbush!;
      const encounter=findEncounter(ctx.content,pending.encounterId??ctx.content.timeRules.combat.ambushEncounterId)!;
      const enemies=encounter.enemies.map((enemy,index)=>{const monster=requireMonster(ctx.content,enemy.monsterId);
        return {id:`${encounter.id}:${index}`,monsterId:monster.id,health:monster.health,maxHealth:monster.health,row:enemy.row};});
      const character={...state.character!,activity:'waiting' as const};
      const combat:CombatState={encounterId:encounter.id,origin:pending.encounterId?'map':'ambush',retreat:pending.retreat??character.position!,
        enemies,status:'active',turn:1,actions:[],history:[],loot:[],initial:{contentVersion:ctx.content.contentVersion,
          character,enemies,rngState:rng.getState(),gameTime:state.meta.gameTime}};
      return result({...state,character,expedition:{...state.expedition!,pendingAmbush:null,combat}},'combat/started');
    },
  },
  'combat/act':{
    validate(state,action,ctx){
      const combat=state.expedition?.combat;if(!combat || combat.status!=='active' || !state.character)return 'condition_not_met';
      if(!['attack','defend','skill','item','escape'].includes(action.choice))return 'invalid_action';
      const rules=ctx.content.timeRules.combat;
      if((combat.actions.length+1)*rules.ticksPerTurn>Number.MAX_SAFE_INTEGER-state.meta.gameTime)return 'invalid_action';
      if(action.choice==='attack'||action.choice==='skill'){
        if(!livingFront(combat.enemies).some(enemy=>enemy.id===action.targetId))return 'invalid_action';
        if(action.choice==='skill' && state.character.stamina.current<rules.skillCost)return 'insufficient_resources';
        const inventory=addLoot(state.character.inventory,combat.enemies.flatMap(enemy=>requireMonster(ctx.content,enemy.monsterId).loot));
        if(!inventory)return 'insufficient_resources';
        try{inventoryWeight(inventory,ctx.content);}catch{return 'insufficient_resources';}
      }
      if(action.choice==='item'){
        if(typeof action.itemId!=='string')return 'invalid_action';
        // 전투의 사용도 기존 아이템 검증·효과 경로를 사용한다.
        const inventoryState={...state,expedition:{...state.expedition!,combat:undefined}};
        return inventoryHandlers['inventory/use']!.validate(inventoryState,{type:'inventory/use',itemId:action.itemId},ctx);
      }
      return null;
    },
    execute(state,action,ctx,rng){
      const old=state.expedition!.combat!;const rules=ctx.content.timeRules.combat;
      let next=state;let enemies=[...old.enemies];let status:CombatState['status']='active';
      const lines:CombatLine[]=[];const log=(text:string)=>lines.push({turn:old.turn,text});
      if(action.choice==='attack'||action.choice==='skill'){
        const index=enemies.findIndex(enemy=>enemy.id===action.targetId);const enemy=enemies[index]!;
        const monster=requireMonster(ctx.content,enemy.monsterId);
        if(action.choice==='skill')next={...next,character:{...next.character!,stamina:consumeStamina(next.character!.stamina,rules.skillCost)}};
        if(rng.nextFloat()<rules.hitChance){
          const guard=monsterBehavior(monster,old.turn-1);
          const damage=computeValue(rng.nextInt(rules.attackMin,rules.attackMax),[
            ...(action.choice==='skill'?[{target:'damage',op:'mul' as const,value:rules.skillMultiplier,source:'skill.power_strike'}]:[]),
            ...(guard?.type==='guard'?[{target:'damage',op:'mul' as const,value:guard.multiplier,source:'monster.guard'}]:[]),
          ],{round:'round',min:guard?.type==='guard'?0:1});
          enemies[index]={...enemy,health:computeValue(enemy.health,[{target:'health',op:'add',value:-damage,source:'attack'}],{round:'round',min:0,max:enemy.maxHealth})};
          log(`${action.choice==='skill'?'강타':'공격'}. ${monster.name}에게 ${damage} 피해.`);
        }else log(`${monster.name}에게 공격이 빗나갔다.`);
      }else if(action.choice==='defend')log('방어 자세를 취했다.');
      else if(action.choice==='item'){
        const used=inventoryHandlers['inventory/use']!.execute(next,{type:'inventory/use',itemId:action.itemId!},ctx,rng);
        next=used.state;log(`${findItem(ctx.content,action.itemId!)!.name}을 사용했다.`);
      }else if(action.choice==='escape'){
        if(rng.nextFloat()<rules.escapeChance){status='escaped';next={...next,character:{...next.character!,position:old.retreat,movedSinceLastTick:true}};log('도주에 성공했다.');}
        else log('도주에 실패했다.');
      }
      if(status==='active' && enemies.every(enemy=>enemy.health===0))status='victory';
      if(status==='active')for(const enemy of livingFront(enemies)){
        const monster=requireMonster(ctx.content,enemy.monsterId);
        const behavior=monsterBehavior(monster,old.turn);
        if(behavior && behavior.type!=='attack'){
          if(behavior.type==='heal'){
            const i=enemies.findIndex(e=>e.id===enemy.id),healed=Math.min(enemy.maxHealth-enemy.health,behavior.amount);
            enemies[i]={...enemy,health:enemy.health+healed};log(`${monster.name}: ${behavior.text} 체력 ${healed} 회복.`);
          }else log(`${monster.name}: ${behavior.text}`);
          continue;
        }
        if(rng.nextFloat()<monster.hitChance){
          const damage=computeValue(rng.nextInt(monster.damageMin,monster.damageMax),[
            ...(action.choice==='defend'?[{target:'damage',op:'mul' as const,value:rules.defenseMultiplier,source:'defend'}]:[]),
            ...(behavior?.type==='attack'?[{target:'damage',op:'mul' as const,value:behavior.multiplier,source:'monster.attack'}]:[]),
          ],{round:'round',min:1});
          next=combatEffects.apply(next,{type:'health/change',params:{amount:-damage}},ctx,rng).state;
          log(behavior?`${monster.name}: ${behavior.text} 받은 피해 ${damage}.`:`${monster.name}의 공격. 받은 피해 ${damage}.`);
          if(next.character!.health.current===0){status='defeat';break;}
        }else log(`${monster.name}의 공격을 피했다.`);
      }
      const actions=[...old.actions,action];let loot=old.loot;
      if(status==='victory'){
        loot=enemies.flatMap(enemy=>requireMonster(ctx.content,enemy.monsterId).loot);
        const inventory=addLoot(next.character!.inventory,loot)!;
        next={...next,character:{...next.character!,inventory},
          expedition:{...next.expedition!,defeatedEnemies:old.origin==='map'?{...next.expedition!.defeatedEnemies,[old.encounterId]:true}:next.expedition!.defeatedEnemies}};
        // 정의되지 않은 optional 필드는 JSON에 넣지 않는다.
        if(next.expedition?.defeatedEnemies===undefined){const {defeatedEnemies: _unused,...expedition}=next.expedition!;next={...next,expedition};}
        log('전투에서 승리했다. 전리품을 챙겼다.');
      }
      if(status==='defeat')log('체력이 다했다. 이번 감시자의 여정이 끝났다.');
      const combat:CombatState={...old,enemies,status,turn:old.turn+1,actions,history:[...old.history,...lines],loot};
      next={...next,expedition:{...next.expedition!,combat}};
      if(status!=='active')next=advanceCombatTime(next,actions.length*rules.ticksPerTurn);
      const acted=result(next,'combat/acted');
      return status==='defeat'?{...acted,events:[...acted.events,{type:'character/died',encounterId:old.encounterId}]}:acted;
    },
  },
  'combat/close':{
    validate:state=>state.expedition?.combat && state.expedition.combat.status!=='active' && state.expedition.combat.status!=='defeat'?null:'condition_not_met',
    execute(state){const {combat: _combat,...expedition}=state.expedition!;return result({...state,expedition},'combat/closed');},
  },
};
