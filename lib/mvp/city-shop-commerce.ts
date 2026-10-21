import {tavernDemandLeft,tavernPresence} from './city-tavern.ts';
import {completeShopDelivery} from './city-shop-transfers.ts';
import {activeShopContract} from './city-shop-production-data.ts';
import {newCityShop} from './city-shop.ts';
import {consume,emit,MvpError} from './helpers.ts';
import {nextSocialId} from './operation-ids.ts';
import {TRADE_REQUESTS,newPlayerShop,shopAtHome,shopPresence,shopRig,type ShopCity,type TradeRequest} from './city-shop.ts';
import {SHOP_SITES,sitePoint} from '../graphics/city-shop-sites.ts';
import {ROYAL_SHOP} from '../graphics/city-shop-layout.ts';
import {shopTradeRoad} from '../graphics/city-shop-route.ts';
import {royalLocalToWorld} from '../graphics/royal-world-location.ts';
import {royalNavigation} from '../graphics/royal-navigation.ts';
import {explorationPositionAt} from './exploration-data.ts';
import {ROYAL_WORLD_ORIGIN} from '../graphics/royal-world-location.ts';
import {compileJourney} from './exploration-network.ts';
import {reserveExplorationJourney} from './exploration-traffic.ts';
import type {MvpWorld,Player} from './types.ts';

