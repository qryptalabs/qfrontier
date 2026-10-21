import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {worldCameraFrame} from '../lib/graphics/world-camera.ts';
import {constrainDistrictCamera,districtCameraFrame,districtHeldInput,districtLook,districtMovement,districtStreamWindow,normalizeDistrictInput,DISTRICT_EYE_HEIGHT,DISTRICT_WALK_INTERVAL} from '../lib/graphics/district-navigation.ts';
import {createHabitableDistrict} from '../lib/graphics/habitable-district.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {HabitablePoint,HabitableState} from '../lib/mvp/habitable-data.ts';
import {HABITABLE_OBSTACLES} from '../lib/mvp/habitable-data.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import type {DistrictManualNavigationIntent} from '../lib/client/district-controls.ts';

function fixture(){const now=1000,world=createMvpWorld('owner',now),player=createPlayer(world,{ownerId:'owner',requestId:'district-cameras',now,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',now,player.id),input:SceneInput={view,player:view.player,selected:player.position,mode:'settlement',quality:'performance',reducedMotion:true},state:HabitableState={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};return{input,state};}

test('held arrows and WASD combine with joystick without doubling speed or retaining released keys',()=>{
  const keys=new Set(['ArrowUp','w','ArrowRight']),diagonal=districtHeldInput(keys,{forward:0,strafe:0});assert.ok(Math.abs(Math.hypot(diagonal.forward,diagonal.strafe)-1)<1e-12);assert.equal(diagonal.forward,diagonal.strafe);
  keys.delete('ArrowUp');keys.delete('w');assert.deepEqual(districtHeldInput(keys,{forward:0,strafe:0}),{forward:0,strafe:1});keys.clear();assert.deepEqual(districtHeldInput(keys,{forward:0,strafe:0}),{forward:0,strafe:0});assert.deepEqual(normalizeDistrictInput({forward:NaN,strafe:Infinity}),{forward:0,strafe:0});
});
test('walking is relative to camera yaw and pitch cannot increase walking speed',()=>{
  const north=districtMovement({forward:1,strafe:0},0),east=districtMovement({forward:1,strafe:0},Math.PI/2),right=districtMovement({forward:0,strafe:1},0);assert.deepEqual(north,{x:0,y:-1});assert.ok(Math.abs(east.x-1)<1e-12&&Math.abs(east.y)<1e-12);assert.deepEqual(right,{x:1,y:0});const clamped=districtLook(0,0,NaN,Infinity);assert.ok(Number.isFinite(clamped.yaw)&&Number.isFinite(clamped.pitch));assert.equal(districtLook(0,100,0,1).pitch,1.12);
});
test('aerial forward input stays above the avatar on screen after rotating either projection',()=>{
  for(const heading of[0,Math.PI/4,Math.PI/2,Math.PI,-Math.PI/3])for(const mode of['2d','3d']as const){const frame=worldCameraFrame(10,1.4,mode,58,heading),target=new THREE.Vector3(0,2,0),camera=mode==='2d'?new THREE.OrthographicCamera(-frame.halfWidth,frame.halfWidth,frame.halfHeight,-frame.halfHeight,.3,20000):new THREE.PerspectiveCamera(42,1.4,.3,20000);if(mode==='2d')camera.up.set(-Math.sin(heading),0,-Math.cos(heading));camera.position.copy(target).add(new THREE.Vector3(frame.offset.x,frame.offset.y,frame.offset.z));camera.lookAt(target);camera.updateMatrixWorld();const input=districtMovement({forward:1,strafe:0},-heading),screen=target.clone().add(new THREE.Vector3(input.x,0,input.y)).project(camera);assert.ok(screen.y>0);assert.ok(Math.abs(screen.x)<1e-8);}
});
test('first-person eyes and third-person shoulder use the same confirmed foot pose',()=>{
  const foot={x:50,y:3,z:-20},before=JSON.stringify(foot),fp=districtCameraFrame(foot,0,0,'first-person'),tp=districtCameraFrame(foot,0,0,'third-person');assert.deepEqual(fp.eye,{x:50,y:3+DISTRICT_EYE_HEIGHT,z:-20});assert.equal(fp.target.z,-30);assert.ok(tp.eye.z>foot.z&&tp.eye.y>fp.eye.y);assert.deepEqual(tp.anchor,fp.anchor);assert.equal(JSON.stringify(foot),before);
});
test('shoulder camera stops before a wall and before terrain without moving the anchor',()=>{
  const anchor={x:0,y:1.24,z:0},desired={x:0,y:1.8,z:6},wall={minX:-2,maxX:2,minY:0,maxY:5,minZ:2,maxZ:3},before=JSON.stringify({anchor,desired,wall}),camera=constrainDistrictCamera(anchor,desired,()=>0,[wall]);assert.ok(camera.z>0&&camera.z<1.8);const slope=constrainDistrictCamera(anchor,desired,(_x,z)=>z>3?4:0,[]);assert.ok(slope.z<=3);assert.equal(JSON.stringify({anchor,desired,wall}),before);
});
test('camera clearance follows the narrow rotated wall rather than its unrotated footprint',()=>{
  const anchor={x:0,y:1.24,z:0},desired={x:2,y:1.24,z:2},wall={minX:2.9,maxX:3.1,minY:0,maxY:4,minZ:0,maxZ:6,rotation:Math.PI/4},eye=constrainDistrictCamera(anchor,desired,()=>0,[wall]);assert.ok(eye.x<1&&eye.z<1,'the diagonal wall reaches the camera path before its centre');assert.deepEqual(anchor,{x:0,y:1.24,z:0});
});
test('eye-level fog horizon stays within a bounded streamed region at every chunk seam',()=>{
  for(const performance of[false,true])for(const x of[-64.01,-.01,0,31.99,63.99,100000])for(const y of[-.01,0,50]){const view=districtStreamWindow({x,y},performance);assert.ok((view.maxCx-view.minCx+1)*(view.maxCy-view.minCy+1)<=16);assert.ok(view.minCx*64<=x-view.fogFar&&view.maxCx*64+64>=x+view.fogFar);assert.ok(view.minCy*64<=y-view.fogFar&&view.maxCy*64+64>=y+view.fogFar);assert.ok(view.fogFar>view.fogNear);}
});
test('navigation coalesces commands and never invents movement while waiting for server state',()=>{
  const{input,state}=fixture(),moves:HabitablePoint[]=[],before=JSON.stringify({input,state}),district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove:p=>moves.push(p),onPlace(){},onInteract(){}});district.animate(1000,true);
  for(let t=0;t<DISTRICT_WALK_INTERVAL;t+=10)district.navigate?.({forward:0,strafe:1},0,t);assert.equal(moves.length,1);assert.deepEqual(state.position,{x:0,y:1.5});district.navigate?.({forward:0,strafe:1},0,DISTRICT_WALK_INTERVAL);assert.equal(moves.length,2);assert.equal(JSON.stringify({input,state}),before);
  const moving={...state,movement:{points:[{x:0,y:1.5},{x:2,y:1.5}],startsAt:1000,endsAt:3000}};district.update(input,moving);district.animate(1500,true);district.navigate?.({forward:1,strafe:0},0,5000);assert.equal(moves.length,2);district.dispose();
});

test('continuous controls renew a confirmed lease without waiting for arrival and stop while a save is pending',()=>{const{input,state}=fixture(),intents:DistrictManualNavigationIntent[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onManualNavigation:intent=>intents.push(intent),onMove(){assert.fail('held input cannot use the click-route channel');},onPlace(){},onInteract(){}});try{district.animate(1000,true);district.navigate?.({forward:0,strafe:-1},0,0);assert.equal(intents.length,1);const serial=JSON.stringify(state),moving={...state,movement:{points:[{x:0,y:1.5},{x:-1.98,y:1.5}],startsAt:1000,endsAt:1900,manualSessionId:intents[0].sessionId}};district.update(input,moving);district.animate(1250,true);district.navigate?.({forward:0,strafe:-1},0,250);assert.equal(intents.length,2);assert.equal(intents[1].sequence,2);district.update(input,moving,null,{navigationBlocked:true});district.navigate?.({forward:0,strafe:0},0,260);assert.equal(intents.at(-1)!.stop,true);assert.equal(intents.at(-1)!.sequence,3);assert.equal(JSON.stringify(state),serial);assert.deepEqual(moving.movement.points[0],{x:0,y:1.5});}finally{district.dispose();}});

