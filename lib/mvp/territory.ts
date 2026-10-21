import { addLots, available, consume, emit, MvpError } from './helpers.ts';
import { requireUnprotected, starterProtection } from './settlements.ts';
import { weatherFor } from './world.ts';
import type { Battle, Context, ItemAmount, Job, MvpCommand, MvpWorld, Player, Unit } from './types.ts';

const HOUR=3_600_000;
export const TERRITORY_PARAMETERS={
  claimCosts:[{itemId:'timber',qty:5},{itemId:'ration',qty:2}] as ItemAmount[],
  maintenanceCosts:[{itemId:'timber',qty:2},{itemId:'ration',qty:1}] as ItemAmount[],
  concessionHours:48,maintenanceHours:24,clanLimit:1,allianceLimit:2,
  logisticsTimeFactor:0.9,observatorySurveyFactor:0.9,
  disputesEnabled:true,battleSeconds:20,restHours:24,unitsPerBattle:6,
  battleRationsPerUnit:2,battleWaterPerUnit:1,maxCounterFactor:1.25,
  disputeWindowUtc:{startHour:18,endHour:22},
  policy:'Parámetros de piloto. Materiales transferibles. El mantenimiento no prolonga la concesión. El puesto nunca bloquea rutas ni regenera reservas.',
};
export interface OutpostHistory {
  at:number;kind:'claimed'|'maintained'|'suspended'|'expired'|'released'|'defense'|'challenged'|'defended'|'captured';playerId:string|null;text:string;costs:ItemAmount[];
}
export interface Outpost {
  id:string;clanId:string;tileId:string;holderId:string;purpose:'logistics'|'observatory';
  createdAt:number;expiresAt:number;maintenanceUntil:number;status:'active'|'suspended'|'expired';history:OutpostHistory[];
  defense?:{playerId:string;unitIds:string[]};pendingBattleId?:string|null;cooldownUntil?:number;
}

