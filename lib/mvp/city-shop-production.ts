import {activeShopContract,commercialLot,refreshShopProduction,settleShopLoading,reservedShopLot} from './city-shop-production-data.ts';
import {refreshManagerMaterialReservations} from './habitable-manager-reservations.ts';
import {habitableResidentBusy} from './habitable-residents.ts';
import {habitableBuildingEntrance,habitablePath,habitablePositionAt} from './habitable-data.ts';
import {guardHabitableWorkerMovement,habitableWorkerObstacles} from './habitable-logistics.ts';
import {emit,MvpError,nextLotId} from './helpers.ts';
import {shopAtHome,shopRig} from './city-shop.ts';
import type {MvpWorld,Player,InventoryLot} from './types.ts';
import type {LandCrewLeg} from './land-grid.ts';

/** Player consent attaches one finite existing contract to an existing bounded plan. */
export function authorizeShopProduction(w:MvpWorld,p:Player,now:number){
 const c=activeShopContract(p),m=p.habitable?.manager;if(!shopAtHome(p,now)||!c||c.request!=='granary'||c.seasonId!==w.seasonId)throw new MvpError('Autoriza desde tu aldea el pedido activo de tablones para el granero.',409);
 if(!m)throw new MvpError('Configura primero el encargado de producción y su cobertizo.',409);
 if(c.production?.loading)throw new MvpError('La carga ya fue preparada. Entrega o cancela el encargo cuando regrese su transportista.',409);
 const b=p.habitable!.buildings.find(b=>b.id===m.supplyShedId&&b.templateId==='shed');if(!b||b.endsAt>now||b.demolition)throw new MvpError('El cobertizo del plan debe estar terminado y disponible.',409);
 c.production={planId:m.id,shedId:b.id,authorizedAt:now,reservations:[]};refreshManagerMaterialReservations(p,m,now);if(m.status==='active')m.nextAt=now+1;
 emit(w,p,now,'Autorizó al encargado a preparar el pedido del granero con sus límites de turno y materiales transferibles.');
}
export function packShopProduction(w:MvpWorld,p:Player,now:number){
 settleShopLoading(p,now);const c=activeShopContract(p),s=c?.production,m=p.habitable?.manager,h=p.habitable;
 if(!shopAtHome(p,now)||!c||!s||!h||!m||m.id!==s.planId)throw new MvpError('Carga desde tu aldea el pedido autorizado en el plan actual.',409);
 if(s.loading)throw new MvpError('El pedido ya tiene una carga registrada.',409);
 refreshManagerMaterialReservations(p,m,now);refreshShopProduction(p,now);
 const carried=(p.shop?.cargo??[]).filter(l=>l.itemId==='plank'&&commercialLot(l,now)).reduce((n,l)=>n+l.qty,0),amount=Math.max(0,2-carried),shed=h.buildings.find(b=>b.id===s.shedId);
 if(!amount)throw new MvpError('Ya llevas los tablones necesarios.',409);
 if(!shed||shed.demolition||s.reservations.reduce((n,r)=>n+reservedShopLot(p,s.shedId,r.lotId,now),0)<amount)throw new MvpError('Espera los tablones transferibles reservados en el cobertizo; se respetan obras y mínimos.',409);
 if(p.shop!.cargo.reduce((n,l)=>n+l.qty,0)+amount>(shopRig(p)?.capacity??20))throw new MvpError('No queda capacidad en la carga.',409);
 const r=h.workforce?.residents.find(r=>!r.assignment&&!habitableResidentBusy(w,p,r,now));if(!r)throw new MvpError('Necesitas un habitante libre. Pausa el encargado y espera el regreso de su transportista, o libera otro habitante.',409);
 const origin={...r.position},entry=habitableBuildingEntrance(h,shed),hero=habitablePositionAt(h,now),extra=habitableWorkerObstacles(w,p,now,undefined,true,r.id);extra.push({id:'avatar',...hero,width:.85,depth:.85});
 const approach=entry?habitablePath(h,origin,entry,extra):null;let route:ReturnType<typeof habitablePath>=null;
 for(const [dx,dy]of [[1.25,0],[-1.25,0],[0,1.25],[0,-1.25]]){const candidate=entry?habitablePath(h,entry,{x:hero.x+dx,y:hero.y+dy},extra):null;if(candidate){route=candidate;break;}}
 if(!approach||!route)throw new MvpError('No hay un camino libre del transportista al cobertizo y a tu punto de carga. Aparta al personaje y despeja los accesos.',409);
 const ms=(pts:readonly{x:number;y:number}[])=>Math.max(500,Math.ceil(pts.slice(1).reduce((n,b,i)=>n+Math.hypot(b.x-pts[i].x,b.y-pts[i].y),0)/1.6*1000));
 const back=[...route].reverse().concat([...approach].reverse().slice(1)),legs:LandCrewLeg[]=[];let cursor=now;
 const leg=(phase:LandCrewLeg['phase'],points:{x:number;y:number}[],duration:number,cargoUnits=0)=>{legs.push({phase,points,startsAt:cursor,endsAt:cursor+duration,cargoUnits});cursor+=duration;};
 leg('outbound',approach,ms(approach));leg('loading',[entry!,entry!],3000);leg('between',route,ms(route),amount);leg('unloading',[route.at(-1)!,route.at(-1)!],2500,amount);leg('returning',back,ms(back));
 for(const l of legs)guardHabitableWorkerMovement(w,p,{points:l.points,startsAt:l.startsAt,endsAt:l.endsAt},r.id);
 const cargo:InventoryLot[]=[];let left=amount;for(const a of s.reservations){const l=shed.storage!.find(l=>l.id===a.lotId);if(!l||!commercialLot(l,cursor))continue;const qty=Math.min(left,a.qty,l.qty);if(qty){const taken={...structuredClone(l),qty,location:'shop-loading:'+c.id};if(qty<l.qty){taken.originLotId=l.originLotId??l.id;taken.id=nextLotId(p);}l.qty-=qty;cargo.push(taken);left-=qty;}if(!left)break;}
 if(left)throw new MvpError('Los tablones deben seguir vigentes hasta terminar la carga.',409);
 shed.storage=shed.storage!.filter(l=>l.qty>0);s.reservations=[];s.loading={residentId:r.id,crew:{kind:'transport',legs,startsAt:now,endsAt:cursor},cargo};
 emit(w,p,now,`${r.name} prepara el cargamento del granero: recoge los tablones del cobertizo y los lleva al punto de carga.`);
}
