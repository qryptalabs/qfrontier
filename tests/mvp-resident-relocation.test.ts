import test from 'node:test';
import assert from 'node:assert/strict';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {habitableLineClear,habitablePositionAt,habitableWalkableAt,habitableWorkerAt} from '../lib/mvp/habitable-data.ts';
import {getHabitableWorkers,guardHabitableWorkerConstruction,habitableWorkerObstacles,habitableWorkStand} from '../lib/mvp/habitable-logistics.ts';
import {habitableResidentBusy,planHabitableResidentRelocation,requireHabitableResident,dispatchHabitableResidents} from '../lib/mvp/habitable-residents.ts';
import type {HabitableBuilding,HabitableResident,HabitableState} from '../lib/mvp/habitable-data.ts';
import type {HabitableManagerState} from '../lib/mvp/habitable-manager.ts';

const NOW=Date.parse('2026-10-16T20:00:00Z');
function fixture(){
  const world=createMvpWorld('relocation-owner',NOW),p=createPlayer(world,{ownerId:'relocation-owner',requestId:crypto.randomUUID(),now:NOW,actor:null},{type:'player.create',name:'Alba',stationName:'Trayectos reales',faction:'cartographers'});
  const workbench:HabitableBuilding={id:'bench',templateId:'workbench',x:7,y:3,rotation:0,startsAt:NOW-30000,endsAt:NOW-1,bound:true},resident:HabitableResident={id:'operator',name:'Nora',homeBuildingId:null,position:{x:-2,y:1.5},createdAt:NOW-60000};
  const state:HabitableState={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[workbench],workforce:{sequence:1,initializedAt:NOW-60000,residents:[resident]}};p.habitable=state;
  return{world,p,state,resident,workbench};
}

test('the shared relocation planner is pure and follows the same dry collision geometry and real resident identity',()=>{
  const f=fixture(),target=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(target);const before=structuredClone(f.world),move=planHabitableResidentRelocation(f.world,f.p,f.resident,target,NOW);
  assert.deepEqual(f.world,before,'previewing an operator transition cannot change a save, assignment or clock');assert.deepEqual(move.points[0],f.resident.position);assert.deepEqual(move.points.at(-1),target);assert.ok(move.endsAt>move.startsAt);
  const extra=habitableWorkerObstacles(f.world,f.p,NOW,undefined,true,f.resident.id);for(let i=1;i<move.points.length;i++)assert.ok(habitableLineClear(move.points[i-1],move.points[i],f.state,extra));
  f.resident.relocation=move;f.resident.assignment={buildingId:f.workbench.id,stand:{...target}};
  for(let at=move.startsAt;at<=move.endsAt;at+=100){const workers=getHabitableWorkers(f.world,f.p,at),actor=workers.find(w=>w.id===f.resident.id);assert.ok(actor);assert.equal(workers.filter(w=>w.id===f.resident.id).length,1);const pose=habitableWorkerAt(actor,at);assert.ok(habitableWalkableAt(pose,f.state,.32,extra));assert.ok(Math.hypot(pose.x-f.state.position.x,pose.y-f.state.position.y)>=.75);}
  const end=habitableWorkerAt(getHabitableWorkers(f.world,f.p,move.endsAt)[0],move.endsAt);assert.deepEqual({x:end.x,y:end.y},target);
});

test('a destination search excludes only the moving resident and never places it on another resident',()=>{
  const f=fixture(),first=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(first);f.resident.position={...first};
  assert.deepEqual(habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id),first);assert.notDeepEqual(habitableWorkStand(f.world,f.p,f.workbench,NOW),first);
  f.state.workforce!.residents.push({...f.resident,id:'other',name:'Iris'});const alternative=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(alternative);assert.ok(Math.hypot(alternative.x-first.x,alternative.y-first.y)>=.75);
  assert.throws(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,first,NOW),/camino seguro|ruta|obrero/);
});

test('a second transition waits for the real arrival and starts at its endpoint even before consolidation',()=>{
  const f=fixture(),target=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(target);const move=planHabitableResidentRelocation(f.world,f.p,f.resident,target,NOW);f.resident.relocation=move;
  const during=structuredClone(f.world);assert.throws(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,{x:-2,y:1.5},move.startsAt+1),/llegue/);assert.deepEqual(f.world,during);
  const returnMove=planHabitableResidentRelocation(f.world,f.p,f.resident,{x:-2,y:1.5},move.endsAt+1);assert.deepEqual(returnMove.points[0],target);assert.deepEqual(returnMove.points.at(-1),{x:-2,y:1.5});
  const start=habitablePositionAt({position:{x:999,y:999},movement:returnMove}as HabitableState,returnMove.startsAt);assert.deepEqual(start,target,'the return cannot jump back to the resident’s stale stored origin');
});

