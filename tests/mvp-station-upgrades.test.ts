import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchProduction,settleProduction} from '../lib/mvp/production.ts';
import {dispatchStationUpgrade,getStationUpgradeVisuals,getStationUpgradeWorkers} from '../lib/mvp/station-upgrades.ts';
import {createMvpWorld} from '../lib/mvp/world.ts';
import {available,give} from '../lib/mvp/helpers.ts';
import {habitableWalkableAt,HABITABLE_SPAWN} from '../lib/mvp/habitable-data.ts';
import {executeMvp,quoteMvp,readMvpView} from '../lib/mvp/engine.ts';
import type {BuildingType,MvpCommand,MvpWorld} from '../lib/mvp/types.ts';
import type {HabitableWorkerVisual} from '../lib/mvp/habitable-data.ts';
const NOW=Date.UTC(2026,9,15,21);
let sequence=0;
function run(world:MvpWorld,id:string|null,cmd:MvpCommand,at=NOW){assert.equal(dispatchProduction(world,cmd,{ownerId:'owner',requestId:`test-${++sequence}`,now:at,actor:id?world.players[id]:null}),true);}
function setup(){const world=createMvpWorld('owner',NOW);run(world,null,{type:'player.create',name:'Obra',stationName:'Andamios',faction:'cartographers'});const p=Object.values(world.players)[0];for(const item of ['plank','iron_ingot','stone'] as const)give(p,item,20,NOW,'test-budget',[],false);return{world,p};}
const kinds:BuildingType[]=['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'];
for(const building of kinds)test(`upgrade ${building} keeps level until completion and renders one safe crew`,()=>{
 const {world,p}=setup(),farm=p.farmCycles,budget=JSON.stringify(world.regions),before=available(p,'plank',NOW);
 run(world,p.id,{type:'building.upgrade',building});const job=Object.values(world.jobs)[0];
 assert.equal(p.buildings[building],1);assert.equal(job.endsAt-NOW,60000);assert.equal(available(p,'plank',NOW),before-2);
 const visuals=getStationUpgradeVisuals(world,p);assert.equal(visuals.length,1);assert.equal(getStationUpgradeWorkers(world,p).length,1);assert.equal(p.habitable,undefined,'Upgrades must not initialize an avatar or residents');
 assert.equal(habitableWalkableAt(visuals[0].stand,{version:1,appearance:'pine',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings:[]}),true);
 assert.throws(()=>run(world,p.id,{type:'building.upgrade',building}),/ya tiene/);
 settleProduction(world,job.endsAt-1);assert.equal(p.buildings[building],1);settleProduction(world,job.endsAt);assert.equal(p.buildings[building],2);assert.equal(job.status,'completed');assert.equal(getStationUpgradeVisuals(world,p).length,0);assert.equal(p.farmCycles,farm);assert.equal(JSON.stringify(world.regions),budget);
 const finished=JSON.stringify(world);settleProduction(world,job.endsAt+10000);assert.equal(JSON.stringify(world),finished);
 run(world,p.id,{type:'building.upgrade',building},job.endsAt+10001);const second=Object.values(world.jobs).at(-1)!;assert.equal(second.endsAt-second.startsAt,120000);settleProduction(world,second.endsAt);assert.equal(p.buildings[building],3);assert.throws(()=>run(world,p.id,{type:'building.upgrade',building},second.endsAt+1),/máximo/);
});
test('cancelling a started improvement keeps the old level and consumes no further goods',()=>{const{world,p}=setup();run(world,p.id,{type:'building.upgrade',building:'warehouse'});const job=Object.values(world.jobs)[0],inventory=structuredClone(p.inventory);run(world,p.id,{type:'job.cancel',jobId:job.id},NOW+1);assert.equal(job.status,'cancelled');settleProduction(world,NOW+200000);assert.equal(p.buildings.warehouse,1);assert.deepEqual(p.inventory,inventory);assert.equal(getStationUpgradeVisuals(world,p).length,0);});
test('upgrade quotes reserve nothing and duplicate confirmation cannot create another crew',async()=>{
 const{world,p}=setup();let record={revision:0,world};const store={async read(){return structuredClone(record);},async insert(){throw Error('unexpected');},async compareAndSwap(revision:number,next:MvpWorld){if(revision!==record.revision)return false;record={revision:revision+1,world:structuredClone(next)};return true;}};
 const cmd={type:'building.upgrade',building:'workshop',playerId:p.id},id=crypto.randomUUID(),quote=await quoteMvp(store,'owner',cmd,id,NOW),before=JSON.stringify(record);
 assert.equal(quote.durationSeconds,60);assert.deepEqual(quote.changes.map(c=>[c.itemId,c.delta]).sort(),[['iron_ingot',-1],['plank',-2],['stone',-2]].sort());assert.equal(Object.keys(record.world.jobs).length,0);assert.equal(JSON.stringify(record),before);
 await executeMvp(store,'owner',cmd,id,quote.revision,NOW);const committed=JSON.stringify(record);await executeMvp(store,'owner',cmd,id,quote.revision,NOW+1);assert.equal(JSON.stringify(record),committed);
 const other=await readMvpView(store,'another-owner',undefined,NOW+10);assert.equal(other.jobs.length,0);const publicCrew=other.settlements.find(s=>s.playerId===p.id)!.construction!;assert.equal(publicCrew.length,1);assert.deepEqual(Object.keys(publicCrew[0]).sort(),['id','building','startsAt','endsAt','stand','yaw'].sort());
});

test('an original building crew cannot occupy an already confirmed future food-delivery stop',()=>{
 const baseline=setup();run(baseline.world,baseline.p.id,{type:'building.upgrade',building:'workshop'});const reserved=getStationUpgradeVisuals(baseline.world,baseline.p)[0].stand;
 const{world,p}=setup(),worker:HabitableWorkerVisual={id:'food-courier',buildingId:'synthetic-workbench',role:'worker',stand:{x:0,y:1.5},yaw:0,startsAt:0,workEndsAt:0,pendingUnits:0,blockedReason:null,daily:{startsAt:NOW+5000,endsAt:NOW+20000,legs:[{kind:'delivery',startsAt:NOW+5000,arrivesAt:NOW+18000,endsAt:NOW+20000,quantity:1,residentId:'recipient',points:[reserved,reserved]}]}};
 const before=structuredClone(world);
 assert.throws(()=>dispatchStationUpgrade(world,{type:'building.upgrade',building:'workshop'},{ownerId:'owner',requestId:'daily-route-upgrade',now:NOW,actor:p},[worker]),/acceso seguro/);
 assert.deepEqual(world,before,'a conflicting crew cannot reserve materials or a construction job');
});
