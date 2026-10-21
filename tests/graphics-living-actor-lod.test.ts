import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createLivingActorLibrary,type LivingActorRole} from '../lib/graphics/living-actors.ts';

const roles:LivingActorRole[]=['worker','guard','merchant','farmer','woodcutter','builder'];
function visibleMeshes(group:THREE.Object3D){const result:THREE.Mesh[]=[];group.traverseVisible(object=>{if(object instanceof THREE.Mesh)result.push(object);});return result;}
function magenta(geometry:THREE.BufferGeometry){const colors=geometry.getAttribute('color');for(let i=0;i<colors.count;i++)if(colors.getX(i)===1&&colors.getY(i)===0&&colors.getZ(i)===1)return true;return false;}

test('distant residents draw one unshadowed body without moving the authoritative group or losing named pivots',()=>{
  const library=createLivingActorLibrary();
  for(const biome of['forest','ice','desert']as const)for(const role of roles){
    const actor=library.getForBiome(role,biome,7),head=actor.group.getObjectByName('actor-head'),load=actor.group.getObjectByName('actor-load'),near=visibleMeshes(actor.group).length;actor.group.position.set(32,7,-18);actor.group.rotation.y=1.7;actor.group.scale.setScalar(.72);actor.animate(8,1.2,true);
    const before={position:actor.group.position.toArray(),rotation:actor.group.rotation.toArray(),scale:actor.group.scale.toArray()};actor.setVisualDetail!(false);
    const far=visibleMeshes(actor.group);assert.equal(far.length,1);assert.equal(far[0].castShadow,false);assert.equal(far[0].receiveShadow,true);assert.equal(actor.group.getObjectByName('actor-head'),head);assert.equal(actor.group.getObjectByName('actor-load'),load);
    actor.animate(15,1,true);assert.deepEqual({position:actor.group.position.toArray(),rotation:actor.group.rotation.toArray(),scale:actor.group.scale.toArray()},before);
    actor.setVisualDetail!(true);actor.animate(15,1,true);assert.equal(visibleMeshes(actor.group).length,near);assert.ok(visibleMeshes(actor.group).every(mesh=>mesh.castShadow));
  }
  library.dispose();
});

test('the same template shares a neutral distant mesh regardless of walking phase and allocates no geometry per frame',()=>{
  const library=createLivingActorLibrary(),a=library.get('builder',0),b=library.get('builder',12);a.animate(123,1.2,true);b.animate(456,0,true);a.setVisualDetail!(false);b.setVisualDetail!(false);
  const geometry=visibleMeshes(a.group)[0].geometry;assert.equal(geometry,visibleMeshes(b.group)[0].geometry);
  for(let i=0;i<120;i++){a.setVisualDetail!(false);a.animate(1000+i/60,1.2,i%2===0);assert.equal(visibleMeshes(a.group)[0].geometry,geometry);}
  a.setVisualDetail!(true);a.animate(4000,1,true);a.setVisualDetail!(false);assert.equal(visibleMeshes(a.group)[0].geometry,geometry);
  assert.ok(new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position')as THREE.BufferAttribute).min.y<.01,'normal body feet stay at the same local origin');library.dispose();
});

test('cargo visibility and replaced port cargo are baked correctly while the original cargo API stays intact',()=>{
  const library=createLivingActorLibrary(),actor=library.get('worker',2),load=actor.group.getObjectByName('actor-load')!,originalVisible=load.visible;
  actor.setVisualDetail!(false);const loaded=visibleMeshes(actor.group)[0].geometry;load.visible=false;actor.animate(3,false);const empty=visibleMeshes(actor.group)[0].geometry;assert.notEqual(empty,loaded);assert.ok(empty.getAttribute('position').count<loaded.getAttribute('position').count);actor.setVisualDetail!(true);assert.equal(load.visible,false);
  load.visible=originalVisible;load.removeFromParent();const replacement=new THREE.Group();replacement.name='actor-load';replacement.position.set(0,1.02,.44);const crateGeometry=new THREE.BoxGeometry(.8,.5,.4),crateMaterial=new THREE.MeshStandardMaterial({color:0xff00ff});replacement.add(new THREE.Mesh(crateGeometry,crateMaterial));actor.group.getObjectByName('actor-torso')!.add(replacement);
  actor.setVisualDetail!(false);assert.ok(magenta(visibleMeshes(actor.group)[0].geometry),'the distant porter carries its actual replacement, not the original log bundle');replacement.visible=false;actor.animate(4,false);assert.equal(magenta(visibleMeshes(actor.group)[0].geometry),false);actor.setVisualDetail!(true);assert.equal(actor.group.getObjectByName('actor-load'),replacement);assert.equal(replacement.visible,false);
  library.dispose();crateGeometry.dispose();crateMaterial.dispose();
});

test('instance disposal preserves shared near/far resources until the library releases them exactly once',()=>{
  const library=createLivingActorLibrary(),a=library.get('merchant',3),b=library.get('merchant',15);a.setVisualDetail!(false);b.setVisualDetail!(false);const mesh=visibleMeshes(a.group)[0],geometry=mesh.geometry,material=mesh.material as THREE.Material;let geometryFreed=0,materialFreed=0;geometry.addEventListener('dispose',()=>geometryFreed++);material.addEventListener('dispose',()=>materialFreed++);
  a.dispose();a.dispose();assert.equal(geometryFreed,0);assert.equal(materialFreed,0);assert.equal(visibleMeshes(b.group)[0].geometry,geometry);b.animate(20,1);library.dispose();library.dispose();assert.equal(geometryFreed,1);assert.equal(materialFreed,1);b.setVisualDetail!(false);b.animate(30,1);assert.equal(geometryFreed,1);
});

test('forty distant residents need forty color draws instead of hundreds of articulated part draws',()=>{
  const library=createLivingActorLibrary(),actors=Array.from({length:40},(_,i)=>library.get(roles[i%roles.length],i)),near=actors.reduce((sum,a)=>sum+visibleMeshes(a.group).length,0);actors.forEach(a=>a.setVisualDetail!(false));const far=actors.reduce((sum,a)=>sum+visibleMeshes(a.group).length,0);
  assert.ok(near>=400);assert.equal(far,40);assert.ok(actors.every(a=>!visibleMeshes(a.group)[0].castShadow));library.dispose();
});
