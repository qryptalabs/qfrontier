import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { maritimeWave,maritimeBoatPose,createMaritimeWaterTexture,createMaritimeWaterMotion,createMaritimeFoamTexture } from '../lib/graphics/maritime-water.ts';

test('water motion owns an independent texture transform and never drags terrain pixels',()=>{
  const ground=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1),water=createMaritimeWaterTexture(ground);water.offset.set(.4,.8);assert.notEqual(water,ground);assert.deepEqual(ground.offset,new THREE.Vector2());assert.notEqual(water.image,ground.image,'marine ripples have their own pixels as well as independent motion');assert.ok(ground.image.data);assert.deepEqual(Array.from(ground.image.data),[255,255,255,255]);water.dispose();ground.dispose();
});
test('marine pixels use fine low contrast crests rather than the large terrain checker pattern',()=>{
  const ground=new THREE.Texture(),water=createMaritimeWaterTexture(ground)as THREE.DataTexture,{width,height,data}=water.image;assert.ok(data);assert.ok(width>=64&&height>=64);const light:number[]=[];let fineChanges=0,shortCrests=0;
  for(let y=0;y<height;y++){let run=0;for(let x=0;x<width;x++){const i=(y*width+x)*4,v=data[i];light.push(v);assert.equal(data[i+3],255);if(x&&v!==data[i-4])fineChanges++;if(v>=246)run++;else if(run){assert.ok(run<=7,'wave crests remain short');shortCrests++;run=0;}}if(run){assert.ok(run<=7);shortCrests++;}}
  assert.ok(Math.max(...light)-Math.min(...light)<=13);assert.ok(fineChanges>width*height*.5);assert.ok(shortCrests>10);water.dispose();ground.dispose();
});
test('wave and boat poses are bounded, continuous, deterministic and stable at clock wrapping',()=>{
  for(const x of[-27000,0,41000])for(const y of[-14000,0,19000])for(const time of[0,12,1792000000,4095.9999]){
    const w=maritimeWave(x,y,time),again=maritimeWave(x,y,time);assert.deepEqual(w,again);assert.ok(Math.abs(w.height)<=.180001);assert.ok(Math.abs(w.dx)<=.023&&Math.abs(w.dy)<=.02);
    const epsilon=.001,dx=(maritimeWave(x+epsilon,y,time).height-maritimeWave(x-epsilon,y,time).height)/(2*epsilon);assert.ok(Math.abs(dx-w.dx)<1e-7);
    const pose=maritimeBoatPose(x,y,time,.7);assert.equal(pose.height,w.height);assert.ok(Math.abs(pose.pitch)<.04&&Math.abs(pose.roll)<.04);
  }
  assert.ok(Math.abs(maritimeWave(120,80,4096-.000001).height-maritimeWave(120,80,4096+.000001).height)<1e-5);
});

test('the single-pass water shader adds lit slopes, depth foam and sky reflection to the actual standard shader',()=>{
  const material=new THREE.MeshStandardMaterial({transparent:true}),motion=createMaritimeWaterMotion(material,{depthAttribute:true}),shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.ok(shader.vertexShader.includes('attribute float waterDepth;'));
  assert.ok(shader.vertexShader.includes('vQWaterPoint=vec4(qSeaPoint,seaWave,max(0.0,waterDepth))'));
  assert.ok(shader.vertexShader.includes(')*.12+sin('),'the shared vessel wave amplitudes remain the visible geometry displacement');
  assert.ok(shader.fragmentShader.includes('normal=normalize(mat3(viewMatrix)*vec3(-qSlope.x,1.0,-qSlope.y))'));
  assert.ok(shader.fragmentShader.includes('fwidth(qWaterP)'),'distant micro-normal detail is filtered rather than shimmering unbounded');
  assert.ok(shader.fragmentShader.includes('qShore*smoothstep'));
  assert.ok(shader.fragmentShader.includes('reflect(qWorldView,qWorldNormal)'));
  assert.ok(shader.fragmentShader.includes('isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition)'),'parallel cameras retain the correct Fresnel direction');
  assert.ok(shader.fragmentShader.includes('qSunGlitter*qSunExposure'),'sun glitter uses existing shadowed direct light');
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'),'normal standard lighting and shadows are retained');
  assert.ok(shader.fragmentShader.indexOf('float qFresnel=')<shader.fragmentShader.indexOf('outgoingLight=mix'));
  assert.equal((shader.fragmentShader.match(/varying vec4 vQWaterPoint/g)??[]).length,1);
  motion.update(4097,{x:32768,y:-16384});assert.equal(shader.uniforms.qSeaTime.value,1);assert.deepEqual(shader.uniforms.qWorldOrigin.value,new THREE.Vector2(32768,-16384));
  const sky=shader.uniforms.qWaterSky.value as THREE.Color;motion.setSkyColor(0x506c88);assert.equal(shader.uniforms.qWaterSky.value,sky);assert.equal(sky.getHex(),0x506c88);
  const sun=shader.uniforms.qWaterSun.value as THREE.Vector3;motion.setSunDirection({x:2,y:1,z:-2});assert.ok(sun.distanceTo(new THREE.Vector3(2,1,-2).normalize())<1e-10);const before=sun.clone();motion.setSunDirection({x:0,y:0,z:0});motion.setSunDirection({x:NaN,y:1,z:0});assert.deepEqual(sun,before);
  assert.ok(!Object.values(shader.uniforms).some(uniform=>uniform.value instanceof THREE.WebGLRenderTarget),'water does not introduce a scene reflection pass');material.dispose();
});

test('legacy water geometry needs no new attribute unless depth support was explicitly enabled',()=>{
  const fallback=new THREE.MeshStandardMaterial(),withDepth=new THREE.MeshStandardMaterial();createMaritimeWaterMotion(fallback);createMaritimeWaterMotion(withDepth,{depthAttribute:true});
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as THREE.WebGLProgramParametersWithUniforms;fallback.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.ok(!shader.vertexShader.includes('attribute float waterDepth;'));assert.ok(shader.vertexShader.includes('vQWaterPoint=vec4(qSeaPoint,seaWave,8.0)'));assert.notEqual(fallback.customProgramCacheKey(),withDepth.customProgramCacheKey());fallback.dispose();withDepth.dispose();
});

test('wake foam has transparent edges and broken soft coverage instead of an opaque rectangle',()=>{
  const texture=createMaritimeFoamTexture(),{width,height,data}=texture.image;assert.ok(data);assert.equal(width*height,2048);let transparent=0,soft=0;for(let index=3;index<data.length;index+=4){const alpha=data[index];if(alpha===0)transparent++;else if(alpha<210)soft++;}assert.ok(transparent>width*height*.2);assert.ok(soft>width*height*.25);for(let y=0;y<height;y++)assert.equal(data[(y*width)*4+3],0);assert.equal(texture.magFilter,THREE.LinearFilter);texture.dispose();
});
