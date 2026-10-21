import {nextWorldId} from './operation-ids.ts';
import { ITEM_CATALOG, RECIPE_CATALOG } from './catalog.ts';
import { actor, addLots, available, consume, consumedInputs, emit, field, give, integer, item, milestone, MvpError, spendMany, takeLot } from './helpers.ts';
import { createPlayer, neighboring, routeTo, weatherFor } from './world.ts';
import { areAllied } from './social.ts';
import { getOutpostRouteFactor, getOutpostSurveyFactor, resolveOutpostBattle } from './territory.ts';
import { createHmac } from 'node:crypto';
import { requireUnprotected, starterProtection } from './settlements.ts';
import { giveHabitableOutput, getHabitableWorkers } from './habitable-logistics.ts';
import { dispatchStationUpgrade, settleStationUpgrades } from './station-upgrades.ts';
import { requireRecipeUnlock } from './level-unlocks.ts';
import { planTestBoost } from './test-boosts.ts';
import { settlementPlayers } from './village-settlement-scope.ts';
import {playerOwnerId,resourceExtractions} from './village-evidence.ts';
import type { BuildingType, Context, InventoryLot, ItemAmount, ItemId, Job, MvpCommand, MvpWorld, Player, Tile, Unit } from './types.ts';

const ACTIVE=new Set(['running','reserved']);
const TERRAIN_FACTORS={firm:1,rocky:1.10,sandy:1.20,muddy:1.30,slope:1.25,water:1.50};
const UNIT_POWER:Record<Unit['type'],number>={scout:3,guard:5,ranged:4,engineer:2};
const UNIT_COSTS:Record<Unit['type'],ItemAmount[]>={scout:[{itemId:'cloth',qty:1},{itemId:'ration',qty:1}],guard:[{itemId:'guard_armor',qty:1},{itemId:'spear',qty:1},{itemId:'ration',qty:1}],ranged:[{itemId:'cloth',qty:1},{itemId:'arrow_bundle',qty:2},{itemId:'ration',qty:1}],engineer:[{itemId:'repair_kit',qty:1},{itemId:'ration',qty:1}]};
function tile(world:MvpWorld,id:string):Tile{const result=world.tiles[id];if(!result)throw new MvpError('El sector no existe.',404);return result;}
function ownJobs(world:MvpWorld,p:Player){return Object.values(world.jobs).filter(j=>j.playerId===p.id&&ACTIVE.has(j.status));}
function atTile(p:Player,id:string):void {if(p.position!==id)throw new MvpError('Viaja a ese sector para ejecutar la orden.',409);}
function motionFree(world:MvpWorld,p:Player):void{if(ownJobs(world,p).some(j=>j.kind==='travel'||j.kind==='convoy'))throw new MvpError('Tu expedición ya está en ruta.',409);}
function addJob(world:MvpWorld,p:Player,ctx:Context,kind:Job['kind'],seconds:number,payload:Record<string,unknown>,costs:InventoryLot[]=[],route:string[]=[p.position],startsAt=ctx.now):Job{
 const job:Job={id:nextWorldId(world,'job'),playerId:p.id,kind,status:startsAt>ctx.now?'reserved':'running',createdAt:ctx.now,startsAt,endsAt:startsAt+Math.ceil(seconds)*1000,ruleVersion:world.rulesVersion,weather:weatherFor(tile(world,route.at(-1)!).regionId,ctx.now),route:[...route],costs,payload,report:[]};world.jobs[job.id]=job;return job;
}
function freeSlot(world:MvpWorld,p:Player,building:BuildingType,now:number):number{
 const active=ownJobs(world,p).filter(j=>j.payload.building===building);
 const slots=p.buildings[building];if(active.length>=slots+2)throw new MvpError('La cola de este edificio está llena.',409);
 const timelines=Array.from({length:slots},()=>now);
 for(const job of active.sort((a,b)=>a.startsAt-b.startsAt)){const index=timelines.indexOf(Math.min(...timelines));timelines[index]=Math.max(timelines[index],job.endsAt);}
 return Math.min(...timelines);
}
function selectedUnits(p:Player,command:MvpCommand):Unit[]{if(!Array.isArray(command.unitIds))throw new MvpError('Selecciona tus unidades.');const ids=command.unitIds;if(ids.length<1||ids.length>6||new Set(ids).size!==ids.length)throw new MvpError('Una orden utiliza entre una y seis unidades distintas.');return ids.map(id=>{const u=p.units.find(u=>u.id===id);if(!u||u.busy||u.health<25)throw new MvpError('Una unidad no está disponible o necesita recuperación.',409);return u;});}
function travelSeconds(world:MvpWorld,route:string[],now:number,playerId:string,gear:{cloak?:boolean;cart?:boolean}={}):number {let seconds=0;for(const id of route.slice(1)){const t=tile(world,id),terrain=1+(TERRAIN_FACTORS[t.terrain]-1)*(gear.cart?0.5:1),weather=1+(weatherFor(t.regionId,now).movementFactor-1)*(gear.cloak?0.5:1);seconds+=6*terrain*weather;}return Math.max(3,Math.ceil(seconds*getOutpostRouteFactor(world,playerId,route,now)));}
function costsWithScale(costs:ItemAmount[],qty:number):ItemAmount[]{return costs.map(c=>({...c,qty:c.qty*qty}));}
function unitsBusy(units:Unit[],value:boolean){for(const unit of units)unit.busy=value;}
function reveal(world:MvpWorld,p:Player,id:string,now:number){for(const sector of [id,...neighboring(world,id)])if(!p.discovered.includes(sector))p.discovered.push(sector);const region=tile(world,id).regionId;if(!p.visitedRegions.includes(region))p.visitedRegions.push(region);milestone(p,'explorer',now);}
function wearTool(p:Player,lotId:string,now:number,defensive=false):void {const source=p.inventory.find(l=>l.id===lotId);if(!source)return;const lot=takeLot(p,lotId,1,now),wear=defensive&&p.faction==='custodians'?0.9:1;lot.wear=Math.max(0,Math.round((lot.wear-wear)*100)/100);if(lot.wear)addLots(p,[lot]);milestone(p,'tool-use',now);}
function holdGear(p:Player,itemId:ItemId,now:number):InventoryLot|null{const lot=p.inventory.find(l=>l.itemId===itemId&&l.wear>0&&(!l.expiresAt||l.expiresAt>now));return lot?takeLot(p,lot.id,1,now):null;}
function returnGear(p:Player,job:Job,worn=true):void {const held=(job.payload.equipment??[]) as InventoryLot[];for(const lot of held){const copy=structuredClone(lot);if(worn)copy.wear=Math.max(0,copy.wear-1);if(copy.wear)addLots(p,[copy]);}job.payload.equipment=[];}
function routeCloak(world:MvpWorld,p:Player,route:string[],now:number):InventoryLot|null{return route.some(id=>weatherFor(tile(world,id).regionId,now).state!=='clear')?holdGear(p,'weather_cloak',now):null;}
function requireNpcTraining(p:Player):void {if(!p.milestones.includes('npc-training'))throw new MvpError('Completa un encuentro de entrenamiento contra NPC antes de activar PvP.',409);}

