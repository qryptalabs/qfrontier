import {settleDueTavernSupplies} from './tavern-settlement.ts';
import {loadTavernSupply,dispatchTavernSupply,settleTavernSupply,tavernUnloading} from './city-tavern.ts';
import {startShopHandling,settleShopHandling,shopHandlingBusy,cityWorkerBusy} from './city-shop-handling.ts';
import {completeShopCollection} from './city-shop-transfers.ts';
import {authorizeShopProduction,packShopProduction} from './city-shop-production.ts';
import {activeShopContract,settleShopLoading,refreshShopProduction} from './city-shop-production-data.ts';
import {settleMvpPlayer} from './engine.ts';
import {addLots,consume,emit,integer,MvpError,nextLotId} from './helpers.ts';
import {nextSocialId} from './operation-ids.ts';
import {SHOP_GOODS,goodItem,newCityShop,newPlayerShop,shopAtHome,shopPresence,shopRig,shopSnapshot,shopGood,shopGoods,type ShopCity,type ShopGood,type ShopAssetKind} from './city-shop.ts';
import {executeShopCommerce} from './city-shop-commerce.ts';
import {SHOP_SITES} from '../graphics/city-shop-sites.ts';
import type {MvpStore} from './store.ts';
import type {MvpWorld,Player} from './types.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=['shop.tavern-load','shop.tavern-deliver','shop.collect-crew','shop.deliver-crew','shop.sell-crew','shop.buy','shop.collect','shop.sell','shop.load','shop.unload','shop.hitch','shop.park','shop.accept','shop.deliver','shop.cancel','shop.route','shop.stop','shop.resume','shop.prepare','shop.pack'];
function actor(w:MvpWorld,owner:string,id:unknown){if(typeof owner!=='string'||!owner||owner.length>256)throw new MvpError('Inicia sesión.',401);const p=typeof id==='string'&&Object.hasOwn(w.players,id)?w.players[id]:null;if(!p||p.ownerId!==owner)throw new MvpError('Ese explorador no pertenece a tu cuenta.',403);return p;}
const fingerprint=async(v:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(n=>n.toString(16).padStart(2,'0')).join('');
function requireStill(p:Player,now:number){if(p.habitable?.exploration?.movement&&p.habitable.exploration.movement.endsAt>now||p.habitable?.movement&&p.habitable.movement.endsAt>now)throw new MvpError('Detén el recorrido antes de operar en la tienda.',409);}
export async function readCityShop(store:MvpStore,owner:string,id:string|undefined,now=Date.now(),city:ShopCity='corona-del-alba'){let r=await store.read();if(!r)throw new MvpError('Abre primero tu partida.',409);actor(r.world,owner,id);r=await settleDueTavernSupplies(store,r,owner,id!,now);const selected=actor(r.world,owner,id);if(selected.shop?.contracts?.some(c=>c.tavern&&c.tavern.paidAt===undefined&&c.tavern.schedule.deliversAt<=now)||activeShopContract(selected)?.production||selected.shop?.handling&&selected.shop.handling.completedAt===undefined){await settleMvpPlayer(store,owner,selected.id,now);r=(await store.read())!;}return shopSnapshot(r.world,actor(r.world,owner,id),r.revision,now,city);}
function execute(w:MvpWorld,p:Player,c:Record<string,unknown>,requestId:string,now:number){
 if(tavernUnloading(p,now)||shopHandlingBusy(p,now))throw new MvpError('Espera a que el trabajador termine la carga o descarga y regrese al almacén.',409);
 const loader=activeShopContract(p)?.production?.loading;if(loader&&loader.crew.endsAt>now)throw new MvpError('Espera la carga y el regreso del transportista antes de cambiar tu equipo, recursos o pedido.',409);
 settleShopLoading(p,now);refreshShopProduction(p,now);if(c.type==='shop.prepare'){authorizeShopProduction(w,p,now);return;}if(c.type==='shop.pack'){packShopProduction(w,p,now);return;}
 if(c.type!=='shop.stop')requireStill(p,now);if(c.type==='shop.tavern-load'){loadTavernSupply(p,now);return;}if(c.type==='shop.tavern-deliver'){dispatchTavernSupply(w,p,now);return;}const city=(c.cityId??'corona-del-alba') as ShopCity;if(!Object.hasOwn(SHOP_SITES,city))throw new MvpError('Tienda no válida.');const presence=shopPresence(p,now,city),home=shopAtHome(p,now),type=String(c.type);if(type.endsWith('-crew')){startShopHandling(w,p,c,requestId,city,now);return;}if(type==='shop.sell'&&cityWorkerBusy(w,city,now,p.id))throw new MvpError('Espera a que termine la recepción de mercancías en esta tienda.',409);if(['shop.accept','shop.deliver','shop.cancel','shop.route','shop.stop','shop.resume'].includes(type)){executeShopCommerce(w,p,c,requestId,now,city);return;}
 const good=typeof c.good==='string'&&Object.hasOwn(SHOP_GOODS,c.good)?c.good as ShopGood:null;
 if(['shop.buy','shop.sell'].includes(type)&&(!presence.counter||shopRig(p)))throw new MvpError('Acércate al mostrador con tu personaje real y a pie.',409);
 if(['shop.collect','shop.hitch'].includes(type)&&!presence.pickup)throw new MvpError('Acércate al patio de recogida con tu personaje real.',409);
 if(['shop.load','shop.unload'].includes(type)&&!home)throw new MvpError('Regresa a tu aldea para cargar o descargar su almacén.',409);
 if(type==='shop.park'&&!presence.pickup&&!home)throw new MvpError('Estaciona en el patio de la tienda o en tu aldea.',409);
 if(['shop.buy','shop.sell','shop.load'].includes(type)&&!good)throw new MvpError('Selecciona un producto del catálogo.');
 p.shop??=newPlayerShop();const s=p.shop;
 if(type==='shop.buy'){
   if(!shopGoods(city).includes(good!))throw new MvpError('Este producto no se vende en esta ciudad.',409);const g=shopGood(city,good!),qty=integer(c.qty,'Unidades',1,g.kind==='resource'?20:1),account=w.social.accounts[p.id];
   if(!account||!Number.isSafeInteger(account.credits)||account.credits<g.price*qty)throw new MvpError('No tienes suficientes créditos disponibles. Los créditos del tutorial no se gastan aquí.',409);
   if(s.orders.filter(o=>o.collectedAt===undefined).length>=12)throw new MvpError('Recoge tus compras pendientes antes de reservar más mercancía.',409);
   if(g.kind!=='resource'&&s.assets.length>=6)throw new MvpError('Tu registro inicial permite seis animales y vehículos.',409);
   const shop=w.cityShops?.[city]??newCityShop(now,w.seasonId,city);if(shop.stock[good!]<qty)throw new MvpError('El producto está agotado. No se cobró la compra.',409);
   const cost=g.price*qty;if(!Number.isSafeInteger(shop.credits+cost))throw new MvpError('El saldo de la tienda requiere revisión.',503);
   shop.stock[good!]-=qty;shop.credits+=cost;account.credits-=cost;w.cityShops??={};w.cityShops[city]=shop;
   const id='shop:'+p.id+':'+requestId,itemId=goodItem(good!),lots:Player['inventory']=[];
   if(itemId){let remaining=qty;for(const lot of shop.lots[good!]??[]){if(remaining<=0)break;if(lot.expiresAt!==null&&lot.expiresAt<=now)continue;const amount=Math.min(remaining,lot.qty);lots.push({...structuredClone(lot),originLotId:lot.originLotId??lot.id,id:nextLotId(p),qty:amount,location:id});lot.qty-=amount;remaining-=amount;}if(remaining)throw new MvpError('Las existencias disponibles cambiaron. Actualiza el catálogo.',409);shop.lots[good!]=(shop.lots[good!]??[]).filter(l=>l.qty>0);}
   const assetId=itemId?undefined:'asset:'+p.id+':'+requestId;if(assetId)s.assets.push({id:assetId,kind:good as ShopAssetKind,cityId:city,acquiredAt:now,collected:false,health:100,condition:100});
   s.orders.push({id,cityId:city,good:good!,qty,price:cost,at:now,lots,...(assetId?{assetId}:{})});s.orders=s.orders.filter(o=>o.collectedAt===undefined||s.orders.indexOf(o)>=s.orders.length-48);
   w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount:cost,from:p.id,to:'npc:'+city+':shop',reason:`Compra en Suministros del Alba: ${qty} ${g.name}`});p.stats.trades++;emit(w,p,now,`Reservó ${qty} ${g.name.toLowerCase()} en Suministros del Alba por ${cost} CR. Recogida en el patio.`);
 }else if(type==='shop.collect'){
   const order=s.orders.find(o=>o.id===c.orderId);if(!order||order.collectedAt!==undefined||(order.cityId??'corona-del-alba')!==city)throw new MvpError('La compra ya fue recogida o no pertenece a tu explorador.',409);
   if(s.cargo.reduce((n,l)=>n+l.qty,0)+order.lots.reduce((n,l)=>n+l.qty,0)>(shopRig(p)?.capacity??20))throw new MvpError('La carga supera tu capacidad. Descarga o engancha un vehículo antes de recogerla.',409);
   completeShopCollection(w,p,order.id,city,now);
 }else if(type==='shop.hitch'){
   if(s.hitch)throw new MvpError('Estaciona el equipo actual antes de cambiarlo.',409);
   const animal=s.assets.find(a=>a.id===c.animalId&&a.cityId===city&&a.collected&&a.health>0&&['horse','mule'].includes(a.kind)),vehicle=s.assets.find(a=>a.id===c.vehicleId&&a.cityId===city&&a.collected&&a.condition>0&&['cart','carriage','wagon'].includes(a.kind));
   if(!animal||!vehicle||vehicle.kind==='carriage'&&animal.kind!=='horse')throw new MvpError('Necesitas un animal de tiro y un vehículo recogidos y compatibles.',409);
   s.hitch={animalId:animal.id,vehicleId:vehicle.id};emit(w,p,now,`Enganchó su ${SHOP_GOODS[animal.kind].name.toLowerCase()} a su ${SHOP_GOODS[vehicle.kind].name.toLowerCase()}.`);
 }else if(type==='shop.park'){
   if(s.cargo.reduce((n,l)=>n+l.qty,0)>20)throw new MvpError('Descarga primero: llevas más de 20 unidades.',409);if(s.hitch&&presence.pickup)for(const a of s.assets)if(a.id===s.hitch.animalId||a.id===s.hitch.vehicleId)a.cityId=city;delete s.hitch;
 }else if(type==='shop.unload'){
   if(!s.cargo.length)throw new MvpError('No llevas recursos para descargar.',409);addLots(p,s.cargo.map(l=>({...l,location:'station'})));s.cargo=[];emit(w,p,now,'Descargó en su aldea los recursos transportados desde la tienda.');
 }else{
   const qty=integer(c.qty,'Unidades',1,20),itemId=goodItem(good!);if(!itemId)throw new MvpError('Este producto no es un recurso transportable.');
   const eligible=(type==='shop.load'?p.inventory:s.cargo).filter(l=>l.itemId===itemId&&!l.bound&&(l.expiresAt===null||l.expiresAt>now)&&(type!=='shop.load'||l.location==='station'));
   if(eligible.reduce((n,l)=>n+l.qty,0)<qty)throw new MvpError(type==='shop.load'?'No tienes esas unidades transferibles en tu aldea.':'No llevas esas unidades en la carga.',409);
   if(type==='shop.load'&&s.cargo.reduce((n,l)=>n+l.qty,0)+qty>(shopRig(p)?.capacity??20))throw new MvpError('No queda espacio en tu carga.',409);
   const ids=new Set(eligible.map(l=>l.id)),holder={...p,inventory:structuredClone(eligible)},taken=consume(holder,itemId,qty,now,{tradeableOnly:true});p.lotSequence=holder.lotSequence;
   if(type==='shop.load'){p.inventory=[...p.inventory.filter(l=>!ids.has(l.id)),...holder.inventory];s.cargo.push(...taken.map(l=>({...l,location:'shop-cargo:'+p.id})));}
   else{if(!shopGoods(city).includes(good!))throw new MvpError('Esta tienda no compra ese recurso.',409);const shop=w.cityShops?.[city];const amount=shopGood(city,good!).sell*qty;if(!shop||shop.credits<amount||shop.stock[good!]+qty>SHOP_GOODS[good!].opening*2)throw new MvpError('La tienda no puede recibir esta venta por ahora.',409);const account=w.social.accounts[p.id];if(!account||!Number.isSafeInteger(account.credits+amount))throw new MvpError('El saldo necesita revisión.',503);s.cargo=[...s.cargo.filter(l=>!ids.has(l.id)),...holder.inventory];shop.lots[good!]??=[];shop.lots[good!]!.push(...taken.map(l=>({...l,location:'shop:'+city})));shop.stock[good!]+=qty;shop.credits-=amount;account.credits+=amount;w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount,from:'npc:'+city+':shop',to:p.id,itemId,reason:`Venta física en Suministros del Alba: ${qty} ${SHOP_GOODS[good!].name}`});p.stats.trades++;emit(w,p,now,`Vendió ${qty} ${SHOP_GOODS[good!].name.toLowerCase()} de su carga en Suministros del Alba.`);}
 }
}
export async function executeCityShop(store:MvpStore,owner:string,input:unknown,now=Date.now()){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new MvpError('Operación inválida.');const b=input as Record<string,unknown>,c=b.command as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['requestId','expectedRevision','command'].includes(k))||typeof b.requestId!=='string'||!UUID.test(b.requestId)||!c||typeof c!=='object'||Array.isArray(c)||!TYPES.includes(String(c.type)))throw new MvpError('Operación de tienda no válida.');
 const fields:Record<string,string[]>={'shop.tavern-load':[],'shop.tavern-deliver':[],'shop.collect-crew':['orderId'],'shop.deliver-crew':[],'shop.sell-crew':['good','qty'],'shop.buy':['good','qty'],'shop.sell':['good','qty'],'shop.load':['good','qty'],'shop.collect':['orderId'],'shop.hitch':['animalId','vehicleId'],'shop.park':[],'shop.unload':[],'shop.accept':['request'],'shop.deliver':[],'shop.cancel':[],'shop.route':[],'shop.stop':[],'shop.resume':[],'shop.prepare':[],'shop.pack':[]};
 if(Object.keys(c).some(k=>!['type','playerId','cityId',...fields[String(c.type)]].includes(k)))throw new MvpError('La operación contiene campos no válidos.');
 const city=(c.cityId??'corona-del-alba')as ShopCity;if(typeof city!=='string'||!Object.hasOwn(SHOP_SITES,city))throw new MvpError('Tienda no válida.');integer(b.expectedRevision,'Revisión',0,Number.MAX_SAFE_INTEGER);const hash=await fingerprint(c),receipt=owner+':'+b.requestId;
 for(let i=0;i<8;i++){const r=await store.read();if(!r)throw new MvpError('Abre primero tu partida.',409);const p=actor(r.world,owner,c.playerId),old=r.world.receipts[receipt];if(old){if(old!==hash)throw new MvpError('Identificador utilizado en otra operación.',409);return shopSnapshot(r.world,p,r.revision,now,city);}if(r.revision!==b.expectedRevision)throw new MvpError('El estado cambió. Actualiza el catálogo y confirma otra vez.',409);const next=structuredClone(r.world),buyer=actor(next,owner,c.playerId);for(const a of Object.values(next.players))if(a.id===buyer.id||a.shop?.handling?.cityId===city)settleShopHandling(next,a,now);for(const a of Object.values(next.players))settleTavernSupply(next,a,now);execute(next,buyer,c,b.requestId,now);next.receipts[receipt]=hash;if(await store.compareAndSwap(r.revision,next,{ownerId:owner,playerId:buyer.id,now}))return shopSnapshot(next,buyer,r.revision+1,now,city);}
 throw new MvpError('La tienda está ocupada. Comprueba la operación pendiente antes de repetirla.',503);
}
