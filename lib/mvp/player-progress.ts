import { RECIPE_CATALOG } from './catalog.ts';
import type { ItemId, Job, MvpWorld, Player } from './types.ts';

export interface PlayerProgressView {
  playerId:string;
  stats:{gathered:number;crafted:number;explored:number;farms:number;regionsVisited:number;trades:number;marketTrades:number;npcSales:number};
  orders:{total:number;active:number;completed:number;cancelled:number};
  foundation:{id:'found'|'survey'|'craft'|'region'|'trade';label:string;done:boolean;detail:string}[];
}
export interface PlayerReportView {
  id:string;playerId:string;source:'job'|'battle';jobId:string;battleId?:string;kind:string;title:string;
  status:Job['status']|'resolved';at:number;dateKind:'completed'|'created';lines:string[];
}
const nonnegative=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,value):0;
const jobTitles:Record<Job['kind'],string>={survey:'Prospección',travel:'Viaje',extract:'Extracción',craft:'Fabricación',farm:'Cosecha',expedition:'Expedición',battle:'Encuentro',convoy:'Convoy',upgrade:'Mejora de edificio',land:'Orden territorial'};
/** Read-only display projection. Reward counters and persisted player state are never repaired or migrated here. */
export function getPlayerProgress(world:MvpWorld,p:Player,now:number):PlayerProgressView {
  const jobs=Object.values(world.jobs).filter(j=>j.playerId===p.id),completed=jobs.filter(j=>j.status==='completed'),extracted=completed.filter(j=>j.kind==='extract').reduce((n,j)=>n+nonnegative(j.payload.qty),0),crafted=completed.filter(j=>j.kind==='craft').reduce((n,j)=>n+(RECIPE_CATALOG[j.payload.recipeId as ItemId]?.output??[]).reduce((n,o)=>n+o.qty*nonnegative(j.payload.qty),0),0),marketTrades=world.social.offers.filter(o=>o.status==='filled'&&(o.makerId===p.id||o.takerId===p.id)).length;
  // The classic fair emits an item debit and a credit payment for one sale. Count only its item receipt.
  const regionalSales=world.social.ledger.filter(l=>l.currency==='item'&&l.from===p.id&&l.to==='npc-season'&&l.reason==='Productos entregados al encargo finito'&&l.amount>0&&l.at<=now).length;
  const caravanSales=(p.habitable?.commerce?.contracts??[]).filter(c=>c.status==='completed'&&c.paidAt!==undefined&&c.paidAt<=now&&c.escrow===0&&c.quantity>0&&(c.deliveredUnits??0)>=c.quantity&&c.price>0).length,npcSales=regionalSales+caravanSales;
  const stats={gathered:Math.max(nonnegative(p.stats.gathered),extracted),crafted:Math.max(nonnegative(p.stats.crafted),crafted),explored:Math.max(nonnegative(p.stats.explored),completed.filter(j=>j.kind==='survey').length,p.surveyed.length),farms:Math.max(nonnegative(p.stats.farms),completed.filter(j=>j.kind==='farm').length),regionsVisited:new Set(p.visitedRegions).size,trades:Math.max(nonnegative(p.stats.trades),marketTrades)+npcSales,marketTrades,npcSales};
  return{playerId:p.id,stats,orders:{total:jobs.length,active:jobs.filter(j=>j.status==='running'||j.status==='reserved').length,completed:completed.length,cancelled:jobs.filter(j=>j.status==='cancelled').length},foundation:[
    {id:'found',label:'Fundar una estación',done:true,detail:'Tu estación y su parcela están registradas.'},
    {id:'survey',label:'Completar una prospección',done:stats.explored>0,detail:stats.explored>0?'Hay una prospección resuelta de este explorador.':'Revisa un sector y completa su prospección; explorar el planeta visual no cuenta como esta orden.'},
    {id:'craft',label:'Fabricar un producto',done:stats.crafted>0,detail:stats.crafted>0?'Fabricación completada en la Estación o una instalación propia.':'Completa una receta real; las reservas y los trabajos pendientes todavía no cuentan.'},
    {id:'region',label:'Visitar otra región',done:stats.regionsVisited>1,detail:stats.regionsVisited>1?'Tu expedición registró la visita a otra región.':'Viaja con la expedición a otra región económica; mover la cámara no traslada al explorador.'},
    {id:'trade',label:'Completar un intercambio',done:stats.trades>0,detail:stats.trades>0?regionalSales>0?caravanSales>0?'Incluye ventas pagadas por la Feria regional y Valleverde.':'Incluye una venta entregada y pagada por la Feria regional.':caravanSales>0?'Incluye la venta entregada y pagada por Valleverde.':'Hay un intercambio resuelto de este explorador.':'Entrega una operación comercial; aceptar o enviar la carreta todavía no equivale a cobrar.'},
  ]};
}
/** Resolved history belongs to the selected explorer, not every profile sharing its account. */
export function getPlayerReports(world:MvpWorld,p:Player,now:number):PlayerReportView[] {
  const battles=Object.values(world.battles).filter(b=>b.status==='resolved'&&(b.attackerId===p.id||b.targetId===p.id||world.jobs[b.jobId]?.payload.defenderPlayerId===p.id)),battleJobs=new Set(battles.map(b=>b.jobId));
  const reports:PlayerReportView[]=Object.values(world.jobs).filter(j=>j.playerId===p.id&&(j.status==='completed'||j.status==='cancelled')&&!battleJobs.has(j.id)).map(j=>{
    const explicit=(j as Job&{completedAt?:number}).completedAt,at=j.status==='cancelled'?j.createdAt:typeof explicit==='number'&&Number.isFinite(explicit)?explicit:j.endsAt;
    return{id:`job:${j.id}`,playerId:p.id,source:'job' as const,jobId:j.id,kind:j.kind,title:jobTitles[j.kind],status:j.status,at,dateKind:j.status==='cancelled'?'created' as const:'completed' as const,lines:j.report.length?[...j.report]:[j.status==='cancelled'?'Orden cancelada. No se registra un resultado de producción.':`${jobTitles[j.kind]} completada. El registro histórico no contiene un informe detallado.`]};
  });
  for(const battle of battles)reports.push({id:`battle:${battle.id}`,playerId:p.id,source:'battle',jobId:battle.jobId,battleId:battle.id,kind:'battle',title:battle.npc?'Encuentro NPC':battle.targetOutpostId?'Disputa territorial':'Disputa de convoy',status:'resolved',at:battle.resolvedAt??world.jobs[battle.jobId]?.endsAt??now,dateKind:'completed',lines:battle.report.length?[...battle.report]:['Encuentro resuelto sin informe detallado.']});
  return reports.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
}
