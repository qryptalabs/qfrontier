import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {applyRoyalSurfaceDetail,type RoyalSurfaceKind} from '../lib/graphics/royal-harbor-materials.ts';

function shader(){return{uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as THREE.WebGLProgramParametersWithUniforms;}

test('royal finishes preserve existing shader hooks and standard lighting without allocating texture passes',()=>{
  for(const kind of['masonry','wood','landscape'] as RoyalSurfaceKind[]){
    const material=new THREE.MeshStandardMaterial({vertexColors:true});let called=0;material.onBeforeCompile=compiled=>{called++;compiled.uniforms.existing={value:1};};material.customProgramCacheKey=()=>`base-${kind}`;
    applyRoyalSurfaceDetail(material,kind);const compiled=shader();material.onBeforeCompile(compiled,{} as THREE.WebGLRenderer);assert.equal(called,1);assert.equal(compiled.uniforms.existing.value,1);assert.ok(compiled.fragmentShader.includes('#include <lights_fragment_begin>'));assert.ok(compiled.vertexShader.includes('instanceMatrix*royalDetailPosition'));assert.ok(compiled.vertexShader.includes('batchingMatrix*royalDetailPosition'));assert.ok(compiled.vertexShader.indexOf('instanceMatrix*royalDetailPosition')<compiled.vertexShader.indexOf('(modelMatrix*royalDetailPosition).xyz'));assert.ok(compiled.fragmentShader.includes('fwidth('));assert.ok(compiled.fragmentShader.includes('royalBump('));assert.equal(material.map,null);assert.equal(material.bumpMap,null);assert.equal(material.normalMap,null);assert.ok(material.customProgramCacheKey().startsWith(`base-${kind}|`));material.dispose();
  }
});

test('reapplying a finish is idempotent and replacing it produces one program rather than nested injections',()=>{
  const material=new THREE.MeshStandardMaterial();applyRoyalSurfaceDetail(material,'masonry');const version=material.version,key=material.customProgramCacheKey(),compile=material.onBeforeCompile;applyRoyalSurfaceDetail(material,'masonry');assert.equal(material.version,version);assert.equal(material.onBeforeCompile,compile);assert.equal(material.customProgramCacheKey(),key);
  applyRoyalSurfaceDetail(material,'wood');const compiled=shader();material.onBeforeCompile(compiled,{} as THREE.WebGLRenderer);assert.notEqual(material.customProgramCacheKey(),key);assert.equal((compiled.vertexShader.match(/varying vec3 vRoyalDetailPosition;/g)??[]).length,1);assert.equal((compiled.fragmentShader.match(/vec3 royalFinish=/g)??[]).length,1);assert.ok(compiled.fragmentShader.includes('royalWood(vRoyalDetailPosition,royalWorldNormal)'));material.dispose();
});
