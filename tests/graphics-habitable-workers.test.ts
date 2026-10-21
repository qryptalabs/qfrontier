import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createHabitableWorkerModelLibrary} from '../lib/graphics/habitable-worker-models.ts';
import {createHabitableWorkerLayer,habitableWorkerActionAt} from '../lib/graphics/habitable-workers.ts';
import {createHabitableBuildingLayer} from '../lib/graphics/habitable-buildings.ts';
import {HABITABLE_POINTS,HABITABLE_SPAWN,habitableBuildingEntrance,habitableWorkerAt,habitableWalkableAt,type HabitableBuilding,type HabitableState,type HabitableWorkerVisual} from '../lib/mvp/habitable-data.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpWorld} from '../lib/mvp/types.ts';
import {physicalHomeNpcCapsulesNear} from '../lib/mvp/exploration-data.ts';

function visibleBounds(group:THREE.Object3D){group.updateMatrixWorld(true);const bounds=new THREE.Box3();group.traverseVisible(object=>{if(object instanceof THREE.Mesh){object.geometry.computeBoundingBox();bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));}});return bounds;}

test('functional workers retain adult avatar scale, grounded feet and distinct stable work clothes',()=>{
  const library=createHabitableWorkerModelLibrary();for(const role of['builder','farmer']as const){const actor=library.get(role,11);actor.animate({action:'idle',walking:false,carrying:false},100,true);const bounds=visibleBounds(actor.group),size=bounds.getSize(new THREE.Vector3());assert.equal(actor.group.scale.x,.72);assert.ok(bounds.min.y>=-.02);assert.ok(size.y>1.35&&size.y<1.6);assert.ok(size.x<.8);assert.equal(actor.group.getObjectByName('actor-load')!.visible,false);actor.dispose();}library.dispose();
});

test('job-specific tools stay attached to hands and disappear while walking or carrying real cargo',()=>{
  const library=createHabitableWorkerModelLibrary(),actor=library.get('farmer',3),tool=actor.group.getObjectByName('habitable-worker-watering-can')!;
  actor.animate({action:'watering',walking:false,carrying:false},10,false);assert.equal(tool.visible,true);assert.equal(tool.parent?.name,'actor-right-elbow');assert.equal(actor.group.getObjectByName('habitable-worker-seed-pouch')!.visible,false);assert.ok(actor.group.getObjectsByProperty('name','habitable-worker-water-drop').every(drop=>drop.visible));
  actor.animate({action:'carrying',walking:true,carrying:true},11,false);assert.equal(tool.visible,false);assert.equal(actor.group.getObjectByName('habitable-worker-harvest-tool')!.visible,false);assert.ok(actor.group.getObjectsByProperty('name','habitable-worker-water-drop').every(drop=>!drop.visible));assert.equal(actor.group.getObjectByName('actor-load')!.visible,true);assert.ok(visibleBounds(actor.group).getSize(new THREE.Vector3()).z<.85);
  actor.group.updateMatrixWorld(true);const carried=new THREE.Box3().setFromObject(actor.group.getObjectByName('actor-load')!);for(const side of['left','right']){const hand=new THREE.Vector3(0,-.32,.02).applyMatrix4(actor.group.getObjectByName(`actor-${side}-elbow`)!.matrixWorld);assert.ok(carried.distanceToPoint(hand)<.08,'both hands physically support the carried sack');}
  actor.animate({action:'returning',walking:true,carrying:false},12,false);assert.equal(actor.group.getObjectByName('actor-load')!.visible,false);actor.dispose();library.dispose();
});

test('wood, cloth and farming actions use the proper held tool without any autonomous animation at idle',()=>{
  const library=createHabitableWorkerModelLibrary(),actor=library.get('builder',7),hammer=actor.group.getObjectByName('habitable-worker-hand-tool')!,needle=actor.group.getObjectByName('habitable-worker-sewing-tool')!;
  actor.animate({action:'crafting',walking:false,carrying:false},20,false);assert.equal(hammer.visible,true);assert.equal(needle.visible,false);actor.animate({action:'sewing',walking:false,carrying:false},21,false);assert.equal(hammer.visible,false);assert.equal(needle.visible,true);actor.animate({action:'idle',walking:false,carrying:false},22,false);assert.equal(hammer.visible,false);assert.equal(needle.visible,false);assert.equal(actor.group.userData.habitableWorkerCarrying,false);library.dispose();
});

