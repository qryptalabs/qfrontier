import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createFishingModelLibrary,createFishingCommunityLibrary,FISHING_MODEL_DIMENSIONS,type FishingStructureKind} from '../lib/graphics/fishing-community-models.ts';
import {createBuilding} from '../lib/graphics/models.ts';
import type {WorldBiome} from '../lib/graphics/world-geography.ts';

const meshes=(group:THREE.Object3D)=>{const list:THREE.Mesh[]=[];group.traverse(object=>{if(object instanceof THREE.Mesh)list.push(object);});return list;};
function checkGeometry(group:THREE.Group,maxTriangles:number){let triangles=0;for(const mesh of meshes(group)){triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}assert.ok(triangles>24&&triangles<maxTriangles);return triangles;}
const visibleCargo=(group:THREE.Group,name:string)=>group.getObjectByName(name)!.children.filter(child=>child.visible).length;

test('fishing boats have finite planked hulls, deck crew, rigging and a fishing net with a bounded budget',()=>{
  const library=createFishingModelLibrary(),boat=library.boat('aurora');checkGeometry(boat.group,7000);assert.ok(boat.group.getObjectByName('boat-planked-hull'));assert.ok(boat.group.getObjectByName('boat-mast-rigging'));assert.ok(boat.group.getObjectByName('boat-net'));assert.ok(boat.group.getObjectByName('fisher-pole'));assert.equal(boat.group.children.filter(child=>child.name.startsWith('living-worker')).length,2);
  const hull=new THREE.Box3().setFromObject(boat.group.getObjectByName('boat-planked-hull')!,true);assert.ok(hull.max.z-hull.min.z<=FISHING_MODEL_DIMENSIONS.boat.length);assert.ok(hull.max.x-hull.min.x<=FISHING_MODEL_DIMENSIONS.boat.width);assert.ok(hull.min.y>=-FISHING_MODEL_DIMENSIONS.boat.draft);const mast=new THREE.Box3().setFromObject(boat.group.getObjectByName('boat-mast-rigging')!,true);assert.ok(mast.max.y<=FISHING_MODEL_DIMENSIONS.boat.height);boat.dispose();library.dispose();
});

test('boat fishing phases lower and animate the net while cargo follows exact snapshot crate counts',()=>{
  const library=createFishingCommunityLibrary(),boat=library.boat(3),net=boat.group.getObjectByName('boat-net')!,sail=boat.group.getObjectByName('boat-sail')!;boat.group.position.set(30,0,-20);boat.group.rotation.y=.7;
  boat.animate(2,1,'outbound',0);const stowed=net.rotation.z;assert.equal(visibleCargo(boat.group,'boat-cargo'),0);assert.equal(sail.scale.x,1);
  boat.animate({time:3,speed:0,state:'fishing',cargo:2,wind:.6});assert.notEqual(net.rotation.z,stowed);assert.equal(visibleCargo(boat.group,'boat-cargo'),2);const phase=net.rotation.z;boat.animate({time:3,speed:0,state:'fishing',cargo:2});assert.equal(net.rotation.z,phase);boat.animate(4,0,'fishing',6);assert.notEqual(net.rotation.z,phase);assert.equal(visibleCargo(boat.group,'boat-cargo'),6);
  boat.animate(5,0,'unloading',1);assert.equal(visibleCargo(boat.group,'boat-cargo'),1);assert.equal(sail.scale.x,.3);assert.deepEqual(boat.group.position.toArray(),[30,0,-20]);assert.equal(boat.group.rotation.y,.7);boat.dispose();library.dispose();
});

