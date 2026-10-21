import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalShipLibrary,createRoyalGalleon,disposeRoyalGalleon,ROYAL_GALLEON_DIMENSIONS} from '../lib/graphics/royal-harbor-ships.ts';

function parts(group:THREE.Group){return group.children.filter((object):object is THREE.Mesh=>object instanceof THREE.Mesh);}

test('royal galleons have a real broad stern, deep hull and eight square sails in seven bounded batches',()=>{
  const library=createRoyalShipLibrary();
  try{for(const variant of[0,1,2]){
    const group=library.create({variant}),meshes=parts(group),bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
    assert.equal(meshes.length,7);let triangles=0;
    for(const mesh of meshes){triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;for(const name of['position','normal','uv','color']){const attribute=mesh.geometry.getAttribute(name);assert.ok(attribute,`${mesh.name} ${name}`);for(const value of attribute.array)assert.ok(Number.isFinite(value),`${mesh.name} finite ${name}`);}assert.ok(mesh.castShadow);assert.equal(mesh.receiveShadow,!['royal-galleon-cloth','royal-galleon-blue'].includes(mesh.name));}
    assert.ok(triangles>25_000&&triangles<42_000);assert.ok(size.z<=ROYAL_GALLEON_DIMENSIONS.overallLength);assert.ok(size.x<=ROYAL_GALLEON_DIMENSIONS.rigBeam);assert.ok(bounds.max.y<=ROYAL_GALLEON_DIMENSIONS.mastHeight);assert.ok(bounds.min.y>=-ROYAL_GALLEON_DIMENSIONS.draft);assert.ok(bounds.min.y<-3);
    assert.equal(group.userData.royalShip.waterline,0);assert.equal(group.userData.royalShip.bow,'negative-z');assert.ok(bounds.min.z<-23&&bounds.max.z>19);
    assert.equal(group.userData.royalShip.masts,variant===1?2:3);assert.equal(group.userData.royalShip.sails,variant===1?6:8);
    const timber=group.getObjectByName('royal-galleon-timber') as THREE.Mesh,position=timber.geometry.getAttribute('position');let bow=0,stern=0;
    for(let i=0;i<position.count;i++){const z=position.getZ(i),y=position.getY(i);if(y>0&&y<2.5){if(Math.abs(z+18)<.001)bow=Math.max(bow,Math.abs(position.getX(i)));if(Math.abs(z-18)<.001)stern=Math.max(stern,Math.abs(position.getX(i)));}}
    assert.ok(stern>bow*5,'the square transom is visibly different from the pointed bow');
    assert.equal(((group.getObjectByName('royal-galleon-cloth') as THREE.Mesh).material as THREE.MeshStandardMaterial).side,THREE.DoubleSide);
  }}finally{library.dispose();}
});

test('gold sail heraldry sits in front of the opaque cloth when viewed from bow or stern',()=>{
  const library=createRoyalShipLibrary(),group=library.create();group.updateMatrixWorld(true);
  try{
    const gold=group.getObjectByName('royal-galleon-gold')!,blue=group.getObjectByName('royal-galleon-blue')!,cloth=group.getObjectByName('royal-galleon-cloth')!;
    const y=19.8-.4*8.7,z=1.7-.34-Math.sin(Math.PI*.4)*1.35;
    for(const side of[-1,1]){const origin=new THREE.Vector3(0,y,z+side*5),direction=new THREE.Vector3(0,0,-side),ray=new THREE.Raycaster(origin,direction,0,6),goldHit=ray.intersectObject(gold,false)[0],sailHit=ray.intersectObjects([blue,cloth],false)[0];assert.ok(goldHit&&sailHit,`heraldic surface visible from ${side<0?'bow':'stern'}`);assert.ok(goldHit.distance<sailHit.distance,`gold crest is in front of the sail from ${side<0?'bow':'stern'}`);}
  }finally{library.dispose();}
});

test('one viewer pools ship meshes and finishes while another viewer retains its own live resources',()=>{
  const first=createRoyalShipLibrary(),second=createRoyalShipLibrary(),a=first.create(),b=first.create({scale:.6}),other=second.create(),resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
  for(const mesh of parts(a)){const counterpart=b.getObjectByName(mesh.name) as THREE.Mesh;assert.notEqual(mesh,counterpart);assert.equal(mesh.geometry,counterpart.geometry);assert.equal(mesh.material,counterpart.material);const material=mesh.material as THREE.MeshStandardMaterial;resources.add(mesh.geometry);resources.add(material);if(material.map)resources.add(material.map);assert.notEqual(mesh.geometry,(other.getObjectByName(mesh.name) as THREE.Mesh).geometry);}
  const original=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()),scaled=new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());assert.ok(scaled.distanceTo(original.multiplyScalar(.6))<1e-5);
  const disposed=new Map<object,number>();resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)??0)+1)));
  const parent=new THREE.Group();parent.add(a,b);first.dispose();first.dispose();assert.equal(parent.children.length,0);for(const resource of resources)assert.equal(disposed.get(resource),1);
  assert.throws(()=>first.create());assert.ok(second.create({variant:1}).children.length===7);second.dispose();
});

test('the standalone builder has explicit idempotent disposal and rejects invalid scales',()=>{
  const group=createRoyalGalleon({variant:2}),mesh=parts(group)[0];let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);disposeRoyalGalleon(group);disposeRoyalGalleon(group);assert.equal(disposed,1);
  const library=createRoyalShipLibrary();try{for(const scale of[0,-1,NaN,Infinity,11])assert.throws(()=>library.create({scale}),RangeError);assert.equal(library.create({variant:NaN}).userData.royalShip.variant,0);}finally{library.dispose();}
});


test('ivory sail reverse faces retain daylight bounce without solid black self-shadowing',()=>{
  const library=createRoyalShipLibrary();
  try{
    const group=library.create(),cloth=group.getObjectByName('royal-galleon-cloth') as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    assert.equal(cloth.receiveShadow,false);assert.equal(cloth.material.side,THREE.DoubleSide);assert.ok(cloth.material.emissiveIntensity>=.2&&cloth.material.emissiveIntensity<=.35);
    const colors=cloth.geometry.getAttribute('color'),positions=cloth.geometry.getAttribute('position');let ivory=0,total=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<colors.count;i+=3){a.fromBufferAttribute(positions,i);b.fromBufferAttribute(positions,i+1);c.fromBufferAttribute(positions,i+2);const area=b.sub(a).cross(c.sub(a)).length()*.5;total+=area;if(colors.getX(i)>.8&&colors.getY(i)>.7&&colors.getZ(i)>.5)ivory+=area;}
    assert.ok(ivory>total*.8,'most visible fabric remains pale linen rather than dark rigging or blue heraldry');
    assert.equal(group.userData.royalShip.staysails,2);
  }finally{library.dispose();}
});