test('reduced motion freezes worker articulation without hiding a confirmed load or reallocating its geometry',()=>{
  const library=createHabitableWorkerModelLibrary(),actor=library.get('builder',5),load=actor.group.getObjectByName('actor-load')!,geometry=(load.children[0]as THREE.Mesh).geometry;
  actor.animate({action:'carrying',walking:true,carrying:true},1,true);actor.group.updateMatrixWorld(true);const matrices:THREE.Matrix4[]=[];actor.group.traverse(object=>matrices.push(object.matrix.clone()));actor.animate({action:'carrying',walking:true,carrying:true},1000,true);actor.group.updateMatrixWorld(true);let i=0;actor.group.traverse(object=>assert.ok(object.matrix.equals(matrices[i++])));assert.equal(load.visible,true);assert.equal((load.children[0]as THREE.Mesh).geometry,geometry);let freed=0;geometry.addEventListener('dispose',()=>freed++);actor.dispose();assert.equal(freed,0);library.dispose();library.dispose();assert.equal(freed,1);
});

function logisticsFixture(){
  const planter:HabitableBuilding={id:'field',templateId:'planter',x:8,y:6,rotation:0,startsAt:0,endsAt:1000,bound:false,visual:{state:'working',operation:'grow',startsAt:10000,endsAt:55000}},worker:HabitableWorkerVisual={id:'farmer-field',buildingId:planter.id,role:'farmer',stand:{x:8,y:4.4},yaw:0,startsAt:10000,workEndsAt:55000,pendingUnits:0,blockedReason:null,shipment:{points:[{x:8,y:4.4},{x:7,y:4.4},{x:7,y:5.1}],startsAt:55000,pickupAt:58000,arrivesAt:62000,unloadsAt:65000,endsAt:69000,quantity:4,destinationBuildingId:'store'}},state:HabitableState={version:1,appearance:'pine',profession:'farmer',position:{x:0,y:1.5},buildings:[planter],workers:[worker]};return{state,worker,planter};
}

test('a farmer never harvests early and only carries goods during the authoritative pickup-to-unload interval',()=>{
  const{state,worker,planter}=logisticsFixture(),layer=createHabitableWorkerLayer({groundHeight:(x,y)=>2+x*.01+y*.02}),before=JSON.stringify(state);
  for(const[now,action]of[[9000,'idle'],[11000,'sowing'],[25000,'watering'],[50000,'tending'],[56000,'harvesting'],[60000,'carrying'],[63000,'unloading'],[67000,'returning'],[70000,'idle']]as const){assert.equal(habitableWorkerActionAt(worker,now,planter),action);layer.update(state,now,false);const actor=layer.group.getObjectByName(`habitable-worker-${worker.id}`)!,pose=habitableWorkerAt(worker,now);assert.equal(actor.position.x,pose.x);assert.equal(actor.position.z,pose.y);assert.equal(actor.position.y,2+pose.x*.01+pose.y*.02+.035);assert.equal(actor.userData.habitableWorkerCargoUnits,pose.carrying?4:0);assert.equal(actor.getObjectByName('actor-load')!.visible,pose.carrying);assert.equal(actor.getObjectByName('habitable-worker-harvest-tool')!.visible,action==='tending'||action==='harvesting');}
  assert.equal(JSON.stringify(state),before);layer.dispose();
});

test('a finished crop waits visibly for collection and leaves the bed only when its confirmed load is picked up',()=>{
  const{state,worker,planter}=logisticsFixture(),layer=createHabitableBuildingLayer({state});planter.visual={state:'idle',operation:'grow',startsAt:10000,endsAt:55000};layer.update(state,56000);assert.equal(layer.group.getObjectByName('habitable-crop-2')!.visible,true);assert.equal(layer.group.getObjectByName('player-built-field')!.userData.habitableVisual.awaitingPickup,true);layer.update(state,58000);for(let stage=0;stage<3;stage++)assert.equal(layer.group.getObjectByName(`habitable-crop-${stage}`)!.visible,false);assert.equal(layer.group.getObjectByName(`habitable-worker-${worker.id}`)!.getObjectByName('actor-load')!.visible,true);layer.dispose();
});