export function executeShopCommerce(w:MvpWorld,p:Player,c:Record<string,unknown>,requestId:string,now:number,city:ShopCity){
 const loader=activeShopContract(p)?.production?.loading;if(loader&&loader.crew.endsAt>now)throw new MvpError('Espera a que termine la carga y regrese el transportista.',409);
 const type=String(c.type),presence=shopPresence(p,now,city),home=shopAtHome(p,now);p.shop??=newPlayerShop();const s=p.shop;
 if(type==='shop.stop'){
  const e=p.habitable?.exploration,m=e?.movement;if(!s.trip||!e||!m||m.endsAt<=now||!m.legs?.every(l=>l.routeId==='shop-commercial-camino-real')||!p.royal)throw new MvpError('No hay un viaje comercial activo.',409);
  const pos=explorationPositionAt(e,now),x=pos.x-ROYAL_WORLD_ORIGIN.x,z=pos.y-ROYAL_WORLD_ORIGIN.y;e.position=pos;delete e.movement;delete e.destinationId;p.royal.pose={x,z,y:royalNavigation().surface.walk(x,z)??1.14,yaw:Math.PI,camera:'third',savedAt:now};delete p.royal.journey;p.royal.version++;return;
 }
 if(type==='shop.route'||type==='shop.resume'){
  if(type==='shop.resume'){
   if(!s.trip||!p.habitable?.exploration||!p.royal)throw new MvpError('No hay una ruta comercial que retomar.',409);
  }

  if(type!=='shop.resume'&&!presence.pickup||!p.habitable?.exploration||!p.royal?.pose)throw new MvpError('Acércate al patio para comenzar la ruta comercial.',409);
  if(Object.values(w.jobs).some(j=>j.playerId===p.id&&['running','reserved'].includes(j.status)&&['travel','convoy','expedition','battle'].includes(j.kind)))throw new MvpError('Termina tu otra expedición antes de viajar.',409);
  const departure:ShopCity=type==='shop.resume'?s.trip!.from:city,to:ShopCity=type==='shop.resume'?s.trip!.to:city==='corona-del-alba'?'paso-del-norte':'corona-del-alba',rig=shopRig(p);let pose={...p.royal.pose},road=shopTradeRoad(departure);
  if(type==='shop.resume'){const pos=explorationPositionAt(p.habitable.exploration,now),x=pos.x-ROYAL_WORLD_ORIGIN.x,z=pos.y-ROYAL_WORLD_ORIGIN.y;let best:{index:number;distance:number;x:number;z:number}|null=null;for(let i=1;i<road.length;i++){const a=road[i-1],b=road[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),q={x:a.x+dx*t,z:a.z+dz*t},distance=Math.hypot(x-q.x,z-q.z);if(!best||distance<best.distance)best={...q,index:i,distance};}if(!best||best.distance>6)throw new MvpError('Acércate al Camino Real para retomar la ruta.',409);road=[{x:best.x,z:best.z},...road.slice(best.index)];pose={...pose,x,z,y:royalNavigation().surface.walk(x,z)??pose.y};}
  const first=road[0];
  if(!royalNavigation().line(pose,first,undefined,rig?1.15:.4))throw new MvpError('El acceso al camino está bloqueado. Acércate al centro del patio.',409);
  const points=[royalLocalToWorld(pose.x,pose.z),...road.map(q=>royalLocalToWorld(q.x,q.z))],compiled=compileJourney([{mode:rig?'carriage':'walk',points,routeId:'shop-commercial-camino-real'}],now),speed=rig?.speed??3.5,length=points.slice(1).reduce((n,q,i)=>n+Math.hypot(q.x-points[i].x,q.y-points[i].y),0),end=now+Math.ceil(length/speed*1000);
  compiled.endsAt=end;compiled.legs.forEach(l=>{l.startsAt=now;l.endsAt=end;});const movement=reserveExplorationJourney(w,p,compiled,now);
  if(movement.holds?.some(h=>h.resourceId.startsWith('traffic-blocked:')))throw new MvpError('La ruta está ocupada. Espera antes de salir.',409);
  const e=p.habitable.exploration;e.position={...points[0]};e.movement=movement;e.destinationId=to==='paso-del-norte'?'npc-paso-del-norte':'world-corona-del-alba';delete e.returning;
  s.trip={id:'shop-trip:'+requestId,from:departure,to,startsAt:now,endsAt:movement.endsAt};const goal=sitePoint(to,ROYAL_SHOP.pickup);p.royal.pose={...goal,yaw:Math.PI,camera:pose.camera,savedAt:movement.endsAt};p.royal.journey={direction:'inbound',startsAt:now,endsAt:movement.endsAt};p.royal.version++;
  emit(w,p,now,`Salió por el Camino Real hacia ${SHOP_SITES[to].city}${rig?' con su animal y su vehículo':' a pie'}.`);return;
 }
 const family=Object.values(w.players).filter(a=>a.ownerId===p.ownerId),history=family.flatMap(a=>a.shop?.contracts??[]),active=s.contracts?.find(a=>a.deliveredAt===undefined&&a.cancelledAt===undefined);
 if(type==='shop.accept'){
  if(!home&&!presence.counter&&!tavernPresence(p,now).counter)throw new MvpError('Consulta los encargos desde tu aldea o en el mostrador real.',409);
  if(typeof c.request!=='string'||!Object.hasOwn(TRADE_REQUESTS,c.request))throw new MvpError('Encargo no válido.');
  if(history.some(a=>a.deliveredAt===undefined&&a.cancelledAt===undefined))throw new MvpError('Tu cuenta ya tiene un encargo reservado.',409);
  const season=history.filter(a=>a.seasonId===w.seasonId),today=season.filter(a=>a.deliveredAt!==undefined&&Math.floor(a.deliveredAt/86400000)===Math.floor(now/86400000));
  if(today.length>=3||season.length>=12)throw new MvpError('Límite de encargos: tres entregas por día UTC y doce reservas por cuenta y temporada.',409);
  const request=c.request as TradeRequest,r=TRADE_REQUESTS[request];if(request==='tavern'&&tavernDemandLeft(w)===0)throw new MvpError('La despensa de La Vela Azul ya tiene todos sus abastecimientos reservados o recibidos.',409);if(request==='granary'&&(w.cityShops?.['paso-del-norte']?.granary?.delivered??0)+Object.values(w.players).flatMap(a=>a.shop?.contracts??[]).filter(c=>c.request==='granary'&&c.deliveredAt===undefined&&c.cancelledAt===undefined).length*2>=20)throw new MvpError('La obra del granero ya tiene todos sus tablones entregados o reservados.',409);if(w.social.npc.remaining<r.reward)throw new MvpError('El presupuesto público no alcanza para reservar este encargo.',409);
  w.social.npc.remaining-=r.reward;s.contracts??=[];s.contracts.push({id:'shop-contract:'+p.id+':'+requestId,request,seasonId:w.seasonId,acceptedAt:now,escrow:r.reward});
  w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount:r.reward,from:'npc',to:s.contracts.at(-1)!.id,reason:'Reserva de encargo comercial'});emit(w,p,now,`Reservó «${r.name}»: ${r.qty} unidades para ${SHOP_SITES[r.destination].city}.`);return;
 }
 if(!active)throw new MvpError('No tienes un encargo comercial activo.',409);
 const r=TRADE_REQUESTS[active.request];
 if(type==='shop.cancel'){
  if(active.tavern)throw new MvpError('La carga ya está bajo custodia del almacén. Espera la entrega y el pago; no se puede cancelar dos veces la mercancía.',409);
  if(!home&&!presence.counter&&!presence.pickup&&!tavernPresence(p,now).counter&&!tavernPresence(p,now).warehouse)throw new MvpError('Cancela desde tu aldea, el mostrador o el patio.',409);
  w.social.npc.remaining+=active.escrow;w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount:active.escrow,from:active.id,to:'npc',reason:'Cancelación del encargo comercial'});active.escrow=0;active.cancelledAt=now;return;
 }
 if(active.request==='tavern')throw new MvpError('La Vela Azul recibe sus recursos a través del Almacén de la Ribera. Usa la recepción de ese edificio.',409);
 if(city!==r.destination||!presence.pickup&&!presence.counter)throw new MvpError('Entrega en el patio o mostrador de '+SHOP_SITES[r.destination].name+'.',409);
 completeShopDelivery(w,p,active,city,now);
}
