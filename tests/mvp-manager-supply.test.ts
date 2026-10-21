import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import {habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import {getHabitableManagerForecast} from '../lib/mvp/habitable-manager-forecast.ts';
import {getManagerBalanceView,recordManagerProducedLot,recordManagerShipmentDelivery} from '../lib/mvp/habitable-manager-balance.ts';
import type {ItemId,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T09:00:00Z');
class MemoryStore implements MvpStore {record:{revision:number;world:MvpWorld}|null=null;writes=0;async read(){return structuredClone(this.record);}async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}}
async function setup(stock=true){const store=new MemoryStore(),owner='supply-manager-owner',view=await executeMvp(store,owner,{type:'player.create',name:'Inés',stationName:'Provisión finita',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),s={store,owner,id:view.player!.id,at:NOW};await act(s,{type:'habitat.profile',appearance:'pine',profession:'farmer'});
  for(const plan of[{templateId:'shed',x:-2,y:-8,rotation:0},{templateId:'workbench',x:7,y:3,rotation:0},{templateId:'planter',x:8,y:6,rotation:0}]){await act(s,{type:'habitat.build',...plan});s.at=Math.max(...state(s).buildings.map(b=>b.endsAt));await read(s);}await act(s,{type:'habitat.residents.initialize'});
  if(stock){await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);for(const[itemId,qty]of[['grain',2],['biomass',3],['water',5],['timber',2],['fiber',3]]as const)await deposit(s,itemId,qty);await go(s,{x:0,y:1.5});}return s;
}
type Fixture=Awaited<ReturnType<typeof setup>>;
const world=(s:Fixture)=>s.store.record!.world;
const player=(s:Fixture)=>world(s).players[s.id];
const state=(s:Fixture)=>player(s).habitable!;
const building=(s:Fixture,type:string)=>state(s).buildings.find(b=>b.templateId===type)!;
const manager=(s:Fixture)=>state(s).manager!;
const read=(s:Fixture)=>readMvpView(s.store,s.owner,s.id,s.at);
const act=(s:Fixture,c:MvpCommand,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...c,playerId:s.id},request,undefined,s.at);
async function go(s:Fixture,point:{x:number;y:number}){await act(s,{type:'habitat.walk',...point});s.at=state(s).movement!.endsAt;await read(s);}
async function deposit(s:Fixture,itemId:ItemId,qty:number){let left=qty;for(const lot of structuredClone(player(s).inventory).filter(l=>l.itemId===itemId)){const use=Math.min(left,lot.qty);if(use){await act(s,{type:'habitat.storage.deposit',buildingId:building(s,'shed').id,lotId:lot.id,qty:use});left-=use;}if(!left)break;}assert.equal(left,0,'all deposited fixture materials must exist in the finite starter kit');}
const config=(s:Fixture):MvpCommand=>({type:'habitat.manager.start',supplyShedId:building(s,'shed').id,workbenchId:building(s,'workbench').id,planterId:building(s,'planter').id,goals:{ration:1,plank:0,cloth:0},durationMinutes:20,maxOrders:12,inputBudget:80,replenishFarmInputs:true,reserves:{grain:1,water:1}});
const jobs=(s:Fixture)=>Object.values(world(s).jobs).filter(j=>j.payload.managerPlanId===manager(s).id);
const qty=(s:Fixture,id:ItemId)=>building(s,'shed').storage!.filter(l=>l.itemId===id).reduce((n,l)=>n+l.qty,0);
const balance=(s:Fixture)=>getManagerBalanceView(manager(s))!;
async function next(s:Fixture){assert.notEqual(manager(s).nextAt,null);s.at=manager(s).nextAt!;return read(s);}

test('explicit replenishment makes seed, nutrient, a finite harvest and ration with exact protected floors and real lot accounting',async()=>{
  const s=await setup(),inventory=structuredClone(player(s).inventory),finance=structuredClone(world(s).social.accounts);await act(s,config(s));const forecast=getHabitableManagerForecast(world(s),player(s),s.at)!,before=structuredClone(s.store.record);assert.equal(forecast.projectedOrders,4);assert.equal(forecast.inputs.reduce((n,i)=>n+i.qty,0),12);assert.equal(forecast.workSeconds,945);assert.equal(forecast.checks.some(c=>c.id==='materials'&&!c.available),false,'seed and nutrient prerequisites resolved by the forecast cannot remain reported as missing');assert.deepEqual(s.store.record,before);
  s.at+=1800000;await read(s);assert.deepEqual(jobs(s).map(j=>j.payload.recipeId??j.kind),['seed','nutrient','farm','ration']);assert.equal(manager(s).turn.startedOrders,4);assert.equal(manager(s).turn.completedOrders,4);assert.equal(player(s).farmCycles,1);assert.equal(qty(s,'ration'),1);assert.equal(qty(s,'grain'),2);assert.equal(qty(s,'water'),1);assert.equal(building(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),10);assert.deepEqual(player(s).inventory,inventory);assert.deepEqual(world(s).social.accounts,finance);
  const rows=balance(s).rows;assert.equal(rows.reduce((n,r)=>n+r.committed,0),12);assert.equal(rows.reduce((n,r)=>n+r.produced,0),7);assert.equal(rows.reduce((n,r)=>n+r.delivered,0),7);assert.ok(rows.every(r=>r.externalAdjustment===0&&r.expired===0));assert.ok(balance(s).finishedAt!==null);assert.ok(building(s,'shed').storage!.filter(l=>['grain','biomass','ration'].includes(l.itemId)).every(l=>l.bound));
  const done=structuredClone(s.store.record);await read(s);assert.deepEqual(s.store.record,done);
});

