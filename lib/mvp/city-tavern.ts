import {consume,emit,MvpError} from './helpers.ts';
import {nextSocialId} from './operation-ids.ts';
import {royalCharacterPresent} from './royal-kingdom.ts';
import {shopAtHome,shopRig} from './city-shop.ts';
import {commercialLot} from './city-shop-production-data.ts';
import {TAVERN_COUNTER,TAVERN_RECEIVING,tavernSupplySchedule,tavernSupplyPose,type TavernSupplySchedule} from '../graphics/tavern-supply-route.ts';
import type {MvpWorld,Player,ItemId} from './types.ts';

export const TAVERN_SUPPLY={grain:4,water:2,reward:20,batches:6} as const;
export interface TavernShipment{schedule:TavernSupplySchedule;paidAt?:number}
export const tavernUnloading=(p:Player,now:number)=>(p.shop?.contracts??[]).some(c=>c.tavern&&now<c.tavern.schedule.unloadedAt);
const orders=(w:MvpWorld)=>Object.values(w.players).flatMap(p=>(p.shop?.contracts??[]).filter(c=>c.request==='tavern'&&c.seasonId===w.seasonId).map(c=>({p,c})));
export const tavernDemandLeft=(w:MvpWorld)=>Math.max(0,TAVERN_SUPPLY.batches-orders(w).filter(({c})=>c.cancelledAt===undefined).length);
export function tavernPresence(p:Player,now:number){const q=p.royal?.pose,real=royalCharacterPresent(p,now);const near=(a:typeof TAVERN_COUNTER)=>!!q&&!!real&&Math.abs(q.y-a.y)<.6&&Math.hypot(q.x-a.x,q.z-a.z)<2.4;return{counter:near(TAVERN_COUNTER)&&!shopRig(p),warehouse:near(TAVERN_RECEIVING)};}
const cargoCount=(p:Player,item:ItemId,now:number)=>(p.shop?.cargo??[]).filter(l=>l.itemId===item&&commercialLot(l,now)).reduce((n,l)=>n+l.qty,0);
export function tavernSnapshot(w:MvpWorld,p:Player,now:number){
 const all=orders(w),c=all.find(o=>o.p.id===p.id&&o.c.cancelledAt===undefined&&o.c.deliveredAt===undefined)?.c;
 const worker=all.map(o=>o.c.tavern?.schedule).filter(s=>s&&s.endsAt>now).sort((a,b)=>a!.startsAt-b!.startsAt)[0]??null;
 const completed=all.filter(o=>o.c.deliveredAt!==undefined).length,near=tavernPresence(p,now);
 return{...near,remaining:tavernDemandLeft(w),batches:completed,target:TAVERN_SUPPLY.batches,grain:completed*TAVERN_SUPPLY.grain,water:completed*TAVERN_SUPPLY.water,
  carriedGrain:cargoCount(p,'grain',now),carriedWater:cargoCount(p,'water',now),worker:worker?structuredClone(worker):null,
  lastPaid:all.filter(o=>o.p.id===p.id&&o.c.tavern?.paidAt!==undefined).sort((a,b)=>b.c.deliveredAt!-a.c.deliveredAt!)[0]?.c.deliveredAt??null,own:c?.tavern?{...structuredClone(c.tavern.schedule),phase:tavernSupplyPose(c.tavern.schedule,now).phase}:null};
}
/** Cargo changes custody now; credits stay in escrow until the tavern receives it. */
export function dispatchTavernSupply(w:MvpWorld,p:Player,now:number){
 const c=p.shop?.contracts?.find(c=>c.request==='tavern'&&c.deliveredAt===undefined&&c.cancelledAt===undefined);
 if(!c||c.seasonId!==w.seasonId||c.tavern)throw new MvpError('Reserva primero el encargo de La Vela Azul; cada cargamento se entrega una sola vez.',409);
 if(!tavernPresence(p,now).warehouse)throw new MvpError('Acércate con tu personaje real a la recepción del Almacén de la Ribera.',409);
 if(Math.hypot(p.royal!.pose!.x-34,p.royal!.pose!.z-154)<1.6)throw new MvpError('Deja libre el acceso del trabajador y sitúate en el centro del muelle, junto al almacén.',409);
 if(orders(w).some(o=>o.c.tavern&&o.c.tavern.schedule.endsAt>now))throw new MvpError('El transportista de la Ribera está ocupado. Espera su regreso.',409);
 const schedule=tavernSupplySchedule(c.id,now);
 for(const [item,qty]of [['grain',4],['water',2]]as const)if(cargoCount(p,item,schedule.deliversAt)<qty)throw new MvpError('Necesitas 4 grano y 2 agua transferibles, vigentes hasta la entrega. Las existencias de apertura y el tutorial no cuentan.',409);
 const eligible=p.shop!.cargo.filter(l=>commercialLot(l,schedule.deliversAt)),ids=new Set(eligible.map(l=>l.id)),holder={...p,inventory:structuredClone(eligible)};
 const lots=[...consume(holder,'grain',4,now,{tradeableOnly:true}),...consume(holder,'water',2,now,{tradeableOnly:true})];p.lotSequence=holder.lotSequence;
 p.shop!.cargo=[...p.shop!.cargo.filter(l=>!ids.has(l.id)),...holder.inventory];c.lots=lots.map(l=>({...l,location:'ribera-warehouse:'+c.id}));c.tavern={schedule};
 emit(w,p,now,'Entregó su cosecha al Almacén de la Ribera. El transportista la llevará a La Vela Azul; el pago sigue reservado.');
}
export function settleTavernSupply(w:MvpWorld,p:Player,now:number){
 for(const c of p.shop?.contracts??[]){const t=c.tavern;if(!t||t.paidAt!==undefined||now<t.schedule.deliversAt)continue;
  const account=w.social.accounts[p.id];if(!account||c.escrow!==TAVERN_SUPPLY.reward||!Number.isSafeInteger(account.credits+c.escrow))throw new MvpError('La entrega de la taberna necesita revisión de su reserva.',503);
  for(const [item,qty]of [['grain',4],['water',2]]as const)if((c.lots??[]).filter(l=>l.itemId===item).reduce((n,l)=>n+l.qty,0)!==qty)throw new MvpError('La carga reservada de la taberna está incompleta.',503);
  const at=t.schedule.deliversAt;for(const lot of c.lots!)lot.location='tavern-pantry:'+c.id;
  account.credits+=c.escrow;w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at,currency:'credits',amount:c.escrow,from:c.id,to:p.id,itemId:'grain',reason:'Abastecimiento recibido: Taberna La Vela Azul'});
  c.escrow=0;c.deliveredAt=at;t.paidAt=at;p.stats.trades++;emit(w,p,at,'La Vela Azul recibió 4 grano y 2 agua de su aldea. Cobró 20 CR por la entrega verificada.');
 }
}
/** Explicit loading protects the manager's configured village reserves. */
export function loadTavernSupply(p:Player,now:number){
 const c=p.shop?.contracts?.find(c=>c.request==='tavern'&&c.deliveredAt===undefined&&c.cancelledAt===undefined);
 if(!shopAtHome(p,now)||!c||c.tavern)throw new MvpError('Carga en tu aldea el encargo reservado de La Vela Azul.',409);
 const sources=[p.inventory,...(p.habitable?.buildings??[]).filter(b=>b.templateId==='shed'&&b.endsAt<=now&&!b.demolition&&!b.upgrade).map(b=>b.storage??[])];
 const needs=([['grain',4],['water',2]]as const).map(([item,qty])=>({item,qty:Math.max(0,qty-cargoCount(p,item,now))}));
 if(!needs.some(n=>n.qty))throw new MvpError('Ya llevas el cargamento necesario.',409);
 if(p.shop!.cargo.reduce((n,l)=>n+l.qty,0)+needs.reduce((n,r)=>n+r.qty,0)>(shopRig(p)?.capacity??20))throw new MvpError('No hay capacidad para el cargamento.',409);
 const holds=new Set((p.habitable?.manager?.approvals??[]).filter(a=>a.status==='approved').flatMap(a=>a.materialReservations??[]).filter(r=>r.qty>0).map(r=>r.lotId));
 const floors=p.habitable?.manager?.reserves as Partial<Record<ItemId,number>>|undefined;
 for(const {item,qty}of needs){const available=sources.flat().filter(l=>l.itemId===item&&!holds.has(l.id)&&commercialLot(l,now)&&(l.location==='station'||l.location.startsWith('shed:')||sources.slice(1).some(s=>s.includes(l)))).reduce((n,l)=>n+l.qty,0);if(available-qty<(floors?.[item]??0))throw new MvpError('Faltan alimentos o agua transferibles después de proteger las reservas mínimas de tu aldea.',409);}
 for(const {item,qty}of needs){let left=qty;for(const source of sources){const eligible=source.filter(l=>l.itemId===item&&!holds.has(l.id)&&commercialLot(l,now)&&(source!==p.inventory||l.location==='station')),amount=Math.min(left,eligible.reduce((n,l)=>n+l.qty,0));if(!amount)continue;const ids=new Set(eligible.map(l=>l.id)),holder={...p,inventory:structuredClone(eligible)},taken=consume(holder,item,amount,now,{tradeableOnly:true});p.lotSequence=holder.lotSequence;source.splice(0,source.length,...source.filter(l=>!ids.has(l.id)),...holder.inventory);p.shop!.cargo.push(...taken.map(l=>({...l,location:'shop-cargo:'+p.id})));left-=amount;if(!left)break;}}
}
