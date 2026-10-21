import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createExplorationTransportLayer} from '../lib/graphics/exploration-transport.ts';
import {createHabitableDistrict} from '../lib/graphics/habitable-district.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {HabitableState} from '../lib/mvp/habitable-data.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import {EXPLORATION_PUBLIC_LANDINGS} from '../lib/mvp/exploration-network-data.ts';
import {createExplorationInfrastructureChunk} from '../lib/graphics/exploration-infrastructure.ts';

test('boat legs carry one passenger above a real hull instead of grounding them on the sea bed',()=>{
  const layer=createExplorationTransportLayer(()=>-12),position={x:12000,y:1000},origin={x:11968,y:960};
  try{const pose=layer.update('ari',position,'boat',0,1000,origin,true),boat=layer.group.getObjectByName('exploration-boat-ari')!;assert.ok(boat.getObjectByName('boat-planked-hull'));assert.equal(boat.position.x,32);assert.equal(boat.position.z,40);assert.ok(pose.foot.y>.5&&pose.foot.y<1);assert.ok(pose.foot.y>-12+10);assert.ok(Math.abs(pose.foot.x-12000.42)<.03);assert.ok(Math.abs(pose.foot.z-1000.45)<.03);layer.update('ari',position,'boat',0,1100,origin,true);assert.equal(layer.group.children.length,1);assert.equal(layer.group.children[0],boat);}finally{layer.dispose();layer.dispose();}
});

test('carriage legs include a harnessed animal and place the passenger on the cart floor',()=>{
  const layer=createExplorationTransportLayer(()=>3);
  try{const pose=layer.update('ari',{x:50,y:25},'carriage',Math.PI/2,1000,{x:0,y:0},true),cart=layer.group.getObjectByName('exploration-carriage-ari')!;assert.ok(cart.getObjectByName('haulage-animal'));assert.ok(cart.getObjectByName('haulage-yoke-harness-reins'));assert.ok(cart.getObjectByName('haulage-cart-body'));assert.ok(Math.abs(pose.foot.y-4.06)<1e-8);assert.ok(Math.abs(pose.foot.x-49.4)<1e-8);assert.equal(pose.foot.z,25);layer.update('ari',{x:50,y:25},'walk',0,2000,{x:0,y:0},true);assert.equal(layer.group.children.length,0);}finally{layer.dispose();}
});

test('transport instances follow floating origins and release public vehicles when their owner leaves view',()=>{
  const layer=createExplorationTransportLayer(()=>2),point={x:1000,y:-500};
  try{layer.update('one',point,'carriage',0,1000,{x:960,y:-512},true);layer.update('two',point,'boat',0,1000,{x:960,y:-512},true);const vehicle=layer.group.getObjectByName('exploration-carriage-one')!;assert.equal(vehicle.position.x,40);assert.equal(vehicle.position.z,12);layer.update('one',point,'carriage',0,1100,{x:1024,y:-448},true);assert.equal(vehicle.position.x,-24);assert.equal(vehicle.position.z,-52);layer.retain(new Set(['one']));assert.equal(layer.group.children.length,1);}finally{layer.dispose();}
});

test('a confirmed traffic hold stops the animal and wheels without hiding or replacing the carriage',()=>{
  const layer=createExplorationTransportLayer(()=>2),point={x:50,y:25},origin={x:0,y:0};
  try{
    layer.update('waiting',point,'carriage',0,1000,origin,false,null,true);layer.update('waiting',point,'carriage',0,1250,origin,false,null,true);
    const cart=layer.group.getObjectByName('exploration-carriage-waiting')!,wheel=cart.getObjectByName('haulage-wheel--1.015--1.35')!,animal=cart.getObjectByName('haulage-animal')!;assert.ok(cart.userData.distance>0);
    const foot=layer.update('waiting',point,'carriage',0,1500,origin,false,null,false).foot,angle=wheel.rotation.x,distance=cart.userData.distance;
    layer.update('waiting',point,'carriage',0,2500,origin,false,null,false);assert.equal(wheel.rotation.x,angle);assert.equal(cart.userData.distance,distance);assert.equal(cart.visible,true);assert.equal(layer.group.children.length,1);assert.equal(layer.group.children[0],cart);
    for(const leg of animal.children.filter(node=>node.name.startsWith('animal-leg-')))assert.equal(Math.abs(leg.rotation.x),0);assert.deepEqual(layer.update('waiting',point,'carriage',0,2600,origin,false,null,false).foot,foot);
    layer.update('waiting',{x:51,y:25},'carriage',0,2750,origin,false,null,true);assert.ok(cart.userData.distance>distance);assert.notEqual(wheel.rotation.x,angle);
  }finally{layer.dispose();}
});

