import { HABITABLE_INTERACTION_RADIUS, habitableBuildingEntrance, habitableConstructionPoint, habitableLineClear, habitablePositionAt } from './habitable-data.ts';
import type { HabitableBuilding, HabitableWorkerVisual } from './habitable-data.ts';
import { getHabitableWorkers, guardHabitableWorkerConstruction } from './habitable-logistics.ts';
import { getStationUpgradeWorkers } from './station-upgrades.ts';
import { actor, available, field, MvpError, spendMany } from './helpers.ts';
import type { Context, ItemAmount, MvpCommand, MvpWorld, Player } from './types.ts';

export const HABITABLE_SHED_UPGRADE_COSTS:ItemAmount[]=[{itemId:'plank',qty:2},{itemId:'timber',qty:2},{itemId:'fiber',qty:2}];
export const HABITABLE_SHED_UPGRADE_SECONDS=60;
export interface HabitableShedUpgradeView {level:1|2;targetLevel:2;seconds:number;costs:ItemAmount[];canUpgrade:boolean;reason:string|null;startsAt:number|null;endsAt:number|null}
export function getHabitableShedUpgradeView(world:MvpWorld,p:Player,b:HabitableBuilding,now:number,near:boolean):HabitableShedUpgradeView {
  const reason=b.level===2?'El cobertizo ya alcanzó el nivel dos.':b.upgrade&&b.upgrade.endsAt>now?'La ampliación está en curso; el almacén sigue operativo con ochenta plazas.':b.endsAt>now?'Espera a que termine el cobertizo.':!near?'Acércate al acceso del cobertizo.':!HABITABLE_SHED_UPGRADE_COSTS.every(i=>available(p,i.itemId,now)>=i.qty)?'Faltan materiales en el inventario de la Estación.':null;
  return{level:b.level??1,targetLevel:2,seconds:HABITABLE_SHED_UPGRADE_SECONDS,costs:structuredClone(HABITABLE_SHED_UPGRADE_COSTS),canUpgrade:reason===null,reason,startsAt:b.upgrade?.startsAt??null,endsAt:b.upgrade?.endsAt??null};
}
export function dispatchHabitableShedUpgrade(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  if(command.type!=='habitat.shed.upgrade')return false;const p=actor(ctx),state=p.habitable,now=ctx.now,b=state?.buildings.find(b=>b.id===field(command,'buildingId')&&b.templateId==='shed');if(!state||!b)throw new MvpError('El cobertizo no pertenece a tu parcela.',403);
  const entry=habitableBuildingEntrance(state,b),pos=habitablePositionAt(state,now),moving=state.movement&&state.movement.endsAt>now||Object.values(world.jobs).some(j=>j.playerId===p.id&&(j.status==='reserved'||j.status==='running')&&(j.kind==='travel'||j.kind==='convoy')),near=!!entry&&!moving&&Math.hypot(pos.x-entry.x,pos.y-entry.y)<=HABITABLE_INTERACTION_RADIUS&&habitableLineClear(pos,entry,state),view=getHabitableShedUpgradeView(world,p,b,now,near);if(!view.canUpgrade)throw new MvpError(view.reason!,409);
  const workers=[...getHabitableWorkers(world,p,now),...getStationUpgradeWorkers(world,p)],stand=habitableConstructionPoint({...state,workers},b,now);if(!stand)throw new MvpError('Despeja un puesto seguro para la cuadrilla sin cortar los suministros.',409);
  const proposed={...state,buildings:state.buildings.map(other=>other.id===b.id?{...other,upgrade:{fromLevel:1 as const,toLevel:2 as const,startsAt:now,endsAt:now+60000,constructionStand:stand}}:other)};
  guardHabitableWorkerConstruction(world,p,proposed,now);
  // Reserve the exterior crew point against every already-authorized timed worker and the avatar.
  for(let at=now;at<now+60000;at+=100){const hero=habitablePositionAt(state,at);if(Math.hypot(hero.x-stand.x,hero.y-stand.y)<.75)throw new MvpError('Aparta el personaje del puesto de la cuadrilla.',409);for(const w of workers){const point=workerPosition(w,at);if(point&&Math.hypot(point.x-stand.x,point.y-stand.y)<.75)throw new MvpError('La cuadrilla bloquearía una ruta de trabajo reservada.',409);}}
  const costs=spendMany(p,HABITABLE_SHED_UPGRADE_COSTS,now);b.bound||=costs.some(l=>l.bound);b.upgrade=proposed.buildings.find(v=>v.id===b.id)!.upgrade;return true;
}
import { habitableWorkerAt } from './habitable-data.ts';
function workerPosition(w:HabitableWorkerVisual,now:number){return w.role==='builder'&&(now<w.startsAt||now>=w.workEndsAt)?null:habitableWorkerAt(w,now);}
export function settleHabitableShedUpgrades(world:MvpWorld,now:number,playerId?:string):void {for(const p of Object.values(world.players)){if(playerId!==undefined&&p.id!==playerId)continue;for(const b of p.habitable?.buildings??[])if(b.templateId==='shed'&&b.upgrade&&b.upgrade.endsAt<=now&&b.level!==2)b.level=2;}}
