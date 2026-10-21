import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {VOXEL_PILOT_SPECS,voxelFitMatrix,createTripoVoxelPilot,finishVoxelMaterial} from '../lib/graphics/tripo-voxel-pilot.ts';
import {createCityShopModel} from '../lib/graphics/city-shop-model.ts';
import {shopObstacles} from '../lib/graphics/city-shop-layout.ts';

function asset(id:'pine'|'shelf'){
 const bytes=readFileSync(new URL('../public'+VOXEL_PILOT_SPECS[id].url,import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.equal(bytes.readUInt32LE(16),0x4e4f534a);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 return {bytes,json};
}
test('the actual Tripo exports are embedded, bounded GLBs with a single textured mesh',()=>{
 for(const id of ['pine','shelf'] as const){const {bytes,json}=asset(id);assert(bytes.length<1_000_000);assert.equal(json.buffers.length,1);assert(!json.buffers[0].uri);
  assert.equal(json.meshes.length,1);assert.equal(json.materials.length,1);assert(!json.extensionsRequired?.length);assert(!json.animations?.length);assert(!json.skins?.length);
  assert.equal(json.images.length,1);assert.equal(json.images[0].mimeType,'image/jpeg');assert(Number.isInteger(json.images[0].bufferView));assert(!json.images[0].uri);
  const p=json.meshes[0].primitives[0];assert.equal(p.mode??4,4);assert(json.accessors[p.indices].count/3<12000);assert(json.accessors[p.attributes.POSITION].min.every(Number.isFinite));
  assert(json.accessors[p.attributes.POSITION].max.every(Number.isFinite));assert.equal(json.materials[0].pbrMetallicRoughness.baseColorTexture.index,0);
 }
});
test('both real models fit inside their reserved metres, stand on the floor and keep uniform proportions',()=>{
 for(const id of ['pine','shelf'] as const){const {json}=asset(id),p=json.meshes[0].primitives[0],a=json.accessors[p.attributes.POSITION];
  const source=new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max)),fit=voxelFitMatrix(source,VOXEL_PILOT_SPECS[id]),bounds=source.clone().applyMatrix4(fit),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  assert(Math.abs(bounds.min.y)<1e-8);assert(Math.abs(center.x)<1e-8&&Math.abs(center.z)<1e-8);assert(size.x<=VOXEL_PILOT_SPECS[id].width+1e-7);assert(size.y<=VOXEL_PILOT_SPECS[id].height+1e-7);assert(size.z<=VOXEL_PILOT_SPECS[id].depth+1e-7);
  const scales=new THREE.Vector3().setFromMatrixScale(fit);assert(Math.abs(scales.x-scales.y)<1e-8&&Math.abs(scales.y-scales.z)<1e-8);
 }
 assert.throws(()=>voxelFitMatrix(new THREE.Box3(),VOXEL_PILOT_SPECS.pine));
});
test('the server uses the intact visual fallback, no browser loading, and never disposes a shared fallback geometry',()=>{
 const fallback=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();fallback.add(new THREE.Mesh(geometry,material));let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
 const pilot=createTripoVoxelPilot(VOXEL_PILOT_SPECS.pine,[{x:2,y:1,z:4}],fallback);pilot.setFocus(2,4);assert.equal(fallback.visible,true);assert.equal(pilot.group.userData.voxelPilot.status,'idle');pilot.dispose();pilot.dispose();assert.equal(disposed,0);geometry.dispose();material.dispose();
});
test('the pilot preserves the shop collision and its northern counterpart',()=>{
 const royal=createCityShopModel(),north=createCityShopModel('paso-del-norte');try{assert.deepEqual(royal.obstacles,shopObstacles());assert(royal.group.getObjectByName('tripo-voxel-pilot-shelf'));assert(!north.group.getObjectByName('tripo-voxel-pilot-shelf'));royal.setFocus(-84,2.5,160);assert(royal.group.getObjectByName('shop-original-back-cabinet')!.visible);}finally{royal.dispose();north.dispose();}
});
test('forest and furniture retain distinct shader cache keys and crisp texture sampling',()=>{
 const pine=new THREE.MeshStandardMaterial(),shelf=new THREE.MeshStandardMaterial();finishVoxelMaterial(pine,true);finishVoxelMaterial(shelf,false);assert.notEqual(pine.customProgramCacheKey(),shelf.customProgramCacheKey());assert(pine.flatShading&&shelf.flatShading);assert(pine.roughness>=.78);pine.dispose();shelf.dispose();
});