test('a horse or ox visibly pulls the cart, with a seated driver and distance-linked hooves and wheels',()=>{
  const library=createFishingModelLibrary();for(const kind of['horse','ox']as const){const haulage=library.haulage(kind,4);checkGeometry(haulage.group,6000);assert.ok(haulage.group.getObjectByName('haulage-animal-body'));assert.ok(haulage.group.getObjectByName('haulage-yoke-harness-reins'));assert.ok(haulage.group.getObjectByName('haulage-driver'));const wheels=haulage.group.children.filter(child=>child.name.startsWith('haulage-wheel-')),animal=haulage.group.getObjectByName('haulage-animal')!,legs=animal.children.filter(child=>child.name.startsWith('animal-leg-'));assert.equal(wheels.length,4);assert.equal(legs.length,4);
    haulage.animate(0,0,0);haulage.animate(.5,1,3);assert.ok(Math.abs(wheels[0].rotation.x-1)<1e-9);assert.notEqual(legs[0].rotation.x,0);assert.equal(visibleCargo(haulage.group,'haulage-cargo'),3);const stopped=wheels[0].rotation.x;haulage.animate({time:.8,speed:0,cargo:3});assert.equal(wheels[0].rotation.x,stopped);haulage.animate({time:.8,speed:0,cargo:3});assert.equal(wheels[0].rotation.x,stopped);
    assert.equal(haulage.group.getObjectByName('actor-left-hip')!.rotation.x,-1.2);const bounds=new THREE.Box3().setFromObject(haulage.group,true);assert.ok(bounds.max.x-bounds.min.x<=FISHING_MODEL_DIMENSIONS.haulage.width);assert.ok(bounds.min.z>=FISHING_MODEL_DIMENSIONS.haulage.minZ);assert.ok(bounds.max.z<=FISHING_MODEL_DIMENSIONS.haulage.maxZ);haulage.dispose();}
  library.dispose();
});

test('fishing port buildings and props retain finite detailed geometry at declared footprints',()=>{
  const library=createFishingModelLibrary(),kinds:FishingStructureKind[]=['dock','warehouse','fishstall','rack','crate','home','landing','net','barrel','lamp','workshop','garden','market','windmill','hall','tower'];
  for(const kind of kinds)checkGeometry(library.get(kind,7),30_000);
  for(const kind of['home','warehouse']as const){const bounds=new THREE.Box3().setFromObject(library.get(kind),true),size=bounds.getSize(new THREE.Vector3()),budget=FISHING_MODEL_DIMENSIONS[kind];assert.ok(size.x<=budget.width);assert.ok(size.z<=budget.length);assert.ok(bounds.min.x>=-1.35&&bounds.max.x<=1.35&&bounds.min.z>=-1.3&&bounds.max.z<=1.3,'normalized homes and stores fit shared layout dimensions');}
  library.dispose();
});

test('porters carry fish crates conditionally and unladen workers or boat crews have no timber load',()=>{
  const library=createFishingModelLibrary(),porter=library.worker('dockworker','mario'),load=porter.group.getObjectByName('actor-load')!;assert.ok(load.getObjectByName('porter-fish-crate'));assert.equal(load.visible,false);load.visible=true;porter.animate(2,true,false);assert.equal(load.visible,true);assert.equal(porter.group.getObjectByName('actor-left-shoulder')!.rotation.x,-.82);
  for(const role of['worker','fisher']as const){const actor=library.worker(role,3);assert.equal(actor.group.getObjectByName('actor-load'),undefined);actor.dispose();}const merchant=library.worker('merchant',3);assert.equal(merchant.group.getObjectByName('actor-load')!.visible,false,'idle merchants can become porters without changing the cached entity');merchant.dispose();porter.dispose();library.dispose();
});

test('fishing model instances share templates and each pooled resource is disposed exactly once',()=>{
  const library=createFishingModelLibrary(),a=library.boat(2),b=library.boat(2),cart=library.haulage('horse'),model=library.get('warehouse');assert.notEqual(a.group,b.group);assert.equal((a.group.getObjectByName('boat-planked-hull')as THREE.Mesh).geometry,(b.group.getObjectByName('boat-planked-hull')as THREE.Mesh).geometry);
  const resources=new Set<THREE.BufferGeometry|THREE.Material>();for(const group of[a.group,b.group,cart.group,model])for(const mesh of meshes(group)){resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])resources.add(material);}let events=0;resources.forEach(resource=>resource.addEventListener('dispose',()=>events++));a.dispose();a.dispose();assert.equal(events,0);b.animate(4,1,'inbound',6);library.dispose();library.dispose();assert.equal(events,resources.size);assert.throws(()=>library.boat());assert.throws(()=>library.get('crate'));assert.throws(()=>library.worker('porter'));
});

