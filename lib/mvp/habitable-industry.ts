import { HABITABLE_INTERACTION_RADIUS, getHabitableStorageCapacity, habitableBuildingEntrance, habitableLineClear, habitablePositionAt } from './habitable-data.ts';
import type { HabitableBuilding, HabitableWorkOrder } from './habitable-data.ts';
import { habitableDailyProductionReason } from './habitable-daily.ts';
import { actor, emit, field, integer, MvpError } from './helpers.ts';
import { startHabitableProduction } from './habitable-buildings.ts';
import { habitableAssignedResident, requireHabitableResident } from './habitable-residents.ts';
import { habitableLogisticsBusy, habitableReservedStorage } from './habitable-logistics.ts';
import { getHabitableSupplySources } from './habitable-supplies.ts';
import type { HabitableSupplySourceView } from './habitable-supplies.ts';
import type { Context, ItemAmount, Job, MvpCommand, MvpWorld, Player } from './types.ts';
import {playerOwnerId,resourceExtractions} from './village-evidence.ts';
import {assertManagerAuthority,managerCommittedUnits} from './habitable-manager.ts';
import type {ManagerForestSourceView} from './habitable-manager.ts';

export const HABITABLE_FORESTRY_SECONDS_PER_UNIT=15;
export const HABITABLE_SAWMILL_SECONDS=60;
export const HABITABLE_SAWMILL_INPUTS:ItemAmount[]=[{itemId:'timber',qty:2}];
export const HABITABLE_SAWMILL_OUTPUTS:ItemAmount[]=[{itemId:'plank',qty:1}];
export interface HabitableIndustryView {
  kind:'woodlot'|'sawmill';secondsPerUnit:number;inputs:ItemAmount[];outputs:ItemAmount[];canStart:boolean;reason:string|null;sources:HabitableSupplySourceView[];
  source?:{tileId:string;tileName:string;available:number;quotaRemaining:number;description:string};
  order?:{id:string;target:number;started:number;completed:number;status:HabitableWorkOrder['status'];blockedReason:string|null;canStop:boolean;canResume:boolean;supplyShedId:string};
}
const active=(job:Job|undefined)=>job?.status==='running'||job?.status==='reserved';
const jobFor=(world:MvpWorld,b:HabitableBuilding)=>b.operation?world.jobs[b.operation.jobId]:undefined;
const producerReason=(p:Player,b:HabitableBuilding,now:number)=>!p.habitable?.workforce?'Organiza primero el registro de habitantes.':!habitableAssignedResident(p,b)?'Asigna un habitante propio a esta instalación.':habitableAssignedResident(p,b)?.relocation&&habitableAssignedResident(p,b)!.relocation!.endsAt>now?'Espera a que el habitante llegue a su puesto.':null;

