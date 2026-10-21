import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalHarborScene,ROYAL_HARBOR_CAMERAS} from '../lib/graphics/royal-harbor-scene.ts';
import {ROYAL_FREIGHT_ROUTE,sampleRoyalHarborRoute,royalResidentPose} from '../lib/graphics/royal-harbor-activity.ts';
import {ROYAL_CAMERA_MAX_POLAR} from '../lib/graphics/royal-harbor-layout.ts';
import {ROYAL_CITADEL_BASELINE,ROYAL_CITADEL_TRANSFORM} from '../lib/graphics/royal-citadel-layout.ts';

function visibleMeshes(root:THREE.Object3D){const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});return meshes;}
function resources(root:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 for(const mesh of visibleMeshes(root)){geometries.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}}
 return{geometries,materials,textures};
}
function finiteBox(box:THREE.Box3){assert.ok(!box.isEmpty());for(const v of[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z])assert.ok(Number.isFinite(v));}

test('authored harbor contains a genuinely volumetric city, seven large vessels and a monumental citadel with finite world transforms',()=>{
 const district=createRoyalHarborScene();
 try{
  const {group}=district;group.updateMatrixWorld(true);const meshes=visibleMeshes(group),geometries=new Set<THREE.BufferGeometry>(),houseBatches=new Map<string,number>();
  let triangles=0,singularBuildings=0;
  group.traverse(object=>{
   assert.ok(!(object instanceof THREE.Sprite),'city architecture must not be substituted by a billboard');
   for(const value of object.matrixWorld.elements)assert.ok(Number.isFinite(value));
   if(object instanceof THREE.Group&&(object.userData.structureKind==='tower'||object.userData.structureKind==='windmill'||object.name==='royal-citadel-on-the-fourth-terrace'))singularBuildings++;
  });
  const instance=new THREE.Matrix4();
  for(const mesh of meshes){
   assert.ok(mesh.geometry.getAttribute('position').count>=3);geometries.add(mesh.geometry);
   const count=mesh instanceof THREE.InstancedMesh?mesh.count:1;triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3*count;
   if(mesh instanceof THREE.InstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);for(const value of instance.elements)assert.ok(Number.isFinite(value));assert.ok(Math.abs(instance.determinant())>1e-8);}}
   if(mesh instanceof THREE.InstancedMesh&&mesh.name.startsWith('royal-city-')){const previous=houseBatches.get(mesh.name);if(previous!==undefined)assert.equal(previous,mesh.count,'material batches must refer to the same building instances');houseBatches.set(mesh.name,mesh.count);}
  }
  const buildings=[...houseBatches.values()].reduce((sum,n)=>sum+n,0)+singularBuildings;
  assert.ok(buildings>=127,`expected at least127 constructed buildings, found${buildings}`);
  assert.ok(houseBatches.size>=8,'house and workshop facades have several volumetric variants');
  assert.ok(meshes.length>80&&triangles>300_000&&triangles<20_000_000,'the city has real geometry within a finite scene budget');
  for(const geometry of geometries){for(const name of['position','normal']){const attribute=geometry.getAttribute(name);if(attribute)for(const value of attribute.array)assert.ok(Number.isFinite(value));}geometry.computeBoundingBox();finiteBox(geometry.boundingBox!);}
  const bounds=new THREE.Box3().setFromObject(group,true);finiteBox(bounds);const size=bounds.getSize(new THREE.Vector3());assert.ok(size.x>2000&&size.z>1500&&size.y>200);assert.ok(Math.max(size.x,size.y,size.z)<60000);
  const ships=group.children.filter(object=>/^royal-harbor-galleon-\d+$/.test(object.name));assert.equal(ships.length,7);
  for(const ship of ships){const box=new THREE.Box3().setFromObject(ship,true);finiteBox(box);const scale=box.getSize(new THREE.Vector3());assert.ok(scale.y>10&&Math.max(scale.x,scale.z)>10,'every vessel has a three-dimensional hull and mast');assert.ok(box.min.y<0&&box.max.y>10,'the hull sits across its waterline');}
  const castle=group.getObjectByName('royal-citadel-on-the-fourth-terrace');assert.ok(castle);const castleBounds=new THREE.Box3().setFromObject(castle,true);assert.ok(castleBounds.min.y>60&&castleBounds.max.y>235,'the palace stands on its high terrace');
  for(const camera of Object.values(ROYAL_HARBOR_CAMERAS)){assert.ok(camera.position.every(Number.isFinite)&&camera.target.every(Number.isFinite));assert.ok(new THREE.Vector3(...camera.position).distanceTo(new THREE.Vector3(...camera.target))>5);}
 }finally{district.dispose();}
});

test('the harbor river retains an open water channel and the installed main bridge has actual open archways',()=>{
 const district=createRoyalHarborScene();
 try{
  district.group.updateMatrixWorld(true);
  const fixed=visibleMeshes(district.group).filter(mesh=>{for(let object:THREE.Object3D|null=mesh;object;object=object.parent)if(/^royal-harbor-galleon-\d+$/.test(object.name))return false;return true;});
  // The fleet may occupy the water. Banks, houses and port cargo may not fill
  // the central navigation channel with a hidden land slab or a city grid.
  for(const z of[-55,0,80,155,235,310,420])for(const x of[-24,-8,8,24]){
   const ray=new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0),0,12);
   assert.equal(ray.intersectObjects(fixed,false).length,0,`the central river at${x},${z} remains open below its waterline`);
  }
  const bridge=district.group.getObjectByName('great-seven-arch-harbor-bridge');assert.ok(bridge);
  const arches=bridge.userData.royalBridge.arches as {x:number;spring:number;rise:number}[];assert.ok(arches.length>=7);
  for(const arch of arches){const origin=bridge.localToWorld(new THREE.Vector3(arch.x,arch.spring+arch.rise*.3,15)),direction=new THREE.Vector3(0,0,-1).transformDirection(bridge.matrixWorld);assert.equal(new THREE.Raycaster(origin,direction,0,30).intersectObject(bridge,true).length,0,'each visible bridge arch is a hole through actual masonry');}
  const deck=new THREE.Raycaster(new THREE.Vector3(0,40,-88),new THREE.Vector3(0,-1,0),0,40).intersectObject(bridge,true);assert.ok(deck.length>0&&deck[0].point.y>19&&deck[0].point.y<21,'an open arch retains a solid crossing above it');
 }finally{district.dispose();}
});