function modelSignature(group:THREE.Object3D,colors=true){return meshes(group).map(mesh=>`${mesh.geometry.attributes.position.count}:${[...mesh.geometry.attributes.position.array].join(',')}:${colors&&mesh.geometry.attributes.color?[...mesh.geometry.attributes.color.array].join(','):''}`).join('|');}

test('the optional biome keeps the original coastal API and exact default model geometry',()=>{
  const defaultLibrary=createFishingModelLibrary(),coast=createFishingModelLibrary('coast');
  for(const kind of['home','warehouse','dock','fishstall','rack','crate']as const)assert.equal(modelSignature(defaultLibrary.get(kind,7)),modelSignature(coast.get(kind,7)));
  assert.equal(modelSignature(defaultLibrary.boat('aurora').group),modelSignature(coast.boat('aurora').group));assert.equal(modelSignature(defaultLibrary.haulage().group),modelSignature(coast.haulage().group));defaultLibrary.dispose();coast.dispose();
});

test('regional ports use distinct architecture, sheltered props, climate clothing and painted sails without changing footprint budgets',()=>{
  const biomes:WorldBiome[]=['coast','ice','desert','tropical','forest'],houses=new Set<string>(),stores=new Set<string>(),sails=new Set<string>();
  for(const biome of biomes){const library=createFishingModelLibrary(biome);for(const kind of['home','warehouse']as const){const model=library.get(kind,6),bounds=new THREE.Box3().setFromObject(model,true);checkGeometry(model,12_000);assert.ok(bounds.min.x>=-1.35&&bounds.max.x<=1.35&&bounds.min.z>=-1.3&&bounds.max.z<=1.3,`${biome}/${kind} stays in the unchanged layout`);(kind==='home'?houses:stores).add(modelSignature(model,false));}
    for(const kind of['dock','fishstall','rack','net','garden','workshop']as const)checkGeometry(library.get(kind,2),30_000);
    const boat=library.boat(2);checkGeometry(boat.group,7500);sails.add(modelSignature(boat.group.getObjectByName('boat-sail')!));boat.animate(3,0,'fishing',3);assert.equal(visibleCargo(boat.group,'boat-cargo'),3);const net=boat.group.getObjectByName('boat-net')!,pose=net.rotation.z;boat.animate(3,0,'fishing',3);assert.equal(net.rotation.z,pose);
    const worker=library.worker('porter',4);assert.equal(worker.group.userData.fishingBiome,biome);assert.equal(!!worker.group.getObjectByName('actor-winter-cloak'),biome==='ice');const haulage=library.haulage();assert.ok(haulage.group.name.includes(biome==='ice'?'ox':'horse'));checkGeometry(haulage.group,6500);worker.dispose();boat.dispose();haulage.dispose();library.dispose();
  }
  assert.equal(houses.size,5,'all five communities have different building geometry, beyond recoloring');assert.equal(stores.size,5);assert.equal(sails.size,5);
});

test('regional dependencies are released once while borrowed global materials and another port remain usable',()=>{
  const forest=createFishingModelLibrary('forest'),ice=createFishingModelLibrary('ice'),objects=[forest.get('home',0),forest.get('warehouse',0),forest.boat(2).group,forest.haulage('ox').group],borrowed=new Set<THREE.Material>();for(const kind of['home','warehouse']as const)for(const mesh of meshes(createBuilding(kind,2,'custodians')))for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])borrowed.add(material);
  const resources=new Set<THREE.BufferGeometry|THREE.Material>();for(const group of objects)for(const mesh of meshes(group)){resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])resources.add(material);}const events=new Map<THREE.BufferGeometry|THREE.Material,number>();resources.forEach(resource=>resource.addEventListener('dispose',()=>events.set(resource,(events.get(resource)??0)+1)));forest.dispose();forest.dispose();for(const resource of resources)assert.equal(events.get(resource)??0,borrowed.has(resource as THREE.Material)?0:1);
  const boat=ice.boat(1);boat.animate(5,1,'outbound',6);assert.equal(visibleCargo(boat.group,'boat-cargo'),6);boat.dispose();ice.dispose();assert.throws(()=>forest.boat());
});

