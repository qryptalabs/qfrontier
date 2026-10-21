import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createFishingCommunityRenderer,fishingBoardingHeight } from '../lib/graphics/fishing-community.ts';
import { FISHING_COMMUNITY,FISHING_DOCK_PATHS,fishingSnapshot } from '../lib/graphics/fishing-community-data.ts';
import { continuousTerrainHeight } from '../lib/graphics/world-terrain-renderer.ts';
import { maritimeWave } from '../lib/graphics/maritime-water.ts';

test('the wharf has full physical dimensions and detailed planks instead of a stretched small model',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;
  render.setView({x:0,y:0},{x:dock.x,y:dock.y},8);render.animate(60,false);render.group.updateMatrixWorld(true);
  const platform=render.group.getObjectByName('continuous-fishing-wharf')as THREE.InstancedMesh;assert.ok(platform);assert.ok(platform.count>1000,'deck is built from individual, correctly scaled boards');
  const bounds=new THREE.Box3().setFromObject(platform);assert.ok(bounds.max.x-bounds.min.x>=dock.length-1);assert.ok(bounds.max.z-bounds.min.z>=dock.width-1);
  let triangles=0,staticCalls=0;render.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof THREE.InstancedMesh?o.count:1);if(o.name==='fishing-port-static-detail')staticCalls++;});assert.ok(triangles<800000);assert.ok(staticCalls<40);render.dispose();
});

test('wharf fittings share one instanced draw and finish textures are freed without changing the deck',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;render.setView({x:0,y:0},{x:dock.x,y:dock.y},8);render.animate(60,false);
  const wood=render.group.getObjectByName('continuous-fishing-wharf') as THREE.InstancedMesh,fittings=render.group.getObjectByName('fishing-wharf-forged-fittings') as THREE.InstancedMesh;assert.ok(fittings?.isInstancedMesh);assert.ok(fittings.count>20&&fittings.count<400);assert.equal(wood.geometry,fittings.geometry);assert.ok((fittings.material as THREE.MeshStandardMaterial).metalness>.5);const timber=(wood.material as THREE.MeshStandardMaterial).map!,foam=(render.group.getObjectByName('vessel-wakes') as THREE.Mesh).material as THREE.MeshBasicMaterial;assert.equal(timber.name,'fishing-timber-grain');assert.equal(foam.map?.name,'broken-maritime-foam');let released=0;for(const texture of[timber,foam.map!])texture.addEventListener('dispose',()=>released++);render.dispose();render.dispose();assert.equal(released,2);
});

test('the whole wharf remains exposed wood with a wooden shore ramp instead of sand road slabs over the sea',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;render.setView({x:0,y:0},{x:dock.x,y:dock.y},8);render.animate(315,false);render.group.updateMatrixWorld(true);
  const surfaces:THREE.Object3D[]=[];render.group.traverse(object=>{if(object.name==='continuous-fishing-wharf'||object.name==='fishing-port-static-detail')surfaces.push(object);});
  const ray=new THREE.Raycaster(),columns=Math.ceil(dock.length/.3),cell=dock.length/columns;
  for(const column of[30,70,110,150,190])for(const z of[6714,6723,6732]){const x=dock.x-dock.length/2+(column+.5)*cell;ray.set(new THREE.Vector3(x,12,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(surfaces,false)[0];assert.ok(hit);assert.equal(hit.object.name,'continuous-fishing-wharf',`wood remains visible at ${x},${z}`);assert.ok(Math.abs(hit.point.y-dock.deckHeight)<.001);assert.ok(continuousTerrainHeight(x,z)<dock.deckHeight-.2);}
  ray.set(new THREE.Vector3(1116,12,dock.y),new THREE.Vector3(0,-1,0));const ramp=ray.intersectObjects(surfaces,false)[0];assert.equal(ramp?.object.name,'continuous-fishing-wharf');assert.ok(ramp!.point.y>.5&&ramp!.point.y<dock.deckHeight);render.dispose();
});

test('boat poses share the sea wave field and remain stable when their world clock is paused',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;
  render.setView({x:0,y:0},{x:dock.x,y:dock.y},9);render.animate(150,false);
  const snapshot=fishingSnapshot(150),boat=snapshot.boats[0],model=render.group.getObjectByName(boat.id)!;assert.ok(model);
  assert.ok(Math.abs(model.position.y-(boat.waterLevel+.08+maritimeWave(boat.x,boat.y,150).height))<1e-9);
  const before=model.position.clone(),rotation=model.quaternion.clone();render.animate(150,true);assert.deepEqual(model.position,before);assert.ok(model.quaternion.angleTo(rotation)<1e-7);render.animate(230,false);assert.ok(model.position.distanceTo(before)>1);render.dispose();
});