/** A local forestry licence reserves the same finite deposits and seasonal account quota as legacy extraction. */
export function habitableForestSource(world:MvpWorld,p:Player,now:number,qty=1,pin?:{tileId:string;layerId:string}){
  const home=world.tiles[p.settlement?.homeTileId??p.position];
  for(const tile of Object.values(world.tiles).filter(t=>t.biome==='forest'&&(!pin||t.id===pin.tileId)).sort((a,b)=>Math.abs(a.row-home.row)+Math.abs(a.col-home.col)-Math.abs(b.row-home.row)-Math.abs(b.col-home.col)||a.id.localeCompare(b.id))){
    const jobs=Object.values(world.jobs).filter(j=>j.kind==='extract'&&j.payload.tileId===tile.id&&j.payload.itemId==='timber'),competing=resourceExtractions(world,tile.id,'timber'),used=jobs.filter(j=>j.status!=='cancelled'&&playerOwnerId(world,j.playerId)===p.ownerId).reduce((n,j)=>n+Number(j.payload.qty),0),quotaRemaining=Math.max(0,30-used);
    if(competing.length>=2||competing.some(j=>j.ownerId===p.ownerId)||quotaRemaining<qty)continue;
    const deposit=tile.deposits.find(d=>d.itemId==='timber'),free=(layer:NonNullable<typeof deposit>['layers'][number])=>layer.remaining-layer.reserved-(layer.promoterId!==p.id&&(layer.promoterExpiresAt??0)>now?(layer.promoterQuota??0):0),layer=deposit?.layers.find(l=>l.unlocked&&(!pin||l.id===pin.layerId)&&free(l)>=qty);if(layer)return{tile,layer,quotaRemaining,available:Math.min(10,quotaRemaining,free(layer))};
  }return null;
}
export function getHabitableForestSources(world:MvpWorld,p:Player,now:number):ManagerForestSourceView[]{const result:ManagerForestSourceView[]=[];for(const tile of Object.values(world.tiles))if(tile.biome==='forest')for(const layer of tile.deposits.find(d=>d.itemId==='timber')?.layers??[]){const source=habitableForestSource(world,p,now,1,{tileId:tile.id,layerId:layer.id});if(source)result.push({tileId:tile.id,layerId:layer.id,tileName:tile.name,available:source.available,quotaRemaining:source.quotaRemaining});}return result;}
function requireAccess(world:MvpWorld,p:Player,b:HabitableBuilding,now:number):void {
  if(b.endsAt>now)throw new MvpError('Espera a que termine la construcción.',409);const state=p.habitable!,access=habitableBuildingEntrance(state,b),position=habitablePositionAt(state,now);
  if(state.movement&&state.movement.endsAt>now||Object.values(world.jobs).some(j=>j.playerId===p.id&&active(j)&&(j.kind==='travel'||j.kind==='convoy')))throw new MvpError('Espera a llegar antes de gestionar esta instalación.',409);
  if(!access||Math.hypot(position.x-access.x,position.y-access.y)>HABITABLE_INTERACTION_RADIUS||!habitableLineClear(position,access,state))throw new MvpError('Acércate al acceso de la instalación industrial.',409);
}
function sawCycleReason(world:MvpWorld,p:Player,b:HabitableBuilding,shedId:string,now:number,orderCreatedAt?:number):string|null {
  const reason=producerReason(p,b,now)??habitableDailyProductionReason(p,b,'craft','plank',now,orderCreatedAt);if(reason)return reason;const shed=p.habitable!.buildings.find(s=>s.id===shedId&&s.templateId==='shed');if(!shed||shed.endsAt>now)return'Elige un cobertizo propio y terminado.';
  const source=getHabitableSupplySources(world,p,b,HABITABLE_SAWMILL_INPUTS,now,null).find(s=>s.supplyShedId===shedId);if(!source?.available)return source?.reason??'No se puede abastecer desde ese cobertizo.';
  // Input collection frees two slots before the single output arrives; other reserved deliveries remain protected.
  const used=(shed.storage??[]).reduce((n,l)=>n+l.qty,0);if(used+habitableReservedStorage(p.habitable!,shed.id)-2+1>getHabitableStorageCapacity(shed))return'Libera espacio en el cobertizo para el siguiente tablón.';return null;
}
function startSawCycle(world:MvpWorld,p:Player,b:HabitableBuilding,order:HabitableWorkOrder,now:number):void {
  const reason=sawCycleReason(world,p,b,order.supplyShedId,now,order.createdAt);if(reason)throw new MvpError(reason,409);
  startHabitableProduction(world,p,b,now,{kind:'craft',seconds:HABITABLE_SAWMILL_SECONDS,inputs:HABITABLE_SAWMILL_INPUTS,payload:{recipeId:'plank',qty:1,habitableIndustry:'sawmill',workOrderId:order.id,orderCreatedAt:order.createdAt,outputShedId:order.supplyShedId},supplyShedId:order.supplyShedId,requireAssigned:true});order.started++;delete order.blockedReason;
}

export function getHabitableIndustryView(world:MvpWorld,p:Player,b:HabitableBuilding,now:number,blockedReason:string|null):HabitableIndustryView|undefined {
  if(b.templateId!=='woodlot'&&b.templateId!=='sawmill')return undefined;const base=blockedReason??producerReason(p,b,now),o=b.workOrder;
  if(b.templateId==='woodlot'){const source=habitableForestSource(world,p,now),current=jobFor(world,b),currentTile=current&&active(current)&&current.payload.habitableIndustry==='woodlot'?world.tiles[String(current.payload.tileId)]:undefined,reason=base??(!source?'No queda una reserva forestal accesible con cuota de temporada.':null),shown=currentTile?{tileId:currentTile.id,tileName:currentTile.name,available:0,quotaRemaining:Math.max(0,30-Object.values(world.jobs).filter(j=>j.kind==='extract'&&j.status!=='cancelled'&&j.payload.tileId===currentTile.id&&j.payload.itemId==='timber'&&playerOwnerId(world,j.playerId)===p.ownerId).reduce((n,j)=>n+Number(j.payload.qty),0))}:source?{tileId:source.tile.id,tileName:source.tile.name,available:source.available,quotaRemaining:source.quotaRemaining}:null;return{kind:'woodlot',secondsPerUnit:HABITABLE_FORESTRY_SECONDS_PER_UNIT,inputs:[],outputs:[{itemId:'timber',qty:1}],canStart:reason===null,reason,sources:[],...(shown?{source:{...shown,description:'Licencia forestal: reserva madera real de este yacimiento; no regenera árboles ni recursos.'}}:{})};}
  const sources=getHabitableSupplySources(world,p,b,HABITABLE_SAWMILL_INPUTS,now,base??habitableDailyProductionReason(p,b,'craft','plank',now)).filter(s=>s.supplyShedId!==null),orderReason=o&&(o.status==='active'||o.status==='stopping')?'Ya existe un pedido en curso.':null,reason=base??orderReason??(sources.some(s=>s.available)?null:'Faltan insumos o una ruta libre desde un cobertizo propio.');
  return{kind:'sawmill',secondsPerUnit:HABITABLE_SAWMILL_SECONDS,inputs:structuredClone(HABITABLE_SAWMILL_INPUTS),outputs:structuredClone(HABITABLE_SAWMILL_OUTPUTS),canStart:reason===null,reason,sources,...(o?{order:{id:o.id,target:o.target,started:o.started,completed:o.completed,status:o.status,blockedReason:o.blockedReason??null,canStop:o.status==='active',canResume:o.status==='stopped'&&o.completed<o.target,supplyShedId:o.supplyShedId}}:{})};
}

