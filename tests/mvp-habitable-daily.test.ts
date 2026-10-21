import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMvp, readMvpView, quoteMvp } from '../lib/mvp/engine.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import type { HabitableBuilding } from '../lib/mvp/habitable-data.ts';
import { give } from '../lib/mvp/helpers.ts';
import { getHabitableStorageCapacity, HABITABLE_POINTS, habitableBuildingEntrance, habitableLineClear, habitableWorkerAt } from '../lib/mvp/habitable-data.ts';
import { getHabitableWorkers, guardHabitableWorkerMovement } from '../lib/mvp/habitable-logistics.ts';
import { getHabitableDailyView, habitableDailyProductionReason, planHabitableDaily } from '../lib/mvp/habitable-daily.ts';
import type { MvpStore } from '../lib/mvp/store.ts';
import type { ItemId, MvpCommand, MvpWorld } from '../lib/mvp/types.ts';

class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld};writes=0;
  constructor(record:{revision:number;world:MvpWorld}){this.record=structuredClone(record);}
  async read(){return structuredClone(this.record);}
  async insert(){throw Error('Existing-save test must never initialize a world');}
  async compareAndSwap(revision:number,world:MvpWorld){assert.equal(revision,this.record.revision);this.writes++;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}
function fixture(){
  const at=Date.parse('2026-10-16T04:30:00Z'),owner='daily-test-owner',world=createMvpWorld(owner,at-600000),player=createPlayer(world,{ownerId:owner,requestId:crypto.randomUUID(),now:at-600000,actor:null},{type:'player.create',name:'Alba',stationName:'Aldea de prueba',faction:'cartographers'});
  for(let i=0;i<3;i++)createPlayer(world,{ownerId:`other-test-owner-${i}`,requestId:crypto.randomUUID(),now:at-600000,actor:null},{type:'player.create',name:`Explorador ${i}`,stationName:`Estación ${i}`,faction:'cartographers'});
  const plans:[HabitableBuilding['templateId'],number,number,0|1|2|3][]=[['workbench',-2,-8,1],['shed',7,3,0],['planter',8,6,0],['house',-9,9,0],['woodlot',-12,1,0],['sawmill',-12,5,0]],buildings:HabitableBuilding[]=plans.map(([templateId,x,y,rotation],i)=>({id:`fixture-building-${i}`,templateId,x,y,rotation,startsAt:at-120000,endsAt:at-60000,bound:true}));
  const posts:[number,number,number][]=[[0,-.75,-8.95],[2,8.95,7.45],[4,-11.05,2.35],[5,-11.05,6.85]];
  player.habitable={version:1,appearance:'pine',profession:'carpenter',position:{x:4.5,y:5},buildings,workforce:{sequence:4,initializedAt:at-60000,residents:posts.map(([index,x,y],i)=>({id:`fixture-resident-${i}`,name:['Lucía','Mateo','Nora','Elías'][i],homeBuildingId:i<2?null:buildings[3].id,assignment:{buildingId:buildings[index].id,stand:{x,y}},position:{x,y},createdAt:at-60000}))}};
  for(const[item,qty]of[['grain',5],['biomass',2]]as const){const lot=give(player,item,qty,at-30000,'existing-fixture-food',[],true);player.inventory=player.inventory.filter(l=>l.id!==lot.id);lot.location=`habitat:${buildings[1].id}`;(buildings[1].storage??=[]).push(lot);}
  return{store:new MemoryStore({revision:1,world}),id:player.id,owner,at};
}
type Fixture=ReturnType<typeof fixture>;
const p=(s:Fixture)=>s.store.record.world.players[s.id],state=(s:Fixture)=>p(s).habitable!,b=(s:Fixture,kind:string)=>state(s).buildings.find(b=>b.templateId===kind)!,units=(lots:{itemId:string;qty:number}[],item:string)=>lots.filter(l=>l.itemId===item).reduce((n,l)=>n+l.qty,0);
const act=(s:Fixture,command:MvpCommand,at=s.at,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...command,playerId:s.id},request,undefined,at),read=(s:Fixture,at=s.at)=>readMvpView(s.store,s.owner,s.id,at);
function stock(s:Fixture,item:ItemId,qty:number,bound=false){const l=give(p(s),item,qty,s.at,'existing-test-daily-stock',[],bound);p(s).inventory=p(s).inventory.filter(v=>v.id!==l.id);l.location=`habitat:${b(s,'shed').id}`;(b(s,'shed').storage??=[]).push(l);return l;}
async function ready(){const s=fixture();await read(s);stock(s,'ration',4,true);stock(s,'timber',2);return s;}
const courier=(s:Fixture)=>state(s).workforce!.residents.find(r=>r.assignment?.buildingId===b(s,'planter').id)!;
const command=(s:Fixture)=>({type:'habitat.daily.start',buildingId:b(s,'shed').id,residentId:courier(s).id});

