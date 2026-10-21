import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {readOfflineGlb} from './helpers/glb-offline.ts';
import {bindTripoHorse,horseHoofOffset} from '../lib/graphics/tripo-transport.ts';
import {createShopTransport,createTransportOdometer,SHOP_DRIVER_SEAT} from '../lib/graphics/city-shop-transport.ts';

test('real transport assets stay within the web budget, with one atlas each and four real wheel pivots',async()=>{
 for(const id of['horse','cart']){const{source,bytes,gltf}=await readOfflineGlb(new URL('../public/models/tripo-v1/'+id+'.glb',import.meta.url));assert(bytes.length<900000);assert.equal(source.materials.length,1);assert.equal(source.images.length,1);assert(!source.images[0].uri);assert(!source.buffers[0].uri);assert.equal(source.meshes.length,id==='horse'?1:5);assert(!source.animations?.length);if(id==='horse')assert.equal(source.skins[0].joints.length,23);else{gltf.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(gltf.scene);assert(bounds.min.y>=-1e-5);assert(bounds.min.z>=-1.601&&bounds.max.z<1.401);assert(bounds.getSize(new THREE.Vector3()).x<1.5);for(const wheel of gltf.scene.children.filter(o=>o.name.startsWith('cart-wheel-'))){const before=wheel.position.clone();wheel.rotation.x=1.1;assert(wheel.position.equals(before));}assert.equal(gltf.scene.children.filter(o=>o.name.startsWith('cart-wheel-')).length,4);}}
});
test('the real quadruped rig moves four legs without moving its world origin, stretching the body or sinking through the road',async()=>{
 const{gltf}=await readOfflineGlb(new URL('../public/models/tripo-v1/horse.glb',import.meta.url)),horse=bindTripoHorse(gltf.scene),poses:number[][]=[];
 try{for(const[time,distance,speed]of[[0,0,0],[.1,.1,2],[.3,.4,2],[.5,.8,5.6],[.7,1.1,5.6],[1,1.1,0]]){horse.update(time,distance,speed);horse.group.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});const bounds=new THREE.Box3().setFromObject(horse.group),size=bounds.getSize(new THREE.Vector3());assert(bounds.min.y>-.13&&bounds.min.y<.15,JSON.stringify({time,bounds}));assert(size.y>1.8&&size.y<2.6);assert(size.x<1.2&&size.z<3);assert.deepEqual(horse.group.position.toArray(),[0,0,0]);let pose:number[]=[];horse.group.traverse(o=>{if(o instanceof THREE.Bone)pose.push(...o.quaternion.toArray());});poses.push(pose);}
 assert.notDeepEqual(poses[0],poses[1]);assert.notDeepEqual(poses[1],poses[2]);
 }finally{horse.dispose();}
});
test('gait and wheel distance stop against obstacles, and teleports or hidden-tab jumps do not spin the wheels',()=>{
 const odometer=createTransportOdometer();assert.equal(odometer.sample(10,100,100).distance,0);assert(Math.abs(odometer.sample(10.1,100.2,100).distance-.2)<1e-8);const stopped=odometer.sample(10.2,100.2,100);assert.equal(stopped.speed,0);assert.equal(odometer.sample(100,5000,5000).distance,stopped.distance);assert.equal(odometer.sample(100,5001,5000).distance,stopped.distance);assert.deepEqual(horseHoofOffset(20,0,0),{z:0,y:0});
 const cart=createShopTransport('cart','horse',true);try{cart.setCargo(21);assert.equal(cart.group.getObjectByName('owned-vehicle-cargo')!.children.filter(c=>c.visible).length,3);cart.animate(1,5.6);cart.group.position.z=.2;cart.animate(1.1,5.6);const wheel=cart.group.children.find(c=>c.name.startsWith('owned-wheel-'))!;assert(wheel.rotation.x>0);const angle=wheel.rotation.x;cart.animate(1.2,5.6);assert.equal(wheel.rotation.x,angle);assert.equal(cart.group.userData.travelSpeed,0);assert(cart.group.getObjectByName('owned-harness-and-reins')!.visible);assert(SHOP_DRIVER_SEAT.y<1);cart.setNear(true);assert.equal(cart.group.getObjectByName('draft-animal-original')!.visible,true,'SSR starts no asset download');}finally{cart.dispose();cart.dispose();}
});
test('stance targets oppose world movement and reverse travel reverses the wheels',()=>{
 const a=horseHoofOffset(.05,2,0),b=horseHoofOffset(.09,2,0);assert.equal(a.y,0);assert.equal(b.y,0);assert(Math.abs((b.z-a.z)+.04)<1e-8,'a planted hoof opposes the body displacement');
 const odometer=createTransportOdometer();odometer.sample(0,0,0);const reverse=odometer.sample(.1,0,-.2);assert(reverse.speed<0&&reverse.distance<0);
});