test('manual release hooks are idempotent and cannot commandeer an active click route',()=>{const{input,state}=fixture(),intents:DistrictManualNavigationIntent[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onManualNavigation:intent=>intents.push(intent),onMove(){},onPlace(){},onInteract(){}});district.animate(1000,true);district.navigate?.({forward:1,strafe:0},0,0);district.stopManualNavigation?.();district.stopManualNavigation?.();assert.equal(intents.length,2);assert.equal(intents[1].stop,true);const click={...state,movement:{points:[{x:0,y:1.5},{x:0,y:5}],startsAt:1000,endsAt:3000}};district.update(input,click);district.animate(1200,true);district.navigate?.({forward:1,strafe:0},0,1000);assert.equal(intents.length,2);district.dispose();assert.equal(intents.length,2);});
test('editing and pending actions block movement and interaction; first person hides only the local avatar markers',()=>{
  const{input,state}=fixture(),actions:string[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove:()=>actions.push('walk'),onPlace(){},onInteract:()=>actions.push('interact')});district.animate(1000,true);const avatar=district.group.getObjectByName('your-persistent-avatar')!,npc=district.group.getObjectByName('district-contractor')!;district.setNavigationMode?.('first-person');district.animate(1000,true);assert.equal(avatar.visible,false);assert.equal(npc.visible,true);assert.equal(district.group.getObjectByName('your-avatar-ring')!.visible,false);
  district.update(input,state,null,{navigationBlocked:true});district.navigate?.({forward:0,strafe:1},0,1000);district.interact?.();assert.deepEqual(actions,[]);district.update(input,state,{templateId:'workbench',rotation:0});district.navigate?.({forward:0,strafe:1},0,2000);district.interact?.();assert.deepEqual(actions,[]);
  district.update(input,state,null,{});district.setNavigationMode?.('aerial');district.animate(1000,true);assert.equal(avatar.visible,true);district.interact?.();assert.deepEqual(actions,['interact']);district.dispose();
});
test('camera bounds keep crops low and reuse the structural cache across avatar-only updates',()=>{
  const{input,state}=fixture(),district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove(){},onPlace(){},onInteract(){}});district.animate(1000,true);const original=district.cameraObstacles!();
  for(const[id,height]of[['vegetables',1],['wheat',1.2],['wheat-terrace',1.2],['logs',1.4]]as const){const box=original[HABITABLE_OBSTACLES.findIndex(b=>b.id===id)];assert.ok(Math.abs(box.maxY-box.minY-(height+.2))<1e-8,`${id} cannot act like a tall wall`);}
  district.update(input,{...state,position:{x:1,y:1.5},appearance:'frost'});district.animate(1600,true);assert.equal(district.cameraObstacles!(),original,'walking or appearance does not rebuild hundreds of static bounds');
  district.update(input,{...state,buildings:[{id:'new-shed',templateId:'shed',x:-2,y:-8,rotation:0,startsAt:0,endsAt:1,bound:false}]});district.animate(2000,true);const changed=district.cameraObstacles!();assert.notEqual(changed,original);assert.equal(changed.length,original.length+1);district.dispose();
});