test('old six-building save remains opt-out with no food charges, no new level fields and no repeated writes',async()=>{
  const s=fixture();await read(s);const before=structuredClone(s.store.record),writes=s.store.writes;const view=await read(s,s.at+1000);assert.equal(view.habitable.daily.status,'legacy');assert.equal(state(s).daily,undefined);assert.equal(b(s,'shed').level,undefined);assert.equal(getHabitableStorageCapacity(b(s,'shed')),80);assert.equal(s.store.writes,writes);assert.deepEqual(s.store.record,before);
});

test('daily reserves real lots once, preserves metadata in cargo and consumes only at each authorized handover and maintenance',async()=>{
  const s=await ready(),oldOthers=Object.fromEntries(Object.entries(s.store.record.world.players).filter(([id])=>id!==s.id)),source=structuredClone(b(s,'shed').storage),request=crypto.randomUUID(),cmd=command(s);const quote=await quoteMvp(s.store,s.owner,{...cmd,playerId:s.id},request,s.at);assert.ok(quote.changes.some(c=>c.itemId==='ration'&&c.delta===-4));await act(s,cmd,s.at,request);const d=state(s).daily!,j=structuredClone(d.journey);assert.equal(j.cargo.reduce((n,l)=>n+l.qty,0),6);assert.equal(d.rationsConsumed,0);assert.equal(d.timberConsumed,0);for(const l of j.cargo){const old=source!.find(v=>v.id===l.id)!;assert.ok(old);assert.deepEqual(l.provenance,old.provenance);assert.equal(l.bound,old.bound);assert.equal(l.expiresAt,old.expiresAt);assert.equal(l.wear,old.wear);}await act(s,cmd,s.at,request);assert.equal(state(s).daily!.sequence,1);
  const first=j.legs[0];await read(s,first.endsAt-1);assert.equal(state(s).daily!.rationsConsumed,0);await read(s,first.endsAt);assert.equal(state(s).daily!.rationsConsumed,1);assert.equal(courier(s).fedUntil,first.endsAt+1200000);assert.equal(state(s).daily!.timberConsumed,0);
  const maintenance=j.legs.find(l=>l.kind==='maintenance')!;await read(s,maintenance.endsAt-1);assert.equal(state(s).daily!.rationsConsumed,4);assert.equal(state(s).daily!.timberConsumed,0);assert.equal(units(state(s).daily!.journey.cargo,'timber'),2);await read(s,maintenance.endsAt);assert.equal(state(s).daily!.timberConsumed,2);assert.equal(state(s).daily!.journey.cargo.length,0);await read(s,j.endsAt+1);assert.equal(getHabitableDailyView(s.store.record.world,p(s),j.endsAt+1).status,'active');
  const terminal=structuredClone(s.store.record);await read(s,j.endsAt+2);assert.deepEqual(s.store.record,terminal);for(const[id,other]of Object.entries(oldOthers))assert.deepEqual(s.store.record.world.players[id],other);
});

test('all four real incumbents can perform the entire six-building route and return without teleporting or intersecting residents or avatar',async()=>{
  const s=await ready(),residents=state(s).workforce!.residents;for(const r of residents){const plan=planHabitableDaily(s.store.record.world,p(s),b(s,'shed'),r.id,s.at);assert.ok(plan);assert.equal(plan.legs.length,6);for(const leg of plan.legs)for(let i=1;i<leg.points.length;i++)assert.ok(habitableLineClear(leg.points[i-1],leg.points[i],state(s)));assert.deepEqual(plan.legs.at(-1)!.points.at(-1),r.assignment!.stand);}
  await act(s,command(s));const j=state(s).daily!.journey,w=getHabitableWorkers(s.store.record.world,p(s),s.at).find(w=>w.id===j.workerId)!;assert.equal(getHabitableWorkers(s.store.record.world,p(s),s.at).filter(v=>v.id===w.id).length,1);for(let at=j.startsAt;at<j.endsAt;at+=100){const pose=habitableWorkerAt(w,at);assert.ok(Math.hypot(pose.x-4.5,pose.y-5)>=.75);for(const r of residents.filter(r=>r.id!==w.id)){const stand=r.assignment?.stand??r.position;assert.ok(Math.hypot(pose.x-stand.x,pose.y-stand.y)>=.75);}for(const other of HABITABLE_POINTS)assert.ok(Math.hypot(pose.x-other.x-.7,pose.y-other.y)>=.75);}
  const end=habitableWorkerAt(w,j.endsAt);assert.equal(end.state,'idle');assert.deepEqual({x:end.x,y:end.y},w.stand);
});

