import test from 'node:test';
import assert from 'node:assert/strict';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeCityShop,readCityShop} from '../lib/mvp/city-shop-service.ts';
import {executeRoyalKingdom} from '../lib/mvp/royal-kingdom-service.ts';
import {newCityShop,type ShopCity} from '../lib/mvp/city-shop.ts';
import {settleShopHandling} from '../lib/mvp/city-shop-handling.ts';
import {getActivityProgression} from '../lib/mvp/activity-progression.ts';
import {SHOP_SITES,sitePoint} from '../lib/graphics/city-shop-sites.ts';
import {ROYAL_SHOP} from '../lib/graphics/city-shop-layout.ts';
import {royalLocalToWorld} from '../lib/graphics/royal-world-location.ts';
import {shopHandlingPose} from '../lib/graphics/shop-handling-motion.ts';
import {give} from '../lib/mvp/helpers.ts';
import {serializeWorldRecords,decodeWorldRecords} from '../lib/mvp/partitioned-codec.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';
const NOW=Date.parse('2026-10-19T18:00:00Z');
class Store implements MvpStore{
 record:{revision:number;world:MvpWorld};ambiguous=false;writes=0;
 constructor(w:MvpWorld){this.record={revision:1,world:structuredClone(w)};}
 async read(){return structuredClone(this.record);}async insert(){throw Error('No reset');}
 async compareAndSwap(r:number,w:MvpWorld){if(r!==this.record.revision)return false;this.record={revision:r+1,world:structuredClone(w)};this.writes++;if(this.ambiguous){this.ambiguous=false;throw Error('lost response');}return true;}
}
function fixture(){const w=createMvpWorld('tester',NOW-86400000),p=createPlayer(w,{ownerId:'tester',actor:null,requestId:crypto.randomUUID(),now:NOW-86400000},{type:'player.create',name:'Clara',stationName:'Encina',faction:'cartographers'});p.habitable={version:1,appearance:'pine',profession:'carpenter',skin:'light',hair:'black',position:{x:0,y:1.5},buildings:[]};w.social.accounts[p.id]={credits:4000,boundCredits:50,simUnits:1000};return{store:new Store(w),id:p.id};}
type F=ReturnType<typeof fixture>;const player=(f:F)=>f.store.record.world.players[f.id];
function at(f:F,city:ShopCity,place:'counter'|'pickup'){const p=player(f),q=sitePoint(city,ROYAL_SHOP[place]);p.royal??={schema:1,version:0,sequence:0,contracts:[]};p.royal.pose={...q,yaw:Math.PI,camera:'third',savedAt:NOW-10000};p.habitable!.exploration={version:1,position:royalLocalToWorld(q.x,q.z),homePosition:{x:0,y:1.5},departedAt:NOW-10000};}
const body=(f:F,type:string,cityId:ShopCity,fields:Record<string,unknown>={})=>({requestId:crypto.randomUUID(),expectedRevision:f.store.record.revision,command:{type,cityId,playerId:f.id,...fields}});
const run=(f:F,type:string,city:ShopCity='corona-del-alba',fields:Record<string,unknown>={},now=NOW)=>executeCityShop(f.store,'tester',body(f,type,city,fields),now);
async function equip(f:F){at(f,'corona-del-alba','counter');await run(f,'shop.buy','corona-del-alba',{good:'horse',qty:1});await run(f,'shop.buy','corona-del-alba',{good:'cart',qty:1});at(f,'corona-del-alba','pickup');for(const o of player(f).shop!.orders)await run(f,'shop.collect','corona-del-alba',{orderId:o.id});const [animal,vehicle]=player(f).shop!.assets;await run(f,'shop.hitch','corona-del-alba',{animalId:animal.id,vehicleId:vehicle.id});}
const credits=(f:F)=>{const w=f.store.record.world;return w.social.npc.remaining+Object.values(w.social.accounts).reduce((n,a)=>n+a.credits,0)+Object.values(w.cityShops??{}).reduce((n,s)=>n+s.credits,0)+Object.values(w.players).flatMap(p=>p.shop?.contracts??[]).reduce((n,c)=>n+c.escrow,0);};