export function dispatchHabitableIndustry(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  const ownCommands=['habitat.woodlot.start','habitat.sawmill.order','habitat.sawmill.stop','habitat.sawmill.resume','habitat.sawmill.cycle'];const p=ctx.actor;if(!ownCommands.includes(command.type)&&!(command.type==='habitat.facility.cancel'&&p?.habitable?.buildings.some(b=>b.id===command.buildingId&&(b.templateId==='woodlot'||b.templateId==='sawmill'))))return false;
  const player=actor(ctx),state=player.habitable;if(!state)throw new MvpError('Crea primero tu personaje del distrito.',409);const b=state.buildings.find(b=>b.id===field(command,'buildingId'));if(!b)throw new MvpError('La instalación no pertenece a tu parcela.',403);if(ctx.manager){assertManagerAuthority(player,ctx);if(!['habitat.woodlot.start','habitat.sawmill.cycle'].includes(command.type))throw new MvpError('El encargado sólo autoriza un ciclo industrial por orden.',403);}else{if(command.type==='habitat.sawmill.cycle')throw new MvpError('Este ciclo requiere la autorización interna de un turno.',403);requireAccess(world,player,b,ctx.now);}
  const managed=ctx.manager?{managerPlanId:ctx.manager.planId,managerTurnId:ctx.manager.turnId,managerSequence:ctx.manager.sequence,...(ctx.manager.shopContractId?{shopContractId:ctx.manager.shopContractId}:{}),outputShedId:state.manager!.supplyShedId,...(state.manager!.parallel?{managerCourierId:state.manager!.courierResidentId!}:{})}:{};
  if(command.type==='habitat.facility.cancel'){
    if(b.templateId==='sawmill')throw new MvpError('Detén el pedido del aserradero: su ciclo actual y sus entregas deben terminar.',409);
    const job=jobFor(world,b);if(!job||job.id!==field(command,'jobId')||!active(job)||job.payload.habitableIndustry!=='woodlot')throw new MvpError('La extracción ya terminó o no existe.',409);const layer=world.tiles[String(job.payload.tileId)]?.deposits.find(d=>d.itemId==='timber')?.layers.find(l=>l.id===job.payload.layerId),qty=Number(job.payload.qty);if(!layer||layer.reserved<qty)throw new MvpError('La reserva forestal no concilia.',500);layer.reserved-=qty;if((layer.promoterExpiresAt??0)>ctx.now)layer.promoterQuota=(layer.promoterQuota??0)+Number(job.payload.promoterTaken??0);job.status='cancelled';job.report=['Extracción cancelada: la madera sin extraer vuelve al yacimiento, sin productos ni pagos.'];emit(world,player,ctx.now,job.report[0]);return true;
  }
  if(command.type==='habitat.woodlot.start'){
    if(b.templateId!=='woodlot')throw new MvpError('Esta obra no es un puesto forestal.',409);const qty=integer(command.qty,'Madera',1,10),m=ctx.manager?state.manager:undefined;if(m&&(!m.forestry||m.woodlotId!==b.id||qty>m.forestry.maxTimber-(m.turn.extractionCommitted??0)||managerCommittedUnits(m.turn)+qty>m.turn.inputBudget))throw new MvpError('La extracción supera la fuente, el tope forestal o el presupuesto autorizado.',409);const source=habitableForestSource(world,player,ctx.now,qty,m?.forestry??undefined);if(!source)throw new MvpError('No existe madera accesible en la fuente autorizada con ranura y cuota de temporada para esa cantidad.',409);
    const job=startHabitableProduction(world,player,b,ctx.now,{kind:'extract',seconds:qty*HABITABLE_FORESTRY_SECONDS_PER_UNIT,inputs:[],payload:{tileId:source.tile.id,itemId:'timber',qty,layerId:source.layer.id,promoterTaken:0,habitableIndustry:'woodlot',...managed},residentId:command.residentId,requireAssigned:true}),promoterTaken=source.layer.promoterId===player.id&&(source.layer.promoterExpiresAt??0)>ctx.now?Math.min(qty,source.layer.promoterQuota??0):0;job.payload.promoterTaken=promoterTaken;if(promoterTaken)source.layer.promoterQuota=(source.layer.promoterQuota??0)-promoterTaken;source.layer.reserved+=qty;return true;
  }
  if(b.templateId!=='sawmill')throw new MvpError('Esta obra no es un aserradero propio.',409);
  if(command.type==='habitat.sawmill.cycle'){if(b.workOrder&&(b.workOrder.status==='active'||b.workOrder.status==='stopping'))throw new MvpError('El aserradero tiene un pedido manual que conserva prioridad.',409);if(state.manager?.sawmillId!==b.id)throw new MvpError('Este aserradero no fue seleccionado en el turno.',403);const reason=sawCycleReason(world,player,b,state.manager.supplyShedId,ctx.now);if(reason)throw new MvpError(reason,409);startHabitableProduction(world,player,b,ctx.now,{kind:'craft',seconds:HABITABLE_SAWMILL_SECONDS,inputs:HABITABLE_SAWMILL_INPUTS,payload:{recipeId:'plank',qty:1,habitableIndustry:'sawmill',...managed},supplyShedId:state.manager.supplyShedId,requireAssigned:true});return true;}
  if(command.type==='habitat.sawmill.order'){
    if(b.workOrder?.status==='active'||b.workOrder?.status==='stopping')throw new MvpError('El aserradero ya tiene un pedido en curso.',409);const target=integer(command.target,'Tablones',1,5),shedId=field(command,'supplyShedId');requireHabitableResident(world,player,b,ctx.now,command.residentId);const order:HabitableWorkOrder={id:`work-order:${ctx.requestId}`,status:'active',target,started:0,completed:0,supplyShedId:shedId,createdAt:ctx.now};startSawCycle(world,player,b,order,ctx.now);b.workOrder=order;return true;
  }
  const order=b.workOrder;if(!order||order.status==='completed'||order.completed>=order.target)throw new MvpError('No hay un pedido incompleto que gestionar.',409);
  if(command.type==='habitat.sawmill.stop'){if(order.status==='stopped'||order.status==='stopping')return true;order.status=active(jobFor(world,b))||habitableLogisticsBusy(b,ctx.now)?'stopping':'stopped';delete order.blockedReason;return true;}
  if(order.status!=='stopped')throw new MvpError('El pedido ya está activo o termina su ciclo actual.',409);order.status='active';delete order.blockedReason;return true;
}