test('expired, zero-quality, insufficient, foreign and obstructed supplies never opt in or remove resources',async()=>{
  for(const kind of['expired','bad-quality','missing','foreign','blocked']){const s=await ready();const food=b(s,'shed').storage!.find(l=>l.itemId==='ration')!;if(kind==='expired')food.expiresAt=s.at+1;if(kind==='bad-quality')food.quality=0;if(kind==='missing')food.qty=3;if(kind==='blocked')state(s).position=habitableBuildingEntrance(state(s),b(s,'shed'))!;const cmd={...command(s),...(kind==='foreign'?{residentId:'not-owned'}:{})},before=structuredClone(s.store.record);await assert.rejects(act(s,cmd));assert.deepEqual(s.store.record,before);assert.equal(state(s).daily,undefined);}
});

test('reassignment and production cannot reuse a distributing inhabitant; walks reserve the future route, but profile changes preserve cargo',async()=>{
  const s=await ready();await act(s,command(s));const j=state(s).daily!.journey,r=state(s).workforce!.residents[0];await assert.rejects(act(s,{type:'habitat.resident.unassign',residentId:r.id},s.at+1),/termine/);const routePoint=j.legs.find(l=>l.kind==='delivery')!.points.at(-1)!;await assert.rejects(act(s,{type:'habitat.walk',...routePoint},s.at+1),/obrero|camino/);
  const before=structuredClone(state(s).daily);await act(s,{type:'habitat.profile',appearance:'frost',profession:'farmer'},s.at+1);assert.deepEqual(state(s).daily,before);
});

test('one paid day expires without debt or an offline second charge; only new nonfood production pauses and subsistence remains allowed',async()=>{
  const s=await ready();await act(s,command(s));const j=state(s).daily!.journey;await read(s,j.endsAt+1);await assert.rejects(act(s,command(s),j.endsAt+2),/jornada/);const last=Math.max(...state(s).workforce!.residents.map(r=>r.fedUntil!));await read(s,last+86400000);assert.equal(getHabitableDailyView(s.store.record.world,p(s),last+86400000).status,'paused');assert.equal(state(s).daily!.sequence,1);assert.equal(state(s).daily!.rationsConsumed,4);assert.equal(state(s).daily!.timberConsumed,2);
  const bench=b(s,'workbench'),now=last+86400000;assert.match(habitableDailyProductionReason(p(s),bench,'craft','plank',now)!,/jornada/);for(const recipe of['ration','seed','nutrient'])assert.equal(habitableDailyProductionReason(p(s),bench,'craft',recipe,now),null);assert.equal(habitableDailyProductionReason(p(s),b(s,'planter'),'farm',null,now),null);assert.equal(habitableDailyProductionReason(p(s),b(s,'woodlot'),'extract',null,now),null);assert.equal(habitableDailyProductionReason(p(s),b(s,'sawmill'),'craft','plank',now,state(s).daily!.optedInAt-1),null);
  const before=structuredClone(s.store.record),writes=s.store.writes;await read(s,now+1);assert.equal(s.store.writes,writes);assert.deepEqual(s.store.record,before);
});

test('shed level two costs actual station materials once, stays at eighty during construction and reaches exactly one hundred sixty at completion',async()=>{
  const s=fixture();await read(s);for(const[item,qty]of[['plank',2],['timber',2],['fiber',2]]as const)give(p(s),item,qty,s.at,'existing-upgrade-test-stock',[],false);const old=structuredClone(p(s).inventory),shed=b(s,'shed'),cmd={type:'habitat.shed.upgrade',buildingId:shed.id},request=crypto.randomUUID();await act(s,cmd,s.at,request);const upgraded=b(s,'shed');assert.equal(upgraded.upgrade!.endsAt-upgraded.upgrade!.startsAt,60000);for(const[item,qty]of[['plank',2],['timber',2],['fiber',2]]as const)assert.equal(units(p(s).inventory,item),units(old,item)-qty);const inv=structuredClone(p(s).inventory);await act(s,cmd,s.at,request);assert.deepEqual(p(s).inventory,inv);assert.equal(getHabitableStorageCapacity(b(s,'shed')),80);assert.equal(getHabitableWorkers(s.store.record.world,p(s),s.at).filter(w=>w.id===`builder:upgrade:${shed.id}`).length,1);
  await read(s,s.at+59999);assert.equal(getHabitableStorageCapacity(b(s,'shed')),80);await read(s,s.at+60000);assert.equal(getHabitableStorageCapacity(b(s,'shed')),160);assert.equal(b(s,'shed').level,2);await assert.rejects(act(s,cmd,s.at+60001),/nivel dos/);const before=structuredClone(s.store.record);await read(s,s.at+60002);assert.deepEqual(s.store.record,before);
});