test('missing or full storage leaves pending goods at the real building, with an empty-handed stationary worker',()=>{
  const{state,worker,planter}=logisticsFixture();delete worker.shipment;worker.pendingUnits=4;worker.blockedReason='El cobertizo está lleno.';planter.visual={state:'idle',operation:'grow',startsAt:10000,endsAt:55000};const layer=createHabitableBuildingLayer({state});layer.update(state,70000);const actor=layer.group.getObjectByName(`habitable-worker-${worker.id}`)!;assert.equal(actor.position.x,worker.stand.x);assert.equal(actor.position.z,worker.stand.y);assert.equal(actor.userData.habitableWorkerState,'waiting');assert.equal(actor.getObjectByName('actor-load')!.visible,false);assert.equal(layer.group.getObjectByName('habitable-crop-2')!.visible,true);assert.equal(layer.group.getObjectByName('player-built-field')!.userData.habitableLabel,'Bancal · Esperando traslado');layer.dispose();
});

test('legacy saves never gain invented workers and worker models detach without releasing shared geometry early',()=>{
  const{state,worker}=logisticsFixture(),layer=createHabitableWorkerLayer({groundHeight:()=>2});layer.update({...state,workers:undefined},20000);assert.equal(layer.group.children.length,0);layer.update(state,60000);const actor=layer.group.getObjectByName(`habitable-worker-${worker.id}`)!,cargo=actor.getObjectByName('actor-load')!.children[0]as THREE.Mesh;let freed=0;cargo.geometry.addEventListener('dispose',()=>freed++);layer.update({...state,workers:[]},61000);assert.equal(layer.group.children.length,0);assert.equal(freed,0);layer.dispose();layer.dispose();assert.equal(freed,1);
});

test('builders have a physical body exactly while their confirmed job is visibly active and leave no invisible body after completion',()=>{
  const{state,worker}=logisticsFixture();worker.role='builder';worker.startsAt=100;worker.workEndsAt=200;delete worker.shipment;const layer=createHabitableWorkerLayer({groundHeight:()=>2}),plot={x:128,y:-64},point={x:plot.x+worker.stand.x,y:plot.y+worker.stand.y};
  try{for(const[now,visible]of[[50,false],[150,true],[250,false]]as const){layer.update(state,now,true);const model=layer.group.getObjectByName(`habitable-worker-${worker.id}`),bodies=physicalHomeNpcCapsulesNear(point,{plot,state},now,4,false);assert.equal(!!model,visible);assert.equal(bodies.some(body=>body.id===worker.id),visible);}}
  finally{layer.dispose();}
});

