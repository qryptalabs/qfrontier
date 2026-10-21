import {nextWorldId} from './operation-ids.ts';
import {assertManagerAuthority} from './habitable-manager.ts';
import type {HabitableNetworkVisual} from './habitable-network.ts';
import {getHabitableNetworkVisual} from './habitable-network.ts';
import {getLandVisual} from './land-grid.ts';
import { RECIPE_CATALOG } from './catalog.ts';
import { HABITABLE_BUILDING_TEMPLATES, HABITABLE_INTERACTION_RADIUS, HABITABLE_PLANTER_INPUTS, HABITABLE_PLANTER_OUTPUTS, HABITABLE_PLANTER_SECONDS, getHabitableStorageCapacity, HABITABLE_WORKBENCH_RECIPE_IDS, habitableBuildingEntrance, habitableLineClear, habitablePositionAt, habitableWalkableAt } from './habitable-data.ts';
import type { HabitableBuilding, HabitableBuildingVisual, HabitablePoint, HabitableState, HabitableTemplateId } from './habitable-data.ts';
import type { Context, InventoryLot, ItemAmount, ItemId, Job, MvpCommand, MvpWorld, Player } from './types.ts';
import { actor, addLots, available, emit, field, integer, MvpError, nextLotId, spendMany, takeLot } from './helpers.ts';
import { weatherFor } from './world.ts';
import { requireHabitableResident } from './habitable-residents.ts';
import { cancelHabitableSupply, getHabitableSupplySources, getHabitableSuppliesView, habitableWorkerReason, planHabitableSupply, takeHabitableSupply } from './habitable-supplies.ts';
import type { HabitableSupplySourceView, HabitableSuppliesView } from './habitable-supplies.ts';
import type { HabitableIndustryView } from './habitable-industry.ts';
import { getHabitableShedUpgradeView } from './habitable-shed-upgrades.ts';
import type { HabitableShedUpgradeView } from './habitable-shed-upgrades.ts';
import { habitableDailyProductionReason } from './habitable-daily.ts';
import { requireRecipeUnlock } from './level-unlocks.ts';
import { planTestBoost } from './test-boosts.ts';
import {freeManagerLot} from './habitable-manager-reservations.ts';
import { getHabitableWorkers, habitableLogisticsBusy, habitableReservedStorage, habitableWorkerObstacles, habitableWorkStand, settleHabitableLogistics } from './habitable-logistics.ts';

export interface HabitableFacilityRecipeView {id:ItemId;name:string;inputs:ItemAmount[];output:ItemAmount[];seconds:number;available:boolean;reason:string|null;sources:HabitableSupplySourceView[]}
export interface HabitableFacilityOperationView {jobId:string;kind:'craft'|'farm'|'extract';status:Job['status'];startsAt:number;endsAt:number;outputs:ItemAmount[];outputDestination:'station'|'shed';inputSource:'station'|'shed';supplyShedId:string|null}
export interface HabitableFacilityLogisticsView {status:'working'|'waiting'|'collecting'|'carrying'|'unloading'|'returning'|'delivered'|'expired';pending:InventoryLot[];pendingUnits:number;cargoUnits:number;destinationBuildingId:string|null;destinationName:string|null;blockedReason:string|null;startsAt:number|null;endsAt:number|null;canRetry:boolean}
export interface HabitableFacilityView {
  buildingId:string;templateId:HabitableTemplateId;label:string;ready:boolean;access:HabitablePoint|null;near:boolean;blockedReason:string|null;
  storage?:{lots:InventoryLot[];used:number;capacity:number;reserved:number;free:number};recipes:HabitableFacilityRecipeView[];operation:HabitableFacilityOperationView|null;logistics?:HabitableFacilityLogisticsView;supplies?:HabitableSuppliesView;
  farm?:{inputs:ItemAmount[];outputs:ItemAmount[];seconds:number;cyclesRemaining:number;regionRemaining:number;regionName:string;allowed:boolean;sources:HabitableSupplySourceView[]};
  industry?:HabitableIndustryView;upgrade?:HabitableShedUpgradeView;
}

