import {shopHandlingSchedule,type ShopHandlingSchedule} from '../graphics/shop-handling-motion.ts';
import {royalNavigation} from '../graphics/royal-navigation.ts';
import {shopAssetObstacles} from '../graphics/city-shop-layout.ts';
import {completeShopCollection,completeShopDelivery,completeShopSale} from './city-shop-transfers.ts';
import {SHOP_GOODS,TRADE_REQUESTS,shopPresence,shopRig,type ShopCity,type ShopGood} from './city-shop.ts';
import {MvpError,integer,emit} from './helpers.ts';
import type {MvpWorld,Player} from './types.ts';

export interface ShopHandling extends ShopHandlingSchedule {orderId?:string;contractId?:string;good?:ShopGood;qty?:number;transferredAt?:number;completedAt?:number}
export const shopHandlingBusy=(p:Player,now:number)=>!!p.shop?.handling&&p.shop.handling.endsAt>now;
export function cityWorkerBusy(w:MvpWorld,city:ShopCity,now:number,except?:string){return Object.values(w.players).some(p=>p.id!==except&&p.shop?.handling?.cityId===city&&p.shop.handling.completedAt===undefined&&p.shop.handling.endsAt>now);}
export function settleShopHandling(w:MvpWorld,p:Player,now:number){
 const h=p.shop?.handling;if(!h||h.completedAt!==undefined)return;
 if(h.transferredAt===undefined&&h.transfersAt<=now){
  if(h.kind==='collect')completeShopCollection(w,p,h.orderId,h.cityId,h.transfersAt);
  else if(h.kind==='sell')completeShopSale(w,p,h.cityId,h.good!,h.qty!,h.transfersAt);
  else{const c=p.shop!.contracts?.find(c=>c.id===h.contractId);if(!c||c.deliveredAt!==undefined||c.cancelledAt!==undefined)throw new MvpError('El encargo reservado requiere revisión.',409);completeShopDelivery(w,p,c,h.cityId,h.transfersAt);}
  h.transferredAt=h.transfersAt;
 }
 if(h.endsAt<=now)h.completedAt=h.endsAt;
}
/** Time and routes come from the server. No client pose, duration, price or reward. */
export function startShopHandling(w:MvpWorld,p:Player,c:Record<string,unknown>,requestId:string,city:ShopCity,now:number){
 const s=p.shop,rig=shopRig(p);if(!s||!p.royal?.pose||!shopPresence(p,now,city).pickup)throw new MvpError('Acércate con tu personaje al patio de recogida.',409);
 if(!rig)throw new MvpError('Engancha primero un animal y una carreta en el patio.',409);
 if(cityWorkerBusy(w,city,now,p.id))throw new MvpError('El trabajador está atendiendo otro transporte. Espera a que regrese al almacén.',409);
 let units=0,kind:ShopHandling['kind'],orderId:string|undefined,contractId:string|undefined,good:ShopGood|undefined,qty:number|undefined;
 if(c.type==='shop.collect-crew'){
  const order=s.orders.find(o=>o.id===c.orderId&&(o.cityId??'corona-del-alba')===city&&o.collectedAt===undefined);
  if(!order||!order.lots.length||order.assetId)throw new MvpError('Selecciona una compra de recursos pendiente en esta tienda.',409);
  kind='collect';orderId=order.id;units=order.lots.reduce((n,l)=>n+l.qty,0);if(units+s.cargo.reduce((n,l)=>n+l.qty,0)>rig.capacity)throw new MvpError('La carga supera la capacidad de la carreta.',409);
 }else if(c.type==='shop.deliver-crew'){
  const active=s.contracts?.find(c=>c.deliveredAt===undefined&&c.cancelledAt===undefined);if(!active||TRADE_REQUESTS[active.request].destination!==city)throw new MvpError('Necesitas un encargo para esta ciudad.',409);
  kind='deliver';contractId=active.id;units=TRADE_REQUESTS[active.request].qty;
 }else{
  if(typeof c.good!=='string'||!Object.hasOwn(SHOP_GOODS,c.good))throw new MvpError('Selecciona un recurso.');good=c.good as ShopGood;qty=integer(c.qty,'Unidades',1,20);units=qty;kind='sell';
 }
 const pose=p.royal.pose,h:ShopHandling={...shopHandlingSchedule('shop-handling:'+p.id+':'+requestId,kind,city,{x:pose.x,y:pose.y,z:pose.z,yaw:pose.yaw},units,now),...(orderId?{orderId}:{}),...(contractId?{contractId}:{}),...(good?{good,qty}: {})};
 // Validate the whole future transfer on a throwaway world. Nothing is paid,
 // copied or consumed until the worker physically reaches the receiving point.
 const trial=structuredClone(w),actor=trial.players[p.id];actor.shop!.handling=structuredClone(h);settleShopHandling(trial,actor,h.endsAt);
 if(kind==='collect'&&s.orders.find(o=>o.id===orderId)!.lots.some(l=>l.expiresAt!==null&&l.expiresAt<=h.endsAt))throw new MvpError('El pedido debe seguir vigente hasta completar la carga.',409);
 const extra=shopAssetObstacles(s.assets,s.hitch),co=Math.abs(Math.cos(pose.yaw)),si=Math.abs(Math.sin(pose.yaw));
 extra.push({x:pose.x,z:pose.z,halfWidth:1.15*co+1.6*si,halfDepth:1.6*co+1.15*si,minY:pose.y,maxY:pose.y+2.2},{x:pose.x+Math.sin(pose.yaw)*3,z:pose.z+Math.cos(pose.yaw)*3,halfWidth:.45*co+1.25*si,halfDepth:1.25*co+.45*si,minY:pose.y,maxY:pose.y+2.5});
 const nav=royalNavigation(extra);
 for(const leg of h.legs)for(let i=1;i<leg.points.length;i++)if(!nav.line(leg.points[i-1],leg.points[i],leg.points[i].y,.35))throw new MvpError('Despeja el acceso entre el almacén y el costado de la carreta. Estaciónala orientada hacia el camino.',409);
 // The stopped rig remains a physical obstacle; its side, not its centre, is
 // the handoff point. All moving APIs share the same finite handling lock.
 s.handling=h;emit(w,p,now,kind==='collect'?`El trabajador prepara ${units} unidades y las lleva a tu carreta.`:`El trabajador recoge ${units} unidades de tu carreta y las lleva al almacén.`);
}
