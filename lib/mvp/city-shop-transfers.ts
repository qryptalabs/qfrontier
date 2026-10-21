import {consume,emit,MvpError} from './helpers.ts';
import {nextSocialId} from './operation-ids.ts';
import {SHOP_GOODS,TRADE_REQUESTS,newCityShop,shopGood,shopGoods,type ShopCity,type ShopContract,type ShopGood} from './city-shop.ts';
import {SHOP_SITES} from '../graphics/city-shop-sites.ts';
import type {MvpWorld,Player} from './types.ts';

export function completeShopCollection(w:MvpWorld,p:Player,orderId:unknown,city:ShopCity,now:number){
 const s=p.shop!,order=s.orders.find(o=>o.id===orderId);if(!order||order.collectedAt!==undefined||(order.cityId??'corona-del-alba')!==city)throw new MvpError('La compra ya fue recogida o no pertenece a tu explorador.',409);
 s.cargo.push(...order.lots.map(l=>({...l,location:'shop-cargo:'+p.id})));order.lots=[];order.collectedAt=now;
 if(order.assetId){const asset=s.assets.find(a=>a.id===order.assetId);if(!asset)throw new MvpError('Falta el registro de la compra.',503);asset.collected=true;}
 emit(w,p,now,`Recogió ${order.qty} ${SHOP_GOODS[order.good].name.toLowerCase()} en el patio de la tienda.`);
}
export function completeShopDelivery(w:MvpWorld,p:Player,active:ShopContract,city:ShopCity,now:number){
 if(active.request==='tavern')throw new MvpError('Este cargamento requiere la recepción y el transportista de la Ribera.',409);
 const s=p.shop!,r=TRADE_REQUESTS[active.request],item=r.good==='grain'?'grain':r.good==='plank'?'plank':'cloth',eligible=s.cargo.filter(l=>l.itemId===item&&!l.bound&&(l.expiresAt===null||l.expiresAt>now)&&!l.provenance.source.includes('finite-opening-stock'));
 if(eligible.reduce((n,l)=>n+l.qty,0)<r.qty)throw new MvpError('Necesitas la carga transferible producida o cosechada para el encargo. Las existencias iniciales de las tiendas no cuentan.',409);
 const holder={...p,inventory:structuredClone(eligible)},ids=new Set(eligible.map(l=>l.id)),lots=consume(holder,item,r.qty,now,{tradeableOnly:true});p.lotSequence=holder.lotSequence;
 const account=w.social.accounts[p.id];if(!account||!Number.isSafeInteger(account.credits+active.escrow)||active.escrow!==r.reward)throw new MvpError('La reserva de créditos necesita revisión.',409);
 s.cargo=[...s.cargo.filter(l=>!ids.has(l.id)),...holder.inventory];active.lots=lots.map(l=>({...l,location:'city-use:'+city+':'+active.id}));active.deliveredAt=now;account.credits+=active.escrow;
 if(active.request==='granary'){w.cityShops??={};const target=w.cityShops['paso-del-norte']??=newCityShop(now,w.seasonId,'paso-del-norte');target.granary??={delivered:0};target.granary.delivered+=r.qty;}
 w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount:active.escrow,from:active.id,to:p.id,itemId:item,reason:'Entrega física: '+r.name});active.escrow=0;p.stats.trades++;emit(w,p,now,`Entregó «${r.name}» en ${SHOP_SITES[city].city} y cobró ${r.reward} CR. La ciudad recibió los materiales.`);
}
export function completeShopSale(w:MvpWorld,p:Player,city:ShopCity,good:ShopGood,qty:number,now:number){
 const g=SHOP_GOODS[good];if(!('itemId'in g)||!shopGoods(city).includes(good))throw new MvpError('Esta tienda no compra ese recurso.',409);
 const s=p.shop!,eligible=s.cargo.filter(l=>l.itemId===g.itemId&&!l.bound&&(l.expiresAt===null||l.expiresAt>now)),ids=new Set(eligible.map(l=>l.id)),holder={...p,inventory:structuredClone(eligible)},taken=consume(holder,g.itemId,qty,now,{tradeableOnly:true});
 const shop=w.cityShops?.[city],amount=shopGood(city,good).sell*qty,account=w.social.accounts[p.id];
 if(!shop||shop.credits<amount||shop.stock[good]+qty>g.opening*2)throw new MvpError('La tienda no puede recibir esta venta por ahora.',409);
 if(!account||!Number.isSafeInteger(account.credits+amount))throw new MvpError('El saldo necesita revisión.',503);
 p.lotSequence=holder.lotSequence;s.cargo=[...s.cargo.filter(l=>!ids.has(l.id)),...holder.inventory];shop.lots[good]??=[];shop.lots[good]!.push(...taken.map(l=>({...l,location:'shop:'+city})));shop.stock[good]+=qty;shop.credits-=amount;account.credits+=amount;
 w.social.ledger.push({id:nextSocialId(w.social,'ledger'),at:now,currency:'credits',amount,from:'npc:'+city+':shop',to:p.id,itemId:g.itemId,reason:`Venta física en Suministros del Alba: ${qty} ${g.name}`});p.stats.trades++;emit(w,p,now,`Vendió ${qty} ${g.name.toLowerCase()} de su carga en ${SHOP_SITES[city].name}.`);
}
