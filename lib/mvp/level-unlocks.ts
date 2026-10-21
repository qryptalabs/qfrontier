import { RECIPES, RECIPE_CATALOG } from './catalog.ts';
import { getActivityProgression, activityLevelThreshold } from './activity-progression.ts';
import type { ActivityProgressionView } from './activity-progression.ts';
import { HABITABLE_BUILDING_TEMPLATES } from './habitable-data.ts';
import type { HabitableTemplateId } from './habitable-data.ts';
import { MvpError } from './helpers.ts';
import type { BuildingType, ItemId, Job, MvpWorld, Player } from './types.ts';

/** Fixed at the observed rollout preparation time, never recomputed per request or profile. */
export const UNLOCK_RULES_EFFECTIVE_AT=Date.parse('2026-10-16T10:58:05.601Z');
export interface UnlockAccess {requiredLevel:number;unlocked:boolean;legacy:boolean}
export interface LevelMilestone {level:number;xp:number;recipes:ItemId[];buildings:HabitableTemplateId[]}
export interface LevelUnlockView {
  playerId:string;level:number;recipes:(UnlockAccess&{id:ItemId})[];buildings:(UnlockAccess&{id:HabitableTemplateId})[];
  milestones:LevelMilestone[];next:LevelMilestone|null;
  policy:{gameplayFree:true;xpPurchasable:false;levelSkipsPurchasable:false};
}
export const RECIPE_UNLOCK_LEVELS:Readonly<Partial<Record<ItemId,number>>>=Object.freeze({
  copper_wire:2,glass:2,medkit:2,camp_kit:2,
  alloy:3,repair_kit:3,cart:3,
  preserved_food:4,drill_module_i:4,scanner:4,weather_cloak:4,bridge_kit:4,
  drill_module_ii:5,
});
export const BUILDING_UNLOCK_LEVELS:Readonly<Record<HabitableTemplateId,number>>=Object.freeze({shed:1,workbench:1,planter:1,house:2,woodlot:2,sawmill:3});
export const FREE_UNLOCK_POLICY=Object.freeze({gameplayFree:true as const,xpPurchasable:false as const,levelSkipsPurchasable:false as const});
const validAt=(value:unknown,now:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=now;
const completedAt=(job:Job)=>(job as Job&{completedAt?:number}).completedAt??job.endsAt;
const beforeRules=(value:unknown,now:number)=>validAt(value,now)&&Number(value)<UNLOCK_RULES_EFFECTIVE_AT;

/** Infer old advanced buildings from the saved level, removing every post-policy upgrade's contribution.
 * Initial level-one buildings and newly purchased inventory are never evidence of old capabilities.
 */
function historicalStationLevel(world:MvpWorld,p:Player,building:BuildingType,now:number):number {
  if(!beforeRules(p.createdAt,now))return 1;
  let level=p.buildings[building];if(!Number.isSafeInteger(level)||level<2)return 1;
  for(const j of Object.values(world.jobs)){
    if(j.playerId!==p.id||j.kind!=='upgrade'||j.payload.building!==building||j.status!=='completed'||!validAt(completedAt(j),now)||j.createdAt<UNLOCK_RULES_EFFECTIVE_AT)continue;
    const from=j.payload.fromLevel;if(typeof from==='number'&&Number.isSafeInteger(from)&&from>=1)level=Math.min(level,from);
    // A modern upgrade without its normal fromLevel cannot prove a legacy capability.
    else level=1;
  }
  return level;
}
function recipeLegacy(world:MvpWorld,p:Player,id:ItemId,now:number):boolean {
  const recipe=RECIPE_CATALOG[id];if(!recipe)return false;
  const known=Object.values(world.jobs).some(j=>j.playerId===p.id&&j.kind==='craft'&&j.payload.recipeId===id&&beforeRules(j.createdAt,now)
    &&(j.status==='running'||j.status==='reserved'||j.status==='completed'&&validAt(completedAt(j),now)));
  return known||historicalStationLevel(world,p,recipe.building,now)>=Math.max(2,recipe.level);
}
function access(requiredLevel:number,level:number,legacy:boolean,now:number):UnlockAccess{return{requiredLevel,unlocked:now<UNLOCK_RULES_EFFECTIVE_AT||level>=requiredLevel||legacy,legacy};}
const playerLevel=(world:MvpWorld,p:Player,now:number)=>getActivityProgression(world,p,now)!.progression.level;
export function recipeUnlockAccess(world:MvpWorld,p:Player,id:ItemId,now:number,level=playerLevel(world,p,now)):UnlockAccess {
  const requiredLevel=RECIPE_UNLOCK_LEVELS[id]??1;return access(requiredLevel,level,requiredLevel>1&&recipeLegacy(world,p,id,now),now);
}
export function buildingUnlockAccess(world:MvpWorld,p:Player,id:HabitableTemplateId,now:number,level=playerLevel(world,p,now)):UnlockAccess {
  const requiredLevel=BUILDING_UNLOCK_LEVELS[id]??1,legacy=requiredLevel>1&&[...(p.habitable?.buildings??[]),...(p.habitable?.land?.demolished?.map(d=>d.building)??[])].some(b=>b.templateId===id&&beforeRules(b.startsAt,now));return access(requiredLevel,level,legacy,now);
}
export function requireRecipeUnlock(world:MvpWorld,p:Player,id:ItemId,now:number):void {
  if(now<UNLOCK_RULES_EFFECTIVE_AT||(RECIPE_UNLOCK_LEVELS[id]??1)===1)return;
  const row=recipeUnlockAccess(world,p,id,now);if(!row.unlocked)throw new MvpError(`Alcanzá el nivel ${row.requiredLevel} para fabricar esta receta. La experiencia se obtiene jugando; no requiere un pago.`,409);
}
export function requireBuildingUnlock(world:MvpWorld,p:Player,id:HabitableTemplateId,now:number):void {
  if(now<UNLOCK_RULES_EFFECTIVE_AT||(BUILDING_UNLOCK_LEVELS[id]??1)===1)return;
  const row=buildingUnlockAccess(world,p,id,now);if(!row.unlocked)throw new MvpError(`Alcanzá el nivel ${row.requiredLevel} para construir este plano. Las obras que ya tenías conservan sus funciones.`,409);
}
/** Adds display data only. It never records unlocks, pays XP, consumes goods or modifies old jobs. */
export function getLevelUnlocks(world:MvpWorld,p:Player|null,now:number,progression?:ActivityProgressionView['progression']):LevelUnlockView|null {
  if(!p)return null;
  const level=progression?.level??playerLevel(world,p,now),recipes=RECIPES.map(r=>({id:r.id,...recipeUnlockAccess(world,p,r.id,now,level)})),buildings=HABITABLE_BUILDING_TEMPLATES.map(b=>({id:b.id,...buildingUnlockAccess(world,p,b.id,now,level)}));
  const milestones:LevelMilestone[]=Array.from({length:5},(_,i)=>({level:i+1,xp:activityLevelThreshold(i+1),recipes:recipes.filter(r=>r.requiredLevel===i+1).map(r=>r.id),buildings:buildings.filter(b=>b.requiredLevel===i+1).map(b=>b.id)}));
  return{playerId:p.id,level,recipes,buildings,milestones,next:milestones.find(m=>m.level>level)??null,policy:{...FREE_UNLOCK_POLICY}};
}