const active=(job:Job)=>job.status==='running'||job.status==='reserved';
const localMoving=(p:Player,now:number)=>!!p.habitable?.movement&&p.habitable.movement.endsAt>now;
const traveling=(world:MvpWorld,p:Player)=>Object.values(world.jobs).some(j=>j.playerId===p.id&&active(j)&&(j.kind==='travel'||j.kind==='convoy'));
const buildingJob=(world:MvpWorld,p:Player,b:HabitableBuilding)=>{const job=b.operation?world.jobs[b.operation.jobId]:undefined;return job?.playerId===p.id&&job.payload.habitableBuildingId===b.id?job:undefined;};
const jobOutputs=(job:Job):ItemAmount[]=>job.kind==='extract'?[{itemId:job.payload.itemId as ItemId,qty:Number(job.payload.qty)}]:job.kind==='farm'?structuredClone([...HABITABLE_PLANTER_OUTPUTS]):(RECIPE_CATALOG[job.payload.recipeId as ItemId]?.output??[]).map(o=>({...o,qty:o.qty*Number(job.payload.qty)}));

export function getHabitableBuildingVisual(world:MvpWorld,p:Player,b:HabitableBuilding,now=Date.now()):HabitableBuildingVisual {
  const job=buildingJob(world,p,b);return{state:job&&active(job)?'working':'idle',...(job?{operation:b.templateId==='woodlot'?'extract' as const:b.templateId==='sawmill'?'saw' as const:job.kind==='farm'?'grow' as const:'craft' as const,...(job.kind==='extract'?{recipeId:job.payload.itemId as ItemId}:job.kind==='craft'?{recipeId:job.payload.recipeId as ItemId}:{}),startsAt:job.startsAt,endsAt:job.endsAt}:{}),...(b.templateId==='house'?{residents:p.habitable?.workforce?.residents.filter(r=>r.homeBuildingId===b.id).length??0,residentCapacity:2}:{}),...(b.templateId==='shed'?{storedUnits:(b.storage??[]).reduce((n,l)=>n+l.qty,0)+(p.habitable?.buildings??[]).reduce((n,other)=>{const c=other.construction,pickup=c?.crew.legs.find(l=>l.phase==='loading')?.endsAt??0;return n+(c?.sourceBuildingId===b.id&&now<pickup?c.cargo.reduce((sum,l)=>sum+l.qty,0):0);},0),capacity:getHabitableStorageCapacity(b)}:{})};
}
/** Deliberate public whitelist: never copy storage, operation references or future private fields. */
export function publicHabitableBuilding(world:MvpWorld,p:Player,b:HabitableBuilding,now=Date.now()):HabitableBuilding {
  return{id:b.id,templateId:b.templateId,x:b.x,y:b.y,rotation:b.rotation,startsAt:b.startsAt,endsAt:b.endsAt,bound:b.bound,...(b.construction?{constructionVisual:{sourceBuildingId:b.construction.sourceBuildingId,workerId:b.construction.workerId,quantity:Math.max(0,...b.construction.crew.legs.map(l=>l.cargoUnits??0)),crew:structuredClone(b.construction.crew)}}:{}),...(b.demolition?{demolition:structuredClone(b.demolition)}:{}),...(b.level?{level:b.level}:{}),...(b.upgrade?{upgrade:{fromLevel:b.upgrade.fromLevel,toLevel:b.upgrade.toLevel,startsAt:b.upgrade.startsAt,endsAt:b.upgrade.endsAt,constructionStand:{x:b.upgrade.constructionStand.x,y:b.upgrade.constructionStand.y}}}:{}),visual:getHabitableBuildingVisual(world,p,b,now)};
}
export function habitableStateWithVisuals(world:MvpWorld,p:Player,now=Date.now(),networkVisual?:HabitableNetworkVisual):HabitableState|undefined {
  if(!p.habitable)return undefined;const state=structuredClone(p.habitable);const land=getLandVisual(world,p,now);if(land)state.landVisual=land;state.networkVisual=networkVisual??getHabitableNetworkVisual(world,p,now);state.buildings=state.buildings.map(b=>({...b,...(b.construction?{constructionVisual:publicHabitableBuilding(world,p,b,now).constructionVisual}:{}),visual:getHabitableBuildingVisual(world,p,b,now)}));if(p.habitable.commerce?.gateway)state.commerceGateway=structuredClone(p.habitable.commerce.gateway);const workers=getHabitableWorkers(world,p,now);if(workers.length)state.workers=workers;return state;
}

