import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createHabitableDistrict} from '../lib/graphics/habitable-district.ts';
import {districtFloatingOrigin,explorationRenderGround,explorationPlayerBodies} from '../lib/graphics/exploration-district.ts';
import {continuousTerrainHeight} from '../lib/graphics/world-terrain-height.ts';
import {LIVING_ZONE,LIVING_BUILDINGS} from '../lib/graphics/living-zone-data.ts';
import {explorationHeadingAt,explorationStaticHeightAt,explorationStaticLineClear,type ExplorationState} from '../lib/mvp/exploration-data.ts';
import {explorationWorldBodies} from '../lib/mvp/exploration.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {HabitablePoint,HabitableState} from '../lib/mvp/habitable-data.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';

function fixture(){
  const world=createMvpWorld('owner',1000),player=createPlayer(world,{ownerId:'owner',requestId:'exploration-graphics',now:1000,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',1000,player.id);
  const own=view.settlements.find(p=>p.playerId===player.id)!;own.plot={...own.plot,x:128,y:-64};
  const input:SceneInput={view,player:view.player,selected:player.position,mode:'settlement',quality:'performance',reducedMotion:true};
  const state:HabitableState={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[{id:'home-shed',templateId:'shed',x:-2,y:-8,rotation:0,startsAt:0,endsAt:1,bound:false}]};
  const exploration:ExplorationState={version:1,position:{x:500,y:150},homePosition:{...state.position},departedAt:1000};
  return{input,state,exploration};
}

test('one persistent avatar follows global server travel while buildings and work stay anchored at home',()=>{
  const{input,state,exploration}=fixture();exploration.movement={points:[{x:500,y:150},{x:504,y:150},{x:504,y:154}],startsAt:1000,endsAt:3000};
  const current={...state,exploration},before=JSON.stringify(current),district=createHabitableDistrict({input,state:current,groundHeight:()=>7,onMove(){},onPlace(){},onInteract(){}});
  try{
    district.setOrigin({x:448,y:128});assert.deepEqual(district.animate(2000,true),{x:504,y:150});
    const avatar=district.group.getObjectByName('your-persistent-avatar')!,shed=district.group.getObjectByName('player-built-home-shed')!,worker=district.group.getObjectByName('district-contractor')!;
    district.group.updateMatrixWorld(true);assert.equal(avatar.getWorldPosition(new THREE.Vector3()).x,56);assert.equal(avatar.getWorldPosition(new THREE.Vector3()).z,22);
    assert.equal(shed.getWorldPosition(new THREE.Vector3()).x,128-2-448);assert.ok(worker.getWorldPosition(new THREE.Vector3()).distanceTo(avatar.getWorldPosition(new THREE.Vector3()))>100);
    const route=district.group.getObjectByName('server-confirmed-walking-route')as THREE.Line,buffer=route.geometry.attributes.position;
    assert.equal(buffer.getX(0),500-128);assert.equal(buffer.getZ(0),150+64);assert.equal(route.visible,true);
    district.animate(2100,true);assert.equal(route.geometry.attributes.position,buffer,'confirmed route reuses its buffer');
    district.setOrigin({x:512,y:128});district.animate(2000,true);district.group.updateMatrixWorld(true);assert.equal(avatar.getWorldPosition(new THREE.Vector3()).x,-8);assert.equal(shed.getWorldPosition(new THREE.Vector3()).x,128-2-512);
    district.setNavigationMode?.('first-person');district.animate(2200,true);assert.equal(avatar.visible,false);assert.equal(worker.visible,true);district.setNavigationMode?.('third-person');district.animate(2200,true);assert.equal(avatar.visible,true);
    assert.equal(district.navigationPose?.().foot.x,504);assert.equal(district.navigationPose?.().foot.z,150.8);assert.equal(JSON.stringify(current),before);
    let avatars=0;district.group.traverse(o=>{if(o.name==='your-persistent-avatar')avatars++;});assert.equal(avatars,1);
  }finally{district.dispose();}
});

test('exterior input is global and cannot select or construct remote domestic facilities',()=>{
  const{input,state,exploration}=fixture(),moves:HabitablePoint[]=[],actions:string[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove:p=>moves.push(p),onPlace:()=>actions.push('place'),onInteract:()=>actions.push('interact'),onLandCell:()=>actions.push('land')});
  try{
    const homeHit=district.pickables()[0];district.update(input,{...state,exploration},{templateId:'workbench',rotation:0},{landMode:true});district.animate(1100,true);
    assert.deepEqual(district.pickables(),[]);district.pointer({object:homeHit}as THREE.Intersection,{x:500.2,y:150.35});district.interact?.();
    assert.deepEqual(moves,[{x:500,y:150.5}]);assert.deepEqual(actions,[]);assert.equal(district.group.getObjectByName('building-placement-preview')!.visible,false);assert.equal(district.navigationPose?.().editing,false);
    district.update(input,{...state,exploration},null,{navigationBlocked:true});district.pointer(null,{x:501,y:150});assert.equal(moves.length,1);
    district.update(input,state,null,{});district.animate(1200,true);district.pointer(null,{x:130,y:-62.5});assert.deepEqual(moves[1],{x:2,y:1.5});assert.equal(district.navigationPose?.().foot.x,128);assert.equal(district.navigationPose?.().foot.z,-62.5);
  }finally{district.dispose();}
});

test('manual exterior movement requests a shared walkable segment without predicting the avatar or replacing active travel',()=>{
  const{input,state,exploration}=fixture();let start:HabitablePoint|undefined;
  for(let x=-60;x<=60&&!start;x+=4)for(let y=-60;y<=60&&!start;y+=4){const point={x:LIVING_ZONE.city.x+x,y:LIVING_ZONE.city.y+y};if(explorationStaticLineClear(point,{x:point.x+1.1,y:point.y}))start=point;}
  assert.ok(start);exploration.position=start;const current={...state,exploration},before=JSON.stringify(current),moves:HabitablePoint[]=[],district=createHabitableDistrict({input,state:current,groundHeight:()=>2,onMove:p=>moves.push(p),onPlace(){},onInteract(){}});
  try{
    district.animate(1000,true);district.navigate?.({forward:0,strafe:1},0,1000);district.navigate?.({forward:0,strafe:1},0,1010);assert.equal(moves.length,1);assert.ok(Math.abs(moves[0].x-start.x-1.1)<1e-8);assert.equal(moves[0].y,start.y);assert.equal(JSON.stringify(current),before);assert.equal(district.navigationPose?.().foot.x,start.x);
    district.update(input,{...current,exploration:{...exploration,movement:{points:[start,{x:start.x+1.1,y:start.y}],startsAt:1000,endsAt:3000}}});district.animate(1500,true);district.navigate?.({forward:0,strafe:1},0,3000);assert.equal(moves.length,1);
  }finally{district.dispose();}
});

test('leaving home retains the authored foot height and requests global steps through the same village paths',()=>{
  const{input,state,exploration}=fixture(),moves:HabitablePoint[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove:p=>moves.push(p),onPlace(){},onInteract(){}});
  try{
    district.animate(1000,true);const foot=district.navigationPose!().foot;exploration.position={x:foot.x,y:foot.z};district.update(input,{...state,exploration});district.animate(1000,true);assert.deepEqual(district.navigationPose!().foot,foot);district.navigate?.({forward:0,strafe:1},0,1000);assert.equal(moves.length,1);assert.ok(Math.abs(moves[0].x-128-1.1)<1e-8);assert.equal(moves[0].y,-62.5);
  }finally{district.dispose();}
});

