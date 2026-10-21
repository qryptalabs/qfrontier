import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWorldSky} from '../lib/graphics/world-sky.ts';
test('atmosphere follows the camera and changes biome without allocating another renderer',()=>{
 const sky=createWorldSky(),camera=new THREE.PerspectiveCamera();camera.position.set(300,8,-120);sky.update(camera,new THREE.Vector3(1,2,3),1792346000);
 assert.deepEqual(sky.mesh.position,camera.position);assert.equal(sky.mesh.material.depthWrite,false);assert.equal(sky.mesh.material.depthTest,false);
 sky.setBiome('ice');const ice=sky.mesh.material.uniforms.horizon.value.getHex();sky.setBiome('desert');assert.notEqual(sky.mesh.material.uniforms.horizon.value.getHex(),ice);assert.ok(Number.isFinite(sky.mesh.material.uniforms.clock.value));
 let geometries=0,materials=0;sky.mesh.geometry.addEventListener('dispose',()=>geometries++);sky.mesh.material.addEventListener('dispose',()=>materials++);sky.dispose();sky.dispose();assert.equal(geometries,1);assert.equal(materials,1);
});