export function getHabitableFacilities(world:MvpWorld,p:Player|null,now:number):HabitableFacilityView[] {
  if(!p?.habitable)return[];const state=p.habitable,position=habitablePositionAt(state,now),moving=localMoving(p,now)||traveling(world,p),home=world.tiles[p.settlement?.homeTileId??p.position],region=world.regions[home.regionId];
  return state.buildings.map(b=>{
    const access=habitableBuildingEntrance(state,b),job=buildingJob(world,p,b),ready=b.endsAt<=now,near=!!access&&!moving&&Math.hypot(position.x-access.x,position.y-access.y)<=HABITABLE_INTERACTION_RADIUS&&habitableLineClear(position,access,state),busy=!!job&&active(job),logisticsBusy=habitableLogisticsBusy(b,now);
    const blockedReason=b.demolition?'La instalación está reservada para desmontaje.':!ready?'Espera a que termine la construcción.':!access?'La instalación necesita un acceso seguro.':moving?'Espera a llegar antes de usar la instalación.':!near?'Acércate al acceso de la instalación.':busy?'La única ranura de esta instalación está ocupada.':logisticsBusy?'Espera a que se entregue la producción y regrese el obrero.':null;
    const recipes:HabitableFacilityRecipeView[]=b.templateId==='workbench'?HABITABLE_WORKBENCH_RECIPE_IDS.map(id=>{const r=RECIPE_CATALOG[id]!,sources=getHabitableSupplySources(world,p,b,r.inputs,now,blockedReason??habitableDailyProductionReason(p,b,'craft',id,now)),reason=sources[0].reason;return{id:r.id,name:r.name,inputs:structuredClone(r.inputs),output:structuredClone(r.output),seconds:r.seconds*(p.faction==='forgers'?.9:1),available:sources[0].available,reason,sources};}):[];
    const used=(b.storage??[]).reduce((sum,l)=>sum+l.qty,0),reserved=habitableReservedStorage(state,b.id),s=b.shipment;
    let logistics:HabitableFacilityLogisticsView|undefined;if(job?.payload.habitableLogistics===1&&job.status!=='cancelled'){
      const status:HabitableFacilityLogisticsView['status']=busy?'working':s?now<s.startsAt?'waiting':now<s.pickupAt?'collecting':now<s.arrivesAt?'carrying':now<s.unloadsAt?'unloading':now<s.endsAt?'returning':s.deliveredQuantity===0?'expired':'delivered':b.pending?.length?'waiting':'expired';
      logistics={status,pending:structuredClone(b.pending??[]),pendingUnits:(b.pending??[]).reduce((n,l)=>n+l.qty,0),cargoUnits:(s?.cargo??[]).reduce((n,l)=>n+l.qty,0),destinationBuildingId:s?.destinationBuildingId??null,destinationName:s?'Cobertizo':null,blockedReason:b.deliveryBlockedReason??null,startsAt:s?.startsAt??null,endsAt:s?.endsAt??null,canRetry:near&&!busy&&!!b.pending?.length};
    }
    return{buildingId:b.id,templateId:b.templateId,label:HABITABLE_BUILDING_TEMPLATES.find(t=>t.id===b.templateId)!.label,ready,access,near,blockedReason,recipes,operation:job?{jobId:job.id,kind:job.kind as 'craft'|'farm'|'extract',status:job.status,startsAt:job.startsAt,endsAt:job.endsAt,outputs:jobOutputs(job),outputDestination:job.payload.habitableLogistics===1?'shed':'station',inputSource:job.payload.supplyShedId?'shed':'station',supplyShedId:typeof job.payload.supplyShedId==='string'?job.payload.supplyShedId:null}:null,...(b.supply?{supplies:getHabitableSuppliesView(b,job,now,near)}:{}),...(logistics?{logistics}:{}),
      ...(b.templateId==='shed'?{upgrade:getHabitableShedUpgradeView(world,p,b,now,near),storage:{lots:structuredClone(b.storage??[]),used,capacity:getHabitableStorageCapacity(b),reserved,free:Math.max(0,getHabitableStorageCapacity(b)-used-reserved)}}:{}),
      ...(b.templateId==='planter'?{farm:{inputs:structuredClone([...HABITABLE_PLANTER_INPUTS]),outputs:structuredClone([...HABITABLE_PLANTER_OUTPUTS]),seconds:HABITABLE_PLANTER_SECONDS,cyclesRemaining:Math.max(0,10-p.farmCycles),regionRemaining:region.farmRemaining,regionName:region.name,allowed:blockedReason===null&&!habitableWorkerReason(p,b,now)&&(home.biome==='forest'||home.biome==='plains')&&p.farmCycles<10&&region.farmRemaining>0&&HABITABLE_PLANTER_INPUTS.every(i=>available(p,i.itemId,now)>=i.qty),sources:getHabitableSupplySources(world,p,b,[...HABITABLE_PLANTER_INPUTS],now,blockedReason??(home.biome!=='forest'&&home.biome!=='plains'?'El bancal necesita bosque o llanura.':p.farmCycles>=10?'La parcela agotó sus diez ciclos.':region.farmRemaining<=0?'El presupuesto agrícola regional está agotado.':null))}}:{}),
    };
  });
}

