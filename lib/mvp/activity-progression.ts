import type { GameNavigation } from '../client/navigation.ts';
import {TRADE_REQUESTS} from './city-shop.ts';
import { ITEM_CATALOG, RECIPE_CATALOG } from './catalog.ts';
import type { HabitableTemplateId } from './habitable-data.ts';
import type { BuildingType, ItemId, Job, MvpWorld, Player } from './types.ts';
import {playerIdentity} from './village-evidence.ts';

export type ActivityKind=Job['kind']|'build'|'delivery'|'trade'|'daily'|'work-order'|'district-contract'|'level-up';
export interface ActivityCompletion {
  id:string;playerId:string;kind:ActivityKind;completedAt:number;title:string;result:string;xp:number;points:number;target:GameNavigation;
}
export interface ActivityProgressionView {
  playerId:string;
  /** Activity points and XP are the same non-spendable unit. They never change economic rewards. */
  progression:{xp:number;points:number;level:number;levelStartXp:number;nextLevelXp:number;intoLevelXp:number;xpToNextLevel:number;progressPercent:number;activityCount:number};
  completions:ActivityCompletion[];
  nextCompletionAt:number|null;
}
export const ACTIVITY_COMPLETION_LIMIT=200;
export const ACTIVITY_XP=Object.freeze({survey:20,extractPerUnit:3,craftPerBatch:10,farm:15,upgrade:40,expedition:25,convoy:15,firstDestination:5,build:30,firstTrade:20});
const titles:Record<Job['kind'],string>={survey:'Prospección completada',travel:'Llegaste a tu destino',extract:'Extracción completada',craft:'Fabricación completada',farm:'Cosecha completada',expedition:'Expedición resuelta',battle:'Encuentro resuelto',convoy:'Convoy entregado',upgrade:'Mejora completada',land:'Orden territorial completada'};
const buildings:Record<HabitableTemplateId,string>={shed:'Cobertizo',workbench:'Mesa de trabajo',planter:'Bancal',house:'Vivienda',woodlot:'Puesto forestal',sawmill:'Aserradero propio'};
const stationBuildings:Record<BuildingType,string>={workshop:'Taller',garden:'Huerto',kitchen:'Cocina',laboratory:'Laboratorio',barracks:'Cuartel',warehouse:'Almacén',logistics:'Logística'};
const number=(value:unknown):number=>typeof value==='number'&&Number.isFinite(value)?value:NaN;
const quantity=(value:unknown):number=>Number.isSafeInteger(value)&&Number(value)>0?Number(value):0;
const name=(item:unknown):string=>ITEM_CATALOG[item as ItemId]?.name??'material';
const time=(value:unknown,now:number):value is number=>Number.isFinite(number(value))&&Number(value)>=0&&Number(value)<=now;
const ascending=(a:ActivityCompletion,b:ActivityCompletion)=>a.completedAt-b.completedAt||a.id.localeCompare(b.id);
const total=(a:number,b:number)=>Math.min(Number.MAX_SAFE_INTEGER,a+b);

