import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalTownLibrary} from '../lib/graphics/royal-harbor-town.ts';

test('merchant facades have bounded volumetric roof, shop, upper floors and reusable material batches',()=>{
 const library=createRoyalTownLibrary(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 for(const kind of['home','warehouse','market','workshop']as const)for(let variant=0;variant<12;variant++){
  const model=library.get(kind,variant);assert.equal(library.get(kind,variant+12),model);assert.ok(model.children.length>=4&&model.children.length<=5);const box=new THREE.Box3().setFromObject(model,true),size=box.getSize(new THREE.Vector3());
  // The later urban plan uses human-scale houses and larger warehouses; the
  // former ten-metre depth cap predates that plan. Check declared street fit.
  const dimensions=model.userData.royalTown;
  assert.equal(dimensions.doorHeight,2.2);
  assert.ok(dimensions.width>=8&&dimensions.width<=14.2);
  assert.ok(size.x>=dimensions.width&&size.x<=dimensions.width*1.2+1);
  assert.ok(size.y>8&&size.y<13);
  assert.ok(size.z>=dimensions.depth&&size.z<=dimensions.footprintDepth);
  model.traverse(object=>{if(!(object instanceof THREE.Mesh))return;geometries.add(object.geometry);materials.add(object.material as THREE.Material);for(const name of['position','normal','color'])for(const n of object.geometry.getAttribute(name).array)assert.ok(Number.isFinite(n));});
 }
 assert.equal(materials.size,5);assert.ok(geometries.size>150);const counts=new Map<object,number>();for(const r of[...geometries,...materials]){counts.set(r,0);r.addEventListener('dispose',()=>counts.set(r,counts.get(r)!+1));}library.dispose();library.dispose();for(const n of counts.values())assert.equal(n,1);assert.throws(()=>library.get('home'),/disposed/);
});