test('exterior cameras use solid city footprints instead of distant home bounds and retain the cache within a tile',()=>{
  const{input,state,exploration}=fixture(),building=LIVING_BUILDINGS[0];exploration.position={x:building.x+building.width/2+1,y:building.y};const district=createHabitableDistrict({input,state:{...state,exploration},groundHeight:()=>2,onMove(){},onPlace(){},onInteract(){}});
  try{
    district.animate(1000,true);const bounds=district.cameraObstacles!();assert.ok(bounds.some(b=>Math.abs((b.minX+b.maxX)/2-building.x)<1e-8&&Math.abs((b.minZ+b.maxZ)/2-building.y)<1e-8));assert.ok(bounds.every(b=>b.maxX<0),'home at x128 cannot obstruct a camera in the city');district.animate(1100,true);assert.equal(district.cameraObstacles!(),bounds);
  }finally{district.dispose();}
});

test('nearby public explorers render at global travel coordinates rather than their home village',()=>{
  const{input,state,exploration}=fixture();input.view.habitable.actors.push({playerId:'other',name:'Mara',plot:{x:-2000,y:1000},state:{appearance:'frost',profession:'farmer',position:{x:0,y:1.5},buildings:[],exploration:{version:1,position:{x:501,y:150},departedAt:1000,movement:{points:[{x:501,y:150},{x:503,y:150}],startsAt:1000,endsAt:2000}}}});
  const district=createHabitableDistrict({input,state:{...state,exploration},groundHeight:()=>2,onMove(){assert.fail('rendering must not walk');},onPlace(){},onInteract(){}});
  try{district.animate(1500,true);const other=district.group.getObjectByName('nearby-player-other')!;assert.ok(other);assert.equal(other.position.x,502-128);assert.equal(other.position.z,150+64);assert.ok(Math.abs(other.rotation.y-Math.PI/2)<1e-8);}finally{district.dispose();}
});