function fail(message:string,status=409):never {throw new MvpError(message,status);}
function identifier(value:unknown):string {if(typeof value!=='string'||!value||value.length>180)fail('Identificador de puesto inválido.',400);return value;}
function representative(world:MvpWorld,ctx:Context) {
  const player=ctx.actor&&Object.hasOwn(world.players,ctx.actor.id)?world.players[ctx.actor!.id]:null;
  if(!player||player.ownerId!==ctx.ownerId)fail('Este explorador no pertenece a tu cuenta.',403);
  const clan=world.social.clans.find(c=>Object.hasOwn(c.members,player.id));
  if(!clan)fail('Se necesita un clan para sostener una concesión.');
  if(clan.members[player.id]!=='founder'&&clan.members[player.id]!=='coordinator')fail('Solo fundadores y coordinadores gestionan puestos.',403);
  return {player,clan};
}
function occupied(post:Outpost,now:number):boolean {return post.status!=='expired'&&post.expiresAt>now;}
function functioning(post:Outpost,now:number):boolean {return occupied(post,now)&&post.status==='active'&&post.maintenanceUntil>now;}
function pay(player:Player,costs:ItemAmount[],now:number):void {
  for(const cost of costs)if(available(player,cost.itemId,now,true)<cost.qty)fail('Faltan materiales y alimentos transferibles para sostener el puesto.');
  for(const cost of costs)consume(player,cost.itemId,cost.qty,now,{tradeableOnly:true});
}
function record(post:Outpost,now:number,kind:OutpostHistory['kind'],playerId:string|null,text:string,costs:ItemAmount[]=[]):void {
  post.history.push({at:now,kind,playerId,text,costs:structuredClone(costs)});
}
function alliedClanIds(world:MvpWorld,clanId:string):Set<string> {
  const ids=new Set([clanId]);
  for(const alliance of world.social.alliances)if(alliance.status==='active'&&alliance.noAggression&&alliance.clanIds.includes(clanId))for(const id of alliance.clanIds)ids.add(id);
  return ids;
}
function reservations(world:MvpWorld,now:number,ignoreJobId?:string) {
  return Object.values(world.jobs).filter(job=>job.id!==ignoreJobId&&job.kind==='battle'&&(job.status==='running'||job.status==='reserved')&&typeof job.payload.outpostId==='string'&&world.social.outposts.some(post=>post.id===job.payload.outpostId&&occupied(post,now)));
}
function capacity(world:MvpWorld,clanId:string,now:number,ignoreJobId?:string):void {
  const live=world.social.outposts.filter(post=>occupied(post,now)),pending=reservations(world,now,ignoreJobId);
  if(live.filter(post=>post.clanId===clanId).length+pending.filter(job=>job.payload.attackerClanId===clanId).length>=TERRITORY_PARAMETERS.clanLimit)fail('Un clan puede sostener un solo puesto vigente, incluidas capturas pendientes.');
  const allies=alliedClanIds(world,clanId);
  if(allies.size>1&&live.filter(post=>allies.has(post.clanId)).length+pending.filter(job=>allies.has(String(job.payload.attackerClanId))).length>=TERRITORY_PARAMETERS.allianceLimit)fail('La alianza ya sostiene dos puestos vigentes o capturas pendientes.');
}
function selectedUnits(player:Player,value:unknown,allowEmpty=false):Unit[] {
  if(!Array.isArray(value)||value.length>(TERRITORY_PARAMETERS.unitsPerBattle)||(!allowEmpty&&value.length<1)||new Set(value).size!==value.length)fail('Selecciona entre una y seis unidades propias distintas.',400);
  return value.map(id=>{const unit=player.units.find(candidate=>candidate.id===id);if(!unit||unit.busy||unit.health<25)fail('Una unidad es ajena, está ocupada o necesita recuperación.');return unit;});
}
function snapshot(units:Unit[]) {return units.map(unit=>({id:unit.id,type:unit.type,health:unit.health}));}
function stationary(world:MvpWorld,player:Player):void {
  if(Object.values(world.jobs).some(job=>job.playerId===player.id&&(job.status==='running'||job.status==='reserved')&&(job.kind==='travel'||job.kind==='convoy')))fail('Espera a que la expedición llegue antes de comprometer una formación.');
}
const UNIT_POWER:Record<Unit['type'],number>={scout:8,guard:12,ranged:11,engineer:9};
type UnitSnapshot=ReturnType<typeof snapshot>[number];
function counter(units:UnitSnapshot[],opponents:UnitSnapshot[]):number {
  if(!units.length||!opponents.length)return 1;
  const counts=units.reduce((sum,u)=>sum+opponents.filter(other=>(u.type==='scout'&&other.type==='ranged')||(u.type==='ranged'&&other.type==='guard')||(u.type==='guard'&&other.type==='scout')).length,0);
  return Math.min(1.25,1+0.25*counts/(units.length*opponents.length));
}

export function settleTerritory(world:MvpWorld,now:number,playerId?:string):void {
  // Outpost concessions are shared clan state, never a side effect of opening
  // an unrelated village. Their settlement retains the shared transaction path.
  if(playerId!==undefined)return;
  world.social.outposts??=[];
  for(const post of world.social.outposts){
    if(post.status==='expired')continue;
    if(now>=post.expiresAt){post.status='expired';record(post,now,'expired',null,'Finalizó la concesión. La estación y las reservas naturales permanecen.');}
    else if(post.status==='active'&&now>=post.maintenanceUntil){post.status='suspended';record(post,now,'suspended',null,'Sin mantenimiento: servicios suspendidos hasta reponer suministros.');}
  }
}

