import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {habitableBuildingEntrance,habitableGroundHeight,habitableLineClear,habitableWalkableAt} from '../lib/mvp/habitable-data.ts';
import type {HabitableBuilding} from '../lib/mvp/habitable-data.ts';
import {demolitionReason,demolitionRecovery} from '../lib/mvp/land-civil.ts';
import {landCellFromId,landCrewAt,landMaintenance} from '../lib/mvp/land-grid.ts';
import type {LandCrewSchedule} from '../lib/mvp/land-grid.ts';
import {preferredLandPath} from '../lib/mvp/land-paths.ts';
import {settleLandExpansion} from '../lib/mvp/land-expansion.ts';
import {getHabitableWorkers,guardHabitableWorkerMovement} from '../lib/mvp/habitable-logistics.ts';
import {getActivityProgression} from '../lib/mvp/activity-progression.ts';
import {weatherFor} from '../lib/mvp/world.ts';
import type {InventoryLot,ItemId,Job,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T01:00:00Z');
class MemoryStore implements MvpStore {
  record:{revision:number;world:MvpWorld}|null=null;writes=0;
  async read(){return structuredClone(this.record);}
  async insert(world:MvpWorld){assert.equal(this.record,null);this.record={revision:0,world:structuredClone(world)};}
  async compareAndSwap(revision:number,world:MvpWorld){if(this.record?.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};this.writes++;return true;}
}
async function setup(){
  const store=new MemoryStore(),owner='civil-test-owner';
  const created=await executeMvp(store,owner,{type:'player.create',name:'Alba',stationName:'Cuadrilla',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  await executeMvp(store,owner,{type:'habitat.profile',playerId:id,appearance:'pine',profession:'carpenter'},crypto.randomUUID(),undefined,NOW);
  return{store,owner,id,at:NOW};
}
type Fixture=Awaited<ReturnType<typeof setup>>;
const world=(s:Fixture)=>s.store.record!.world;
const player=(s:Fixture)=>world(s).players[s.id];
const state=(s:Fixture)=>player(s).habitable!;
const units=(s:Fixture,item:ItemId)=>player(s).inventory.filter(l=>l.itemId===item).reduce((n,l)=>n+l.qty,0);
const read=(s:Fixture)=>readMvpView(s.store,s.owner,s.id,s.at);
async function signed(s:Fixture,command:MvpCommand){
  command={...command,playerId:s.id};await read(s);const before=structuredClone(s.store.record),request=crypto.randomUUID(),quote=await quoteMvp(s.store,s.owner,command,request,s.at);
  assert.deepEqual(s.store.record,before,'a preview must not debit materials or create infrastructure');
  await validateMvpQuote(s.store,s.owner,command,request,quote.revision,quote.token,quote.expiresAt,s.at);
  const view=await executeMvp(s.store,s.owner,command,request,quote.revision,s.at);return{view,quote,request,command};
}
async function finish(s:Fixture){s.at=Math.max(s.at,...Object.values(world(s).jobs).filter(j=>j.playerId===s.id&&['reserved','running'].includes(j.status)).map(j=>j.endsAt),...state(s).buildings.map(b=>b.endsAt),state(s).movement?.endsAt??0);return read(s);}
const landJob=(s:Fixture)=>Object.values(world(s).jobs).find(j=>j.playerId===s.id&&j.kind==='land'&&j.status==='running')!;
const crew=(j:Job)=>j.payload.crew as LandCrewSchedule;
const work=(j:Job)=>crew(j).legs.find(l=>l.phase==='working')!;
async function table(s:Fixture){await signed(s,{type:'habitat.build',templateId:'workbench',x:-2,y:-8,rotation:1});await finish(s);return state(s).buildings[0];}
async function approach(s:Fixture,b:HabitableBuilding){const access=habitableBuildingEntrance(state(s),b);assert.ok(access);await signed(s,{type:'habitat.walk',...access});await finish(s);}
async function rejectsUnchanged(s:Fixture,command:MvpCommand,pattern:RegExp){await read(s);const before=structuredClone(s.store.record);await assert.rejects(signed(s,command),pattern);assert.deepEqual(s.store.record,before);}

test('roads, a genuine river bridge and partial recycling form a finite signed cycle without new goods or repeat construction XP',async()=>{
  const s=await setup(),finance=structuredClone(world(s).social),deposits=structuredClone(world(s).tiles);
  await signed(s,{type:'craft.start',recipeId:'plank',qty:2});await finish(s);const b=await table(s),view=await read(s),xp=view.activity!.progression.xp;
  assert.equal(xp,50);assert.equal(units(s,'timber'),5);assert.ok(b.constructionCosts?.every(l=>l.bound));
  const cellId='land_2_7';await signed(s,{type:'habitat.land.clear',cellIds:[cellId]});await finish(s);const stone=units(s,'stone');
  const road=await signed(s,{type:'habitat.land.road',cellIds:[cellId]}),rj=landJob(s),rw=work(rj);
  assert.equal(units(s,'stone'),stone-1);assert.equal(rw.endsAt-rw.startsAt,10000);assert.ok(road.quote.durationSeconds!>10);assert.deepEqual(state(s).land!.roads,undefined);
  for(const leg of crew(rj).legs){assert.equal(landCrewAt(crew(rj),(leg.startsAt+leg.endsAt)/2).working,leg.phase==='working');for(let i=1;i<leg.points.length;i++)assert.equal(habitableLineClear(leg.points[i-1],leg.points[i],state(s)),true);}
  s.at=rw.endsAt;await read(s);assert.equal(state(s).land!.roads![cellId].completedAt,s.at);assert.equal(rj.status,'running');await finish(s);
  const committed=structuredClone(s.store.record);await executeMvp(s.store,s.owner,road.command,road.request,road.quote.revision,s.at);assert.deepEqual(s.store.record,committed);
  await rejectsUnchanged(s,{type:'habitat.land.road',cellIds:[cellId]},/ya construido/);
  assert.equal(habitableWalkableAt({x:10.3,y:8.5},state(s)),false);const oldBridge=habitableGroundHeight(10.6,4.25,state(s));
  await signed(s,{type:'habitat.land.bridge',presetId:'river-south'});const bj=landJob(s),bw=work(bj);assert.equal(bw.endsAt-bw.startsAt,60000);assert.equal(units(s,'plank'),0);assert.equal(units(s,'timber'),3);
  s.at=bw.endsAt-1;await read(s);assert.equal(habitableWalkableAt({x:10.3,y:8.5},state(s)),false);s.at++;await read(s);
  assert.equal(habitableLineClear({x:7.8,y:8.5},{x:12.8,y:8.5},state(s)),true);assert.ok(habitableGroundHeight(10.3,8.5,state(s))>2);assert.equal(habitableGroundHeight(10.6,4.25,state(s)),oldBridge);await finish(s);
  await approach(s,b);const order=await signed(s,{type:'habitat.building.demolish',buildingId:b.id}),dj=landJob(s),dw=work(dj),timber=units(s,'timber');
  assert.equal(dw.endsAt-dw.startsAt,30000);assert.ok(state(s).buildings[0].demolition);assert.ok(order.quote.expectedOutputs?.some(o=>o.itemId==='timber'&&o.qty===1));
  s.at=dw.endsAt;let after=await read(s);assert.equal(state(s).buildings.length,0);assert.equal(units(s,'timber'),timber);const tomb=state(s).land!.demolished![0];assert.equal(tomb.recoveryCargo![0].qty,1);assert.equal(landCrewAt(crew(dj),s.at+1).cargoUnits,1);assert.equal(after.activity!.progression.xp,xp);
  await finish(s);const history=state(s).land!.demolished![0],lot=history.recoveredLots[0],source=history.building.constructionCosts!.find(l=>l.itemId==='timber')!;
  assert.equal(units(s,'timber'),timber+1);assert.equal(lot.originLotId,source.originLotId??source.id);assert.equal(lot.bound,source.bound);assert.deepEqual(lot.provenance,source.provenance);assert.equal(history.recoveryCargo!.length,0);
  const saved=structuredClone(s.store.record);await executeMvp(s.store,s.owner,order.command,order.request,order.quote.revision,s.at);assert.deepEqual(s.store.record,saved);
  await table(s);after=await read(s);assert.equal(after.activity!.progression.xp,xp);assert.ok(state(s).buildings[0].rebuildOf);assert.equal(units(s,'timber'),1);assert.equal(units(s,'stone'),3);
  assert.deepEqual(world(s).tiles,deposits);assert.deepEqual(world(s).social.accounts,finance.accounts);assert.deepEqual(world(s).social.ledger,finance.ledger);assert.equal(state(s).daily,undefined);assert.deepEqual(landMaintenance(state(s)),{extraRations:0,extraTimber:2,roads:1,bridges:1});
  const publicText=JSON.stringify(after.habitable.actors[0].state);for(const key of['constructionCosts','originLotId','recoveryCargo','recoveredLots','provenance'])assert.equal(publicText.includes(key),false,key);
});

test('a demolition reservation rejects new deposits, work and assignments atomically, with defensive preservation of unexpected goods',async()=>{
  const s=await setup(),b=await table(s);await approach(s,b);await signed(s,{type:'habitat.building.demolish',buildingId:b.id});const job=landJob(s);
  for(const command of[{type:'habitat.workbench.start',buildingId:b.id,recipeId:'plank'},{type:'habitat.storage.deposit',buildingId:b.id,lotId:player(s).inventory[0].id,qty:1},{type:'habitat.residents.assign',buildingId:b.id,residentId:'invalid'}])await rejectsUnchanged(s,command,/reservada para desmontaje/);
  // Simulate a conflicting old persisted job, which must preserve its goods instead of erasing them or blocking all realm reads.
  const real=player(s).inventory.find(l=>l.itemId==='timber')!;player(s).inventory=player(s).inventory.filter(l=>l.id!==real.id);state(s).buildings[0].storage=[real];
  s.at=work(job).endsAt;await read(s);assert.equal(state(s).buildings.length,1);assert.deepEqual(state(s).buildings[0].storage,[real]);assert.equal(state(s).land!.demolished,undefined);assert.equal(landCrewAt(crew(world(s).jobs[job.id]),s.at+1).cargoUnits,0);
  await finish(s);assert.equal(world(s).jobs[job.id].status,'cancelled');assert.equal(state(s).buildings[0].demolition,undefined);
});

test('unsafe or foreign demolition and arbitrary water works do not debit lots, and occupied homes cannot be removed',async()=>{
  const s=await setup(),b=await table(s);await rejectsUnchanged(s,{type:'habitat.building.demolish',buildingId:b.id},/Acercate/);await rejectsUnchanged(s,{type:'habitat.building.demolish',buildingId:'foreign'},/pertenece/);await rejectsUnchanged(s,{type:'habitat.land.bridge',presetId:'anywhere'},/desconocido/);
  const cell=(await read(s)).land!.cells.find(c=>c.terrain==='water')!;await rejectsUnchanged(s,{type:'habitat.land.road',cellIds:[cell.id]},/propias|despejadas|agua/);
  const home:HabitableBuilding={...b,id:'occupied-home',templateId:'house',x:-9,y:9};state(s).buildings.push(home);state(s).workforce={initializedAt:s.at,sequence:1,residents:[{id:'resident',name:'Nora',createdAt:s.at,homeBuildingId:home.id,position:{x:-8.05,y:10.85}}]};
  assert.match(demolitionReason(world(s),player(s),home,s.at)!,/habitantes/);home.endsAt=s.at+1;assert.match(demolitionReason(world(s),player(s),home,s.at)!,/construcción/);
});

test('recycling floors each genuinely paid material total and retains binding, age, wear and finite provenance',()=>{
  const lot=(id:string,qty:number,bound:boolean,expiresAt:number|null=null):InventoryLot=>({id,itemId:'timber',qty,bound,quality:2,expiresAt,wear:17,location:'construction',provenance:{source:'finite-existing-forest',creatorId:'p',seasonId:'s',inputs:[]}});
  const b:HabitableBuilding={id:'b',templateId:'workbench',x:0,y:0,rotation:0,startsAt:NOW-20000,endsAt:NOW-10000,bound:true,constructionCosts:[lot('first',1,true),lot('second',2,false)]};
  const recovered=demolitionRecovery(b,NOW);assert.equal(recovered.reduce((n,l)=>n+l.qty,0),1);assert.deepEqual(recovered,[{...b.constructionCosts![0],qty:1}]);assert.equal(demolitionRecovery({...b,constructionCosts:undefined},NOW).length,0);assert.equal(demolitionRecovery({...b,constructionCosts:[lot('expired',3,true,NOW)]},NOW).length,0);
});

test('existing v1 deadlines and duplicate historic construction XP survive reads and removal without migration',async()=>{
  const s=await setup(),b=await table(s),other={...structuredClone(b),id:'historic-second',x:7,y:3};state(s).buildings.push(other);const xp=getActivityProgression(world(s),player(s),s.at)!.progression.xp;
  state(s).land={version:1,activatedAt:s.at,centerLevel:1,cells:{},usedProofs:[]};const tile=world(s).tiles[player(s).position],j:Job={id:'legacy-land',playerId:s.id,kind:'land',status:'running',createdAt:s.at,startsAt:s.at,endsAt:s.at+60000,ruleVersion:world(s).rulesVersion,weather:weatherFor(tile.regionId,s.at),route:[tile.id],costs:[],payload:{landOperation:'center',fromLevel:1,toLevel:2,cellIds:[]},report:[]};world(s).jobs[j.id]=j;
  const before=structuredClone(s.store.record);s.at+=30000;await read(s);assert.deepEqual(s.store.record,before);assert.equal(getHabitableWorkers(world(s),player(s),s.at).some(w=>w.crew),false);
  s.at=j.endsAt;await read(s);assert.equal(state(s).land!.centerLevel,2);assert.equal(world(s).jobs[j.id].endsAt-j.startsAt,60000);assert.equal(world(s).jobs[j.id].payload.crew,undefined);
  state(s).buildings=state(s).buildings.filter(x=>x.id!==b.id);state(s).land!.demolished=[{id:'historical-demo',jobId:'historic',building:structuredClone(b),removedAt:s.at,recoveredAt:s.at,recoveredLots:[]}];assert.equal(getActivityProgression(world(s),player(s),s.at)!.progression.xp,xp);
  const settled=structuredClone(s.store.record);settleLandExpansion(world(s),s.at+1000);assert.deepEqual(s.store.record,settled);
});

test('road preference keeps safe detours and never permits a forbidden segment or changes movement speed',()=>{
  const from={x:0,y:0},to={x:10,y:0},road=(p:{x:number;y:number})=>Math.abs(p.y-1)<=.26||p.x<=.3||p.x>=9.7;
  const route=preferredLandPath(from,to,()=>true,road);assert.ok(route);assert.ok(route.some(p=>p.y>=.5),'a modest road detour should be preferred over ten off-road units');assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to);
  assert.equal(preferredLandPath(from,to,()=>false,()=>true),null);
});

test('the crew timetable reserves the actual walking and working segments against new movement',async()=>{
  const s=await setup();await signed(s,{type:'habitat.land.clear',cellIds:['land_2_7']});const j=landJob(s),schedule=crew(j),leg=schedule.legs[0],point=landCrewAt(schedule,(leg.startsAt+leg.endsAt)/2);
  assert.equal(point.walking,true);assert.throws(()=>guardHabitableWorkerMovement(world(s),player(s),{points:[point,point],startsAt:(leg.startsAt+leg.endsAt)/2,endsAt:leg.endsAt}),/obrero|ruta|trabajador|cuadrilla|paso/i);
  assert.ok(landCellFromId('land_2_7'));await rejectsUnchanged(s,{type:'job.cancel',jobId:j.id},/completar/);
});