test('the district renders the confirmed boat leg without creating a second avatar or changing the saved route',()=>{
  const world=createMvpWorld('owner',1000),player=createPlayer(world,{ownerId:'owner',requestId:'transit-render',now:1000,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',1000,player.id),input:SceneInput={view,player:view.player,selected:player.position,mode:'settlement',quality:'performance',reducedMotion:true};
  const state:HabitableState={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[],exploration:{version:1,position:{x:1000,y:500},homePosition:{x:0,y:1.5},departedAt:1000,movement:{points:[{x:1000,y:500},{x:1012,y:500}],startsAt:1000,endsAt:2000,legs:[{mode:'boat',fromIndex:0,toIndex:1,startsAt:1000,endsAt:2000}]}}},before=JSON.stringify(state),district=createHabitableDistrict({input,state,groundHeight:()=>-10,onMove(){assert.fail('render cannot submit movement');},onPlace(){},onInteract(){}});
  try{district.animate(1500,true);const avatar=district.group.getObjectByName('your-persistent-avatar')!,boat=district.group.getObjectByName(`exploration-boat-${player.id}`)!;assert.ok(boat);assert.ok(avatar.position.y>.5);assert.ok(avatar.position.x>1006);assert.equal(district.navigationPose!().foot.y,avatar.position.y);district.setNavigationMode?.('first-person');district.animate(1500,true);assert.equal(avatar.visible,false);assert.equal(boat.visible,true);assert.equal(JSON.stringify(state),before);let count=0;district.group.traverse(o=>{if(o.name==='your-persistent-avatar')count++;});assert.equal(count,1);assert.ok(avatar instanceof THREE.Group);}finally{district.dispose();}
});

test('boarding and disembarking keep the hull clear of the pier and support each visible foot on the real gangway',()=>{
  const port=EXPLORATION_PUBLIC_LANDINGS[0],dx=port.water.x-port.land.x,dy=port.water.y-port.land.y,length=Math.hypot(dx,dy),heading=Math.atan2(dx,dy),vehicle={x:port.water.x+dx/length*6,y:port.water.y+dy/length*6},c=Math.cos(heading),s=Math.sin(heading),target={x:vehicle.x+.42*c+.45*s,y:vehicle.y-.42*s+.45*c},cx=Math.floor(port.water.x/64),cy=Math.floor(port.water.y/64),pier=createExplorationInfrastructureChunk(cx,cy,()=>0),layer=createExplorationTransportLayer(()=>0),ray=new THREE.Raycaster();pier.group.position.set(cx*64,0,cy*64);pier.group.updateMatrixWorld(true);
  try{for(const kind of['boarding','disembarking']as const)for(const progress of[0,.2,.45,.7,.99,1]){const alpha=kind==='boarding'?progress:1-progress,position={x:port.water.x+(vehicle.x-port.water.x)*alpha,y:port.water.y+(vehicle.y-port.water.y)*alpha},passenger={x:port.water.x+(target.x-port.water.x)*alpha,y:port.water.y+(target.y-port.water.y)*alpha},pose=layer.update('boarding',position,'boat',heading,1000,{x:0,y:0},true,{vehicle,passenger,heading,boarding:{progress,kind,...(kind==='boarding'?{fromPortId:port.id}:{toPortId:port.id})}}),boat=layer.group.getObjectByName('exploration-boat-boarding')!,gangway=layer.group.getObjectByName('exploration-gangway-boarding')!,steps=layer.group.getObjectByName('exploration-boarding-steps-boarding')!;
      assert.equal(boat.position.x,vehicle.x);assert.equal(boat.position.z,vehicle.y);assert.equal(pose.foot.x,passenger.x);assert.equal(pose.foot.z,passenger.y);layer.group.updateMatrixWorld(true);ray.set(new THREE.Vector3(passenger.x,10000,passenger.y),new THREE.Vector3(0,-1,0));const support=ray.intersectObjects([pier.group,gangway,steps],true)[0];assert.ok(support,`${kind} ${progress} has a visible walking surface`);assert.ok(Math.abs(support.point.y+.07-pose.foot.y)<.025,`${kind} ${progress} feet=${pose.foot.y}, surface=${support.point.y}`);
      const mast=new THREE.Box3().setFromObject(boat.getObjectByName('boat-mast-rigging')!);for(const mesh of pier.group.children)if(mesh instanceof THREE.InstancedMesh){mesh.geometry.computeBoundingBox();for(let i=0;i<mesh.count;i++){const transform=new THREE.Matrix4();mesh.getMatrixAt(i,transform);transform.premultiply(mesh.matrixWorld);const box:THREE.Box3=mesh.geometry.boundingBox!.clone().applyMatrix4(transform);assert.equal(box.intersectsBox(mast),false,'the real pier cannot cross the moored mast');}}
    }
  }finally{layer.dispose();pier.dispose();}
});
