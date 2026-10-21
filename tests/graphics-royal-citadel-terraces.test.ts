import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelTerraces} from '../lib/graphics/royal-citadel-terraces.ts';
import {ROYAL_CITADEL_ASCENTS,ROYAL_CITADEL_LANDINGS,ROYAL_CITADEL_TRANSFORM,royalApproachHeight} from '../lib/graphics/royal-citadel-layout.ts';

function meshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)result.push(object);});return result;}

test('the three ascending flights have real 16cm treads matching the shared walking heights all the way from the bridge to the gate',()=>{
 const model=createRoyalCitadelTerraces();try{
  model.group.updateMatrixWorld(true);const paving=model.group.getObjectByName('royal-citadel-terraces:paving');assert.ok(paving);
  assert.equal(model.metrics.terraces,3);assert.equal(model.metrics.ascentFlights,3);assert.equal(model.metrics.clearAvenueWidth,48);assert.equal(model.metrics.existingForecourt,true);
  assert.ok(model.metrics.drawCalls<=6&&model.metrics.stairTriangles<100_000,'batched tread profiles stay within a bounded rendering budget');
  for(const flight of ROYAL_CITADEL_ASCENTS){
   assert.ok((flight.endY-flight.startY)/flight.steps<=.160001);
   for(let i=0;i<flight.steps;i+=7){
    const z=flight.startZ-(i+.5)*(flight.startZ-flight.endZ)/flight.steps,y=royalApproachHeight(z);
    const hits=new THREE.Raycaster(new THREE.Vector3(0,y+.5,z),new THREE.Vector3(0,-1,0),0,1).intersectObject(paving,true);
    assert.ok(hits.length>0,`tread ${flight.id}:${i} is real geometry`);assert.ok(Math.abs(hits[0].point.y-y)<.0001,`tread ${flight.id}:${i} matches navigation`);
   }
  }
 }finally{model.dispose();}
});

test('the lower terrace avenues and actual open archways connect without planting beds, walls or collision solids across their axis',()=>{
 const model=createRoyalCitadelTerraces();try{
  model.group.updateMatrixWorld(true);
  for(const terrace of ROYAL_CITADEL_LANDINGS){
   if('existingCitadelFloor'in terrace&&terrace.existingCitadelFloor)continue;
   for(let z=terrace.startZ-1;z>terrace.endZ;z-=3.1){
    const hits=new THREE.Raycaster(new THREE.Vector3(0,terrace.y+1,z),new THREE.Vector3(0,-1,0),0,2).intersectObject(model.group,true);
    assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.y-terrace.y)<.0001);
    assert.ok(!model.obstacles.some(o=>Math.abs(o.x)<o.halfWidth+1.5&&Math.abs(z-o.z)<o.halfDepth+1.5&&terrace.y+3>(o.minY??-Infinity)&&terrace.y<(o.maxY??Infinity)));
   }
   const gateZ=terrace.startZ-4;
   for(const x of[-18,0,18]){
    const hits=new THREE.Raycaster(new THREE.Vector3(x,terrace.y+3,gateZ+10),new THREE.Vector3(0,0,-1),0,20).intersectObject(model.group,true);
    assert.equal(hits.length,0,'an entrance is an open volume rather than a dark painted door');
   }
  }
  assert.ok(model.metrics.gardenCount>=20);assert.equal(model.metrics.gateCount,2);assert.ok(model.metrics.arcadeCount>=100);
 }finally{model.dispose();}
});

test('the existing third forecourt is not overlaid with coplanar new paving and all supporting side wings meet the earth',()=>{
 const model=createRoyalCitadelTerraces();try{
  model.group.updateMatrixWorld(true);const third=ROYAL_CITADEL_LANDINGS[2],z=(third.startZ+third.endZ)/2;
  const clear=new THREE.Raycaster(new THREE.Vector3(0,third.y+2,z),new THREE.Vector3(0,-1,0),0,4).intersectObject(model.group,true);assert.equal(clear.length,0,'castle slab is owned by the castle, not duplicated by the terrace module');
  const palaceHalf=72*ROYAL_CITADEL_TRANSFORM.scale,x=(palaceHalf+third.width/2)/2;
  const support=new THREE.Raycaster(new THREE.Vector3(x,third.y-2,third.startZ+10),new THREE.Vector3(0,0,-1),0,30).intersectObject(model.group,true);assert.ok(support.length,'the court side wing has masonry beneath its paving');
  const bounds=new THREE.Box3().setFromObject(model.group,true);assert.ok(bounds.min.y<=4.001&&bounds.max.y>third.y);
  for(const mesh of meshes(model.group)){
   assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);assert.equal(mesh.material.bumpMap,null);assert.equal(mesh.material.displacementMap,null);
   for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));
  }
 }finally{model.dispose();}
});

test('terrace resources are owned locally and disposed once, including when a city is remounted',()=>{
 let previous=new Set<object>();
 for(let iteration=0;iteration<2;iteration++){
  const model=createRoyalCitadelTerraces(),resources=new Set<THREE.BufferGeometry|THREE.Material>(),counts=new Map<object,number>();
  for(const mesh of meshes(model.group)){resources.add(mesh.geometry);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])resources.add(m);}
  for(const resource of resources){assert.ok(!previous.has(resource));counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)!+1));}
  const scene=new THREE.Scene();scene.add(model.group);model.dispose();model.dispose();assert.equal(model.group.parent,null);for(const count of counts.values())assert.equal(count,1);previous=new Set(resources);
 }
});