test('entities keep their identity, global location and cargo when terrain origins and views change',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;
  render.setView({x:0,y:0},{x:dock.x,y:dock.y},8);render.animate(250,false);const state=render.getState(),id=state.activities.find(a=>a.kind==='boat')!.id,boat=render.group.getObjectByName(id)!;render.follow(id);
  const world=new THREE.Vector3();render.group.updateMatrixWorld(true);boat.getWorldPosition(world);render.setView({x:1024,y:6656},{x:1300,y:6700},9);render.animate(250,false);render.group.updateMatrixWorld(true);const shifted=new THREE.Vector3();boat.getWorldPosition(shifted);assert.ok(Math.abs(shifted.x+1024-world.x)<1e-8);assert.ok(Math.abs(shifted.z+6656-world.z)<1e-8);assert.equal(render.getState().followedId,id);assert.equal(render.group.getObjectByName(id),boat);assert.equal(render.getState().activities.find(a=>a.id===id)!.cargo,state.activities.find(a=>a.id===id)!.cargo);
  render.setView({x:0,y:0},{x:30000,y:-10000},7);render.animate(255,false);assert.equal(render.group.visible,false);render.setView({x:1024,y:6656},{x:dock.x,y:dock.y},8);render.animate(310,false);assert.equal(render.group.getObjectByName(id),boat);assert.deepEqual(render.position(id),render.getState().activities.filter(a=>a.id===id).map(a=>({x:a.x,y:a.y}))[0]);render.dispose();
});

test('distant communities skip model construction and local geometry is freed once on disposal',()=>{
  const render=createFishingCommunityRenderer({quality:'performance',heightAt:continuousTerrainHeight});render.setView({x:0,y:0},{x:0,y:0},7);render.animate(50,false);assert.equal(render.group.getObjectByName('continuous-fishing-wharf'),undefined);render.dispose();render.dispose();
  const near=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;near.setView({x:0,y:0},{x:dock.x,y:dock.y},8);near.animate(90,false);
  const owned=new Set<THREE.BufferGeometry>();near.group.traverse(o=>{if(o instanceof THREE.Mesh&&['fishing-port-static-detail','continuous-fishing-wharf','vessel-wakes'].includes(o.name))owned.add(o.geometry);});let freed=0;owned.forEach(g=>g.addEventListener('dispose',()=>freed++));near.dispose();near.dispose();assert.equal(freed,owned.size);assert.equal(near.group.children.length,0);
});

test('visible fish crates follow the deterministic boat, porter and haulage transfer stages',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;render.setView({x:0,y:0},{x:dock.x,y:dock.y},9);let carrying=0;
  for(const time of[45,150,230,315,345,400,480]){
    render.animate(time,false);const snapshot=fishingSnapshot(time);
    for(const boat of snapshot.boats){const model=render.group.getObjectByName(boat.id)!,load=model.getObjectByName('boat-cargo')!;assert.equal(load.children.filter(child=>child.visible).length,boat.cargo,`${boat.name} displays its actual crate count`);}
    for(const cart of snapshot.carts){const model=render.group.getObjectByName(cart.id)!,load=model.getObjectByName('haulage-cargo')!;assert.equal(load.children.filter(child=>child.visible).length,cart.cargo);}
    for(const worker of snapshot.workers){const model=render.group.getObjectByName(worker.id)!,load=model.getObjectByName('actor-load');if(worker.carrying){assert.ok(load?.visible,`${worker.name} visibly carries the transferred fish`);carrying++;}else if(load)assert.equal(load.visible,false);assert.ok(Math.abs(model.position.y-((fishingBoardingHeight(worker.x,worker.y,time,snapshot.boats)??worker.height??continuousTerrainHeight(worker.x,worker.y))+.08))<.001);}
  }
  assert.ok(carrying>4);render.dispose();
});

test('protected player plots suppress port structures and interactive boats instead of obscuring the player',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight,occupiedByPlayer:()=>true}),dock=FISHING_COMMUNITY.dock;render.setView({x:0,y:0},{x:dock.x,y:dock.y},9);render.animate(60,false);assert.equal(render.group.getObjectByName('continuous-fishing-wharf'),undefined);assert.equal(render.group.getObjectByName('fishing-port-static-detail'),undefined);assert.deepEqual(render.pickables(),[]);render.dispose();
});