test('paid resources move only at the physical handoff, survive reload and release the rig after the worker returns',async()=>{
 const f=fixture();await equip(f);await run(f,'shop.park');at(f,'corona-del-alba','counter');await run(f,'shop.buy','corona-del-alba',{good:'plank',qty:4});const order=player(f).shop!.orders.at(-1)!;at(f,'corona-del-alba','pickup');const [a,v]=player(f).shop!.assets;await run(f,'shop.hitch','corona-del-alba',{animalId:a.id,vehicleId:v.id});
 const money=credits(f),source=structuredClone(order.lots),b=body(f,'shop.collect-crew','corona-del-alba',{orderId:order.id});f.store.ambiguous=true;await assert.rejects(executeCityShop(f.store,'tester',b,NOW),/lost response/);const started=await executeCityShop(f.store,'tester',b,NOW+1),h=started.handling!;
 assert.equal(started.cargoUnits,0);assert.equal(player(f).shop!.orders.at(-1)!.lots.reduce((n,l)=>n+l.qty,0),4);assert(h.transfersAt<h.endsAt);assert.equal(credits(f),money);
 await assert.rejects(run(f,'shop.route'),/trabajador/);await assert.rejects(run(f,'shop.collect','corona-del-alba',{orderId:order.id}),/trabajador/);
 const p=player(f);await assert.rejects(executeRoyalKingdom(f.store,'tester',{requestId:crypto.randomUUID(),expectedRevision:f.store.record.revision,command:{type:'royal.walk',playerId:p.id,expectedVersion:p.royal!.version,sequence:1,points:[{x:-122,z:174}],yaw:Math.PI,camera:'third'}},NOW+1),/trabajador/);
 f.store.record.world=decodeWorldRecords(serializeWorldRecords(f.store.record.world));const loaded=await readCityShop(f.store,'tester',f.id,h.transfersAt+1);assert.equal(loaded.cargoUnits,4);assert.equal(loaded.orders.at(-1)!.collectedAt,h.transfersAt);assert.deepEqual(player(f).shop!.cargo.map(l=>l.provenance),source.map(l=>l.provenance));
 const revision=f.store.record.revision;await readCityShop(f.store,'tester',f.id,h.transfersAt+2);assert.equal(f.store.record.revision,revision);await assert.rejects(run(f,'shop.route','corona-del-alba',{},h.transfersAt+2),/trabajador/);
 await readCityShop(f.store,'tester',f.id,h.endsAt+1);const trip=await run(f,'shop.route','corona-del-alba',{},h.endsAt+2);assert(trip.journey?.active);assert.equal(trip.cargoUnits,4);assert.equal(credits(f),money);
 const arrivedAt=trip.journey!.endsAt+1;const w=f.store.record.world;w.cityShops??={};w.cityShops['paso-del-norte']=newCityShop(NOW,w.seasonId,'paso-del-norte');w.cityShops['paso-del-norte'].credits=30;w.social.accounts[f.id].credits-=30;
 const arrived=await readCityShop(f.store,'tester',f.id,arrivedAt,'paso-del-norte');assert(arrived.nearPickup);const unloading=await run(f,'shop.sell-crew','paso-del-norte',{good:'plank',qty:4},arrivedAt);
 await readCityShop(f.store,'tester',f.id,unloading.handling!.endsAt+1,'paso-del-norte');assert.equal(player(f).shop!.cargo.length,0);assert.equal(credits(f),money);assert(f.store.record.world.cityShops!['paso-del-norte'].lots.plank!.some(l=>l.originLotId===source[0].originLotId));
});

test('contract unloading pays its finite escrow once, delivers the original lots and grants first-city XP once',async()=>{
 const f=fixture();await run(f,'shop.accept','corona-del-alba',{request:'granary'});give(player(f),'plank',4,NOW,'craft:plank');await run(f,'shop.load','corona-del-alba',{good:'plank',qty:4});await equip(f);at(f,'paso-del-norte','pickup');
 const money=credits(f),balance=f.store.record.world.social.accounts[f.id].credits,b=body(f,'shop.deliver-crew','paso-del-norte'),started=await executeCityShop(f.store,'tester',b,NOW),h=started.handling!;assert.equal(started.cargoUnits,4);assert.equal(started.credits,balance);assert.equal(started.granary.delivered,0);
 const pose=shopHandlingPose(h,h.legs.find(l=>l.phase==='carry')!.startsAt+1000);assert(pose.carrying);assert(pose.walking);assert(Math.hypot(pose.x-h.cart.x,pose.z-h.cart.z)>1);
 await readCityShop(f.store,'tester',f.id,h.endsAt+1,'paso-del-norte');const done=await readCityShop(f.store,'tester',f.id,h.endsAt+2,'paso-del-norte');assert.equal(done.cargoUnits,2);assert.equal(done.credits,balance+14);assert.equal(done.granary.delivered,2);assert.equal(credits(f),money);assert.equal(player(f).shop!.contracts![0].lots![0].provenance.source,'craft:plank');
 const xp=getActivityProgression(f.store.record.world,player(f),h.endsAt+2)!;assert.equal(xp.completions.filter(e=>e.id.startsWith('city-delivery:')).length,1);assert.equal(xp.completions.find(e=>e.id.startsWith('city-delivery:'))!.xp,25);
 await executeCityShop(f.store,'tester',b,h.endsAt+3);assert.equal(credits(f),money);await assert.rejects(run(f,'shop.deliver-crew','paso-del-norte',{},h.endsAt+4),/encargo/);
 at(f,'paso-del-norte','counter');await run(f,'shop.accept','paso-del-norte',{request:'granary'},h.endsAt+10);at(f,'paso-del-norte','pickup');const again=await run(f,'shop.deliver-crew','paso-del-norte',{},h.endsAt+11);await readCityShop(f.store,'tester',f.id,again.handling!.endsAt+1,'paso-del-norte');const entries=getActivityProgression(f.store.record.world,player(f),again.handling!.endsAt+2)!.completions.filter(e=>e.id.startsWith('city-delivery:'));assert.equal(entries.reduce((n,e)=>n+e.xp,0),25);assert.equal(entries.length,2);
});