/** Level 1 starts at zero; the first intervals cost 100, 150, 200, ... XP. */
export function activityLevelThreshold(level:number):number {
  if(!Number.isSafeInteger(level)||level<1)throw new RangeError('El nivel debe ser un entero positivo.');
  return 25*(level-1)*(level+2);
}
export function activityProgressionForXp(value:number,activityCount=0):ActivityProgressionView['progression'] {
  const xp=Number.isSafeInteger(value)&&value>0?value:0;
  let level=Math.max(1,Math.floor((Math.sqrt(9+4*xp/25)-1)/2));
  while(activityLevelThreshold(level+1)<=xp)level++;
  while(activityLevelThreshold(level)>xp)level--;
  const levelStartXp=activityLevelThreshold(level),nextLevelXp=activityLevelThreshold(level+1),intoLevelXp=xp-levelStartXp;
  return{xp,points:xp,level,levelStartXp,nextLevelXp,intoLevelXp,xpToNextLevel:nextLevelXp-xp,progressPercent:Math.round(intoLevelXp/(nextLevelXp-levelStartXp)*10000)/100,activityCount};
}
function facilityTarget(p:Player,id:string):GameNavigation{return{tab:'roam',section:'production',profileId:p.id,facilityId:id};}
function jobTarget(world:MvpWorld,p:Player,j:Job):GameNavigation {
  const facility=p.habitable?.buildings.find(b=>b.id===j.payload.habitableBuildingId);
  if(facility)return facilityTarget(p,facility.id);
  if(j.payload.habitableContractId)return{tab:'roam',section:'job',profileId:p.id};
  switch(j.kind){
    case 'survey':case 'travel':case 'extract':return{tab:'world',section:'sectors',profileId:p.id,...(world.tiles[String(j.payload.tileId)]?{tileId:String(j.payload.tileId)}:{})};
    case 'craft':return{tab:'station',section:'craft',profileId:p.id};
    case 'farm':return{tab:'station',section:'farm',profileId:p.id};
    case 'land':return{tab:'roam',section:'land',profileId:p.id};
    case 'upgrade':return{tab:'station',section:'buildings',profileId:p.id};
    case 'convoy':return{tab:'expeditions',section:'convoys',profileId:p.id};
    case 'expedition':return{tab:'expeditions',section:'explore',profileId:p.id};
    default:return{tab:'expeditions',section:'reports',profileId:p.id};
  }
}
function productionLocation(p:Player,j:Job):string {
  if(j.payload.habitableLogistics!==1)return'Los productos se entregaron al inventario de Estación.';
  const b=p.habitable?.buildings.find(b=>b.id===j.payload.habitableBuildingId),s=b?.shipment;
  if(s?.jobId===j.id&&s.depositedAt!==undefined&&quantity(s.deliveredQuantity)>0)return'La producción terminó y su entrega al cobertizo quedó confirmada.';
  if(b?.operation?.jobId===j.id&&b.pending?.length)return'Los productos permanecen en la instalación, pendientes de entrega al cobertizo.';
  return'La producción terminó; el traslado al cobertizo tiene su propio estado de entrega.';
}
function jobResult(world:MvpWorld,p:Player,j:Job):string {
  switch(j.kind){
    case 'survey':return`La prospección de ${world.tiles[String(j.payload.tileId)]?.name??'este sector'} quedó registrada.`;
    case 'travel':return`Tu expedición llegó a ${world.tiles[String(j.payload.tileId)]?.name??'su destino'}.`;
    case 'extract':return`${quantity(j.payload.qty)} ${name(j.payload.itemId)} extraídos de reservas existentes. ${productionLocation(p,j)}`;
    case 'craft':{const recipe=RECIPE_CATALOG[j.payload.recipeId as ItemId],outputs=recipe?.output.map(o=>`${o.qty*quantity(j.payload.qty)} ${name(o.itemId)}`).join(', ');return`Fabricación completada${outputs?`: ${outputs}`:''}. ${productionLocation(p,j)}`;}
    case 'farm':return`Cosecha completada: tres granos y una biomasa. ${productionLocation(p,j)}`;
    case 'upgrade':return`${stationBuildings[j.payload.building as BuildingType]??'El edificio'} alcanzó el nivel ${quantity(j.payload.toLevel)||'previsto'}.`;
    case 'land':return j.report[0]??'La orden territorial terminó; los derechos y recursos se conservan.';
    case 'convoy':return'El convoy llegó; su carga válida fue entregada al inventario de Estación.';
    case 'expedition':return'La expedición terminó. Revisá su resultado en Hallazgos o Informes.';
    default:return'El encuentro terminó. Revisá el informe del servidor.';
  }
}

