import type {InventoryLot,ItemAmount,ItemId,Player} from './types.ts';
import type {HabitableManagerState,ManagerBuildApproval} from './habitable-manager.ts';
import {reservedShopLot,refreshShopProduction} from './city-shop-production-data.ts';

export interface ManagerMaterialAllocation {lotId:string;itemId:ItemId;qty:number}
export interface ManagerBuildReservationView {itemId:ItemId;required:number;reserved:number;missing:number}
const usable=(l:InventoryLot,now:number)=>l.qty>0&&(l.expiresAt===null||l.expiresAt>now);
/** Only explicit opt-in plans have holds. Old plans and reads never acquire storage reservations. */
export function reservedManagerLot(p:Player,shedId:string,lotId:string,now:number,ownApprovalId?:string):number {
  const m=p.habitable?.manager,shop=reservedShopLot(p,shedId,lotId,now);if(!m?.reserveBuildMaterials||m.supplyShedId!==shedId)return shop;
  const lot=p.habitable!.buildings.find(b=>b.id===shedId)?.storage?.find(l=>l.id===lotId);if(!lot||!usable(lot,now))return 0;
  return Math.min(lot.qty,shop+m.approvals.filter(a=>a.status==='approved'&&a.id!==ownApprovalId).flatMap(a=>a.materialReservations??[]).filter(a=>a.lotId===lotId&&a.itemId===lot.itemId).reduce((n,a)=>n+a.qty,0));
}
export function freeManagerLot(p:Player,shedId:string,lot:InventoryLot,now:number,ownApprovalId?:string):number {return usable(lot,now)?Math.max(0,lot.qty-reservedManagerLot(p,shedId,lot.id,now,ownApprovalId)):0;}
export function freeManagerMaterial(p:Player,shedId:string,itemId:ItemId,now:number,ownApprovalId?:string):number {return(p.habitable?.buildings.find(b=>b.id===shedId)?.storage??[]).filter(l=>l.itemId===itemId).reduce((n,l)=>n+freeManagerLot(p,shedId,l,now,ownApprovalId),0);}
export function managerBuildReservationView(p:Player,m:HabitableManagerState,a:ManagerBuildApproval,now:number):ManagerBuildReservationView[] {const shed=p.habitable?.buildings.find(b=>b.id===m.supplyShedId);return a.costs.map(i=>{const reserved=(a.status==='approved'&&m.reserveBuildMaterials?a.materialReservations??[]:[]).filter(v=>v.itemId===i.itemId).reduce((n,v)=>{const l=shed?.storage?.find(l=>l.id===v.lotId&&l.itemId===v.itemId&&usable(l,now));return n+(l?Math.min(l.qty,v.qty):0);},0);return{itemId:i.itemId,required:i.qty,reserved,missing:Math.max(0,i.qty-reserved)};});}
/** Reconciled only during opted-in manager mutations/advances, including after deposits. */
export function refreshManagerMaterialReservations(p:Player,m:HabitableManagerState,now:number):void {
  if(!m.reserveBuildMaterials){for(const a of m.approvals)if(a.materialReservations!==undefined)delete a.materialReservations;refreshShopProduction(p,now);return;}
  const lots=(p.habitable?.buildings.find(b=>b.id===m.supplyShedId)?.storage??[]).filter(l=>usable(l,now)).sort((a,b)=>Number(b.bound)-Number(a.bound)||(a.expiresAt??Infinity)-(b.expiresAt??Infinity)||a.id.localeCompare(b.id)),remaining=new Map(lots.map(l=>[l.id,l.qty])),approvals=[...m.approvals].sort((a,b)=>a.approvedAt-b.approvedAt),kept=new Map<string,ManagerMaterialAllocation[]>();
  // Existing valid holds survive manual free-stock withdrawals and changes to manager-only floors.
  for(const a of approvals){if(a.status!=='approved'){if(a.materialReservations!==undefined)delete a.materialReservations;continue;}const allocations:ManagerMaterialAllocation[]=[];for(const old of a.materialReservations??[]){const lot=lots.find(l=>l.id===old.lotId&&l.itemId===old.itemId),required=a.costs.filter(i=>i.itemId===old.itemId).reduce((n,i)=>n+i.qty,0)-allocations.filter(i=>i.itemId===old.itemId).reduce((n,i)=>n+i.qty,0),amount=lot?Math.min(old.qty,required,remaining.get(lot.id)??0):0;if(amount>0){allocations.push({...old,qty:amount});remaining.set(lot!.id,(remaining.get(lot!.id)??0)-amount);}}kept.set(a.id,allocations);}
  // Only new assignments draw from stock above the configured minima.
  for(const[id,floor]of Object.entries(m.reserves??{})){let left=floor??0;for(const l of [...lots].reverse().filter(l=>l.itemId===id)){const amount=Math.min(left,remaining.get(l.id)??0);remaining.set(l.id,(remaining.get(l.id)??0)-amount);left-=amount;if(!left)break;}}
  for(const a of approvals){if(a.status!=='approved')continue;const allocations=kept.get(a.id)!;for(const input of a.costs){let left=input.qty-allocations.filter(i=>i.itemId===input.itemId).reduce((n,i)=>n+i.qty,0);for(const l of lots.filter(l=>l.itemId===input.itemId)){const amount=Math.min(left,remaining.get(l.id)??0);if(amount>0){const old=allocations.find(v=>v.lotId===l.id);if(old)old.qty+=amount;else allocations.push({lotId:l.id,itemId:l.itemId,qty:amount});remaining.set(l.id,(remaining.get(l.id)??0)-amount);left-=amount;}if(!left)break;}}if(JSON.stringify(a.materialReservations??[])!==JSON.stringify(allocations))a.materialReservations=allocations;}
  refreshShopProduction(p,now);
}
export function managerReservedMaterials(p:Player,shedId:string,now:number):ItemAmount[] {const totals=new Map<ItemId,number>();for(const l of p.habitable?.buildings.find(b=>b.id===shedId)?.storage??[]){const held=reservedManagerLot(p,shedId,l.id,now);if(held)totals.set(l.itemId,(totals.get(l.itemId)??0)+held);}return[...totals].map(([itemId,qty])=>({itemId,qty}));}