test('unmount releases every visible geometry, material and procedural texture once and remount creates fresh usable resources',()=>{
 let previous:ReturnType<typeof resources>|undefined;
 for(let cycle=0;cycle<2;cycle++){
  const district=createRoyalHarborScene(),scene=new THREE.Scene();scene.add(district.group);district.animate(12.5);
  const owned=resources(district.group);assert.ok(owned.geometries.size>40&&owned.materials.size>10&&owned.textures.size>=3);
  const released=new Map<object,number>();
  for(const collection of[owned.geometries,owned.materials,owned.textures])for(const resource of collection){assert.ok(!previous||![...previous.geometries,...previous.materials,...previous.textures].includes(resource),'a remount must not reuse an already-disposed buffer or texture');released.set(resource,0);resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)!+1));}
  const wheel=district.group.getObjectByName('harbor-waterwheel');assert.ok(wheel);const angle=wheel.rotation.z;
  district.dispose();assert.equal(district.group.parent,null);district.dispose();district.animate(900);assert.equal(wheel.rotation.z,angle,'disposed scenes stop advancing animations');
  for(const count of released.values())assert.equal(count,1,'a visible resource is released exactly once by its owning scene');
  previous=owned;
 }
});

test('the royal renderer consumes snapshots without performing storage or network operations or requesting remote city imagery',async()=>{
 for(const name of['scene','renderer','ships','castle','materials','town','layout','activity']){
  const source=await readFile(new URL(`../lib/graphics/royal-harbor-${name}.ts`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/(?:from\s*|import\s*\()\s*['"][^'"]*(?:\/mvp\/(?:store|engine|http)|\/auth\/|\/api\/)/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|indexedDB|localStorage|getMvpStore|executeMvp)\b|https?:\/\//,'the architectural scene uses procedural geometry and local renderer resources');
 }
 const component=await readFile(new URL('../app/graphics/royal-harbor.tsx',import.meta.url),'utf8');assert.doesNotMatch(component,/\b(?:getMvpStore|executeMvp|indexedDB)\b|https?:\/\//);assert.match(component,/\/api\/royal-harbor/,'trade requests use the authenticated harbor service');
});

test('the freight and pedestrian lanes are paved and clear of merged port cargo, bollards and crane bases',()=>{
 const district=createRoyalHarborScene();try{district.group.updateMatrixWorld(true);const surfaces=[district.group.getObjectByName('royal-quays-terraces-and-port-cargo')!,district.group.getObjectByName('royal-connected-stone-promenade')!];const points=[];for(let i=0;i<=150;i++)points.push(sampleRoyalHarborRoute(ROYAL_FREIGHT_ROUTE,i/150));for(let t=0;t<60;t+=1.3)for(const side of[-1,1])for(const far of[false,true])for(let i=0;i<4;i++)points.push(royalResidentPose(side,far,i,t));
  for(const p of points){const hits=new THREE.Raycaster(new THREE.Vector3(p.x,8,p.z),new THREE.Vector3(0,-1,0),0,8).intersectObjects(surfaces,true);assert.ok(hits.length&&hits[0].point.y>=4&&hits[0].point.y<=4.55,'a road user must meet paving rather than cargo or a crane');}
 }finally{district.dispose();}
});
test('authored low-angle panoramas fit the orbit controller without being silently lifted above the palace target',()=>{
 for(const pose of Object.values(ROYAL_HARBOR_CAMERAS)){const offset=new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target));assert.ok(Math.acos(offset.y/offset.length())<=ROYAL_CAMERA_MAX_POLAR,'the controller must preserve the authored camera pose');assert.ok(pose.position[1]>=6);}
});

test('the actual palace is ten times the approved footprint and height while its forest keeps every tree in independently culled chunks',()=>{
 const district=createRoyalHarborScene();try{district.group.updateMatrixWorld(true);const castle=district.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!,size=new THREE.Box3().setFromObject(castle,true).getSize(new THREE.Vector3()),old=[144,141.3,132].map(n=>n*ROYAL_CITADEL_BASELINE.scale);
  size.toArray().forEach((n,i)=>assert.ok(Math.abs(n/old[i]-10)<.001,'measurement uses actual transformed masonry, not an interface label'));
  assert.equal(ROYAL_CITADEL_TRANSFORM.scale/ROYAL_CITADEL_BASELINE.scale,10);
  const forest=district.group.getObjectByName('harbor-conifer-forest')!;const chunks=forest.children as THREE.InstancedMesh[];assert.ok(chunks.length>10);assert.equal(chunks.reduce((n,c)=>n+c.count,0),forest.userData.treeCount);assert.ok(chunks.every(c=>c.frustumCulled&&c.boundingSphere&&c.boundingBox));
  const geometries=new Set(chunks.map(c=>c.geometry));assert.equal(geometries.size,1,'chunking keeps one shared forest geometry');
 }finally{district.dispose();}
});
