import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {architectureFootprintScale,createUrbanMasonryMaterial,urbanPavingLayout} from '../lib/graphics/urban-detail.ts';
import {buildWorldTerrainGeometry} from '../lib/graphics/world-terrain-renderer.ts';
import {WORLD_LANDMARKS} from '../lib/graphics/world-geography.ts';

test('detailed architecture can fit an existing rotated physical footprint without moving it',()=>{
 const model=new THREE.Mesh(new THREE.BoxGeometry(2.7,4,2.6));
 for(const yaw of[0,Math.PI/2,.35]){
  const scale=architectureFootprintScale(model,1.95,1.9,yaw),size=new THREE.Vector3(2.7*scale,4*scale,2.6*scale),c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
  assert.ok(size.x*c+size.z*s<=1.950001);assert.ok(size.x*s+size.z*c<=1.900001);assert.ok(scale>0);
 }
 assert.equal(architectureFootprintScale(new THREE.Group(),2,2),1);model.geometry.dispose();(model.material as THREE.Material).dispose();
});
test('asymmetric shop fronts fit around the authoritative origin rather than their bounding-box centre',()=>{
 const model=new THREE.Group(),front=new THREE.Mesh(new THREE.BoxGeometry(2,3,2));front.position.z=.6;model.add(front);
 const scale=architectureFootprintScale(model,2,2);assert.ok(scale<=.62500001);assert.ok((.6+1)*scale<=1.000001);
 front.geometry.dispose();(front.material as THREE.Material).dispose();
});
test('stone setts and kerbs stay inside an unchanged street envelope and have finite positive sizes',()=>{
 for(const width of[1.4,2.7,3,5,6])for(const length of[.5,1.6,1.7]){
  const pieces=urbanPavingLayout(width,length,4);assert.deepEqual(pieces,urbanPavingLayout(width,length,4));assert.ok(pieces.length<=23);
  for(const p of pieces){assert.ok(p.width>0&&p.depth>0);assert.ok(Math.abs(p.x)+p.width/2<=width/2);assert.ok(Math.abs(p.z)+p.depth/2<=length/2);}
 }
});
test('masonry texture is local deterministic and ownership is released once',()=>{
 const a=createUrbanMasonryMaterial(),b=createUrbanMasonryMaterial();assert.deepEqual((a.material.bumpMap as THREE.DataTexture).image.data,(b.material.bumpMap as THREE.DataTexture).image.data);
 let material=0,texture=0;a.material.addEventListener('dispose',()=>material++);a.material.bumpMap!.addEventListener('dispose',()=>texture++);a.dispose();a.dispose();assert.equal(material,1);assert.equal(texture,1);b.dispose();
});
test('streamed water carries finite independent depth per vertex for coast shading',()=>{
 for(const p of WORLD_LANDMARKS.filter(p=>['coast','ocean','ice','desert'].includes(p.biome)).slice(0,12)){
  const built=buildWorldTerrainGeometry(Math.floor(p.x/64),Math.floor(p.y/64)),depth=built.water.getAttribute('waterDepth');assert.ok(depth);assert.equal(depth.count,built.water.attributes.position.count);
  for(const n of depth.array)assert.ok(Number.isFinite(n)&&n>=0);built.terrain.dispose();built.water.dispose();
 }
});
