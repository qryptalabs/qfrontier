import type {InventoryLot,MvpWorld,Player} from './types.ts';
import type {LandCrewSchedule} from './land-grid.ts';
import type {HabitableWorkerVisual} from './habitable-data.ts';

export interface ShopProductionPlan {
  planId:string;shedId:string;authorizedAt:number;
  reservations:{lotId:string;qty:number}[];
  loading?:{residentId:string;crew:LandCrewSchedule;cargo:InventoryLot[];loadedAt?:number};
}
export const activeShopContract=(p:Player)=>(p.shop?.contracts??[]).find(c=>c.deliveredAt===undefined&&c.cancelledAt===undefined);
export const commercialLot=(l:InventoryLot,now:number)=>!l.bound&&l.qty>0&&(l.expiresAt===null||l.expiresAt>now)&&!l.provenance.source.includes('finite-opening-stock');
export function reservedShopLot(p:Player,shedId:string,lotId:string,now:number):number {
  const c=activeShopContract(p),s=c?.production;if(!s||s.shedId!==shedId||s.loading)return 0;
  const lot=p.habitable?.buildings.find(b=>b.id===shedId)?.storage?.find(l=>l.id===lotId&&l.itemId==='plank'&&commercialLot(l,now));
  return lot?Math.min(lot.qty,s.reservations.filter(r=>r.lotId===lot.id).reduce((n,r)=>n+r.qty,0)):0;
}
/** Only explicit authorizations acquire holds. Build holds and configured floors win. */
export function refreshShopProduction(p:Player,now:number):void {
  const c=activeShopContract(p),s=c?.production,m=p.habitable?.manager;if(!c||!s||s.loading)return;
  if(!m||m.id!==s.planId||m.supplyShedId!==s.shedId){s.reservations=[];return;}
  const shed=p.habitable!.buildings.find(b=>b.id===s.shedId),lots=(shed?.storage??[]).filter(l=>l.itemId==='plank'&&commercialLot(l,now)).sort((a,b)=>(a.expiresAt??Infinity)-(b.expiresAt??Infinity)||a.id.localeCompare(b.id));
  const carried=(p.shop?.cargo??[]).filter(l=>l.itemId==='plank'&&commercialLot(l,now)).reduce((n,l)=>n+l.qty,0);
  let left=Math.max(0,2-carried),floor=m.reserves?.plank??0;const rows:{lotId:string;qty:number}[]=[];
  for(const lot of lots){const builds=m.reserveBuildMaterials?m.approvals.filter(a=>a.status==='approved').flatMap(a=>a.materialReservations??[]).filter(r=>r.lotId===lot.id).reduce((n,r)=>n+r.qty,0):0;let free=Math.max(0,lot.qty-builds);const protectedUnits=Math.min(floor,free);floor-=protectedUnits;free-=protectedUnits;const qty=Math.min(left,free);if(qty){rows.push({lotId:lot.id,qty});left-=qty;}if(!left)break;}
  if(JSON.stringify(s.reservations)!==JSON.stringify(rows))s.reservations=rows;
}
export function shopProductionNeed(w:MvpWorld,p:Player,now:number){
  const c=activeShopContract(p),s=c?.production,m=p.habitable?.manager;if(!c||c.request!=='granary'||c.seasonId!==w.seasonId||!s||s.loading||!m||m.id!==s.planId||m.supplyShedId!==s.shedId)return null;
  const held=s.reservations.reduce((n,r)=>n+reservedShopLot(p,s.shedId,r.lotId,now),0),cargo=(p.shop?.cargo??[]).filter(l=>l.itemId==='plank'&&commercialLot(l,now)).reduce((n,l)=>n+l.qty,0);
  const incoming=p.habitable!.buildings.reduce((n,b)=>{const j=b.operation?w.jobs[b.operation.jobId]:undefined;if(j?.payload.shopContractId!==c.id||j.status==='cancelled')return n;
    if(j.status==='running'||j.status==='reserved')return n+1;
    return n+(b.pending??[]).filter(l=>l.itemId==='plank'&&commercialLot(l,now)).reduce((a,l)=>a+l.qty,0)+(b.shipment?.depositedAt===undefined?b.shipment?.cargo.filter(l=>l.itemId==='plank'&&commercialLot(l,now)).reduce((a,l)=>a+l.qty,0)??0:0);
  },0);
  return{contractId:c.id,held,cargo,incoming,missing:Math.max(0,2-held-cargo-incoming)};
}
export function shopLoaderReserved(p:Player,id:string,now:number){const l=activeShopContract(p)?.production?.loading;return!!l&&l.residentId===id&&now<l.crew.endsAt;}
export function shopLoadingWorker(p:Player,now:number):HabitableWorkerVisual|null {const s=activeShopContract(p)?.production,l=s?.loading;if(!s||!l||now>=l.crew.endsAt)return null;return{id:l.residentId,buildingId:s.shedId,role:'worker',stand:{...l.crew.legs[0].points[0]},yaw:0,startsAt:l.crew.startsAt,workEndsAt:l.crew.endsAt,pendingUnits:0,blockedReason:null,crew:structuredClone(l.crew)};}
export function settleShopLoading(p:Player,now:number):void {
  const s=activeShopContract(p)?.production,l=s?.loading;if(!l||l.loadedAt!==undefined)return;const at=l.crew.legs.find(a=>a.phase==='unloading')!.endsAt;if(at>now)return;
  p.shop!.cargo.push(...l.cargo.map(a=>({...a,location:'shop-cargo:'+p.id})));l.cargo=[];l.loadedAt=at;
}
export function shopProductionView(w:MvpWorld,p:Player,now:number){
  const c=activeShopContract(p),s=c?.production,m=p.habitable?.manager,need=shopProductionNeed(w,p,now),l=s?.loading;
  if(!s)return{authorized:false as const,canAuthorize:c?.request==='granary'&&!!m,reason:!m?'Configura primero el encargado y su cobertizo en Recorrer.':null};
  const held=need?.held??0,cargo=(p.shop?.cargo??[]).filter(a=>a.itemId==='plank'&&commercialLot(a,now)).reduce((n,a)=>n+a.qty,0),loading=!!l&&l.loadedAt===undefined;
  const phase=loading?'loading':cargo>=2?'loaded':held+cargo>=2?'ready':!m||m.id!==s.planId?'plan-changed':m.status!=='active'?'paused':need?.incoming?'producing':'waiting';
  return{authorized:true as const,planId:s.planId,shedId:s.shedId,held,incoming:(need?.incoming??0)+(loading?l!.cargo.reduce((n,a)=>n+a.qty,0):0),missing:loading?0:Math.max(0,2-held-cargo-(need?.incoming??0)),cargo,phase,loadEndsAt:l?.crew.legs.find(a=>a.phase==='unloading')?.endsAt??null,
    reason:phase==='plan-changed'?'El plan cambió. Vuelve a autorizar este pedido desde tu aldea.':phase==='paused'?'El turno no está activo. Autoriza otro turno con sus límites originales.':phase==='ready'?'Carga lista en el cobertizo. Pausa el encargado y espera el regreso del transportista para cargar.':phase==='loading'?'Un habitante lleva los tablones reales hasta el punto de carga.':phase==='loaded'?'Los tablones ya están en tu carga; viaja al destino para entregar.':m?.blockedReason??'El encargado preparará sólo los tablones que faltan, con insumos transferibles.'};
}