test('replenishment disabled cannot be inferred from missing farm supplies or a reserve, and invalid options reject atomically',async()=>{
  const s=await setup();for(const patch of[{replenishFarmInputs:'yes'},{reserves:null},{reserves:{water:-1}},{reserves:{seed:21}},{reserves:{credits:1}},{reserves:{grain:1.5}}]){const before=structuredClone(s.store.record);await assert.rejects(act(s,{...config(s),...patch}));assert.deepEqual(s.store.record,before);}
  await act(s,{...config(s),replenishFarmInputs:false});s.at++;await read(s);assert.equal(jobs(s).length,0);assert.equal(manager(s).turn.startedOrders,0);assert.equal(qty(s,'grain'),2);assert.equal(player(s).farmCycles,0);assert.match(manager(s).blockedReason!,/reservas|insumos/);
});

test('minimum products become stock targets while hard order and material caps still stop the turn',async()=>{
  const s=await setup();await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);await deposit(s,'ration',1);await go(s,{x:0,y:1.5});await act(s,{...config(s),replenishFarmInputs:false,reserves:{plank:2},maxOrders:1,inputBudget:2});s.at+=1800000;await read(s);assert.equal(jobs(s).length,1);assert.equal(jobs(s)[0].payload.recipeId,'plank');assert.equal(qty(s,'plank'),1);assert.equal(manager(s).goals.plank,0);assert.equal(manager(s).reserves!.plank,2);assert.equal(manager(s).turn.startedOrders,1);assert.equal(manager(s).turn.committedInputs.reduce((n,i)=>n+i.qty,0),2);assert.equal(player(s).farmCycles,0);
});

test('exhausted or invalid farmland never wastes seed or nutrient preparation, including the local last-cycle forecast',async()=>{
  for(const invalid of['quota','biome']as const){const s=await setup();if(invalid==='quota')player(s).farmCycles=10;else world(s).tiles[player(s).settlement!.homeTileId].biome='desert';await act(s,config(s));s.at+=1800000;await read(s);assert.equal(jobs(s).length,0);assert.equal(qty(s,'grain'),2);assert.equal(qty(s,'biomass'),3);}
  const s=await setup();player(s).farmCycles=9;await act(s,{...config(s),goals:{ration:2,plank:0,cloth:0},reserves:{grain:1}});const forecast=getHabitableManagerForecast(world(s),player(s),s.at)!;assert.equal(forecast.projectedOrders,4);assert.equal(forecast.outputs.filter(i=>i.itemId==='seed').reduce((n,i)=>n+i.qty,0),1);s.at+=1800000;await read(s);assert.equal(jobs(s).length,4);assert.equal(player(s).farmCycles,10);assert.equal(qty(s,'seed'),0);assert.equal(qty(s,'ration'),1);
});

test('a failed reserve check at the physical delivery time rolls back all held inputs, jobs and soil reservations',async()=>{
  const s=await setup();await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);await deposit(s,'nutrient',1);await go(s,{x:0,y:1.5});const shelf=building(s,'shed').storage!,grain=shelf.find(l=>l.itemId==='grain')!;grain.qty=1;const expiring=structuredClone(grain);expiring.id='expiring-grain-fixture';expiring.expiresAt=s.at+5000;shelf.push(expiring);
  await act(s,config(s));s.at++;await read(s);assert.equal(jobs(s).length,0);assert.equal(manager(s).turn.startedOrders,0);assert.equal(manager(s).turn.committedInputs.length,0);assert.equal(qty(s,'grain'),2);assert.equal(player(s).farmCycles,0);assert.match(manager(s).blockedReason!,/caducidad|reservas/);
});

