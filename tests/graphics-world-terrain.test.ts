import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { buildWorldTerrainGeometry, continuousTerrainHeight } from '../lib/graphics/world-terrain-renderer.ts';
import { createWorldAssetLibrary, type WorldAsset } from '../lib/graphics/world-models.ts';
import { WORLD_LANDMARKS, sampleWorld } from '../lib/graphics/world-geography.ts';
import { geographicWorldBounds } from '../lib/graphics/world-navigation.ts';
import { createSettlement } from '../lib/graphics/settlement.ts';
import { SETTLEMENT_ANCHORS } from '../lib/graphics/settlement-layout.ts';

test('streamed terrain has finite, world-aligned geometry in every biome and at navigation limits',()=>{
  const points=[{x:0,y:0},...['ice','desert','forest','tropical','mountain','coast','ocean','plains'].map(biome=>WORLD_LANDMARKS.find(p=>p.biome===biome)!).filter(Boolean),{x:geographicWorldBounds.minX,y:geographicWorldBounds.minY},{x:geographicWorldBounds.maxX,y:geographicWorldBounds.maxY}];
  for(const point of points){const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64),chunk=buildWorldTerrainGeometry(cx,cy,2);for(const geometry of[chunk.terrain,chunk.water]){for(const value of geometry.attributes.position.array)assert.ok(Number.isFinite(value));const position=geometry.attributes.position;for(let i=0;i<position.count;i++){assert.ok(position.getX(i)>=0&&position.getX(i)<=64);assert.ok(position.getZ(i)>=0&&position.getZ(i)<=64);}assert.ok(position.count/3<14_000,'terrain has a bounded geometry budget');geometry.dispose();}assert.equal(chunk.cells,1024);}
});

test('terrain sampling and neighboring chunk coordinates do not depend on streaming order',()=>{
  const first=buildWorldTerrainGeometry(-1,0,2),neighbor=buildWorldTerrainGeometry(0,0,2),repeat=buildWorldTerrainGeometry(-1,0,2);
  assert.deepEqual(first.terrain.attributes.position.array,repeat.terrain.attributes.position.array);
  for(const x of[-64,-2,-.001,0,.001,2,64])assert.equal(continuousTerrainHeight(x,24),Math.round(sampleWorld(x,24).height*2)/2);
  assert.equal(first.terrain.boundingSphere?.center.x,32);assert.equal(neighbor.terrain.boundingSphere?.center.x,32);
  for(const chunk of[first,neighbor,repeat]){chunk.terrain.dispose();chunk.water.dispose();}
});

test('the own village patch retains authored foundation heights at its permanent global location',()=>{
  const own={x:96,y:-48};for(const[name,anchor]of Object.entries(SETTLEMENT_ANCHORS)){if(name==='bridge')continue;const height=continuousTerrainHeight(own.x+anchor[0],own.y+anchor[2],own);assert.ok(Math.abs(height-(anchor[1]+sampleWorld(own.x,own.y).height-2))<.001,`${name} foundation stays grounded`);}
  assert.throws(()=>buildWorldTerrainGeometry(.5,0,2),RangeError);assert.throws(()=>buildWorldTerrainGeometry(0,0,3),RangeError);
});

test('biome architecture and fauna are distinct finite models with pooled resources and bounded complexity',()=>{
  const library=createWorldAssetLibrary(),kinds:WorldAsset[]=['deer','fox','camel','sheep','cactus','igloo','adobe','hut','boat','cave','pine','oak','snowpine','palm','market','windmill','wall'],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),signatures=new Set<string>();
  for(const kind of kinds){const model=library.get(kind),again=library.get(kind);assert.notEqual(model,again);let triangles=0;const shape:string[]=[];model.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.add(object.geometry);for(const value of object.geometry.attributes.position.array)assert.ok(Number.isFinite(value));const count=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;triangles+=count;shape.push(`${count}:${[...object.geometry.attributes.position.array].slice(0,36).join(',')}`);for(const mat of Array.isArray(object.material)?object.material:[object.material]){materials.add(mat);shape.push((mat as THREE.MeshStandardMaterial).color.getHexString());}});assert.ok(triangles>24&&triangles<3000,`${kind} fits the instance budget`);signatures.add(shape.join('|'));assert.equal((model.children[0]as THREE.Mesh).geometry,(again.children[0]as THREE.Mesh).geometry);}
  assert.equal(signatures.size,kinds.length);let disposedGeometries=0,disposedMaterials=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposedGeometries++));materials.forEach(m=>m.addEventListener('dispose',()=>disposedMaterials++));library.dispose();library.dispose();assert.equal(disposedGeometries,geometries.size);assert.equal(disposedMaterials,materials.size);assert.throws(()=>library.get('deer'));
});

test('the streaming village option removes its old surrounding valley while station defaults stay intact',()=>{
  const village=createSettlement({player:null,quality:'performance',showcase:true,includeLandscape:false}),bounds=new THREE.Box3().setFromObject(village.group);assert.ok(bounds.max.x-bounds.min.x<42);assert.ok(bounds.max.z-bounds.min.z<38);assert.ok(bounds.max.y>8,'authored mountain and building detail remain');assert.ok(village.water.length>0);village.dispose();
});