/** At most one future cycle is created per order/read. No offline loop backdates an unattended factory. */
export function settleHabitableIndustry(world:MvpWorld,now:number,playerId?:string):void {
  for(const p of Object.values(world.players))for(const b of p.habitable?.buildings??[]){if(playerId!==undefined&&p.id!==playerId)continue;const o=b.workOrder;if(b.templateId!=='sawmill'||!o||o.status==='completed'||o.status==='stopped')continue;const job=jobFor(world,b);
    if(active(job)||habitableLogisticsBusy(b,now))continue;
    if(job?.payload.workOrderId===o.id&&job.id!==o.lastSettledJobId){
      if(job.status==='completed'&&b.shipment?.jobId===job.id&&b.shipment.depositedAt!==undefined&&b.shipment.deliveredQuantity===1){o.completed++;o.lastSettledJobId=job.id;}
      else if(job.status==='cancelled'){o.lastSettledJobId=job.id;o.status='stopped';o.blockedReason='El ciclo fue cancelado; sus reglas de consumo y reserva se conservan.';continue;}
      else{o.blockedReason??='La producción espera una entrega confirmada en su cobertizo.';continue;}
    }
    if(o.completed>=o.target){o.status='completed';delete o.blockedReason;continue;}if(o.status==='stopping'){o.status='stopped';delete o.blockedReason;continue;}
    try{startSawCycle(world,p,b,o,now);}catch(error){if(error instanceof MvpError&&error.status<500)o.blockedReason=error.message;else throw error;}
  }
}