export interface HabitableProductionPlan {kind:'craft'|'farm'|'extract';seconds:number;inputs:ItemAmount[];payload:Job['payload'];supplyShedId?:unknown;residentId?:unknown;requireAssigned?:boolean;useTestBoost?:boolean}
/** Shared real input reservation and worker schedule; callers separately enforce the action's access and quotas. */
export function startHabitableProduction(world:MvpWorld,p:Player,b:HabitableBuilding,now:number,plan:HabitableProductionPlan):Job {
  const state=p.habitable!,old=b.operation?world.jobs[b.operation.jobId]:undefined;if(b.demolition||b.endsAt>now||old&&active(old)||habitableLogisticsBusy(b,now))throw new MvpError('Espera a que termine el trabajo, la entrega y el regreso del obrero.',409);
  const resident=requireHabitableResident(world,p,b,now,plan.residentId,typeof plan.payload.managerPlanId==='string'?plan.payload.managerPlanId:undefined);if(plan.requireAssigned&&!resident)throw new MvpError('Organiza y asigna un habitante a esta instalación industrial.',409);
  const workerStand=resident?.assignment?.stand??habitableWorkStand(world,p,b,now),avatar=habitablePositionAt(state,now);if(!workerStand||Math.hypot(workerStand.x-avatar.x,workerStand.y-avatar.y)<.8||!habitableWalkableAt(workerStand,state,.32,habitableWorkerObstacles(world,p,now,b.id)))throw new MvpError('Aparta al personaje del puesto de trabajo para dejar espacio al obrero.',409);
  const sourceId=plan.supplyShedId;if(sourceId!==undefined&&sourceId!==null&&(typeof sourceId!=='string'||!sourceId))throw new MvpError('Selecciona un cobertizo válido como fuente.',409);
  const shed=sourceId?state.buildings.find(v=>v.id===sourceId&&v.templateId==='shed'):undefined;if(sourceId&&(!shed||shed.endsAt>now))throw new MvpError('El cobertizo de suministro debe ser propio y estar terminado.',403);
  const route=shed?planHabitableSupply(world,p,b,shed,now,workerStand):null;if(shed&&!route)throw new MvpError('No hay una ruta libre y segura para recoger los insumos del cobertizo. Apártate del acceso y deja pasar al obrero.',409);
  const startsAt=route?.unloadsAt??now,dailyReason=habitableDailyProductionReason(p,b,plan.kind,plan.payload.recipeId,startsAt,typeof plan.payload.orderCreatedAt==='number'?plan.payload.orderCreatedAt:undefined);if(dailyReason)throw new MvpError(dailyReason,409);const held=shed?takeHabitableSupply(p,shed,plan.inputs,startsAt,0,undefined,typeof plan.payload.shopContractId==='string'):[],costs=shed?[]:spendMany(p,plan.inputs,now),home=world.tiles[p.settlement?.homeTileId??p.position],payload={...plan.payload,habitableBuildingId:b.id,habitableLogistics:1,workerStand:{...workerStand},...(resident?{residentId:resident.id}:{}),...(shed?{supplyShedId:shed.id}:{})};
  const baseSeconds=Math.ceil(plan.seconds),boost=planTestBoost(world,p,baseSeconds,plan.useTestBoost===true,now);
  const job:Job={id:nextWorldId(world,'job'),playerId:p.id,kind:plan.kind,status:startsAt>now?'reserved':'running',createdAt:now,startsAt,endsAt:startsAt+(boost?.durationSeconds??baseSeconds)*1000,ruleVersion:world.rulesVersion,weather:weatherFor(home.regionId,now),route:[home.id],costs,payload:boost?{...payload,testBoost:boost}:payload,report:[]};world.jobs[job.id]=job;b.operation={jobId:job.id};delete b.shipment;delete b.supply;delete b.deliveryBlockedReason;delete b.deliveryRetryAt;
  if(shed&&route)b.supply={...route,id:`supply:${job.id}`,jobId:job.id,workerId:resident?.id??`worker:${b.id}`,quantity:held.reduce((n,l)=>n+l.qty,0),cargo:held};return job;
}