test('manual deposits use eighty slots during upgrade and one hundred sixty afterwards without losing old lots',async()=>{
  const s=fixture();await read(s);for(const[item,qty]of[['plank',2],['timber',2],['fiber',2]]as const)give(p(s),item,qty,s.at,'existing-upgrade-test-stock',[],false);const original=structuredClone(b(s,'shed').storage),lot=give(p(s),'stone',160,s.at,'existing-stone-test-stock',[],false),shedId=b(s,'shed').id;await act(s,{type:'habitat.shed.upgrade',buildingId:shedId});await act(s,{type:'habitat.storage.deposit',buildingId:shedId,lotId:lot.id,qty:73},s.at+1);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:shedId,lotId:lot.id,qty:1},s.at+2),/ochenta unidades/);await read(s,s.at+60000);await act(s,{type:'habitat.storage.deposit',buildingId:shedId,lotId:lot.id,qty:80},s.at+60001);assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),160);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:shedId,lotId:lot.id,qty:1},s.at+60002),/ciento sesenta unidades/);for(const old of original!)assert.deepEqual(b(s,'shed').storage!.find(l=>l.id===old.id),old);
});

test('shed upgrade validates owner, proximity, completed building and constructor obstruction before spending',async()=>{
  const s=fixture();await read(s);const cmd={type:'habitat.shed.upgrade',buildingId:b(s,'shed').id},before=structuredClone(s.store.record);await assert.rejects(executeMvp(s.store,'foreign-owner',{...cmd,playerId:s.id},crypto.randomUUID(),undefined,s.at),/pertenece/);assert.deepEqual(s.store.record,before);state(s).position={x:0,y:1.5};await assert.rejects(act(s,cmd),/Acércate/);b(s,'shed').endsAt=s.at+500;state(s).position={x:4.5,y:5};await assert.rejects(act(s,cmd),/termine/);
});

test('public settlements expose only the meal schedule and storage summary; private daily cargo never escapes',async()=>{
  const s=await ready();await act(s,command(s));const secret=state(s).daily!.journey.cargo[0].provenance.source,view=await readMvpView(s.store,'spectator',undefined,s.at);assert.ok(!JSON.stringify(view.habitable.actors).includes(secret));assert.ok(!JSON.stringify(view.habitable.actors).includes('journey'));assert.ok(view.habitable.actors.find(a=>a.playerId===s.id)!.state.workers!.some(w=>w.daily));
});

test('actual production dispatch pauses a new unfed plank recipe while basic food, farming and finite forestry keep their original rules',async()=>{
  const s=await ready();await act(s,command(s));await read(s,state(s).daily!.journey.endsAt+1);const now=Math.max(...state(s).workforce!.residents.map(r=>r.fedUntil!))+1;await read(s,now);state(s).position=habitableBuildingEntrance(state(s),b(s,'workbench'))!;
  const before=structuredClone(s.store.record);await assert.rejects(act(s,{type:'habitat.workbench.start',buildingId:b(s,'workbench').id,recipeId:'plank'},now),/jornada/);assert.deepEqual(s.store.record,before);
  await act(s,{type:'habitat.workbench.start',buildingId:b(s,'workbench').id,recipeId:'ration'},now);const food=s.store.record.world.jobs[b(s,'workbench').operation!.jobId];assert.equal(food.endsAt-food.startsAt,300000);
  state(s).position=habitableBuildingEntrance(state(s),b(s,'planter'))!;await act(s,{type:'habitat.planter.start',buildingId:b(s,'planter').id},now);const farm=s.store.record.world.jobs[b(s,'planter').operation!.jobId];assert.equal(farm.endsAt-farm.startsAt,45000);assert.equal(p(s).farmCycles,1);
  state(s).position=habitableBuildingEntrance(state(s),b(s,'woodlot'))!;await act(s,{type:'habitat.woodlot.start',buildingId:b(s,'woodlot').id,qty:1},now);const forest=s.store.record.world.jobs[b(s,'woodlot').operation!.jobId];assert.equal(forest.endsAt-forest.startsAt,15000);assert.equal(forest.payload.qty,1);
});