/** Mutates only the transaction clone supplied by the engine. */
export function dispatchProduction(world:MvpWorld,command:MvpCommand,ctx:Context):boolean{
 if(command.type==='player.create'){createPlayer(world,ctx,command);return true;}
 const supported=new Set(['world.survey','world.travel','mining.reserve','deposit.unlock','craft.start','craft.cancel','job.cancel','craft.recycle','tool.repair','farm.start','farm.harvest','building.upgrade','expedition.start','army.prepare','army.heal','army.rest','convoy.start','battle.start','battle.raid','battle.resolve','pvp.toggle','world.bridge','world.collect-rain','research.start']);
 if(!supported.has(command.type))return false;
 const p=actor(ctx),now=ctx.now;
 switch(command.type){
  case 'world.survey':{
   const id=field(command,'tileId'),t=tile(world,id);motionFree(world,p);
   if(!p.discovered.includes(id))throw new MvpError('Descubre una ruta a ese sector primero.',409);
   if(p.surveyed.includes(id))throw new MvpError('La prospección de este sector ya está registrada.',409);
   if(ownJobs(world,p).some(j=>j.kind==='survey'&&j.payload.tileId===id))throw new MvpError('Ya hay una prospección de ese sector.',409);
   const distance=Math.abs(t.row-tile(world,p.position).row)+Math.abs(t.col-tile(world,p.position).col);if(distance>1)throw new MvpError('Realiza la prospección desde el sector o uno vecino.',409);
   const scanner=holdGear(p,'scanner',now);
   addJob(world,p,ctx,'survey',12*(p.faction==='cartographers'?0.9:1)*(scanner?0.9:1)*getOutpostSurveyFactor(world,p.id,id,now),{tileId:id,extraDatum:p.faction==='cartographers'||!!scanner,equipment:scanner?[scanner]:[],modifiers:scanner?['Escáner: 10% menos tiempo, dato adicional, un uso de desgaste.']:[]});break;
  }
  case 'world.travel':{
   motionFree(world,p);const id=field(command,'tileId');if(id===p.position)throw new MvpError('Ya estás en ese sector.',409);
   const route=routeTo(world,p.position,id);if(!p.discovered.includes(id))throw new MvpError('Descubre el sector desde una ruta vecina.',409);
   const weather=weatherFor(tile(world,id).regionId,now),steps=route.length-1,cloak=routeCloak(world,p,route,now),waterFactor=1+(weather.waterFactor-1)*(cloak?0.5:1);
   const costs=steps<=2?[]:spendMany(p,[{itemId:'ration',qty:Math.ceil(steps/4)},{itemId:'water',qty:Math.ceil(steps/4*waterFactor)}],now);
   addJob(world,p,ctx,'travel',travelSeconds(world,route,now,p.id,{cloak:!!cloak}),{tileId:id,equipment:cloak?[cloak]:[],modifiers:cloak?['Refugio climático: mitad de las penalizaciones de clima; un uso de desgaste.']:[]},costs,route);break;
  }
  case 'mining.reserve':{
   motionFree(world,p);const id=field(command,'tileId'),t=tile(world,id);atTile(p,id);if(!p.surveyed.includes(id))throw new MvpError('Completa la prospección antes de extraer.',409);
   const itemId=item(command.itemId),qty=integer(command.qty,'Extracción',1,25),deposit=t.deposits.find(d=>d.itemId===itemId);if(!deposit)throw new MvpError('Ese recurso no existe en el sector.');
   const tool=p.inventory.find(l=>l.itemId==='pickaxe'&&l.wear>0&&(!l.expiresAt||l.expiresAt>now));if(!tool&&qty>3)throw new MvpError('La herramienta básica permite hasta tres unidades por orden.',409);
   const competing=resourceExtractions(world,id,itemId);if(competing.length>=2)throw new MvpError('Las dos ranuras del yacimiento están ocupadas.',409);
   if(competing.some(j=>j.ownerId===p.ownerId))throw new MvpError('Tu cuenta ya tiene una reserva activa en este yacimiento.',409);
   const used=Object.values(world.jobs).filter(j=>playerOwnerId(world,j.playerId)===p.ownerId&&j.kind==='extract'&&j.status!=='cancelled'&&j.payload.tileId===id&&j.payload.itemId===itemId).reduce((n,j)=>n+Number(j.payload.qty),0);if(used+qty>30)throw new MvpError('Cuota de temporada: treinta unidades por cuenta y yacimiento.',409);
   const layer=deposit.layers.find(l=>l.unlocked&&l.remaining-l.reserved-(l.promoterId!==p.id&&(l.promoterExpiresAt??0)>now?(l.promoterQuota??0):0)>=qty);if(!layer)throw new MvpError('No hay suficientes unidades accesibles; revisa las capas profundas.',409);
   const promoterTaken=layer.promoterId===p.id&&(layer.promoterExpiresAt??0)>now?Math.min(qty,layer.promoterQuota??0):0;layer.promoterQuota=(layer.promoterQuota??0)-promoterTaken;
   layer.reserved+=qty;const job=addJob(world,p,ctx,'extract',10,{tileId:id,itemId,qty,layerId:layer.id,toolId:tool?.id??null,promoterTaken});
   if(tool){const held=consume(p,'pickaxe',1,now);job.payload.tool=held[0];}
   break;
  }
  case 'deposit.unlock':{
   const id=field(command,'tileId'),t=tile(world,id);atTile(p,id);const itemId=item(command.itemId),index=integer(command.layer,'Capa',1,2),deposit=t.deposits.find(d=>d.itemId===itemId);if(!deposit)throw new MvpError('El depósito no existe.');
   if(deposit.layers[index].unlocked)throw new MvpError('La capa ya está abierta.',409);if(!deposit.layers[index-1].unlocked)throw new MvpError('Abre las capas en orden.',409);
   if(deposit.layers[index-1].remaining>0||deposit.layers[index-1].reserved>0)throw new MvpError('Agota la capa anterior y sus reservas antes de abrir la siguiente.',409);
   consume(p,index===1?'drill_module_i':'drill_module_ii',1,now,{tradeableOnly:true});deposit.layers[index].unlocked=true;deposit.layers[index].promoterId=p.id;deposit.layers[index].promoterQuota=Math.floor(deposit.layers[index].budget*0.25);deposit.layers[index].promoterExpiresAt=now+86400000;emit(world,p,now,`abrió la capa ${index} de ${ITEM_CATALOG[itemId].name}. Reserva total conservada; cuota promotora 25% durante 24 horas.`);break;
  }
  case 'craft.start':{
   if(command.transferableOnly!==undefined&&typeof command.transferableOnly!=='boolean')throw new MvpError('La selección de insumos transferibles debe ser verdadera o falsa.');
   const transferableOnly=command.transferableOnly===true;
   const recipeId=item(command.recipeId),recipe=RECIPE_CATALOG[recipeId];if(!recipe)throw new MvpError('Ese objeto no tiene receta.');const qty=integer(command.qty??1,'Lotes',1,5);
   requireRecipeUnlock(world,p,recipeId,now);
   if(p.buildings[recipe.building]<recipe.level)throw new MvpError(`Necesitas ${recipe.building} de nivel ${recipe.level}.`,409);
   const startsAt=freeSlot(world,p,recipe.building,now),inputs=costsWithScale(recipe.inputs,qty);
   if(transferableOnly&&inputs.some(i=>available(p,i.itemId,now,true)<i.qty))throw new MvpError('Faltan insumos transferibles para esta receta. Los materiales del tutorial permanecen vinculados.',409);
   const costs=transferableOnly?inputs.flatMap(i=>consume(p,i.itemId,i.qty,now,{tradeableOnly:true})):spendMany(p,inputs,now);
   if(costs.some(l=>l.expiresAt!==null&&l.expiresAt<=startsAt))throw new MvpError('Los insumos caducan antes de llegar al inicio de la cola.',409);
   const baseSeconds=Math.ceil(recipe.seconds*qty*(p.faction==='forgers'?0.9:1)),boost=planTestBoost(world,p,baseSeconds,command.useTestBoost===true,now);
   addJob(world,p,ctx,'craft',boost?.durationSeconds??baseSeconds,{recipeId,qty,building:recipe.building,...(transferableOnly?{transferableOnly:true}:{}),...(boost?{testBoost:boost}:{})},costs,[p.position],startsAt);break;
  }
  case 'craft.cancel':case 'job.cancel':{
   const job=world.jobs[field(command,'jobId')];if(!job||job.playerId!==p.id)throw new MvpError('El trabajo no pertenece a tu estación.',403);if(!ACTIVE.has(job.status))throw new MvpError('El trabajo ya terminó.',409);
   if(job.kind==='battle'||job.kind==='convoy'||job.kind==='travel')throw new MvpError('Una ruta o batalla confirmada debe terminar.',409);
   const beforeStart=now<job.startsAt;
   if(beforeStart)addLots(p,job.costs.filter(l=>!l.expiresAt||l.expiresAt>now));
   if(job.kind==='extract'){const t=tile(world,String(job.payload.tileId)),d=t.deposits.find(d=>d.itemId===job.payload.itemId),layer=d?.layers.find(l=>l.id===job.payload.layerId);if(layer){layer.reserved-=Number(job.payload.qty);if((layer.promoterExpiresAt??0)>now)layer.promoterQuota=(layer.promoterQuota??0)+Number(job.payload.promoterTaken??0);}if(job.payload.tool)addLots(p,[job.payload.tool as InventoryLot]);}
   if(job.kind==='farm'&&beforeStart){world.regions[String(job.payload.regionId)].farmRemaining++;p.farmCycles--;}
   returnGear(p,job,!beforeStart);
   job.status='cancelled';job.report=[beforeStart?'Cancelado antes del inicio: insumos reservados devueltos.':'Cancelado en ejecución: insumos consumidos sin devolución.'];emit(world,p,now,job.report[0]);break;
  }
  case 'craft.recycle':{
   const lotId=field(command,'lotId'),source=p.inventory.find(l=>l.id===lotId);if(!source)throw new MvpError('El lote no existe.');const qty=integer(command.qty??1,'Cantidad',1,source.qty);
   if(!source.provenance.inputs.length||ITEM_CATALOG[source.itemId].group==='raw'||ITEM_CATALOG[source.itemId].group==='rare')throw new MvpError('Solo se reciclan bienes con insumos de fabricación registrados.',409);
   source.qty-=qty;if(!source.qty)p.inventory=p.inventory.filter(l=>l.id!==lotId);
   for(const input of source.provenance.inputs){const recovered=Math.floor(input.qty*qty*0.6+1e-9);if(recovered)give(p,input.itemId,recovered,now,`recycle:${lotId}`,[],source.bound);}
   emit(world,p,now,'recicló un lote: hasta 60% de cada insumo real, redondeado hacia abajo.');break;
  }
  case 'tool.repair':{
   const source=p.inventory.find(l=>l.id===field(command,'lotId'));if(!source||!ITEM_CATALOG[source.itemId].durability)throw new MvpError('Selecciona un equipo reparable.');const lot=takeLot(p,source.id,1,now),repair=consume(p,'repair_kit',1,now);lot.wear=ITEM_CATALOG[lot.itemId].durability!;lot.bound||=repair.some(l=>l.bound);addLots(p,[lot]);emit(world,p,now,`reparó una unidad de ${ITEM_CATALOG[lot.itemId].name} con un kit real.`);break;
  }
  case 'farm.start':{
   motionFree(world,p);const t=tile(world,p.position);if(t.biome!=='plains'&&t.biome!=='forest')throw new MvpError('La parcela necesita llanura o bosque.',409);
   if(p.farmCycles>=10)throw new MvpError('Esta parcela agotó sus diez ciclos de temporada.',409);const region=world.regions[t.regionId];if(region.farmRemaining<=0)throw new MvpError('El presupuesto agrícola regional está agotado.',409);
   const startsAt=freeSlot(world,p,'garden',now),costs=spendMany(p,[{itemId:'seed',qty:1},{itemId:'water',qty:2},{itemId:'nutrient',qty:1}],now);p.farmCycles++;region.farmRemaining--;
   const boost=planTestBoost(world,p,45,command.useTestBoost===true,now);
   addJob(world,p,ctx,'farm',boost?.durationSeconds??45,{tileId:t.id,regionId:t.regionId,building:'garden',...(boost?{testBoost:boost}:{})},costs,[p.position],startsAt);break;
  }
  case 'farm.harvest':case 'battle.resolve':throw new MvpError('El servidor completa las órdenes al vencer su plazo; actualiza el estado.',409);
  case 'building.upgrade':{
   return dispatchStationUpgrade(world,command,ctx,getHabitableWorkers(world,p));
  }
  case 'expedition.start':{
   motionFree(world,p);const id=field(command,'tileId');atTile(p,id);if(!p.surveyed.includes(id))throw new MvpError('Prospecta el sector primero.',409);if(ownJobs(world,p).some(j=>j.kind==='expedition'))throw new MvpError('Ya hay una expedición en curso.',409);
   const camp=p.inventory.some(l=>l.itemId==='camp_kit'&&l.qty>0),costs=spendMany(p,[{itemId:'ration',qty:1},{itemId:'water',qty:camp?1:2},...(camp?[{itemId:'camp_kit' as ItemId,qty:1}]:[])],now),roll=createHmac('sha256',world.rngSeed).update(`${ctx.requestId}:${p.id}`).digest().readUInt32BE(0)%10000;
   addJob(world,p,ctx,'expedition',camp?24:30,{tileId:id,roll,probabilities:'65% común · 20% datos · 5% plano · 1% raro · 9% sin objeto',modifiers:camp?['Kit de campamento consumido: 20% menos tiempo y una agua en vez de dos; sin cambiar probabilidades.']:[]},costs);break;
  }
  case 'army.prepare':{
   const type=field(command,'unitType') as Unit['type'];if(!Object.hasOwn(UNIT_POWER,type))throw new MvpError('Unidad desconocida.');const qty=integer(command.qty??1,'Unidades',1,6);if(p.units.length+qty>12)throw new MvpError('Una estación admite hasta doce unidades.',409);
   spendMany(p,costsWithScale(UNIT_COSTS[type],qty),now);for(let i=0;i<qty;i++){p.units.push({id:nextWorldId(world,'unit'),type,health:100,busy:false,trainedAt:now});}milestone(p,'army',now);break;
  }
  case 'army.heal':case 'army.rest':{
   const u=p.units.find(u=>u.id===field(command,'unitId'));if(!u||u.busy)throw new MvpError('La unidad no está disponible.',409);
   if(command.type==='army.heal'){consume(p,'medkit',1,now);u.health=100;}else{if(now-u.trainedAt<3600000)throw new MvpError('El descanso necesita una hora sin una orden.',409);u.health=Math.min(100,u.health+25);u.trainedAt=now;}break;
  }
  case 'convoy.start':{
   motionFree(world,p);const id=field(command,'tileId');if(id===p.position)throw new MvpError('Elige otro destino.');const route=routeTo(world,p.position,id);if(!p.discovered.includes(id))throw new MvpError('El destino todavía no está descubierto.',409);
   const units=selectedUnits(p,command);if(!Array.isArray(command.cargo)||command.cargo.length<1||command.cargo.length>6)throw new MvpError('Selecciona entre uno y seis tipos de carga.');
   const costs=(command.cargo as unknown[]).map(c=>{if(!c||typeof c!=='object')throw new MvpError('La carga no es válida.');const row=c as Record<string,unknown>;return{itemId:item(row.itemId),qty:integer(row.qty,'Carga',1,60)};});if(new Set(costs.map(c=>c.itemId)).size!==costs.length)throw new MvpError('Combina los recursos repetidos en una sola línea.');
   const exposed=command.exposed===true;if(exposed)requireUnprotected(world,p,now);if(exposed&&!p.pvpEnabled)throw new MvpError('Activa PvP voluntario antes de exponer carga.',409);
   const cargo=exposed?costs.flatMap(c=>consume(p,c.itemId,c.qty,now,{tradeableOnly:true})):spendMany(p,costs,now);
   const cart=holdGear(p,'cart',now),cloak=routeCloak(world,p,route,now);if(cargo.reduce((n,l)=>n+l.qty,0)>(cart?60:30))throw new MvpError(`Capacidad de carga: ${cart?60:30} unidades${cart?'':'; un carro permite sesenta'}.`,409);
   const weather=weatherFor(tile(world,id).regionId,now),waterFactor=1+(weather.waterFactor-1)*(cloak?0.5:1),food=spendMany(p,[{itemId:'ration',qty:units.length*2},{itemId:'water',qty:Math.ceil(route.length/3*waterFactor)}],now);unitsBusy(units,true);
   const job=addJob(world,p,ctx,'convoy',Math.max(35,travelSeconds(world,route,now,p.id,{cart:!!cart,cloak:!!cloak})),{tileId:id,unitIds:units.map(u=>u.id),equipment:[cart,cloak].filter(Boolean),modifiers:[...(cart?['Carro: sesenta unidades de carga y mitad de penalización de terreno; un uso de desgaste.']:[]),...(cloak?['Refugio climático: mitad de penalización de clima; un uso de desgaste.']:[])]},food,route),convoyId=`convoy_${job.id}`;job.payload.convoyId=convoyId;
   world.convoys[convoyId]={id:convoyId,playerId:p.id,jobId:job.id,destination:id,cargo,exposed,status:'traveling',attacked:false};break;
  }
  case 'battle.start':case 'battle.raid':{
   const units=selectedUnits(p,command);let targetId:string|null=null,convoyId:string|null=null,id=p.position;
   if(command.type==='battle.raid'){
    convoyId=field(command,'convoyId');const convoy=world.convoys[convoyId];if(!convoy||convoy.status!=='traveling'||!convoy.exposed||convoy.attacked)throw new MvpError('El convoy no está disponible para disputa.',409);
    const target=world.players[convoy.playerId];if(!target||target.ownerId===p.ownerId)throw new MvpError('No se disputan convoyes de tu propia cuenta.',409);
    requireUnprotected(world,p,now);requireUnprotected(world,target,now);
    if(areAllied(world,p.id,target.id))throw new MvpError('El clan o pacto de no agresión protege ese convoy.',409);
    if(Object.values(world.battles).some(b=>!b.npc&&b.status==='scheduled'&&[b.attackerId,b.targetId].some(id=>id===p.id||id===target.id)))throw new MvpError('Ya existe una disputa comprometida para uno de los jugadores.',409);
    if(!p.pvpEnabled||!target.pvpEnabled||p.pvpCooldownUntil>now||target.pvpCooldownUntil>now)throw new MvpError('PvP exige consentimiento y descanso cumplido de ambos jugadores.',409);
    requireNpcTraining(p);requireNpcTraining(target);
    if(world.jobs[convoy.jobId].endsAt<=now+20000)throw new MvpError('El convoy está demasiado cerca de su destino.',409);
    targetId=target.id;convoy.attacked=true;id=world.jobs[convoy.jobId].route[Math.floor(world.jobs[convoy.jobId].route.length/2)];
   }else{id=typeof command.tileId==='string'?command.tileId:p.position;atTile(p,id);}
   const supplies=spendMany(p,[{itemId:'ration',qty:units.length*2},...(units.some(u=>u.type==='ranged')?[{itemId:'arrow_bundle' as ItemId,qty:units.filter(u=>u.type==='ranged').length}]:[])],now);unitsBusy(units,true);
   const job=addJob(world,p,ctx,'battle',20,{tileId:id,unitIds:units.map(u=>u.id)},supplies),battleId=`battle_${job.id}`;job.payload.battleId=battleId;
   world.battles[battleId]={id:battleId,attackerId:p.id,targetId,npc:targetId===null,convoyId,status:'scheduled',jobId:job.id,rounds:[],winnerId:null,loot:[],report:[],resolvedAt:null};break;
  }
  case 'pvp.toggle':{if(typeof command.enabled!=='boolean')throw new MvpError('Indica el consentimiento PvP.');if(command.enabled){requireUnprotected(world,p,now);requireNpcTraining(p);}if(ownJobs(world,p).some(j=>j.kind==='battle'||j.kind==='convoy'))throw new MvpError('Espera a que terminen tus órdenes comprometidas.',409);p.pvpEnabled=command.enabled;break;}
  case 'world.bridge':{const id=field(command,'tileId'),t=tile(world,id);if(t.terrain!=='water'||t.bridge)throw new MvpError('Este sector no necesita otro puente.',409);if(!neighboring(world,p.position).includes(id))throw new MvpError('Construye desde un sector vecino.',409);consume(p,'bridge_kit',1,now);t.bridge=true;emit(world,p,now,`construyó un paso público en ${t.name}.`);break;}
  case 'world.collect-rain':{
   const t=tile(world,p.position),region=world.regions[t.regionId],weather=weatherFor(region.id,now);if(weather.state!=='rain')throw new MvpError('La redistribución hídrica requiere lluvia.',409);if(region.lastRainWindow===weather.startsAt)throw new MvpError('Ya se redistribuyó agua en esta ventana regional.',409);
   const destination=Object.values(world.tiles).filter(t=>t.regionId===region.id).flatMap(t=>t.deposits).find(d=>d.itemId==='water');if(!destination||region.waterUnassigned<=0)throw new MvpError('El presupuesto de agua asignable está agotado.',409);const qty=Math.min(20,region.waterUnassigned);region.waterUnassigned-=qty;region.lastRainWindow=weather.startsAt;destination.layers[0].budget+=qty;destination.layers[0].remaining+=qty;emit(world,p,now,`redistribuyó ${qty} aguas del presupuesto regional; la lluvia no crea agua.`);break;
  }
  case 'research.start':{if(p.milestones.includes('research'))throw new MvpError('El primer plano ya está investigado.',409);consume(p,'data_fragment',2,now);milestone(p,'research',now);emit(world,p,now,'interpretó un plano conservando el conocimiento.');break;}
 }
 return true;
}