export function dispatchHabitableBuilding(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  if(!['habitat.storage.deposit','habitat.storage.withdraw','habitat.workbench.start','habitat.planter.start','habitat.facility.cancel','habitat.logistics.retry'].includes(command.type))return false;
  const p=actor(ctx),state=p.habitable,now=ctx.now;if(ctx.manager)assertManagerAuthority(p,ctx);if(!state)throw new MvpError('Crea primero tu personaje del distrito.',409);
  const id=field(command,'buildingId'),b=state.buildings.find(b=>b.id===id);if(!b)throw new MvpError('La instalación no pertenece a tu parcela.',403);
  if(ctx.manager&&!['habitat.workbench.start','habitat.planter.start'].includes(command.type))throw new MvpError('La autorización del encargado no permite esta acción.',403);
  const facility=ctx.manager?null:getHabitableFacilities(world,p,now).find(f=>f.buildingId===id)!;
  if(facility&&(!facility.ready||!facility.access||!facility.near))throw new MvpError(facility.blockedReason??'Acércate al acceso de la instalación.',409);
  if(command.type==='habitat.logistics.retry'){if(!b.pending?.length){if(b.shipment)return true;throw new MvpError('No hay una producción pendiente para reintentar.',409);}settleHabitableLogistics(world,now);return true;}
  if(command.type.startsWith('habitat.storage.')){
    if(b.templateId!=='shed')throw new MvpError('Solo un cobertizo guarda lotes.',409);
    const lotId=field(command,'lotId'),qty=integer(command.qty,'Cantidad',1,getHabitableStorageCapacity(b));
    if(command.type==='habitat.storage.deposit'){
      if(facility!.storage!.used+facility!.storage!.reserved+qty>getHabitableStorageCapacity(b))throw new MvpError(`El cobertizo admite ${getHabitableStorageCapacity(b)===80?'ochenta':'ciento sesenta'} unidades, incluidas las entregas que ya reservaron espacio.`,409);
      const lot=takeLot(p,lotId,qty,now);lot.location=`habitat:${b.id}`;(b.storage??=[]).push(lot);
    }else{
      const lot=b.storage?.find(l=>l.id===lotId);if(!lot||lot.expiresAt!==null&&lot.expiresAt<=now)throw new MvpError('El lote almacenado ya no está disponible.',409);integer(qty,'Cantidad',1,lot.qty);
      if(qty>freeManagerLot(p,b.id,lot,now))throw new MvpError('Ese lote tiene materiales asignados a una obra o un pedido comercial. Libera la reserva correspondiente antes de retirarlos.',409);const taken=structuredClone(lot);taken.qty=qty;if(qty<lot.qty){lot.originLotId??=lot.id;taken.originLotId=lot.originLotId;taken.id=nextLotId(p);}lot.qty-=qty;b.storage=b.storage!.filter(l=>l.qty>0);taken.location='station';addLots(p,[taken]);
    }
    return true;
  }
  if(command.type==='habitat.facility.cancel'){
    const jobId=field(command,'jobId'),job=buildingJob(world,p,b);if(!job||job.id!==jobId||!active(job))throw new MvpError('Este trabajo de la instalación ya terminó o no existe.',409);
    if(cancelHabitableSupply(world,p,b,job,now)){emit(world,p,now,job.report[0]);return true;}
    // These jobs start immediately. A cancelled started crop still consumed its finite soil cycle.
    if(now<job.startsAt){addLots(p,job.costs.filter(l=>!l.expiresAt||l.expiresAt>now));if(job.kind==='farm'){world.regions[String(job.payload.regionId)].farmRemaining++;p.farmCycles--;}}
    job.status='cancelled';job.report=[now<job.startsAt?'Cancelado antes del inicio: insumos reservados devueltos.':'Cancelado en ejecución: insumos y ciclo agrícola consumidos sin producto.'];emit(world,p,now,job.report[0]);return true;
  }
  if(facility?.blockedReason)throw new MvpError(facility.blockedReason,409);
  let kind:Job['kind'],seconds:number,payload:Job['payload'],inputs:ItemAmount[];const home=world.tiles[p.settlement?.homeTileId??p.position];
  if(command.type==='habitat.workbench.start'){
    if(b.templateId!=='workbench')throw new MvpError('Esta obra no es una mesa de trabajo.',409);const recipeId=field(command,'recipeId');if(!(HABITABLE_WORKBENCH_RECIPE_IDS as readonly string[]).includes(recipeId))throw new MvpError('La mesa no admite esa receta.');requireRecipeUnlock(world,p,recipeId as ItemId,now);const recipe=RECIPE_CATALOG[recipeId as ItemId]!;
    inputs=recipe.inputs;kind='craft';seconds=recipe.seconds*(p.faction==='forgers'?.9:1);payload={recipeId:recipe.id,qty:1,habitableBuildingId:b.id};
  }else{
    if(b.templateId!=='planter')throw new MvpError('Esta obra no es un bancal.',409);if(home.biome!=='forest'&&home.biome!=='plains')throw new MvpError('El bancal necesita un hogar de bosque o llanura.',409);const region=world.regions[home.regionId];if(p.farmCycles>=10)throw new MvpError('Esta parcela agotó sus diez ciclos de temporada.',409);if(region.farmRemaining<=0)throw new MvpError('El presupuesto agrícola regional está agotado.',409);
    inputs=[...HABITABLE_PLANTER_INPUTS];kind='farm';seconds=HABITABLE_PLANTER_SECONDS;payload={tileId:home.id,regionId:home.regionId,habitableBuildingId:b.id};
  }
  startHabitableProduction(world,p,b,now,{kind:kind as 'craft'|'farm',seconds,inputs,payload:ctx.manager?{...payload,managerPlanId:ctx.manager.planId,managerTurnId:ctx.manager.turnId,managerSequence:ctx.manager.sequence,...(ctx.manager.shopContractId?{shopContractId:ctx.manager.shopContractId}:{}),outputShedId:state.manager!.supplyShedId}:payload,supplyShedId:command.supplyShedId,residentId:command.residentId,requireAssigned:!!ctx.manager,useTestBoost:command.useTestBoost===true});if(kind==='farm'){p.farmCycles++;world.regions[home.regionId].farmRemaining--;}return true;
}

/** Storage shares station food expiry without refreshing age or silently freeing it before settlement. */
export function settleHabitableStorage(world:MvpWorld,now:number,playerId?:string):void {
  for(const p of Object.values(world.players)){if(playerId!==undefined&&p.id!==playerId)continue;for(const b of p.habitable?.buildings??[])if(b.storage)b.storage=b.storage.filter(l=>l.qty>0&&(!l.expiresAt||l.expiresAt>now));}
}