test('an operator return waits for the avatar’s already authorized future arrival rather than intersecting it',()=>{
  const f=fixture(),origin={...f.resident.position},stand=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(stand);f.resident.position={...stand};f.resident.assignment={buildingId:f.workbench.id,stand};
  const safe=planHabitableResidentRelocation(f.world,f.p,f.resident,origin,NOW);assert.ok(safe.endsAt>NOW+1000,'the avatar reaches the origin before the returning operator');
  f.state.movement={points:[{...f.state.position},origin],startsAt:NOW,endsAt:NOW+1000};const before=structuredClone(f.world);
  assert.throws(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,origin,NOW),/desplazamiento por su ruta|puesto de llegada/);assert.deepEqual(f.world,before,'a rejected temporal collision leaves both saved trajectories intact');
  const afterArrival=f.state.movement.endsAt+1;assert.throws(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,origin,afterArrival),/camino seguro/);
  f.state.movement={points:[{...f.state.position},{x:1.5,y:1.5}],startsAt:NOW,endsAt:NOW+1000};assert.doesNotThrow(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,origin,NOW),'a separate future walk does not unnecessarily block the return');
});

test('a malformed distant avatar deadline rejects safely instead of creating an unbounded temporal scan',()=>{
  const f=fixture(),stand=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(stand);f.state.movement={points:[{...f.state.position},{x:1.5,y:1.5}],startsAt:NOW,endsAt:Infinity};
  assert.throws(()=>planHabitableResidentRelocation(f.world,f.p,f.resident,stand,NOW),/demasiado largo/);
});

test('a reserved operator cannot be reassigned or manually dispatched and its empty origin remains usable but cannot be built over',()=>{
  const f=fixture(),target=habitableWorkStand(f.world,f.p,f.workbench,NOW,f.resident.id);assert.ok(target);const origin={...f.resident.position};f.resident.assignment={buildingId:f.workbench.id,stand:target};f.resident.position={...target};
  const manager:HabitableManagerState={version:1,id:'reserved-plan',supplyShedId:'shed',workbenchId:f.workbench.id,planterId:null,goals:{ration:0,plank:0,cloth:0},status:'draining',approvals:[],cursor:NOW,nextAt:null,turn:{id:'turn',startsAt:NOW,endsAt:NOW+600000,maxOrders:6,inputBudget:24,startedOrders:0,completedOrders:0,committedInputs:[],sequence:0},operatorState:{residentId:f.resident.id,origin,initializedAt:NOW},operator:{residentId:f.resident.id,allowedJobs:['woodlot','sawmill'],preferredJob:'woodlot'}};f.state.manager=manager;
  assert.equal(habitableResidentBusy(f.world,f.p,f.resident,NOW),true);assert.throws(()=>requireHabitableResident(f.world,f.p,f.workbench,NOW),/reservado/);assert.throws(()=>requireHabitableResident(f.world,f.p,f.workbench,NOW,undefined,'foreign-plan'),/reservado/);assert.equal(requireHabitableResident(f.world,f.p,f.workbench,NOW,undefined,manager.id),f.resident);
  const context={ownerId:f.p.ownerId,requestId:crypto.randomUUID(),now:NOW,actor:f.p};assert.throws(()=>dispatchHabitableResidents(f.world,{type:'habitat.resident.unassign',residentId:f.resident.id},context),/termine/);
  const sawmill:HabitableBuilding={id:'reserved-sawmill',templateId:'sawmill',x:-12,y:5,rotation:0,startsAt:NOW-60000,endsAt:NOW-1,bound:true};f.state.buildings.push(sawmill);manager.sawmillId=sawmill.id;f.state.workforce!.residents.push({id:'other',name:'Iris',homeBuildingId:null,position:{x:1.5,y:1.5},createdAt:NOW-60000});assert.throws(()=>dispatchHabitableResidents(f.world,{type:'habitat.resident.assign',residentId:'other',buildingId:sawmill.id},context),/puesto está reservado/);
  assert.ok(habitableWalkableAt(origin,f.state),'reserving the origin does not create a standing collision obstacle');
  const proposed=structuredClone(f.state);proposed.buildings.push({id:'new-shed',templateId:'shed',...origin,rotation:0,bound:true,startsAt:NOW,endsAt:NOW+30000});assert.throws(()=>guardHabitableWorkerConstruction(f.world,f.p,proposed,NOW),/puesto original|regreso del operador/);
  manager.operatorState!.releasedAt=NOW;assert.equal(habitableResidentBusy(f.world,f.p,f.resident,NOW),false);assert.equal(requireHabitableResident(f.world,f.p,f.workbench,NOW),f.resident);
});
