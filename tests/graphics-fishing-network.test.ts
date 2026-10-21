import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createFishingCommunityRenderer,type FishingRenderSite } from '../lib/graphics/fishing-community.ts';
import { createFishingNetworkRenderer } from '../lib/graphics/fishing-network.ts';
import { FISHING_COMMUNITIES,getFishingCommunityData } from '../lib/graphics/fishing-network-data.ts';
import { FISHING_COMMUNITY,FISHING_DOCK_PATHS } from '../lib/graphics/fishing-community-data.ts';
import { maritimeBoatPose,maritimeWave } from '../lib/graphics/maritime-water.ts';
import { continuousTerrainHeight } from '../lib/graphics/world-terrain-renderer.ts';

test('all five ports place boats, articulated ramps and wharf planks in their true rotated world frame',()=>{
  for(const community of FISHING_COMMUNITIES){const data=getFishingCommunityData(community.id),site:FishingRenderSite={...community,...data},render=createFishingCommunityRenderer({quality:'performance',heightAt:continuousTerrainHeight,site}),origin={x:Math.floor(community.dock.x/64)*64,y:Math.floor(community.dock.y/64)*64},time=855-community.phaseOffset;
    render.setView(origin,community.dock,9);render.animate(time,false);render.group.updateMatrixWorld(true);assert.equal(render.getState().communityId,community.id);
    const snapshot=data.snapshot(time);for(const boat of snapshot.boats){const model=render.group.getObjectByName(boat.id)!;assert.ok(model);assert.ok(model.visible);const point=model.getWorldPosition(new THREE.Vector3()),pose=maritimeBoatPose(boat.x,boat.y,time,boat.yaw);assert.ok(Math.abs(point.x+origin.x-boat.x)<1e-7);assert.ok(Math.abs(point.z+origin.y-boat.y)<1e-7);assert.ok(Math.abs(point.y-boat.waterLevel-.08-pose.height)<1e-7);const q=model.getWorldQuaternion(new THREE.Quaternion()),expected=new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch,boat.yaw,pose.roll,'YXZ'));assert.ok(q.angleTo(expected)<1e-6);}
    for(const path of FISHING_DOCK_PATHS.filter(path=>path.id.startsWith(FISHING_COMMUNITY.boats[0].id))){const ramp=render.group.getObjectByName(community.mapId(path.id))!,end=path.points.at(-1)!,start=FISHING_COMMUNITY.dock.y-FISHING_COMMUNITY.dock.width/2,tip=ramp.localToWorld(new THREE.Vector3(0,0,Math.abs(end.y-start))),expected=community.toWorld(end);assert.ok(Math.abs(tip.x+origin.x-expected.x)<.03);assert.ok(Math.abs(tip.z+origin.y-expected.y)<.03);assert.ok(Math.abs(tip.y-(.56+maritimeWave(expected.x,expected.y,time).height))<.01);}
    const surfaces:THREE.Object3D[]=[];render.group.traverse(object=>{if(object.name==='continuous-fishing-wharf'||object.name==='fishing-port-static-detail')surfaces.push(object);});const center=community.toWorld({x:1152.1,y:6723}),ray=new THREE.Raycaster(new THREE.Vector3(center.x-origin.x,12,center.y-origin.y),new THREE.Vector3(0,-1,0)),hit=ray.intersectObjects(surfaces,false)[0];assert.equal(hit?.object.name,'continuous-fishing-wharf');assert.ok(Math.abs(hit.point.y-.95)<.001);
    let triangles=0;render.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object instanceof THREE.InstancedMesh?object.count:1);});assert.ok(triangles<800000);render.dispose();
  }
});

test('the fleet directory and world-time positions work before any remote port geometry is allocated',()=>{
  const render=createFishingNetworkRenderer({quality:'performance',heightAt:continuousTerrainHeight});render.setView({x:0,y:0},{x:0,y:0},8);render.animate(410,false);assert.equal(render.group.children.length,0);assert.equal(render.getState().available,false);assert.deepEqual(render.getState().activities,[]);
  for(const community of FISHING_COMMUNITIES){const snapshot=getFishingCommunityData(community.id).snapshot(410);for(const boat of snapshot.boats)assert.deepEqual(render.position(boat.id),{x:boat.x,y:boat.y});}
  assert.equal(render.group.children.length,0);assert.equal(render.position('nonexistent'),null);render.dispose();
});

test('visiting distant ports frees old graphics and does not accumulate all five asset pools',()=>{
  const render=createFishingNetworkRenderer({quality:'performance',heightAt:continuousTerrainHeight});let previous:string|null=null,released=0;
  for(const community of FISHING_COMMUNITIES){render.setView({x:community.dock.x,y:community.dock.y},community.dock,8);render.animate(410,false);assert.equal(render.group.children.length,1);assert.equal(render.getState().communityId,community.id);assert.equal(render.getState().available,true);const platform=render.group.getObjectByName('continuous-fishing-wharf')as THREE.InstancedMesh;assert.ok(platform);platform.geometry.addEventListener('dispose',()=>released++);assert.ok(render.group.getObjectByName(community.boats[0].id));if(previous)assert.equal(render.group.getObjectByName(previous),undefined);previous=community.boats[0].id;}
  assert.equal(released,4);render.setView({x:0,y:0},{x:0,y:0},7);render.animate(411,false);assert.equal(released,5);assert.equal(render.group.children.length,0);render.dispose();render.dispose();
});

test('following a remote boat preserves its instance and cargo while rebasing and changing camera views',()=>{
  const community=FISHING_COMMUNITIES[4],render=createFishingNetworkRenderer({quality:'fullhd',heightAt:continuousTerrainHeight}),id=community.boats[0].id;render.animate(250,false);render.follow(id);const position=render.position(id)!;render.setView({x:community.dock.x,y:community.dock.y},position,9);render.animate(250,false);const boat=render.group.getObjectByName(id)!,cargo=render.getState().activities.find(a=>a.id===id)!.cargo;
  assert.ok(boat);assert.equal(render.getState().followedId,id);render.setView({x:community.dock.x+128,y:community.dock.y-64},position,7.8);render.animate(250,true);assert.equal(render.group.getObjectByName(id),boat);assert.equal(render.getState().activities.find(a=>a.id===id)!.cargo,cargo);render.group.updateMatrixWorld(true);const world=boat.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(world.x+community.dock.x+128-position.x)<1e-7);assert.ok(Math.abs(world.z+community.dock.y-64-position.y)<1e-7);
  render.animate(251,false);assert.equal(render.getState().followedId,id);render.follow(null);render.setView({x:0,y:0},{x:0,y:0},8);render.animate(252,false);assert.equal(render.group.children.length,0);assert.equal(render.getState().available,false);render.dispose();
});

test('real player reservations are tested in global coordinates at every rotated port',()=>{
  for(const community of FISHING_COMMUNITIES.slice(1)){const render=createFishingNetworkRenderer({quality:'performance',heightAt:continuousTerrainHeight,occupiedByPlayer:(x,y)=>Math.hypot(x-community.dock.x,y-community.dock.y)<1000});render.setView({x:community.dock.x,y:community.dock.y},community.dock,9);render.animate(410,false);assert.equal(render.group.getObjectByName('continuous-fishing-wharf'),undefined);assert.equal(render.group.getObjectByName('fishing-port-static-detail'),undefined);assert.deepEqual(render.pickables(),[]);render.dispose();}
});
