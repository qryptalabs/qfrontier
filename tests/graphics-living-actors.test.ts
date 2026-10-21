import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createLivingActorLibrary,createLivingActor,createLivingCart,type LivingActorRole} from '../lib/graphics/living-actors.ts';
import {animateWorldAsset,createWorldAssetLibrary} from '../lib/graphics/world-models.ts';

const roles:LivingActorRole[]=['worker','guard','merchant','farmer','woodcutter','builder'];
const transforms=(group:THREE.Group)=>{const result:number[]=[];group.traverse(object=>result.push(...object.position.toArray(),object.rotation.x,object.rotation.y,object.rotation.z));return result;};

test('residents have finite articulated models, role-specific tools and bounded draw/geometry cost',()=>{
  const library=createLivingActorLibrary(),signatures=new Set<string>();
  for(const role of roles){
    const actor=library.get(role,7),meshes:THREE.Mesh[]=[];let triangles=0;actor.group.traverse(object=>{if(object instanceof THREE.Mesh){meshes.push(object);for(const value of object.geometry.attributes.position.array)assert.ok(Number.isFinite(value));triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
    assert.ok(meshes.length<=11,'each resident has at most eleven merged articulated meshes');assert.ok(triangles>100&&triangles<650,'voxel anatomy and tools fit a crowd budget');
    const bounds=new THREE.Box3().setFromObject(actor.group);assert.ok(bounds.min.y>-.6&&bounds.max.y>1.8&&bounds.max.y<2.8);assert.ok(actor.group.getObjectByName('actor-left-knee'));assert.ok(actor.group.getObjectByName('actor-right-elbow'));
    signatures.add(meshes.map(mesh=>`${mesh.geometry.attributes.position.count}:${[...mesh.geometry.attributes.color.array].slice(0,3).join(',')}`).join('|'));actor.dispose();
  }
  assert.equal(signatures.size,roles.length);library.dispose();
});

test('walking gait and work routines animate limbs without changing the route position',()=>{
  const library=createLivingActorLibrary();
  for(const role of roles){const actor=library.get(role,3);actor.group.position.set(120,4,-80);actor.group.rotation.y=.7;actor.animate(0,true);const start=transforms(actor.group);actor.animate(.29,true);assert.notDeepEqual(transforms(actor.group),start,`${role} walks`);assert.deepEqual(actor.group.position.toArray(),[120,4,-80]);assert.equal(actor.group.rotation.y,.7);
    actor.animate(0,false,true);const firstWork=transforms(actor.group);actor.animate(.73,false,true);assert.notDeepEqual(transforms(actor.group),firstWork,`${role} performs a work/guard routine`);
    actor.animate(3.5,true,true);const frozen=transforms(actor.group);actor.animate(3.5,true,true);assert.deepEqual(transforms(actor.group),frozen,'frozen viewer time keeps every limb still');actor.dispose();}
  library.dispose();
});

test('resident pools share geometry/materials and instance disposal cannot free another resident',()=>{
  const library=createLivingActorLibrary(),a=library.get('farmer',3),b=library.get('farmer',3),geometryA=(a.group.getObjectByName('actor-tunic')as THREE.Mesh).geometry,geometryB=(b.group.getObjectByName('actor-tunic')as THREE.Mesh).geometry;
  assert.equal(geometryA,geometryB);assert.notEqual(a.group,b.group);
  let freed=0;geometryA.addEventListener('dispose',()=>freed++);a.dispose();a.dispose();assert.equal(freed,0);b.animate(2,true);library.dispose();library.dispose();assert.equal(freed,1);assert.throws(()=>library.get('worker'));assert.throws(()=>library.cart());
  const solo=createLivingActor('builder');solo.dispose();solo.dispose();
});

test('wooden carts rotate wheels independently and stay deterministic for paused time',()=>{
  const library=createLivingActorLibrary(),cart=library.cart(2),body=cart.group.getObjectByName('cart-body')!,wheels=cart.group.children.filter(child=>child.name.startsWith('cart-wheel-'));
  assert.equal(wheels.length,4);cart.animate(0,1);const first=wheels[0].rotation.x;cart.animate(.5,1);assert.notEqual(wheels[0].rotation.x,first);assert.equal(Math.abs(body.rotation.x),0);const frozen=transforms(cart.group);cart.animate(.5,1);assert.deepEqual(transforms(cart.group),frozen);
  cart.animate(Number.NaN,Infinity);assert.ok(transforms(cart.group).every(Number.isFinite));cart.animate(Number.MAX_VALUE,Number.MAX_VALUE);assert.ok(transforms(cart.group).every(Number.isFinite));cart.dispose();library.dispose();const solo=createLivingCart();solo.dispose();solo.dispose();
});

test('windmill sails pivot about the hub without moving the tower or sharing pose between clones',()=>{
  const library=createWorldAssetLibrary(),mill=library.get('windmill'),second=library.get('windmill'),rotor=mill.getObjectByName('windmill-rotor')!,tower=mill.children[0],towerPose=tower.matrix.clone();
  assert.deepEqual(rotor.position.toArray(),[0,3.6,1.9]);assert.equal(rotor.userData.worldAnimated,true);rotor.traverse(object=>assert.equal(object.userData.worldAnimated,true));
  animateWorldAsset(mill,2);assert.ok(Math.abs(rotor.rotation.z-.84)<1e-12);assert.equal(Math.abs(second.getObjectByName('windmill-rotor')!.rotation.z),0);assert.deepEqual(tower.matrix.elements,towerPose.elements);animateWorldAsset(mill,2);assert.equal(rotor.rotation.z,.84);
  animateWorldAsset(mill,NaN,Infinity);assert.ok(Number.isFinite(rotor.rotation.z));animateWorldAsset(mill,Number.MAX_VALUE,Number.MAX_VALUE);assert.ok(Number.isFinite(rotor.rotation.z));library.dispose();
});