test('manual withdrawals remain external changes and only the remaining lot expires; the closed balance cannot be rewritten',async()=>{
  const s=await setup(false);await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);await deposit(s,'grain',10);const lot=building(s,'shed').storage!.find(l=>l.itemId==='grain')!;lot.expiresAt=s.at+60000;const expiresAt=lot.expiresAt;
  await act(s,{...config(s),replenishFarmInputs:false,reserves:{grain:10}});await act(s,{type:'habitat.storage.withdraw',buildingId:building(s,'shed').id,lotId:lot.id,qty:9});assert.equal(balance(s).rows.find(r=>r.itemId==='grain')!.externalAdjustment,-9);await go(s,{x:0,y:1.5});s.at=expiresAt+1;await read(s);const row=balance(s).rows.find(r=>r.itemId==='grain')!;assert.equal(row.opening,10);assert.equal(row.closing,0);assert.equal(row.expired,1);assert.equal(row.externalAdjustment,-9);await act(s,{type:'habitat.manager.pause',planId:manager(s).id});const closed=structuredClone(balance(s));await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);await deposit(s,'timber',1);assert.deepEqual(balance(s),closed);
});

test('lot-level hooks attribute mixed live and expired outputs by actual item rather than planned output order',async()=>{
  const s=await setup();await act(s,config(s));await next(s);const original=structuredClone(world(s)),p=structuredClone(player(s)),m=p.habitable!.manager!,job=jobs(s)[0],grain=structuredClone(player(s).inventory.find(l=>l.itemId==='grain')!),biomass=structuredClone(player(s).inventory.find(l=>l.itemId==='biomass')!);grain.id='actual-grain-output';grain.qty=3;grain.expiresAt=s.at+1000;biomass.id='actual-biomass-output';biomass.qty=1;biomass.expiresAt=null;
  recordManagerProducedLot(p,job,grain,s.at);recordManagerProducedLot(p,job,biomass,s.at);recordManagerProducedLot(p,job,grain,s.at);recordManagerShipmentDelivery(p,job.id,[grain,biomass],s.at+1001);recordManagerShipmentDelivery(p,job.id,[grain,biomass],s.at+1001);const rows=getManagerBalanceView(m)!.rows;assert.equal(rows.find(r=>r.itemId==='grain')!.produced,3);assert.equal(rows.find(r=>r.itemId==='grain')!.delivered,0);assert.equal(rows.find(r=>r.itemId==='grain')!.expired,3);assert.equal(rows.find(r=>r.itemId==='biomass')!.delivered,1);assert.equal(rows.find(r=>r.itemId==='biomass')!.expired,0);assert.deepEqual(world(s),original);
});

test('the pure forecast debits every source lot exactly and identifies named shortages without pretending to validate paths',async()=>{
  const s=await setup(false);await go(s,habitableBuildingEntrance(state(s),building(s,'shed'))!);for(const quantity of[1,1,2])await deposit(s,'grain',quantity);await deposit(s,'water',3);await go(s,{x:0,y:1.5});await act(s,{...config(s),goals:{ration:3,plank:0,cloth:0},reserves:{},replenishFarmInputs:false,planterId:undefined});const before=structuredClone(s.store.record),f=getHabitableManagerForecast(world(s),player(s),s.at)!;assert.equal(f.projectedOrders,2);assert.equal(f.workSeconds,600);assert.equal(f.inputs.find(i=>i.itemId==='grain')!.qty,4);assert.equal(f.outputs.find(i=>i.itemId==='ration')!.qty,2);assert.equal(f.status,'conditional');assert.ok(f.checks.some(c=>c.id==='materials'&&c.reason?.includes('Grano')));assert.ok(f.checks.some(c=>c.id==='routes'&&!c.available));assert.deepEqual(s.store.record,before);
});

test('resume inherits omitted supply permissions, explicit empty reserves clear them, and legacy turns never gain balances on reads',async()=>{
  const s=await setup();await act(s,config(s));await act(s,{type:'habitat.manager.pause',planId:manager(s).id});await act(s,{type:'habitat.manager.resume',planId:manager(s).id,durationMinutes:10,maxOrders:4,inputBudget:12});assert.equal(manager(s).replenishFarmInputs,true);assert.deepEqual(manager(s).reserves,{grain:1,water:1});await act(s,{type:'habitat.manager.pause',planId:manager(s).id});await act(s,{type:'habitat.manager.resume',planId:manager(s).id,durationMinutes:10,maxOrders:4,inputBudget:12,replenishFarmInputs:false,reserves:{}});assert.equal(manager(s).replenishFarmInputs,false);assert.deepEqual(manager(s).reserves,{});
  const legacy=await setup(false);await act(legacy,{...config(legacy),goals:{ration:0,plank:1,cloth:0},replenishFarmInputs:false,reserves:{}});await next(legacy);delete manager(legacy).replenishFarmInputs;delete manager(legacy).reserves;delete manager(legacy).turn.balance;const before=structuredClone(legacy.store.record),writes=legacy.store.writes;legacy.at++;const v=await read(legacy);assert.equal(v.habitable.manager.plan!.balance,null);assert.equal(v.habitable.manager.plan!.replenishFarmInputs,false);assert.ok(v.habitable.manager.plan!.reserves.every(r=>r.minimum===0));assert.equal(legacy.store.writes,writes);assert.deepEqual(legacy.store.record,before);
});