test('articulated boarding ramps connect the wharf to the floating deck and fold before departure',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;
  render.setView({x:0,y:0},{x:dock.x,y:dock.y},9);render.animate(315,false);render.group.updateMatrixWorld(true);
  for(const path of FISHING_DOCK_PATHS.filter(p=>p.id.startsWith(FISHING_COMMUNITY.boats[0].id))){
    const model=render.group.getObjectByName(path.id)!,end=path.points.at(-1)!,side=end.y<dock.y?-1:1,start=dock.y+side*dock.width/2,length=Math.abs(end.y-start),hinge=model.localToWorld(new THREE.Vector3()),tip=model.localToWorld(new THREE.Vector3(0,0,length));
    assert.ok(Math.abs(hinge.y-dock.deckHeight)<1e-8);assert.ok(Math.abs(tip.x-end.x)<.03);assert.ok(Math.abs(tip.z-end.y)<.03);assert.ok(Math.abs(tip.y-fishingBoardingHeight(end.x,end.y,315)!)<.01,'ramp reaches the actual moving boat deck');
    const pose=model.quaternion.clone();render.animate(315,true);assert.ok(model.quaternion.angleTo(pose)<1e-7);render.animate(60,false);render.group.updateMatrixWorld(true);const raised=model.localToWorld(new THREE.Vector3(0,0,length));assert.ok(raised.y>dock.deckHeight+4,'ramp folds up while the boat sails');render.animate(315,false);render.group.updateMatrixWorld(true);
  }
  let crossings=0;for(const time of[304,308,312,314]){render.animate(time,false);for(const worker of fishingSnapshot(time).workers){const height=fishingBoardingHeight(worker.x,worker.y,time);if(height===null)continue;const model=render.group.getObjectByName(worker.id)!;assert.ok(Math.abs(model.position.y-height-.08)<.001);crossings++;}}
  assert.ok(crossings>=4);render.dispose();
});

test('the same fish crates remain visible while staged on the wharf and deposited at the city warehouse',()=>{
  const render=createFishingCommunityRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),dock=FISHING_COMMUNITY.dock;render.setView({x:0,y:0},{x:dock.x,y:dock.y},9);let staged=0,loaded=0,delivered=0;
  for(const time of[315,320,345,380,390,420,480,620,650,680,720,980,1080]){render.animate(time,false);const snapshot=fishingSnapshot(time);
    for(let berth=0;berth<2;berth++){const stack=render.group.getObjectByName(`fishing-cargo-staging-${berth}`)as THREE.InstancedMesh,ids=snapshot.loads.filter(load=>load.location==='staging'&&load.batchId.startsWith(FISHING_COMMUNITY.boats[berth].id)).flatMap(load=>load.cargoIds);assert.equal(stack.count,ids.length);assert.deepEqual(stack.userData.cargoIds,ids);assert.ok(stack.count<=6);staged+=stack.count;}
    const city=render.group.getObjectByName('fishing-cargo-city--1')as THREE.InstancedMesh,cityIds=snapshot.loads.filter(load=>load.location==='city').flatMap(load=>load.cargoIds).slice(-24);assert.equal(city.count,cityIds.length);assert.deepEqual(city.userData.cargoIds,cityIds);assert.ok(city.count<=24);delivered+=city.count;loaded+=snapshot.carts.reduce((sum,cart)=>sum+cart.cargo,0);
    const matrix=new THREE.Matrix4();for(let i=0;i<city.count;i++){city.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
  }
  assert.ok(staged>12);assert.ok(loaded>6);assert.ok(delivered>24);render.dispose();
});

test('haulage activity labels describe city deliveries and return trips independently from boat voyages',()=>{
  const render=createFishingCommunityRenderer({quality:'performance',heightAt:continuousTerrainHeight});render.setView({x:0,y:0},{x:0,y:0},7);
  for(const[time,state,label]of[[550,'outbound','Camino a la ciudad'],[640,'unloading','Entregando al almacén'],[700,'inbound','Regresando al muelle']]as const){render.animate(time,false);const cart=fishingSnapshot(time).carts[0];assert.equal(cart.state,state);assert.equal(render.getState().activities.find(a=>a.id===cart.id)?.state,label);}
  render.dispose();
});