test('active daily cargo prevents legacy travel without blocking no-cost appearance changes or repeating a paid day',async()=>{
  const s=await ready();await act(s,command(s));const before=structuredClone(state(s).daily);await assert.rejects(act(s,{type:'world.travel',tileId:'t_4_3'},s.at+1),/reparto/);assert.deepEqual(state(s).daily,before);await assert.rejects(act(s,command(s),s.at+1),/jornada/);assert.deepEqual(state(s).daily,before);
});

test('using bound improvement materials preserves the storage building binding and never charges an unfinished or repeated improvement',async()=>{
  const s=fixture();await read(s);b(s,'shed').bound=false;for(const[item,qty]of[['plank',2],['timber',2],['fiber',2]]as const)give(p(s),item,qty,s.at,'existing-bound-upgrade-materials',[],item==='fiber');const id=b(s,'shed').id;await act(s,{type:'habitat.shed.upgrade',buildingId:id});assert.equal(b(s,'shed').bound,true);const inventory=structuredClone(p(s).inventory);await assert.rejects(act(s,{type:'habitat.shed.upgrade',buildingId:id},s.at+1),/curso/);assert.deepEqual(p(s).inventory,inventory);
});

test('production deliveries use the upgraded capacity rather than the old eighty-unit constant',async()=>{
  const s=fixture();await read(s);for(const[item,qty]of[['plank',2],['timber',2],['fiber',2]]as const)give(p(s),item,qty,s.at,'existing-upgrade-materials',[],false);await act(s,{type:'habitat.shed.upgrade',buildingId:b(s,'shed').id});const at=s.at+60001;await read(s,at);stock(s,'fiber',120);stock(s,'timber',2);state(s).position=habitableBuildingEntrance(state(s),b(s,'sawmill'))!;
  await act(s,{type:'habitat.sawmill.order',buildingId:b(s,'sawmill').id,target:1,supplyShedId:b(s,'shed').id},at);const job=s.store.record.world.jobs[b(s,'sawmill').operation!.jobId];state(s).position={x:0,y:1.5};await read(s,job.endsAt+300000);assert.equal(b(s,'sawmill').workOrder!.completed,1);assert.equal(b(s,'sawmill').workOrder!.status,'completed');assert.equal(units(b(s,'shed').storage!,'plank'),1);assert.equal(units(b(s,'shed').storage!,'fiber'),120);assert.equal(b(s,'shed').storage!.reduce((n,l)=>n+l.qty,0),128);
});

test('meal routing checks the real arrival and stationary dwell instead of slowing a courier until the delivery ends',async()=>{
  const s=await ready(),resident=courier(s),plan=planHabitableDaily(s.store.record.world,p(s),b(s,'shed'),resident.id,s.at)!;assert.ok(plan);const leg=plan.legs[0],target=leg.points.at(-1)!;
  // A separately authorized future crew occupies the entry only during the pickup pause.
  // Stretching the walking interpolation across that pause would falsely miss this collision.
  const id='fixture-future-crew';s.store.record.world.jobs[id]={id,playerId:s.id,kind:'upgrade',status:'reserved',createdAt:s.at,startsAt:leg.arrivesAt+100,endsAt:leg.arrivesAt+400,ruleVersion:s.store.record.world.rulesVersion,weather:{regionId:'r_1_1',state:'clear',startsAt:s.at,endsAt:s.at+3600000,movementFactor:1,waterFactor:1},route:[p(s).position],costs:[],payload:{building:'warehouse',fromLevel:1,toLevel:2,constructionStand:target},report:[]};
  assert.doesNotThrow(()=>guardHabitableWorkerMovement(s.store.record.world,p(s),{points:leg.points,startsAt:leg.startsAt,endsAt:leg.endsAt},resident.id));
  assert.throws(()=>guardHabitableWorkerMovement(s.store.record.world,p(s),{points:[target,target],startsAt:leg.arrivesAt,endsAt:leg.endsAt},resident.id),/obrero/);assert.equal(planHabitableDaily(s.store.record.world,p(s),b(s,'shed'),resident.id,s.at),null);assert.equal(state(s).daily,undefined);
});

test('the courier faces the actual shed while picking up food, rather than looking back at its former work post',async()=>{
  const s=await ready();await act(s,command(s));const j=state(s).daily!.journey,leg=j.legs[0],access=leg.points.at(-1)!,w=getHabitableWorkers(s.store.record.world,p(s),s.at).find(w=>w.id===j.workerId)!,pose=habitableWorkerAt(w,leg.arrivesAt+1);assert.equal(pose.state,'loading');assert.ok(Math.abs(pose.yaw-Math.atan2(b(s,'shed').x-access.x,b(s,'shed').y-access.y))<1e-10);
});