class WorkerTestStore implements MvpStore{
  record:{revision:number;world:MvpWorld};constructor(world:MvpWorld){this.record={revision:0,world};}
  async read(){return structuredClone(this.record);}
  async insert(){}
  async compareAndSwap(revision:number,world:MvpWorld){if(revision!==this.record.revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}
}

test('actual QA facilities produce a grounded, collision-free visible worker route with a timed load and real shelf delivery',async()=>{
  const now=Date.parse('2026-10-16T12:00:00Z');
  for(const source of['bench','field']){
    const world=createMvpWorld('worker-owner',now),player=createPlayer(world,{ownerId:'worker-owner',requestId:`graphics-worker-${source}`,now,actor:null},{type:'player.create',name:'Ensayo de oficios',stationName:'Taller vivo',faction:'cartographers'}),buildings:HabitableBuilding[]=[{id:'bench',templateId:'workbench',x:-2,y:-8,rotation:1,startsAt:0,endsAt:1,bound:true},{id:'store',templateId:'shed',x:7,y:3,rotation:0,startsAt:0,endsAt:1,bound:true},{id:'field',templateId:'planter',x:8,y:6,rotation:0,startsAt:0,endsAt:1,bound:true}];
    player.habitable={version:1,appearance:'pine',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings};const sourceBuilding=buildings.find(b=>b.id===source)!,access=habitableBuildingEntrance(player.habitable,sourceBuilding);assert.ok(access);player.habitable.position=access;const store=new WorkerTestStore(world),command=source==='bench'?{type:'habitat.workbench.start',recipeId:'plank'}:{type:'habitat.planter.start'};
    const started=await executeMvp(store,'worker-owner',{...command,playerId:player.id,buildingId:source},crypto.randomUUID(),undefined,now),job=started.jobs.find(j=>j.payload.habitableBuildingId===source)!;assert.ok(job);const initial=started.habitable.state!,assigned=initial.workers!.find(w=>w.buildingId===source)!;assert.ok(assigned);assert.ok(Math.hypot(assigned.stand.x-access.x,assigned.stand.y-access.y)>=.8,'worker and avatar use separate physical places');
    const workingLayer=createHabitableWorkerLayer({groundHeight:()=>2});let touchesWorkSurface=false;for(let offset=0;offset<2000;offset+=50){workingLayer.update(initial,source==='bench'?now+offset:now+35000+offset);const actor=workingLayer.group.getObjectByName(`habitable-worker-${assigned.id}`)!;actor.updateMatrixWorld(true);const tool=actor.getObjectByName(source==='bench'?'habitable-worker-hand-tool':'habitable-worker-harvest-tool')as THREE.Mesh,vertices=tool.geometry.attributes.position,c=Math.cos(sourceBuilding.rotation*Math.PI/2),s=Math.sin(sourceBuilding.rotation*Math.PI/2),surfaceY=source==='bench'?3.045:2.355,halfWidth=source==='bench'?1.15:1.25,halfDepth=source==='bench'?.725:.95;for(let i=0;i<vertices.count;i++){const point=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(tool.matrixWorld),dx=point.x-sourceBuilding.x,dz=point.z-sourceBuilding.y;if(Math.abs(dx*c-dz*s)<=halfWidth+.05&&Math.abs(dx*s+dz*c)<=halfDepth+.05&&Math.abs(point.y-surfaceY)<.17)touchesWorkSurface=true;}}
    assert.ok(touchesWorkSurface,`${source} tools actually reach the rotated QA work surface from their server stand`);workingLayer.dispose();
    const moved=await executeMvp(store,'worker-owner',{type:'habitat.walk',playerId:player.id,...HABITABLE_SPAWN},crypto.randomUUID(),undefined,now+1),arrived=moved.player!.habitable!.movement!.endsAt;assert.ok(arrived<job.endsAt);const produced=await readMvpView(store,'worker-owner',player.id,job.endsAt),state=produced.habitable.state!,worker=state.workers!.find(w=>w.buildingId===source)!;assert.ok(worker.shipment,`server route ${source} from ${JSON.stringify(worker.stand)}: ${worker.blockedReason}`);const shipment=worker.shipment!,layer=createHabitableWorkerLayer({groundHeight:()=>2});
    let carryingFrames=0,returningFrames=0;for(let at=shipment.startsAt;at<=shipment.endsAt+100;at+=100){const time=Math.min(at,shipment.endsAt),pose=habitableWorkerAt(worker,time);layer.update(state,time);const model=layer.group.getObjectByName(`habitable-worker-${worker.id}`)!;assert.equal(model.position.x,pose.x);assert.equal(model.position.z,pose.y);assert.equal(model.position.y,2.035);assert.equal(habitableWalkableAt(pose,state),true,'worker feet stay on the validated dry path');for(const point of HABITABLE_POINTS)assert.ok(Math.hypot(pose.x-point.x-.7,pose.y-point.y)>.6,'the route avoids fixed service NPCs');assert.ok(Math.hypot(pose.x-HABITABLE_SPAWN.x,pose.y-HABITABLE_SPAWN.y)>=.75,'the route yields to the actual stationary avatar');const load=model.getObjectByName('actor-load')!;assert.equal(load.visible,pose.carrying&&pose.cargoUnits>0);if(pose.state==='carrying')carryingFrames++;if(pose.state==='returning')returningFrames++;}
    assert.ok(carryingFrames>5&&returningFrames>5);const delivered=await readMvpView(store,'worker-owner',player.id,shipment.unloadsAt);assert.ok((delivered.habitable.facilities.find(f=>f.buildingId==='store')!.storage!.used)>=shipment.quantity);layer.dispose();
  }
});