export function dispatchTerritory(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  if(!command.type.startsWith('outpost.')&&command.type!=='battle.outpost')return false;
  const {player,clan}=representative(world,ctx),now=ctx.now;
  world.social.outposts??=[];
  switch(command.type){
    case 'outpost.claim': {
      const tileId=identifier(command.tileId),tile=Object.hasOwn(world.tiles,tileId)?world.tiles[tileId]:null;
      if(!tile||tile.protected)fail('La estación y los sectores protegidos quedan fuera de concesiones.');
      if(player.position!==tileId)fail('Viaja al sector para establecer el puesto.');
      if(Object.values(world.jobs).some(j=>j.playerId===player.id&&(j.status==='running'||j.status==='reserved')&&(j.kind==='travel'||j.kind==='convoy')))fail('La expedición debe llegar antes de establecer el puesto.');
      if(!player.pvpEnabled||command.riskAccepted!==true)fail('Activa PvP y acepta expresamente el riesgo territorial de la concesión.',403);
      requireUnprotected(world,player,now);
      const purpose=command.purpose??'logistics';if(purpose!=='logistics'&&purpose!=='observatory')fail('Uso de puesto inválido.',400);
      if(purpose==='observatory'&&(!tile.deposits.length||tile.deposits.some(d=>d.layers.some(l=>l.extracted!==l.budget||l.remaining!==0||l.reserved!==0))))fail('El observatorio reutiliza un yacimiento totalmente agotado, sin rellenarlo.');
      const existing=world.social.outposts.filter(post=>occupied(post,now));
      if(existing.some(post=>post.tileId===tileId))fail('Este sector ya tiene una concesión vigente.');
      capacity(world,clan.id,now);
      pay(player,TERRITORY_PARAMETERS.claimCosts,now);world.social.sequence+=1;
      const post:Outpost={id:`outpost_${world.social.sequence}`,clanId:clan.id,tileId,holderId:player.id,purpose,createdAt:now,expiresAt:now+TERRITORY_PARAMETERS.concessionHours*HOUR,maintenanceUntil:now+TERRITORY_PARAMETERS.maintenanceHours*HOUR,status:'active',history:[]};
      record(post,now,'claimed',player.id,`Concesión de ${purpose==='logistics'?'logística':'observatorio'} por 48 horas.`,TERRITORY_PARAMETERS.claimCosts);
      world.social.outposts.push(post);emit(world,player,now,`estableció un puesto de ${clan.name} en ${tile.name}; las rutas siguen siendo públicas.`);return true;
    }
    case 'outpost.maintain':case 'outpost.release': {
      const post=world.social.outposts.find(candidate=>candidate.id===identifier(command.outpostId));
      if(!post||post.clanId!==clan.id)fail('No puedes gestionar la concesión de otro clan.',403);
      if(!occupied(post,now))fail('Esta concesión ya finalizó.');
      if(post.pendingBattleId)fail('El puesto tiene una disputa comprometida; espera su resolución.');
      if(command.type==='outpost.release'){
        post.status='expired';post.expiresAt=now;post.maintenanceUntil=Math.min(post.maintenanceUntil,now);
        record(post,now,'released',player.id,'El clan abandonó la concesión; no recupera materiales consumidos.');emit(world,player,now,`liberó el puesto de ${clan.name}.`);return true;
      }
      if(player.position!==post.tileId)fail('Lleva los suministros al puesto para mantenerlo.');
      const next=Math.min(post.expiresAt,Math.max(now,post.maintenanceUntil)+TERRITORY_PARAMETERS.maintenanceHours*HOUR);
      if(next<=post.maintenanceUntil)fail('El mantenimiento ya cubre toda la concesión.');
      pay(player,TERRITORY_PARAMETERS.maintenanceCosts,now);post.maintenanceUntil=next;post.status='active';
      record(post,now,'maintained',player.id,'Se repusieron suministros. La fecha final de concesión no cambia.',TERRITORY_PARAMETERS.maintenanceCosts);return true;
    }
    case 'outpost.defense': {
      const post=world.social.outposts.find(candidate=>candidate.id===identifier(command.outpostId));
      if(!post||post.clanId!==clan.id)fail('No puedes configurar la defensa de otro clan.',403);
      if(!occupied(post,now)||post.pendingBattleId)fail('La concesión está cerrada o tiene una disputa comprometida.');
      if(player.position!==post.tileId)fail('Lleva tu formación al puesto para asignar la defensa.');
      stationary(world,player);
      const units=selectedUnits(player,command.unitIds,true);if(units.length){requireUnprotected(world,player,now);if(!player.pvpEnabled)fail('Activa PvP para asignar una formación defensiva.',403);}post.defense={playerId:player.id,unitIds:units.map(unit=>unit.id)};
      record(post,now,'defense',player.id,`Defensa configurada: ${units.length} unidades propias, hasta seis plazas.`);return true;
    }
    case 'battle.outpost': {
      const post=world.social.outposts.find(candidate=>candidate.id===identifier(command.outpostId));
      if(!post||!occupied(post,now))fail('La concesión objetivo ya finalizó.');
      if(post.pendingBattleId)fail('El puesto ya tiene una disputa comprometida.');
      const hour=new Date(now).getUTCHours();if(hour<TERRITORY_PARAMETERS.disputeWindowUtc.startHour||hour>=TERRITORY_PARAMETERS.disputeWindowUtc.endHour)fail('Ventana de disputa: 18:00–22:00 UTC.');
      if(!player.pvpEnabled)fail('Activa PvP para disputar una concesión.',403);
      if(player.position!==post.tileId)fail('Viaja al puesto para presentar la disputa.');
      stationary(world,player);
      const holder=world.players[post.holderId];if(!holder)fail('El titular no está disponible.');
      requireUnprotected(world,player,now);requireUnprotected(world,holder,now);
      if(holder.ownerId===ctx.ownerId)fail('No se permiten disputas entre perfiles de la misma cuenta.',403);
      if(alliedClanIds(world,clan.id).has(post.clanId))fail('No puedes atacar tu clan ni un pacto de no agresión.',403);
      if(player.pvpCooldownUntil>now||holder.pvpCooldownUntil>now||(post.cooldownUntil??0)>now)fail('El jugador o puesto permanece en descanso de 24 horas.');
      if(Object.values(world.battles).some(b=>b.status==='scheduled'&&(b.attackerId===player.id||b.targetId===player.id||b.attackerId===holder.id||b.targetId===holder.id)))fail('Uno de los responsables ya tiene una disputa comprometida.');
      if(now+TERRITORY_PARAMETERS.battleSeconds*1000>=post.expiresAt)fail('La concesión vencerá antes de resolver la disputa.');
      capacity(world,clan.id,now);
      const units=selectedUnits(player,command.unitIds),defender=post.defense&&world.players[post.defense.playerId];
      const defenderInClan=defender&&world.social.clans.some(c=>c.id===post.clanId&&Object.hasOwn(c.members,defender.id));
      if(defenderInClan&&post.defense!.unitIds.length)requireUnprotected(world,defender!,now);
      const defenders=defenderInClan?defender.units.filter(unit=>post.defense!.unitIds.includes(unit.id)&&!unit.busy&&unit.health>=25).slice(0,6):[];
      if(defenders.length&&defender!.ownerId===ctx.ownerId)fail('No se permite atacar formaciones de la misma cuenta.',403);
      if(defenders.length&&defender!.pvpCooldownUntil>now)fail('La formación defensiva permanece en descanso de 24 horas.');
      const tile=world.tiles[post.tileId],weather=weatherFor(tile.regionId,now);
      const costs:ItemAmount[]=[{itemId:'ration',qty:units.length*2},{itemId:'water',qty:Math.ceil(units.length*weather.waterFactor)}];
      for(const cost of costs)if(available(player,cost.itemId,now)<cost.qty)fail('Faltan raciones y agua para la formación.');
      const supplies=costs.flatMap(cost=>consume(player,cost.itemId,cost.qty,now));
      world.counters.job++;const jobId=`job_${world.counters.job}`,battleId=`battle_${jobId}`;
      const job:Job={id:jobId,playerId:player.id,kind:'battle',status:'running',createdAt:now,startsAt:now,endsAt:now+TERRITORY_PARAMETERS.battleSeconds*1000,ruleVersion:world.rulesVersion,weather,route:[post.tileId],costs:supplies,report:[],payload:{outpostId:post.id,battleId,tileId:post.tileId,attackerClanId:clan.id,defenderClanId:post.clanId,unitIds:units.map(u=>u.id),defenderPlayerId:defenderInClan?defender!.id:holder.id,defenderUnitIds:defenders.map(u=>u.id),attackSnapshot:snapshot(units),defenseSnapshot:snapshot(defenders),defenderSupplied:functioning(post,now)}};
      const battle:Battle={id:battleId,attackerId:player.id,targetId:holder.id,targetOutpostId:post.id,npc:false,convoyId:null,status:'scheduled',jobId,rounds:[],winnerId:null,loot:[],report:[],resolvedAt:null};
      for(const unit of [...units,...defenders])unit.busy=true;world.jobs[job.id]=job;world.battles[battle.id]=battle;post.pendingBattleId=job.id;
      record(post,now,'challenged',player.id,`Disputa confirmada: ${units.length} contra ${defenders.length} unidades, tres rondas y ningún botín de estación.`,costs);return true;
    }
    default:fail('Orden territorial desconocida.',400);
  }
}

