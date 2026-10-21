import { RECIPES } from './catalog.ts';
import { MvpError } from './helpers.ts';
import { getBoostPassWallet } from './boost-passes.ts';
import type { BoostPassWallet } from './boost-passes.ts';
import { jobTestBoost, TEST_BOOST_WINDOW_SECONDS, TEST_BOOST_LIMIT_SECONDS, TEST_BOOST_MAX_REDUCTION_PERCENT } from './boost-reservations.ts';
import type { TestBoostReservation } from './boost-reservations.ts';
import type { ItemId, MvpCommand, MvpWorld, Player } from './types.ts';
import {playerOwnerId} from './village-evidence.ts';

export { jobTestBoost, TEST_BOOST_WINDOW_SECONDS, TEST_BOOST_LIMIT_SECONDS, TEST_BOOST_MAX_REDUCTION_PERCENT } from './boost-reservations.ts';
export type { TestBoostReservation } from './boost-reservations.ts';
export const TEST_BOOST_COMMANDS=Object.freeze(['craft.start','farm.start','habitat.workbench.start','habitat.planter.start']);
const offensive=new Set<ItemId>(['guard_armor','spear','arrow_bundle']);
export const TEST_BOOST_RECIPE_IDS:readonly ItemId[]=Object.freeze(RECIPES.filter(r=>!offensive.has(r.id)).map(r=>r.id));
export interface TestBoostView {
  mode:'test';scope:'account';maxReductionPercent:20;windowSeconds:86400;limitSeconds:1800;
  usedSeconds:number;remainingSeconds:number;nextReleaseAt:number|null;eligibleCommands:string[];eligibleRecipeIds:ItemId[];
  passes:BoostPassWallet;
}
export interface TestBoostQuote {
  baseSeconds:number;durationSeconds:number;savedSeconds:number;maxSavedSeconds:number;usedSecondsBefore:number;
  remainingSecondsBefore:number;remainingSecondsAfter:number;reservedAt:number;partial:boolean;
  passCost:1;passesBefore:number;passesAfter:number;
}
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
/** Public command flags cannot accelerate aliases, an existing job, or any unsupported action. */
export function guardTestBoostCommand(command:MvpCommand):void {
  if(command.useTestBoost!==undefined&&typeof command.useTestBoost!=='boolean')throw new MvpError('La selección del impulso de prueba debe ser verdadera o falsa.',400);
  if(command.useTestBoost!==true)return;
  if(!TEST_BOOST_COMMANDS.includes(command.type))throw new MvpError('Esta orden no admite un impulso de prueba. Sólo se acelera la producción civil manual elegible.',400);
  if((command.type==='craft.start'||command.type==='habitat.workbench.start')&&!TEST_BOOST_RECIPE_IDS.includes(command.recipeId as ItemId))throw new MvpError('Esta receta no admite un impulso de prueba.',400);
}
/** Every explorer of the authenticated owner shares this rolling reservation budget, including cancelled work. */
export function getTestBoostsView(world:MvpWorld,ownerId:string,now:number):TestBoostView {
  let usedSeconds=0,nextReleaseAt:number|null=null;
  for(const job of Object.values(world.jobs)){
    if(playerOwnerId(world,job.playerId)!==ownerId||job.createdAt>now||job.createdAt<=now-TEST_BOOST_WINDOW_SECONDS*1000)continue;
    const boost=jobTestBoost(job);if(!boost)continue;
    usedSeconds=Math.min(Number.MAX_SAFE_INTEGER,usedSeconds+boost.savedSeconds);
    const release=job.createdAt+TEST_BOOST_WINDOW_SECONDS*1000;nextReleaseAt=nextReleaseAt===null?release:Math.min(nextReleaseAt,release);
  }
  return{mode:'test',scope:'account',maxReductionPercent:TEST_BOOST_MAX_REDUCTION_PERCENT,windowSeconds:TEST_BOOST_WINDOW_SECONDS,limitSeconds:TEST_BOOST_LIMIT_SECONDS,usedSeconds,remainingSeconds:Math.max(0,TEST_BOOST_LIMIT_SECONDS-usedSeconds),nextReleaseAt,eligibleCommands:[...TEST_BOOST_COMMANDS],eligibleRecipeIds:[...TEST_BOOST_RECIPE_IDS],passes:getBoostPassWallet(world,ownerId,now)};
}
/** Called only while creating new work in the transaction clone. Processing time excludes queues and transport. */
export function planTestBoost(world:MvpWorld,p:Player,baseSeconds:number,requested:boolean,now:number):TestBoostReservation|null {
  if(!requested)return null;
  if(!positive(baseSeconds))throw new MvpError('No se pudo comprobar el plazo normal del trabajo.',500);
  const quota=getTestBoostsView(world,p.ownerId,now),savedSeconds=Math.min(Math.floor(baseSeconds/5),quota.remainingSeconds);
  if(savedSeconds<=0)throw new MvpError('Agotaste el ahorro de treinta minutos de tu cuenta en las últimas veinticuatro horas. Desmarcá el impulso para usar el plazo normal o esperá a que se libere ahorro.',409);
  if(quota.passes.available<=0)throw new MvpError('No te quedan pases de impulso. Completá encargos pagados o alcanzá un nuevo nivel máximo de cuenta; también podés continuar con el plazo normal.',409);
  return{version:2,mode:'test',reservedAt:now,baseSeconds,durationSeconds:baseSeconds-savedSeconds,savedSeconds,passCost:1};
}
export function testBoostQuote(boost:TestBoostReservation,before:TestBoostView):TestBoostQuote {
  return{baseSeconds:boost.baseSeconds,durationSeconds:boost.durationSeconds,savedSeconds:boost.savedSeconds,maxSavedSeconds:Math.floor(boost.baseSeconds/5),usedSecondsBefore:before.usedSeconds,remainingSecondsBefore:before.remainingSeconds,remainingSecondsAfter:Math.max(0,before.remainingSeconds-boost.savedSeconds),reservedAt:boost.reservedAt,partial:boost.savedSeconds<Math.floor(boost.baseSeconds/5),passCost:1,passesBefore:before.passes.available,passesAfter:Math.max(0,before.passes.available-1)};
}
