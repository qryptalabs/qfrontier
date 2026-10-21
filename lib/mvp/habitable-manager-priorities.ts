import type {ItemAmount,ItemId} from './types.ts';

export type ManagerPriority='food'|'construction'|'stock';
export interface ManagerPriorityPlan {priority?:ManagerPriority;goals:{ration:number;plank:number;cloth:number};reserves?:Partial<Record<ItemId,number>>;approvals:readonly {status:string;costs:readonly ItemAmount[]}[]}
export function managerPriorityOrder(priority?:ManagerPriority):ManagerPriority[] {return priority==='construction'?['construction','food','stock']:priority==='stock'?['stock','food','construction']:['food','construction','stock'];}
/** Classifies a real output against physical stock; it does not promise a route or a complete recipe. */
export function classifyManagerDelivery(m:ManagerPriorityPlan,items:readonly ItemAmount[],stock:readonly ItemAmount[]):{priority:ManagerPriority;reason:string} {
  const have=(id:ItemId)=>stock.filter(i=>i.itemId===id).reduce((n,i)=>n+i.qty,0),has=(id:ItemId)=>items.some(i=>i.itemId===id&&i.qty>0),needRation=Math.max(m.goals.ration,m.reserves?.ration??0)>have('ration');
  if(needRation&&(has('ration')||has('grain')||has('seed')||has('nutrient')))return{priority:'food',reason:has('ration')?'Raciones para la existencia de alimentos pendiente.':'Insumos para las raciones pendientes.'};
  const costs=m.approvals.filter(a=>a.status==='approved').flatMap(a=>a.costs),needed=(id:ItemId)=>{const required=costs.filter(i=>i.itemId===id).reduce((n,i)=>n+i.qty,0);return required>0&&required+(m.reserves?.[id]??0)>have(id);};
  if(items.some(i=>needed(i.itemId))||has('timber')&&needed('plank'))return{priority:'construction',reason:has('timber')?'Madera para los tablones de una obra aprobada.':'Materiales para una obra aprobada pendiente.'};
  return{priority:'stock',reason:has('timber')&&m.goals.plank>have('plank')?'Madera para los tablones objetivo.':'Reposición de existencias del cobertizo.'};
}