function expeditionResult(world:MvpWorld,p:Player,job:Job,at:number):void{
 const t=tile(world,String(job.payload.tileId)),region=world.regions[t.regionId],roll=Number(job.payload.roll);let result='No hubo un objeto; la ruta queda registrada.';
 if(roll<6500){const d=t.deposits.find(d=>d.layers.some(l=>l.unlocked&&l.remaining-l.reserved>0)),layer=d?.layers.find(l=>l.unlocked&&l.remaining-l.reserved>0);if(d&&layer){layer.remaining--;layer.extracted++;give(p,d.itemId,1,at,`expedition:${job.id}`);result=`Hallazgo común: ${ITEM_CATALOG[d.itemId].name}.`;}}
 else if(roll<8500){if((region.expeditionRemaining.data_fragment??0)>0){region.expeditionRemaining.data_fragment!--;give(p,'data_fragment',1,at,`expedition:${job.id}`);result='Fragmento de datos del presupuesto regional.';}else{milestone(p,'blueprint-clue',at);result='Stock de datos agotado: pista de plano.';}}
 else if(roll<9000){milestone(p,'blueprint-clue',at);result='Pista de plano registrada.';}
 else if(roll<9100){const rare=(['memory_core','ancient_map','artifact_frame','season_relic'] as ItemId[]).find(id=>(region.expeditionRemaining[id]??0)>0);if(rare){region.expeditionRemaining[rare]!--;give(p,rare,1,at,`expedition:${job.id}`);result=`Hallazgo raro: ${ITEM_CATALOG[rare].name}.`;}else{milestone(p,'blueprint-clue',at);result='Rarezas agotadas: el candidato se reemplazó por una pista.';}}
 job.report=[result,String(job.payload.probabilities)];milestone(p,'expedition',at);emit(world,p,at,result);
}
function resolveBattle(world:MvpWorld,p:Player,job:Job,at:number):void{
 const battle=world.battles[String(job.payload.battleId)];if(!battle||battle.status==='resolved')return;
 if(!battle.npc&&[p,battle.targetId?world.players[battle.targetId]:null].some(player=>player&&starterProtection(world,player,Math.min(at,job.createdAt)).active)){
  for(const unit of p.units)if((job.payload.unitIds as string[]).includes(unit.id))unit.busy=false;
  if(battle.convoyId&&world.convoys[battle.convoyId])world.convoys[battle.convoyId].attacked=false;
  addLots(p,job.costs);battle.status='resolved';battle.resolvedAt=at;battle.winnerId=null;battle.rounds=[];battle.loot=[];
  battle.report=['Disputa anulada por protección inicial de 72 horas. Sin daño ni botín; suministros reservados devueltos.'];job.report=[...battle.report];return;
 }
 const ids=job.payload.unitIds as string[],units=p.units.filter(u=>ids.includes(u.id));const location=tile(world,String(job.payload.tileId));
 const terrain=location.terrain==='slope'?0.9:location.terrain==='muddy'?0.95:1,climate=job.weather.state==='storm'?0.85:job.weather.state==='heat'?0.95:1;
 let attack=units.reduce((n,u)=>n+UNIT_POWER[u.type]*(u.health/100),0)*terrain*climate,defense=units.length*2.5;
 let defenders:Unit[]=[];
 if(battle.convoyId){const convoy=world.convoys[battle.convoyId],target=world.players[convoy.playerId],escort=(world.jobs[convoy.jobId].payload.unitIds??[]) as string[];defenders=target.units.filter(u=>escort.includes(u.id));defense=defenders.reduce((n,u)=>n+UNIT_POWER[u.type]*(u.health/100),0)*(location.terrain==='slope'?1.1:1)*climate;}
 for(let round=1;round<=3;round++){battle.rounds.push({round,attack:Math.round(attack*100)/100,defense:Math.round(defense*100)/100});const a=attack,d=defense;attack=Math.max(0,a-d*0.12);defense=Math.max(0,d-a*0.12);}
 const won=attack>=defense;battle.winnerId=won?p.id:battle.targetId;battle.resolvedAt=at;battle.status='resolved';
 for(const u of units){u.health=Math.max(10,u.health-(won?12:30));u.busy=false;u.trainedAt=at;}for(const u of defenders)u.health=Math.max(10,u.health-(won?25:10));
 const guard_armor=p.inventory.find(l=>l.itemId==='guard_armor'&&l.wear>0);if(guard_armor)wearTool(p,guard_armor.id,at,true);
 if(won&&battle.convoyId){const convoy=world.convoys[battle.convoyId];for(const lot of convoy.cargo){const qty=Math.floor(lot.qty*0.2);if(qty&&!lot.bound&&(!lot.expiresAt||lot.expiresAt>at)){lot.qty-=qty;addLots(p,[{...structuredClone(lot),qty}]);battle.loot.push({itemId:lot.itemId,qty});}}convoy.cargo=convoy.cargo.filter(l=>l.qty>0);}
 if(won&&battle.npc){const d=location.deposits.find(d=>d.layers.some(l=>l.unlocked&&l.remaining-l.reserved>0)),layer=d?.layers.find(l=>l.unlocked&&l.remaining-l.reserved>0);if(d&&layer){const qty=Math.min(2,layer.remaining-layer.reserved);layer.remaining-=qty;layer.extracted+=qty;give(p,d.itemId,qty,at,`npc:${battle.id}`);battle.loot.push({itemId:d.itemId,qty});}}
 if(!battle.npc){p.pvpCooldownUntil=at+86400000;if(battle.targetId)world.players[battle.targetId].pvpCooldownUntil=at+86400000;}
 p.stats.battles++;if(battle.npc)milestone(p,'npc-training',at);battle.report=[won?'Victoria de la expedición.':'La expedición se retiró con unidades heridas.',`Terreno ${terrain.toFixed(2)} × clima ${climate.toFixed(2)}. Suministro reservado al ordenar.`,`Tres rondas deterministas; botín ${battle.npc?'desde reservas existentes':'máximo 20% por lote de carga expuesta'}.`];job.report=[...battle.report];emit(world,p,at,battle.report[0]);
}