test('a desert kitchen and its palm fit the unchanged footprint after a quarter-turn',()=>{
  const library=createFishingModelLibrary('desert');for(const yaw of[-Math.PI/2,Math.PI/2])for(const seed of[0,1,2,3]){const kitchen=library.get('kitchen',seed);kitchen.scale.multiplyScalar(2.8);kitchen.rotation.y=yaw;const bounds=new THREE.Box3().setFromObject(kitchen,true);assert.ok(bounds.min.x>=-2.7*2.8/2-1e-6&&bounds.max.x<=2.7*2.8/2+1e-6&&bounds.min.z>=-2.6*2.8/2-1e-6&&bounds.max.z<=2.6*2.8/2+1e-6);}library.dispose();
});

test('the upgraded boat keeps its physical envelope while adding a curved sail and working helm',()=>{
  const library=createFishingModelLibrary(),boat=library.boat('upgraded');
  try{
    checkGeometry(boat.group,7000);const cloth=boat.group.getObjectByName('boat-canvas-sail') as THREE.Mesh,vertices=cloth.geometry.getAttribute('position'),normals=cloth.geometry.getAttribute('normal');assert.equal(vertices.count,117);assert.ok(cloth.geometry.getAttribute('uv'));assert.ok([...vertices.array].every(Number.isFinite));assert.ok([...normals.array].every(Number.isFinite));let bulge=0;for(let i=0;i<vertices.count;i++)bulge=Math.max(bulge,vertices.getZ(i));assert.ok(bulge>.17,'the sail is a curved surface, not twelve solid horizontal slabs');assert.equal((cloth.material as THREE.MeshStandardMaterial).side,THREE.DoubleSide);
    for(const name of['boat-strakes-stem-and-gunwale','boat-rudder','boat-provisions-coils-and-anchor']){const bounds=new THREE.Box3().setFromObject(boat.group.getObjectByName(name)!,true);assert.ok(bounds.min.x>=-FISHING_MODEL_DIMENSIONS.boat.width/2&&bounds.max.x<=FISHING_MODEL_DIMENSIONS.boat.width/2,name);assert.ok(bounds.min.z>=-2.5&&bounds.max.z<=2.5,name);assert.ok(bounds.min.y>=-FISHING_MODEL_DIMENSIONS.boat.draft,name);}
    assert.ok(boat.group.getObjectByName('boat-stern-lantern-glass'));assert.ok(boat.group.getObjectByName('boat-mast-pennant'));
    boat.animate({time:3,speed:1,state:'outbound',cargo:0});const helm=boat.group.getObjectByName('boat-helm')!,rudder=boat.group.getObjectByName('boat-rudder')!;assert.ok(Math.abs(helm.rotation.z)>0);assert.ok(Math.abs(helm.rotation.z-rudder.rotation.y*2.5)<1e-9);boat.animate({time:3,speed:0,state:'moored',cargo:0});assert.equal(helm.rotation.z,0);assert.equal(rudder.rotation.y,0);
  }finally{boat.dispose();library.dispose();}
});

test('timber and linen finishes are pooled per port and released once with the owning library',()=>{
  const library=createFishingModelLibrary(),a=library.boat('a'),b=library.boat('a'),textures=new Set<THREE.Texture>();for(const object of[a.group,b.group])for(const mesh of meshes(object))for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const map=(material as THREE.MeshStandardMaterial).map;if(map)textures.add(map);}assert.equal(textures.size,2);assert.ok([...textures].every(texture=>texture instanceof THREE.DataTexture&&texture.image.width===64&&texture.image.height===64));
  let released=0;textures.forEach(texture=>texture.addEventListener('dispose',()=>released++));a.dispose();assert.equal(released,0);b.animate(8,1,'inbound',4);library.dispose();library.dispose();assert.equal(released,2);
});