test('a physical sale credits only the receiving stock, conserves money and rejects an unfunded city',async()=>{
 const f=fixture();give(player(f),'grain',4,NOW,'farm');await run(f,'shop.load','corona-del-alba',{good:'grain',qty:4});await equip(f);at(f,'paso-del-norte','pickup');await assert.rejects(run(f,'shop.sell-crew','paso-del-norte',{good:'grain',qty:4}),/recibir/);
 const w=f.store.record.world;w.cityShops??={};w.cityShops['paso-del-norte']=newCityShop(NOW,w.seasonId,'paso-del-norte');w.cityShops['paso-del-norte'].credits=10;const money=credits(f),balance=w.social.accounts[f.id].credits;const started=await run(f,'shop.sell-crew','paso-del-norte',{good:'grain',qty:4});assert.equal(started.credits,balance);
 await readCityShop(f.store,'tester',f.id,started.handling!.endsAt+1,'paso-del-norte');assert.equal(player(f).shop!.cargo.length,0);assert.equal(f.store.record.world.social.accounts[f.id].credits,balance+4);assert.equal(credits(f),money);assert(f.store.record.world.cityShops!['paso-del-norte'].lots.grain!.some(l=>l.provenance.source==='farm'));
});

test('another owner, injected times and bound/initial stock cannot start a physical contract transfer',async()=>{
 const f=fixture();await run(f,'shop.accept','corona-del-alba',{request:'granary'});await equip(f);at(f,'paso-del-norte','pickup');await assert.rejects(run(f,'shop.deliver-crew','paso-del-norte'),/producida/);await assert.rejects(run(f,'shop.deliver-crew','paso-del-norte',{endsAt:NOW}),/campos/);
 await assert.rejects(executeCityShop(f.store,'stranger',body(f,'shop.deliver-crew','paso-del-norte'),NOW),/pertenece/);
 give(player(f),'plank',2,NOW,'tutorial',[],true);player(f).shop!.cargo=player(f).inventory.filter(l=>l.itemId==='plank'&&l.bound);await assert.rejects(run(f,'shop.deliver-crew','paso-del-norte'),/producida/);
 player(f).shop!.cargo=[{...structuredClone(player(f).shop!.cargo[0]),qty:2,bound:false,provenance:{source:'finite-opening-stock',creatorId:'npc',seasonId:'alpha',inputs:[]}}];await assert.rejects(run(f,'shop.deliver-crew','paso-del-norte'),/producida/);
});

test('loading an old save without handling is a pure read; settlement replay cannot copy resources',async()=>{
 const f=fixture(),before=JSON.stringify(f.store.record);await readCityShop(f.store,'tester',f.id,NOW);assert.equal(JSON.stringify(f.store.record),before);settleShopHandling(f.store.record.world,player(f),NOW);assert.equal(JSON.stringify(f.store.record),before);
 for(const city of Object.keys(SHOP_SITES)as ShopCity[])assert(city==='corona-del-alba'||city==='paso-del-norte');
});

test('one city worker cannot load two transports at once and an overdue handoff settles before the next service',async()=>{
 const f=fixture(),w=f.store.record.world,second=createPlayer(w,{ownerId:'tester',actor:null,requestId:crypto.randomUUID(),now:NOW-86400000},{type:'player.create',name:'Mateo',stationName:'Cedro',faction:'cartographers'});second.habitable=structuredClone(player(f).habitable);w.social.accounts[second.id]={credits:4000,boundCredits:50,simUnits:1000};const g={store:f.store,id:second.id};
 for(const a of [f,g]){await equip(a);await run(a,'shop.park');at(a,'corona-del-alba','counter');await run(a,'shop.buy','corona-del-alba',{good:'plank',qty:2});at(a,'corona-del-alba','pickup');const [animal,vehicle]=player(a).shop!.assets;await run(a,'shop.hitch','corona-del-alba',{animalId:animal.id,vehicleId:vehicle.id});}
 const a=await run(f,'shop.collect-crew','corona-del-alba',{orderId:player(f).shop!.orders.at(-1)!.id});await assert.rejects(run(g,'shop.collect-crew','corona-del-alba',{orderId:player(g).shop!.orders.at(-1)!.id}),/otro transporte/);
 const b=await run(g,'shop.collect-crew','corona-del-alba',{orderId:player(g).shop!.orders.at(-1)!.id},a.handling!.endsAt+1);assert.equal(player(f).shop!.cargo.reduce((n,l)=>n+l.qty,0),2);assert.equal(player(g).shop!.cargo.length,0);assert(b.handling);assert.equal(player(f).shop!.handling!.completedAt,a.handling!.endsAt);
});
