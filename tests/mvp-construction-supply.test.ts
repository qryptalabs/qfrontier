import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {habitableBuildingEntrance,habitableLineClear,habitablePath,habitableWorkerAt,HABITABLE_SPAWN,HABITABLE_POINTS} from '../lib/mvp/habitable-data.ts';
import {sweptObstacleHit} from '../lib/graphics/kinematic-physics.ts';
import {habitableReservedStorage,getHabitableWorkers,guardHabitableWorkerMovement,habitableWorkStand,habitableWorkerObstacles} from '../lib/mvp/habitable-logistics.ts';
import {getHabitableNetworkView} from '../lib/mvp/habitable-network.ts';
import type {HabitableBuilding} from '../lib/mvp/habitable-data.ts';
import type {ItemId,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T01:00:00Z');
class MemoryStore implements MvpStore {
  record:{world:MvpWorld;revision:number}|null=null;writes=0;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){assert.equal(this.record,null);this.record={world:structuredClone(world),revision:0};}
  async compareAndSwap(revision:number,world:MvpWorld){if(revision!==this.record?.revision)return false;this.record={world:structuredClone(world),revision:revision+1};this.writes++;return true;}
}
async function setup(){const store=new MemoryStore(),owner='construction-owner',v=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Circuito',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),s={store,owner,id:v.player!.id,at:NOW};await act(s,{type:'habitat.profile',appearance:'pine',profession:'carpenter'});await act(s,{type:'habitat.build',templateId:'shed',x:7,y:3,rotation:0});await finish(s);return s;}
type Fixture=Awaited<ReturnType<typeof setup>>;
const player=(s:Fixture)=>s.store.record!.world.players[s.id];
const state=(s:Fixture)=>player(s).habitable!;
const world=(s:Fixture)=>s.store.record!.world;
const shed=(s:Fixture)=>state(s).buildings.find(b=>b.templateId==='shed')!;
const read=(s:Fixture)=>readMvpView(s.store,s.owner,s.id,s.at);
const act=(s:Fixture,c:MvpCommand,request=crypto.randomUUID())=>executeMvp(s.store,s.owner,{...c,playerId:s.id},request,undefined,s.at);
async function finish(s:Fixture){s.at=Math.max(s.at,...state(s).buildings.map(b=>b.construction?.crew.endsAt??b.endsAt),state(s).movement?.endsAt??0,...Object.values(world(s).jobs).filter(j=>j.status==='running'||j.status==='reserved').map(j=>j.endsAt));return read(s);}
async function go(s:Fixture,p:{x:number;y:number}){await act(s,{type:'habitat.walk',...p});s.at=state(s).movement!.endsAt;await read(s);}
async function deposit(s:Fixture,itemId:ItemId,qty:number){const access=habitableBuildingEntrance(state(s),shed(s))!;if(Math.hypot(state(s).position.x-access.x,state(s).position.y-access.y)>.1)await go(s,access);const lot=player(s).inventory.find(l=>l.itemId===itemId&&l.qty>=qty)!;await act(s,{type:'habitat.storage.deposit',buildingId:shed(s).id,lotId:lot.id,qty});}
async function ready(s:Fixture){await deposit(s,'timber',3);await deposit(s,'stone',1);await go(s,{x:4.5,y:5});}
const command=(s:Fixture):MvpCommand=>({type:'habitat.build',playerId:s.id,templateId:'workbench',x:-2,y:-8,rotation:1,supplyShedId:shed(s).id});
const units=(s:Fixture,item:ItemId)=>player(s).inventory.filter(l=>l.itemId===item).reduce((n,l)=>n+l.qty,0);

test('a signed shed-fed construction reserves actual lots, carries them, builds at the real start and returns without duplication',async()=>{
  const s=await setup();await ready(s);const station=structuredClone(player(s).inventory),sources=structuredClone(shed(s).storage),before=structuredClone(s.store.record),request=crypto.randomUUID(),cmd=command(s),quote=await quoteMvp(s.store,s.owner,cmd,request,s.at);
  assert.deepEqual(s.store.record,before);assert.ok(quote.changes.some(i=>i.itemId==='timber'&&i.delta===-3));assert.ok(quote.changes.some(i=>i.itemId==='stone'&&i.delta===-1));assert.ok(quote.durationSeconds!>15);
  await validateMvpQuote(s.store,s.owner,cmd,request,quote.revision,quote.token,quote.expiresAt,s.at);let view=await executeMvp(s.store,s.owner,cmd,request,quote.revision,s.at),b=state(s).buildings.find(b=>b.templateId==='workbench')!;const c=b.construction!,worker=getHabitableWorkers(world(s),player(s),s.at).find(w=>w.id===c.workerId)!;
  assert.ok(view.player!.habitable!.buildings.find(v=>v.id===b.id)!.constructionVisual);assert.ok(view.habitable.state!.buildings.find(v=>v.id===b.id)!.constructionVisual);assert.deepEqual(player(s).inventory,station);assert.equal(shed(s).storage!.length,0);assert.equal(c.cargo.reduce((n,l)=>n+l.qty,0),4);assert.equal(habitableReservedStorage(state(s),shed(s).id),4);assert.equal(b.constructionCosts,undefined);assert.equal(view.player!.habitable!.buildings.find(v=>v.id===shed(s).id)!.visual!.storedUnits,4);assert.equal(b.endsAt-b.startsAt,15000);assert.equal(habitableWorkerAt(worker,s.at).walking,true);
  const loading=c.crew.legs.find(l=>l.phase==='loading')!,loaded=c.crew.legs.find(l=>l.phase==='between')!,unload=c.crew.legs.find(l=>l.phase==='unloading')!,work=c.crew.legs.find(l=>l.phase==='working')!,back=c.crew.legs.at(-1)!;
  assert.equal(habitableWorkerAt(worker,(loading.startsAt+loading.endsAt)/2).state,'loading');assert.equal(habitableWorkerAt(worker,(loaded.startsAt+loaded.endsAt)/2).cargoUnits,4);assert.equal(habitableWorkerAt(worker,(unload.startsAt+unload.endsAt)/2).state,'receiving');assert.equal(habitableWorkerAt(worker,work.startsAt+1).working,true);assert.equal(habitableWorkerAt(worker,back.startsAt+1).carrying,false);
  for(const leg of c.crew.legs)for(let i=1;i<leg.points.length;i++)assert.equal(habitableLineClear(leg.points[i-1],leg.points[i],state(s)),true);
  assert.ok(view.habitable.network.nextChangeAt!>s.at);assert.ok(view.habitable.network.edges.some(e=>e.kind==='construction'&&e.toBuildingId===b.id&&e.cargoUnits===4));
  s.at=b.startsAt-1;await read(s);assert.equal(state(s).buildings.find(v=>v.id===b.id)!.constructionCosts,undefined);s.at++;view=await read(s);b=state(s).buildings.find(v=>v.id===b.id)!;assert.deepEqual(b.constructionCosts,sources!.map(l=>({...l,location:`construction:${b.id}`})));assert.equal(b.construction!.cargo.length,0);assert.equal(habitableReservedStorage(state(s),shed(s).id),0);
  await finish(s);const settled=structuredClone(s.store.record);await executeMvp(s.store,s.owner,cmd,request,quote.revision,s.at);assert.deepEqual(s.store.record,settled);assert.deepEqual(player(s).inventory,station);assert.ok(b.bound);const text=JSON.stringify(view.habitable.actors.find(a=>a.playerId===s.id)!.state);for(const secret of['constructionCosts','originLotId','provenance','"cargo":'])assert.equal(text.includes(secret),false,secret);
});

test('the chosen resident has one stable visual identity and cannot be assigned or recruited into another task before returning',async()=>{
  const s=await setup();await ready(s);await act(s,{type:'habitat.residents.initialize'});const r=state(s).workforce!.residents[0],cmd={...command(s),residentId:r.id};await act(s,cmd);const b=state(s).buildings.find(b=>b.construction)!;
  assert.equal(b.construction!.residentId,r.id);assert.equal(getHabitableWorkers(world(s),player(s),s.at).filter(w=>w.id===r.id).length,1);const view=await read(s);assert.equal(view.habitable.residents.residents.find(v=>v.id===r.id)!.busy,true);
  const snapshot=structuredClone(s.store.record);await assert.rejects(act(s,{type:'habitat.resident.unassign',residentId:r.id}),/termine/);assert.deepEqual(s.store.record,snapshot);
  s.at=b.endsAt;await read(s);assert.equal((await read(s)).habitable.residents.residents.find(v=>v.id===r.id)!.busy,true,'completion of the building must not teleport its builder home');
  await finish(s);assert.equal((await read(s)).habitable.residents.residents.find(v=>v.id===r.id)!.busy,false);assert.equal(getHabitableWorkers(world(s),player(s),s.at).filter(w=>w.id===r.id).length,1);
});

test('foreign, incomplete and expired sources and unsupported worker selection reject before stock or dates change',async()=>{
  const s=await setup();await ready(s);const expect=async(c:MvpCommand,re:RegExp)=>{await read(s);const before=structuredClone(s.store.record);await assert.rejects(act(s,c),re);assert.deepEqual(s.store.record,before);};
  await expect({...command(s),supplyShedId:'foreign'},/pertenece/);await expect({...command(s),supplyShedId:12},/válidos/);await expect({...command(s),supplyShedId:undefined,residentId:'x'},/cobertizo/);shed(s).endsAt=s.at+10000;await expect(command(s),/terminado/);shed(s).endsAt=s.at-1;
  const source=shed(s).storage!.find(l=>l.itemId==='timber')!;source.expiresAt=s.at+1;await expect(command(s),/insumos válidos/);assert.equal(state(s).buildings.length,1);
});

test('a warehouse reserved by a construction cannot be demolished and its held capacity cannot be overfilled',async()=>{
  const s=await setup();await ready(s);await go(s,{x:5.8,y:5.9});await act(s,command(s));const before=structuredClone(s.store.record),b=state(s).buildings.find(b=>b.construction)!;
  await assert.rejects(act(s,{type:'habitat.building.demolish',buildingId:shed(s).id}),/constructor|ruta|reservas/);assert.deepEqual(s.store.record,before);
  const worker=getHabitableWorkers(world(s),player(s),s.at).find(w=>w.id===b.construction!.workerId)!,leg=b.construction!.crew.legs[0],at=(leg.startsAt+leg.endsAt)/2,pose=habitableWorkerAt(worker,at);assert.throws(()=>guardHabitableWorkerMovement(world(s),player(s),{points:[pose,pose],startsAt:at,endsAt:at+100}),/obrero/);
  // A separate finite preexisting shelf fixture occupies 75 units. Its four held
  // construction units leave one free slot, even though the shelf no longer lists them.
  const grain=player(s).inventory.find(l=>l.itemId==='grain'&&l.qty>=2)!;assert.ok(grain);shed(s).storage=[{...structuredClone(grain),id:'existing-shelf-stock',qty:75,location:`habitat:${shed(s).id}`}];
  const capacityBefore=structuredClone(s.store.record);await assert.rejects(act(s,{type:'habitat.storage.deposit',buildingId:shed(s).id,lotId:grain.id,qty:2}),/capacidad|espacio/);assert.deepEqual(s.store.record,capacityBefore);
});

test('network projections stay pure, scope private stocks to the owner and refresh static connections at the same clock after changes',async()=>{
  const s=await setup(),before=structuredClone(s.store.record),writes=s.store.writes,a=await read(s);await read(s);assert.equal(s.store.writes,writes);assert.deepEqual(s.store.record,before);assert.equal(a.habitable.network.nodes.length,1);assert.equal(a.habitable.buildSources[0].stock.length,0);
  const b:HabitableBuilding={id:'synthetic-static-table',templateId:'workbench',x:-2,y:-8,rotation:1,startsAt:s.at-20000,endsAt:s.at-1,bound:true};const first=getHabitableNetworkView(world(s),player(s),s.at);state(s).buildings.push(b);const second=getHabitableNetworkView(world(s),player(s),s.at);assert.equal(first.nodes.length,1);assert.equal(second.nodes.length,2);assert.equal(second.edges.filter(e=>e.kind==='connection').length,1);assert.ok(second.edges.every(e=>e.roadCoverage>=0&&e.roadCoverage<=1));assert.equal(second.nextChangeAt,null);
  const foreign=(await executeMvp(s.store,'foreign-owner',{type:'player.create',name:'Nora',stationName:'Otra',faction:'cartographers'},crypto.randomUUID(),undefined,s.at)).player!.id,view=await readMvpView(s.store,'foreign-owner',foreign,s.at);assert.equal(view.habitable.network.playerId,foreign);assert.equal(view.habitable.network.nodes.length,0);assert.equal(view.habitable.buildSources.length,0);const actor=view.habitable.actors.find(x=>x.playerId===s.id)!;assert.equal(actor.state.networkVisual,undefined,'a foreign public actor must not trigger idle path planning');assert.equal(Object.hasOwn(actor.state,'networkVisual'),false);assert.equal(actor.state.buildings.length,2);assert.ok(Array.isArray(actor.state.workers));assert.ok(a.habitable.actors.find(x=>x.playerId===s.id)!.state.networkVisual,'the selected explorer keeps its own network');
});

test('idle connections take real detours around all four district residents and never route through their bodies',async()=>{
  const s=await setup(),base=state(s).buildings[0],finished=(id:string,templateId:HabitableBuilding['templateId'],x:number,y:number):HabitableBuilding=>({...base,id,templateId,x,y,rotation:0,startsAt:s.at-60000,endsAt:s.at-1});
  state(s).buildings=[finished('source','shed',-2,-8),finished('table','workbench',-3,1),finished('field','planter',8,6)];
  const before=structuredClone(s.store.record),network=getHabitableNetworkView(world(s),player(s),s.at),edge=network.edges.find(e=>e.toBuildingId==='field')!,people=HABITABLE_POINTS.map(p=>({id:`district-${p.id}`,x:p.x+.7,y:p.y,width:.65,depth:.65,height:1.6}));
  // A refined grid finds a genuine narrow detour that the old half-unit grid missed.
  // Independently sweep every complete segment, rather than accepting sampled clear endpoints.
  assert.equal(edge.status,'connected');assert.ok(edge.points.length>2);assert.equal(edge.blockedReason,null);
  for(let i=1;i<edge.points.length;i++){assert.equal(habitableLineClear(edge.points[i-1],edge.points[i],state(s),people),true);for(const person of people)assert.equal(sweptObstacleHit(edge.points[i-1],edge.points[i],person,.32),false,person.id);}
  for(const person of people)assert.equal(habitablePath(state(s),edge.points[0],person,people),null,person.id);
  assert.deepEqual(s.store.record,before);
  state(s).buildings.find(b=>b.id==='table')!.x=7;state(s).buildings.find(b=>b.id==='table')!.y=3;
  const connected=getHabitableNetworkView(world(s),player(s),s.at).edges.find(e=>e.toBuildingId==='field')!;assert.equal(connected.status,'connected');assert.ok(connected.points.length>1);assert.equal(connected.blockedReason,null);
});

test('new worker posts preserve the workshop entrance and avatar exit without relocating a saved incumbent',async()=>{
  const s=await setup(),base=state(s).buildings[0],building=(id:string,templateId:HabitableBuilding['templateId'],x:number,y:number):HabitableBuilding=>({...base,id,templateId,x,y,rotation:0,startsAt:s.at-60000,endsAt:s.at-1});
  state(s).buildings=[building('source','shed',-2,-8),building('table','workbench',7,3),building('field','planter',8,6)];state(s).position={x:7.9,y:4.5};
  const bench=state(s).buildings[1],access=habitableBuildingEntrance(state(s),bench)!,badStand={x:6.05,y:4.25},extra=habitableWorkerObstacles(world(s),player(s),s.at,bench.id);
  assert.equal(habitablePath(state(s),state(s).position,HABITABLE_SPAWN,[...extra,{id:'old-post',...badStand,width:.85,depth:.85}]),null,'the former first lateral stand sealed the only exit');
  const stand=habitableWorkStand(world(s),player(s),bench,s.at);assert.ok(stand);assert.notDeepEqual(stand,badStand);const safe=[...extra,{id:'new-post',...stand,width:.85,depth:.85}];
  assert.ok(habitablePath(state(s),HABITABLE_SPAWN,access,safe));assert.ok(habitablePath(state(s),state(s).position,HABITABLE_SPAWN,safe));
  state(s).workforce={initializedAt:s.at-1000,sequence:1,residents:[{id:'saved-worker',name:'Mateo',homeBuildingId:null,position:{...badStand},assignment:{buildingId:bench.id,stand:{...badStand}},createdAt:s.at-1000}]};
  const before=structuredClone(s.store.record),view=await read(s);assert.deepEqual(s.store.record,before);assert.deepEqual(view.habitable.residents.residents[0].assignmentBuildingId,bench.id);assert.deepEqual(state(s).workforce!.residents[0].assignment!.stand,badStand);
});

test('the old Station build remains unchanged and a copied save catches up a shed-fed order exactly once',async()=>{
  const s=await setup(),wood=units(s,'timber');await act(s,{type:'habitat.build',templateId:'workbench',x:-2,y:-8,rotation:1});let b=state(s).buildings.at(-1)!;assert.equal(b.startsAt,s.at);assert.equal(b.endsAt-s.at,15000);assert.equal(b.construction,undefined);assert.equal(units(s,'timber'),wood-3);
  const fresh=await setup();await ready(fresh);await act(fresh,command(fresh));b=state(fresh).buildings.at(-1)!;const reload=new MemoryStore();reload.record=structuredClone(fresh.store.record);const s2={...fresh,store:reload,at:b.construction!.crew.endsAt+1000};await read(s2);const done=structuredClone(reload.record);await read(s2);assert.deepEqual(reload.record,done);assert.equal(state(s2).buildings.at(-1)!.construction!.cargo.length,0);assert.equal(state(s2).buildings.at(-1)!.constructionCosts!.reduce((n,l)=>n+l.qty,0),4);
});
