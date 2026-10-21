import {actor,MvpError} from './helpers.ts';
import {HABITABLE_SPEED,habitablePositionAt,type HabitablePoint,type HabitableState} from './habitable-data.ts';
import {EXPLORATION_SPEED,explorationPositionAt,explorationLineClearWithHome} from './exploration-data.ts';
import {explorationWorldBodies} from './exploration.ts';
import {getHabitableWorkers} from './habitable-logistics.ts';
import {getStationUpgradeWorkers} from './station-upgrades.ts';
import {createTradeSceneryClearance} from '../graphics/world-scenery-clearance.ts';
import {houseClearsProceduralTree} from './habitable-data.ts';
import type {MvpWorld,MvpCommand,Context,Player} from './types.ts';
import {manualTrafficLineClear} from './exploration-traffic.ts';
import {royalCharacterPresent} from './royal-kingdom.ts';

export const MANUAL_NAVIGATION_LEASE_MS=900;
const SESSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export interface ManualNavigationOptions {canTraverse?:(from:HabitablePoint,to:HabitablePoint,startsAt:number,endsAt:number)=>boolean}
const movementOf=(state:HabitableState)=>state.exploration?.movement??state.movement;
const activeJob=(world:MvpWorld,p:Player)=>Object.values(world.jobs).some(job=>job.playerId===p.id&&['running','reserved'].includes(job.status)&&['travel','convoy','expedition','battle'].includes(job.kind));

/** Finite server-authorized motion leases. No local prediction, resource changes or path finding. */
export function dispatchManualNavigation(world:MvpWorld,command:MvpCommand,ctx:Context,options:ManualNavigationOptions={}):boolean{
 if(command.type!=='habitat.walk.input')return false;
 const p=actor(ctx),state=p.habitable,now=ctx.now,sessionId=command.sessionId,sequence=command.sequence,stop=command.stop===true;
 if(royalCharacterPresent(p,now))throw new MvpError('Continúa el recorrido desde Mundo › Reino para respetar las plantas y escaleras del castillo.',409);
 if(!state||!p.settlement)throw new MvpError('Crea tu personaje y tu aldea antes de caminar.',409);
 if(typeof sessionId!=='string'||!SESSION.test(sessionId)||!Number.isSafeInteger(sequence)||Number(sequence)<1||Number(sequence)>2147483647||command.stop!==undefined&&typeof command.stop!=='boolean')throw new MvpError('La secuencia de movimiento no es válida.');
 const x=command.directionX,y=command.directionY;if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1||Math.abs(y)>1||stop&&(x!==0||y!==0))throw new MvpError('La dirección de movimiento no es válida.');
 const prior=state.manualNavigation;if(prior?.sessionId===sessionId&&Number(sequence)<=prior.sequence)return true;
 if(prior?.retiredSessions?.includes(sessionId))return true;
 if(prior&&prior.sessionId!==sessionId&&!prior.stopped&&prior.expiresAt>now)throw new MvpError('Otro control de tu personaje sigue activo. Suelta el control y vuelve a intentarlo.',409);
 const move=movementOf(state),ownManual=move?.manualSessionId===sessionId;
 if(!stop&&(activeJob(world,p)||move&&move.endsAt>now&&!move.manualSessionId))throw new MvpError('Termina o detén el viaje antes de usar los controles de caminar.',409);
 const local=state.exploration?explorationPositionAt(state.exploration,now):habitablePositionAt(state,now),plot=p.settlement,global=state.exploration?local:{x:plot.x+local.x,y:plot.y+local.y};
 const retired=[...(prior?.retiredSessions??[]),...(prior&&prior.sessionId!==sessionId?[prior.sessionId]:[])].slice(-8),record={sessionId,sequence:Number(sequence),expiresAt:stop?now:now+MANUAL_NAVIGATION_LEASE_MS,stopped:stop,...(retired.length?{retiredSessions:retired}:{})};
 if(stop){state.manualNavigation=record;if(ownManual){if(state.exploration){state.exploration.position={...local};delete state.exploration.movement;}else{state.position={...local};delete state.movement;}}return true;}
 const strength=Math.hypot(x,y),divisor=Math.max(1,strength),speed=state.exploration?EXPLORATION_SPEED:HABITABLE_SPEED,delta={x:x/divisor*speed*MANUAL_NAVIGATION_LEASE_MS/1000,y:y/divisor*speed*MANUAL_NAVIGATION_LEASE_MS/1000};
 const homes=Object.values(world.players).filter(other=>other.settlement&&other.habitable).map(other=>({player:other,plot:other.settlement!,state:other.habitable!})),trade=createTradeSceneryClearance(homes.flatMap(home=>home.state.commerce?.contracts.map(c=>c.caravan)??[])),context={plots:homes.map(home=>home.plot),clearAt:(gx:number,gy:number,padding=0)=>trade(gx,gy,padding)||homes.some(home=>houseClearsProceduralTree(home.state,gx-home.plot.x,gy-home.plot.y)),ignoreActorId:p.id},home={plot,state:{...state,workers:[...getHabitableWorkers(world,p,now),...getStationUpgradeWorkers(world,p)]},neighbors:homes.filter(home=>home.player.id!==p.id&&Math.hypot(home.plot.x-global.x,home.plot.y-global.y)<48).map(home=>({plot:home.plot,station:{id:home.plot.id,plot:home.plot,buildings:home.player.buildings},state:{...home.state,workers:getHabitableWorkers(world,home.player,now)}}))},bodies=explorationWorldBodies(world,now);
 const at=(fraction:number)=>({x:global.x+delta.x*fraction,y:global.y+delta.y*fraction}),clear=(fraction:number)=>explorationLineClearWithHome(global,at(fraction),home,now,bodies,context,now+MANUAL_NAVIGATION_LEASE_MS*fraction)&&manualTrafficLineClear(world,p,global,at(fraction),now,now+MANUAL_NAVIGATION_LEASE_MS*fraction)&&(!options.canTraverse||options.canTraverse(global,at(fraction),now,now+MANUAL_NAVIGATION_LEASE_MS*fraction));
 let fraction=0;if(strength>.05){if(clear(1))fraction=1;else{let low=0,high=1;for(let i=0;i<8;i++){const middle=(low+high)/2;if(clear(middle))low=middle;else high=middle;}fraction=low;}}
 state.manualNavigation=record;const target={x:local.x+delta.x*fraction,y:local.y+delta.y*fraction},distance=Math.hypot(target.x-local.x,target.y-local.y);
 if(state.exploration){state.exploration.position={...local};if(distance<.02)delete state.exploration.movement;else state.exploration.movement={points:[{...local},target],startsAt:now,endsAt:now+Math.max(1,Math.ceil(MANUAL_NAVIGATION_LEASE_MS*fraction)),manualSessionId:sessionId};}
 else{state.position={...local};if(distance<.02)delete state.movement;else state.movement={points:[{...local},target],startsAt:now,endsAt:now+Math.max(1,Math.ceil(MANUAL_NAVIGATION_LEASE_MS*fraction)),manualSessionId:sessionId};}
 return true;
}