test('interaction near an exterior destination opens information without a domestic action or resource mutation',()=>{
  const{input,state,exploration}=fixture(),actions:string[]=[];exploration.position={x:LIVING_ZONE.city.x,y:LIVING_ZONE.city.y};const current={...state,exploration},before=JSON.stringify(current),district=createHabitableDistrict({input,state:current,groundHeight:()=>2,onMove(){assert.fail('information cannot move the avatar');},onPlace(){assert.fail('information cannot build');},onInteract:id=>actions.push(id)});
  try{district.animate(1000,true);district.interact?.();assert.deepEqual(actions,[`exploration:${LIVING_ZONE.city.id}`]);assert.equal(JSON.stringify(current),before);}finally{district.dispose();}
});

test('floating origins stay bounded across positive and negative chunk seams without changing global coordinates',()=>{
  let origin={x:0,y:0};for(const point of[{x:96,y:0},{x:97,y:0},{x:205,y:160},{x:-97,y:-193},{x:12000,y:-13000}]){const previous=origin;origin=districtFloatingOrigin(point,origin);assert.ok(Math.abs(point.x-origin.x)<=96&&Math.abs(point.y-origin.y)<=96);assert.equal((point.x-origin.x)+origin.x,point.x);assert.equal((point.y-origin.y)+origin.y,point.y);if(point.x===96)assert.equal(origin,previous);}
  assert.equal(districtFloatingOrigin({x:NaN,y:0},origin),origin);
});

test('bridge-deck correction preserves dynamic ground height outside static river crossings',()=>{
  for(const point of[{x:500,y:150},{x:LIVING_ZONE.city.x,y:LIVING_ZONE.city.y},{x:-216,y:168}]){const baseline=continuousTerrainHeight(point.x,point.y),expected=Math.max(0,explorationStaticHeightAt(point)-baseline);assert.equal(explorationRenderGround(point,baseline+3),baseline+3+expected);}
});

test('ordinary hillside support uses the drawn voxel top once rather than adding the analytic-to-voxel delta twice',()=>{
  for(const point of[{x:264.17,y:134.29},{x:287.71,y:149.43}]){const drawn=continuousTerrainHeight(point.x,point.y)+2.713;assert.equal(explorationRenderGround(point,drawn),drawn);}
});

test('a waiting carriage retains its incoming axis in both directions, authority, public body and the persistent avatar',()=>{
 for(const reverse of[false,true]){
  const{input,state,exploration}=fixture(),points=reverse?[{x:88,y:9.5},{x:88,y:1.5},{x:80,y:1.5}]:[{x:80,y:1.5},{x:88,y:1.5},{x:88,y:9.5}],expected=reverse?Math.PI:Math.PI/2;
  exploration.position=points[0];exploration.movement={points,startsAt:1000,endsAt:4000,legs:[{mode:'carriage',fromIndex:0,toIndex:2,startsAt:1000,endsAt:4000}],holds:[{pointIndex:1,startsAt:2000,endsAt:3000,resourceId:'traffic-yield:test'}]};
  const current={...state,exploration},world=createMvpWorld('owner',1000),player=createPlayer(world,{ownerId:'owner',requestId:'heading-body',now:1000,actor:null},{type:'player.create',name:'Ari',stationName:'Casa',faction:'cartographers'});player.habitable=current;
  input.view.habitable.actors.push({playerId:'other-heading',name:'Mara',plot:{x:0,y:0},state:{appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[],exploration}});
  const district=createHabitableDistrict({input,state:current,groundHeight:()=>2,onMove(){assert.fail('a wait cannot walk');},onPlace(){},onInteract(){}}),saved=JSON.stringify(current);
  try{for(const now of[1999,2000,2500,2999]){assert.equal(explorationHeadingAt(exploration,now),expected);assert.equal(explorationWorldBodies(world,now)[0].yaw,expected);assert.equal(explorationPlayerBodies(input,now).find(body=>body.id==='other-heading')!.yaw,expected);district.animate(now,true);assert.equal(district.group.getObjectByName('your-persistent-avatar')!.rotation.y,expected);assert.equal(district.group.getObjectByName('nearby-player-other-heading')!.rotation.y,expected);}assert.equal(explorationHeadingAt(exploration,3000),reverse?-Math.PI/2:0);assert.equal(JSON.stringify(current),saved);}finally{district.dispose();}
 }
});