/** Called once by the production queue on the same transaction clone. */
export function resolveOutpostBattle(world:MvpWorld,job:Job,at:number):void {
  if(at<job.endsAt)return;
  const battle=world.battles[String(job.payload.battleId)];if(!battle||battle.status==='resolved')return;
  const post=world.social.outposts.find(candidate=>candidate.id===job.payload.outpostId),attacker=world.players[job.playerId];
  const defender=world.players[String(job.payload.defenderPlayerId)],holder=battle.targetId?world.players[battle.targetId]:null;
  if([attacker,defender,holder].some(player=>player&&starterProtection(world,player,Math.min(at,job.createdAt)).active)){
    for(const [player,ids] of [[attacker,job.payload.unitIds],[defender,job.payload.defenderUnitIds]] as const)if(player)for(const unit of player.units)if((ids as string[]).includes(unit.id))unit.busy=false;
    if(attacker)addLots(attacker,job.costs);if(post)post.pendingBattleId=null;
    battle.status='resolved';battle.resolvedAt=at;battle.winnerId=null;battle.rounds=[];battle.loot=[];
    battle.report=['Disputa territorial anulada por protección inicial de 72 horas. Sin daño ni captura; suministros reservados devueltos.'];job.report=[...battle.report];return;
  }
  const attack=structuredClone(job.payload.attackSnapshot) as UnitSnapshot[],defense=structuredClone(job.payload.defenseSnapshot) as UnitSnapshot[];
  const tile=world.tiles[String(job.payload.tileId)],terrain=tile.terrain==='slope'?1.15:tile.terrain==='rocky'?1.1:1;
  const climate=job.weather.state==='storm'?0.8:job.weather.state==='clear'?1:0.9,defenseSupply=job.payload.defenderSupplied===true?1:0.7;
  const attackCounter=counter(attack,defense),defenseCounter=counter(defense,attack);
  const power=(units:UnitSnapshot[],factor:number)=>units.reduce((sum,unit)=>sum+UNIT_POWER[unit.type]*Math.max(0,Math.min(100,unit.health))/100,0)*factor;
  const attackFactor=climate*attackCounter,defenseFactor=terrain*climate*defenseSupply*defenseCounter;
  battle.rounds=[];
  for(let round=1;round<=3;round++){
    const a=power(attack,attackFactor),d=power(defense,defenseFactor);
    battle.rounds.push({round,attack:Math.round(a*100)/100,defense:Math.round(d*100)/100});
    const attackDamage=defense.length?Math.min(25,Math.max(2,Math.ceil(d/Math.max(1,attack.length)*0.65))):0;
    const defenseDamage=Math.min(25,Math.max(2,Math.ceil(a/Math.max(1,defense.length)*0.65)));
    for(const unit of attack)unit.health=Math.max(1,unit.health-attackDamage);
    for(const unit of defense)unit.health=Math.max(1,unit.health-defenseDamage);
  }
  const won=power(attack,attackFactor)>power(defense,defenseFactor);
  for(const [player,formation] of [[attacker,attack],[defender,defense]] as const){if(!player)continue;for(const result of formation){const unit=player.units.find(u=>u.id===result.id);if(unit){unit.health=result.health;unit.busy=false;}}}
  battle.status='resolved';battle.resolvedAt=at;battle.winnerId=won?attacker.id:(defender?.id??holder?.id??null);battle.loot=[];
  attacker.pvpCooldownUntil=at+24*HOUR;attacker.stats.battles++;
  if(holder)holder.pvpCooldownUntil=at+24*HOUR;if(defender)defender.pvpCooldownUntil=at+24*HOUR;
  let captured=false,reason='La defensa conserva su concesión.';
  if(post){
    post.pendingBattleId=null;post.cooldownUntil=at+24*HOUR;
    if(won&&occupied(post,at)&&post.clanId===job.payload.defenderClanId){
      const attackerClan=world.social.clans.find(c=>c.id===job.payload.attackerClanId&&Object.hasOwn(c.members,attacker.id));
      if(attackerClan&&!alliedClanIds(world,attackerClan.id).has(post.clanId)){
        try{capacity(world,attackerClan.id,at,job.id);post.clanId=attackerClan.id;post.holderId=attacker.id;post.defense=undefined;captured=true;reason='Concesión transferida con el mismo vencimiento y mantenimiento restante.';}
        catch(error){if(!(error instanceof MvpError))throw error;reason='Victoria táctica sin captura: el clan o alianza ya cubrió su capacidad.';}
      }else reason='Victoria táctica sin transferencia: representación o pacto cambió.';
    }else if(!occupied(post,at))reason='La concesión venció; la batalla no crea una concesión nueva.';
    record(post,at,captured?'captured':'defended',battle.winnerId,reason);
  }
  battle.report=[won?'Victoria táctica de la expedición.':'La defensa conserva el puesto.',reason,`Tres rondas: terreno ${terrain.toFixed(2)}, clima ${climate.toFixed(2)}, suministro defensor ${defenseSupply.toFixed(2)}, contramedidas ${attackCounter.toFixed(2)}/${defenseCounter.toFixed(2)} (máximo 1.25).`,'No hay botín de estación, créditos, SIM_QRYP ni reservas nuevas. Descanso de 24 horas.'];job.report=[...battle.report];
  emit(world,attacker,at,`${captured?'capturó una concesión territorial':'completó una disputa territorial'}: ${reason}`);
}

function playerClan(world:MvpWorld,playerId:string):string|null {return world.social.clans.find(c=>Object.hasOwn(c.members,playerId))?.id??null;}
/** At most one bounded route bonus; several posts cannot stack multipliers. */
export function getOutpostRouteFactor(world:MvpWorld,playerId:string,route:string[],now:number):number {
  const clanId=playerClan(world,playerId);if(!clanId)return 1;const allies=alliedClanIds(world,clanId);
  return (world.social.outposts??[]).some(post=>post.purpose==='logistics'&&allies.has(post.clanId)&&functioning(post,now)&&route.includes(post.tileId))?TERRITORY_PARAMETERS.logisticsTimeFactor:1;
}
export function getOutpostSurveyFactor(world:MvpWorld,playerId:string,tileId:string,now:number):number {
  const clanId=playerClan(world,playerId),tile=world.tiles[tileId];if(!clanId||!tile)return 1;const allies=alliedClanIds(world,clanId);
  return (world.social.outposts??[]).some(post=>post.purpose==='observatory'&&allies.has(post.clanId)&&functioning(post,now)&&world.tiles[post.tileId]?.regionId===tile.regionId)?TERRITORY_PARAMETERS.observatorySurveyFactor:1;
}