/** Resolves due work once; ordinary reads do not advance budgets or timestamps. */
export function settleProduction(world:MvpWorld,now:number,onlyJobs?:ReadonlySet<string>,playerId?:string):void{
 if(!onlyJobs)settleStationUpgrades(world,now,playerId);
 // Expired promoter quotas are already ignored by extraction rules. Housekeeping
 // across unrelated deposits belongs to the shared/global settlement pass.
 if(!onlyJobs&&playerId===undefined)for(const t of Object.values(world.tiles))for(const d of t.deposits)for(const layer of d.layers)if(layer.promoterExpiresAt&&layer.promoterExpiresAt<=now){layer.promoterQuota=0;delete layer.promoterExpiresAt;}
 for(const job of Object.values(world.jobs).filter(j=>ACTIVE.has(j.status)&&(playerId===undefined||j.playerId===playerId)&&(!onlyJobs||onlyJobs.has(j.id))).sort((a,b)=>a.endsAt-b.endsAt)){
  if(job.endsAt>now){if(job.status==='reserved'&&job.startsAt<=now)job.status='running';continue;}
  const p=world.players[job.playerId];if(!p)continue;const at=job.endsAt;
  switch(job.kind){
   case 'survey':{const id=String(job.payload.tileId);if(!p.surveyed.includes(id))p.surveyed.push(id);reveal(world,p,id,at);p.stats.explored++;const extra=neighboring(world,id).map(id=>tile(world,id)).find(t=>!p.surveyed.includes(t.id));job.report=[`Prospección completada: capas, reservas y ruta de ${tile(world,id).name}.`,...(job.payload.extraDatum&&extra?[`Dato adicional: ${extra.name}, terreno ${extra.terrain}, indicios de ${ITEM_CATALOG[extra.deposits[0].itemId].name}.`]:[])];break;}
   case 'travel':{p.position=String(job.payload.tileId);reveal(world,p,p.position,at);job.report=[`Llegada a ${tile(world,p.position).name}. Factores y previsión conservados.`];break;}
   case 'extract':{const t=tile(world,String(job.payload.tileId)),d=t.deposits.find(d=>d.itemId===job.payload.itemId),layer=d?.layers.find(l=>l.id===job.payload.layerId),qty=Number(job.payload.qty);if(!d||!layer||layer.reserved<qty||layer.remaining<qty)throw new MvpError('Inconsistencia de reserva de extracción.',500);layer.reserved-=qty;layer.remaining-=qty;layer.extracted+=qty;giveHabitableOutput(world,p,job,d.itemId,qty,at,`deposit:${t.id}:${layer.id}:${job.id}`,[],false);p.stats.gathered+=qty;if(job.payload.tool){const tool=structuredClone(job.payload.tool) as InventoryLot;tool.wear=Math.max(0,tool.wear-1);if(tool.wear)addLots(p,[tool]);}job.report=[`${qty} ${ITEM_CATALOG[d.itemId].name} extraídos de existencias reservadas.`];milestone(p,'extraction',at);break;}
   case 'craft':{const recipe=RECIPE_CATALOG[job.payload.recipeId as ItemId];if(!recipe)throw new MvpError('Receta de trabajo desconocida.',500);const batches=Number(job.payload.qty),bound=job.costs.some(l=>l.bound),inputs=consumedInputs(job.costs);for(const output of recipe.output){const quantity=output.qty*batches;giveHabitableOutput(world,p,job,output.itemId,quantity,at,`recipe:${recipe.id}:${job.id}`,inputs.map(i=>({...i,qty:i.qty/quantity})),bound);p.stats.crafted+=quantity;}job.report=[`Fabricación completada: ${recipe.name}. ${bound?'Producto vinculado por sus insumos.':'Producto transferible.'}`];milestone(p,'first-craft',at);break;}
   case 'farm':{const bound=job.costs.some(l=>l.bound),inputs=job.payload.habitableBuildingId?consumedInputs(job.costs).map(i=>({...i,qty:i.qty/4})):[];giveHabitableOutput(world,p,job,'grain',3,at,`farm:${job.id}`,inputs,bound);giveHabitableOutput(world,p,job,'biomass',1,at,`farm:${job.id}`,inputs,bound);p.stats.farms++;job.report=['Cosecha: tres granos y una biomasa. Un ciclo de parcela y región consumido.'];milestone(p,'farming',at);break;}
   case 'expedition':expeditionResult(world,p,job,at);break;
   case 'convoy':{const convoy=world.convoys[String(job.payload.convoyId)];if(convoy&&convoy.status==='traveling'){for(const lot of convoy.cargo)lot.location=convoy.destination;addLots(p,convoy.cargo.filter(l=>!l.expiresAt||l.expiresAt>at));convoy.cargo=[];convoy.status='arrived';p.position=convoy.destination;reveal(world,p,p.position,at);const ids=job.payload.unitIds as string[];unitsBusy(p.units.filter(u=>ids.includes(u.id)),false);job.report=['Convoy entregado. Alimentos y agua se consumieron una vez al partir.'];milestone(p,'convoy',at);}break;}
   case 'battle':if(job.payload.outpostId)resolveOutpostBattle(world,job,at);else resolveBattle(world,p,job,at);break;
  }
  returnGear(p,job);job.status='completed';if(job.kind!=='battle'&&job.kind!=='expedition')emit(world,p,at,job.report[0]??'Orden completada.');
 }
 // Food expires from the completion timestamp, including when the player returns late.
 if(!onlyJobs)for(const p of settlementPlayers(world,playerId))p.inventory=p.inventory.filter(l=>l.qty>0&&(!l.expiresAt||l.expiresAt>now));
}