/** Canonical full history is shared by display and account-level rewards, never the truncated inbox. */
function activityHistory(world:MvpWorld,p:Player,now:number):{events:Map<string,ActivityCompletion>;deadlines:number[]} {
  const events=new Map<string,ActivityCompletion>(),deadlines:number[]=[],npcSales:string[]=[],peerTrades=new Map<string,string>();
  const add=(id:string,kind:ActivityKind,at:unknown,title:string,result:string,xp:number,target:GameNavigation)=>{
    if(!time(at,now)||events.has(id))return;
    const earned=Number.isSafeInteger(xp)&&xp>0?xp:0;events.set(id,{id,playerId:p.id,kind,completedAt:at,title,result,xp:earned,points:earned,target});
  };
  const deadline=(value:unknown)=>{if(Number.isFinite(number(value))&&Number(value)>now)deadlines.push(Number(value));};
  const jobs=Object.values(world.jobs).filter(j=>j.playerId===p.id);
  const completed=jobs.filter(j=>j.status==='completed').map(j=>({job:j,at:(j as Job&{completedAt?:number}).completedAt??j.endsAt})).filter(v=>time(v.at,now)).sort((a,b)=>a.at-b.at||a.job.id.localeCompare(b.job.id));
  // Returning to the founding tile, or revisiting any destination, never farms travel XP.
  const destinations=new Set([p.settlement?.homeTileId??'t_4_4']);
  for(const j of jobs)if(j.status==='running'||j.status==='reserved')deadline(j.endsAt);
  for(const{job:j,at}of completed){
    let xp=0;
    switch(j.kind){
      case 'survey':xp=ACTIVITY_XP.survey;break;
      case 'extract':xp=ACTIVITY_XP.extractPerUnit*quantity(j.payload.qty);break;
      case 'craft':xp=ACTIVITY_XP.craftPerBatch*quantity(j.payload.qty);break;
      case 'farm':xp=ACTIVITY_XP.farm;break;
      case 'upgrade':xp=ACTIVITY_XP.upgrade;break;
      case 'expedition':xp=ACTIVITY_XP.expedition;break;
      case 'convoy':xp=ACTIVITY_XP.convoy;break;
      case 'travel':{const id=String(j.payload.tileId);if(world.tiles[id]&&!destinations.has(id))xp=ACTIVITY_XP.firstDestination;destinations.add(id);break;}
    }
    add(`job:${j.id}`,j.kind,at,titles[j.kind],jobResult(world,p,j),xp,jobTarget(world,p,j));
  }
  // Defender notifications share their battle job's ID rather than awarding a second battle result.
  for(const battle of Object.values(world.battles)){
    if(battle.status!=='resolved'||battle.attackerId!==p.id&&battle.targetId!==p.id&&world.jobs[battle.jobId]?.payload.defenderPlayerId!==p.id)continue;
    if(world.jobs[battle.jobId]?.playerId===p.id&&events.has(`job:${battle.jobId}`))continue;
    add(`battle:${battle.id}`,'battle',battle.resolvedAt,'Encuentro resuelto','El encuentro terminó. Revisá tu informe; no hay otra orden que reclamar.',0,{tab:'expeditions',section:'reports',profileId:p.id});
  }
  for(const b of[...(p.habitable?.buildings??[]),...(p.habitable?.land?.demolished?.map(d=>d.building)??[])]){
    deadline(b.endsAt);
    add(`building:${b.id}:complete`,'build',b.endsAt,`${buildings[b.templateId]} terminado`,'La obra está terminada y conserva sus accesos y funciones.',b.rebuildOf?0:ACTIVITY_XP.build,b.templateId==='house'?{tab:'roam',section:'residents',profileId:p.id}:facilityTarget(p,b.id));
    if(b.upgrade){deadline(b.upgrade.endsAt);if(b.level===b.upgrade.toLevel)add(`building:${b.id}:upgrade:${b.upgrade.toLevel}`,'upgrade',b.upgrade.endsAt,'Cobertizo ampliado',`El cobertizo alcanzó el nivel ${b.upgrade.toLevel}; su capacidad ya fue actualizada.`,ACTIVITY_XP.upgrade,facilityTarget(p,b.id));}
    const s=b.shipment,j=s?world.jobs[s.jobId]:undefined;
    if(s&&j?.playerId===p.id&&j.status==='completed'){
      if(s.depositedAt===undefined)deadline(s.unloadsAt);
      if(s.depositedAt!==undefined&&quantity(s.deliveredQuantity)>0)add(`shipment:${s.id}:unloaded`,'delivery',s.depositedAt,'Entrega recibida en el cobertizo',`${s.deliveredQuantity} unidades ya fueron depositadas en tu cobertizo. La producción no gana XP otra vez por el traslado.`,0,facilityTarget(p,s.destinationBuildingId));
      if(b.workOrder?.status==='active'||b.workOrder?.status==='stopping')deadline(s.endsAt);
    }
    const o=b.workOrder;
    if(o?.status==='completed'&&o.completed>=o.target&&s&&s.jobId===o.lastSettledJobId&&s.depositedAt!==undefined&&quantity(s.deliveredQuantity)>0)add(`work-order:${o.id}:complete`,'work-order',s.endsAt,'Pedido del aserradero completado',`${o.completed} tablones del pedido fueron producidos y entregados. Sus ciclos ya aportaron la experiencia correspondiente.`,0,facilityTarget(p,b.id));
  }
  const daily=p.habitable?.daily?.journey;
  if(daily){if(daily.completedAt===undefined)deadline(daily.endsAt);else add(`daily:${daily.id}:complete`,'daily',daily.completedAt,'Reparto de la jornada completado','Las raciones y el mantenimiento fueron entregados; el repartidor regresó a su puesto.',0,{tab:'roam',section:'economy',profileId:p.id});}

  for(const c of p.royal?.contracts??[])if(c.escrow===0&&c.deliveredAt!==undefined&&world.royalKingdom?.deliveries.some(d=>d.id===c.id&&d.playerId===p.id&&d.at===c.deliveredAt&&d.lots.reduce((n,l)=>n+(l.itemId==='plank'&&!l.bound&&c.deliveredLotIds?.includes(l.id)?l.qty:0),0)===2)&&world.social.ledger.some(l=>l.currency==='credits'&&l.from===c.id&&l.to===p.id&&l.at===c.deliveredAt&&l.amount===12&&l.reason==='Entrega verificada de tablones al reino'))add(`royal-supply:${c.id}`,'district-contract',c.deliveredAt,'Suministro del castillo entregado','La cuadrilla real recibió dos tablones. Pago y experiencia registrados una sola vez.',25,{tab:'world',section:'kingdom',profileId:p.id});
  const shopDestinations=new Set<string>();
  for(const c of [...(p.shop?.contracts??[])].sort((a,b)=>(a.deliveredAt??Infinity)-(b.deliveredAt??Infinity))){
    const r=TRADE_REQUESTS[c.request];
    if(!r||c.deliveredAt===undefined||c.escrow!==0||!time(c.deliveredAt,now)||(c.lots??[]).reduce((n,l)=>n+(!l.bound&&!l.provenance.source.includes('finite-opening-stock')?l.qty:0),0)!==r.qty)continue;
    if(!world.social.ledger.some(l=>l.currency==='credits'&&l.from===c.id&&l.to===p.id&&l.at===c.deliveredAt&&l.amount===r.reward&&l.reason==='Entrega física: '+r.name))continue;
    const xp=shopDestinations.has(r.destination)?0:25;shopDestinations.add(r.destination);
    add('city-delivery:'+c.id,'district-contract',c.deliveredAt,'Entrega comercial confirmada',r.qty+' unidades recibidas por la ciudad y '+r.reward+' CR pagados. La primera entrega a cada ciudad aporta 25 XP.',xp,{tab:'world',section:'kingdom',profileId:p.id});
  }
  const yard=p.shop?.handling;if(yard&&yard.completedAt===undefined){deadline(yard.endsAt);if(yard.transferredAt===undefined)deadline(yard.transfersAt);}
  // Canonical payment entries avoid counting the item debit and credit receipt as two trades.
  for(const l of world.social.ledger){
    if(l.currency!=='credits'||l.to!==p.id||l.from!=='npc-season'||l.reason!=='Encargo NPC con presupuesto limitado'||l.amount<=0||!time(l.at,now))continue;
    const id=`npc-sale:${l.id}`;add(id,'trade',l.at,'Venta pagada en la Feria',`${l.amount} CR recibidos por una venta entregada. El pago ya está registrado.`,0,{tab:'trade',section:'npc',profileId:p.id});npcSales.push(id);
  }
  for(const c of p.habitable?.commerce?.contracts??[]){
    if(c.status==='in_transit')deadline(c.caravan.delivery?.unloadsAt);
    if(c.status!=='completed'||!time(c.paidAt,now)||c.escrow!==0||c.quantity<=0||(c.deliveredUnits??0)<c.quantity||c.price<=0)continue;
    if(!world.social.ledger.some(l=>l.currency==='credits'&&l.to===p.id&&l.from==='npc'&&l.reason===`Entrega forestal ${c.id}`&&l.at===c.paidAt&&l.amount===c.price))continue;
    const id=`npc-delivery:${c.id}`;add(id,'trade',c.paidAt,'Valleverde recibió tu entrega',`${c.deliveredUnits} tablones entregados y ${c.price} CR ya pagados.`,0,{tab:'roam',section:'economy',profileId:p.id,facilityId:c.buildingId});npcSales.push(id);
  }
  const district=p.habitable?.job;
  if(district?.status==='completed'&&district.escrow===0&&time(district.deliveredAt,now)&&world.social.ledger.some(l=>l.currency==='credits'&&l.from===district.id&&l.to===p.id&&l.at===district.deliveredAt&&l.amount===district.rewardCredits&&l.reason==='Entrega verificada de dos tablones para el distrito')){
    const id=`district-contract:${district.id}:paid`;add(id,'district-contract',district.deliveredAt,'Encargo del distrito pagado',`${district.rewardCredits} CR recibidos por los tablones del encargo.`,0,{tab:'roam',section:'job',profileId:p.id});npcSales.push(id);
  }
  for(const offer of world.social.offers){
    if(offer.status!=='filled'||!offer.takerId||offer.makerId!==p.id&&offer.takerId!==p.id)continue;
    const receipt=world.social.ledger.filter(l=>l.currency==='item'&&l.from===offer.id&&l.to===offer.takerId&&l.reason==='Entrega de orden'&&l.amount===offer.qty&&time(l.at,now)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))[0];if(!receipt)continue;
    const id=`market:${offer.id}:filled`,other=playerIdentity(world,offer.makerId===p.id?offer.takerId:offer.makerId);
    add(id,'trade',receipt.at,'Intercambio completado',`${offer.qty} ${name(offer.itemId)} entregados; la operación del mercado quedó resuelta.`,0,{tab:'trade',section:'market',profileId:p.id});
    if(other&&other.ownerId!==p.ownerId)peerTrades.set(id,other.ownerId);
  }
  const npcFirst=npcSales.map(id=>events.get(id)).filter((v):v is ActivityCompletion=>!!v).sort(ascending)[0];if(npcFirst){npcFirst.xp=ACTIVITY_XP.firstTrade;npcFirst.points=npcFirst.xp;}
  const counterparties=new Set<string>();
  for(const e of [...events.values()].sort(ascending)){const owner=peerTrades.get(e.id);if(owner&&!counterparties.has(owner)){counterparties.add(owner);e.xp=ACTIVITY_XP.firstTrade;e.points=e.xp;}}
  const loading=p.shop?.contracts?.find(c=>c.deliveredAt===undefined&&c.cancelledAt===undefined)?.production?.loading;if(loading){deadline(loading.crew.endsAt);if(loading.loadedAt===undefined)deadline(loading.crew.legs.find(l=>l.phase==='unloading')?.endsAt);}
  return{events,deadlines};
}
export interface ActivityXpEntry {id:string;playerId:string;completedAt:number;xp:number}
export function getActivityXpTimeline(world:MvpWorld,p:Player,now:number):ActivityXpEntry[] {
  return [...activityHistory(world,p,now).events.values()].filter(e=>e.xp>0).sort(ascending).map(e=>({id:e.id,playerId:e.playerId,completedAt:e.completedAt,xp:e.xp}));
}
/** Pure projection over authoritative history. No migration, claim, balance or receipt is written here. */
export function getActivityProgression(world:MvpWorld,p:Player|null,now:number):ActivityProgressionView|null {
  if(!p)return null;
  const{events,deadlines}=activityHistory(world,p,now),all=[...events.values()].sort(ascending),xp=all.reduce((n,e)=>total(n,e.xp),0),progression=activityProgressionForXp(xp,all.filter(e=>e.xp>0).length);
  // Only the newest 200 level notices can survive the bounded notification window.
  // Even an extreme historical total therefore creates at most 200 extra records.
  let levelToNotify=Math.max(2,progression.level-ACTIVITY_COMPLETION_LIMIT+1),accumulated=0;
  for(const e of all){
    accumulated=total(accumulated,e.xp);
    while(levelToNotify<=progression.level&&activityLevelThreshold(levelToNotify)<=accumulated){
      const id=`level:${p.id}:${levelToNotify}`;events.set(id,{id,playerId:p.id,kind:'level-up',completedAt:e.completedAt,title:`Alcanzaste el nivel ${levelToNotify}`,result:'Revisá las recetas y los planos disponibles. La experiencia no se consume y los desbloqueos no requieren un pago.',xp:0,points:0,target:{tab:'station',section:'craft',profileId:p.id}});levelToNotify++;
    }
  }
  return{playerId:p.id,progression,completions:[...events.values()].sort((a,b)=>-ascending(a,b)).slice(0,ACTIVITY_COMPLETION_LIMIT),nextCompletionAt:deadlines.length?Math.min(...deadlines):null};
}
