import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cameraTilt,worldCameraFrame,worldStreamWindow,retainedSettlementChunks,flushCameraMomentum,WORLD_CAMERA_FOV,worldViewHalfHeight } from '../lib/graphics/world-camera.ts';
import { LIVING_ZONE,LIVING_RESIDENTS,livingRoutePose,livingChunkFor } from '../lib/graphics/living-zone-data.ts';
import { geographicWorldBounds } from '../lib/graphics/world-navigation.ts';

test('public damping flush preserves the focus and removes residual orbit before a projection change',()=>{
  const camera=new THREE.PerspectiveCamera(42,1,.3,20000);camera.position.set(60,85,88);
  const controls=new OrbitControls(camera);controls.target.set(12,4,-20);controls.enableDamping=true;controls.autoRotate=true;
  for(let i=0;i<6;i++)controls.update();controls.autoRotate=false;
  const focus=controls.target.clone(),position=camera.position.clone(),orientation=camera.quaternion.clone();
  flushCameraMomentum(controls);
  assert.ok(camera.position.distanceTo(position)<1e-12);assert.ok(controls.target.distanceTo(focus)<1e-12);assert.ok(camera.quaternion.angleTo(orientation)<1e-7);assert.equal(controls.enableDamping,true);
  for(let i=0;i<20;i++)controls.update();
  assert.ok(camera.position.distanceTo(position)<1e-9,'no old angular momentum can tilt the 2D projection');assert.ok(controls.target.distanceTo(focus)<1e-12); // No DOM listeners were connected by this headless controls instance.
});

test('2D and 3D projections keep the same observed point and target-plane scale',()=>{
  for(const level of[5.6,6,7,8,9,10])for(const aspect of[.6,1,1.8,3])for(const tilt of[30,53,75]){
    const target=new THREE.Vector3(23,7,-44),f=worldCameraFrame(level,aspect,'3d',tilt),perspective=new THREE.PerspectiveCamera(WORLD_CAMERA_FOV,aspect,.3,20000);
    perspective.position.copy(target).add(new THREE.Vector3(f.offset.x,f.offset.y,f.offset.z));perspective.lookAt(target);perspective.updateMatrixWorld();
    assert.ok(target.clone().project(perspective).length()<1.01);
    const up=new THREE.Vector3().setFromMatrixColumn(perspective.matrixWorld,1),projected=target.clone().addScaledVector(up,f.halfHeight).project(perspective);
    assert.ok(Math.abs(projected.y-1)<1e-9,'perspective half-height matches orthographic target plane');
    const o=worldCameraFrame(level,aspect,'2d',tilt),ortho=new THREE.OrthographicCamera(-o.halfWidth,o.halfWidth,o.halfHeight,-o.halfHeight,.3,20000);
    ortho.up.set(0,0,-1);ortho.position.copy(target).add(new THREE.Vector3(o.offset.x,o.offset.y,o.offset.z));ortho.lookAt(target);ortho.updateMatrixWorld();
    assert.ok(Math.abs(target.clone().project(ortho).x)<1e-10);assert.ok(Math.abs(target.clone().project(ortho).y)<1e-10);
    assert.ok(Math.abs(target.clone().add(new THREE.Vector3(0,0,-o.halfHeight)).project(ortho).y-1)<1e-9);
  }
});
test('camera and streaming inputs are bounded, finite and load ahead of a tilted view',()=>{
  assert.equal(cameraTilt(-100),30);assert.equal(cameraTilt(500),75);assert.equal(cameraTilt(NaN),53);
  assert.equal(worldViewHalfHeight(Infinity),worldViewHalfHeight(7));
  for(const mode of['2d','3d'] as const)for(const level of[5.6,7,10])for(const heading of[0,Math.PI/2,Math.PI,NaN]){
    const p={x:0,y:0},view=worldStreamWindow(p,level,1.7,mode,30,heading),frame=worldCameraFrame(level,1.7,mode,30,heading);
    for(const value of Object.values(frame.offset))assert.ok(Number.isFinite(value));
    assert.ok(view.radius>=1&&view.radius<=8);assert.ok(Math.hypot(view.center.x,view.center.y)<(view.radius+1)*64);
    if(mode==='2d')assert.ok(Math.hypot(view.center.x,view.center.y)<1e-9);else assert.ok(view.reach>0);
  }
  const b=geographicWorldBounds,edge=worldStreamWindow({x:b.maxX,y:b.maxY},6,2,'3d',30,Math.PI);
  assert.ok(edge.center.x<=b.maxX&&edge.center.y<=b.maxY);
});

test('streamed bounds cover all visible ground rays in tilted, rotated and export-aspect views',()=>{
  let largest=0;
  for(const mode of['2d','3d'] as const)for(const level of[5.6,6,6.65,8,10])for(const tilt of[30,53,75])for(const aspect of[.7,1.168,16/9])for(const heading of[0,.636,Math.PI/2,Math.PI*1.25]){
    const target=new THREE.Vector3(31,0,63),f=worldCameraFrame(level,aspect,mode,tilt,heading),view=worldStreamWindow({x:target.x,y:target.z},level,aspect,mode,tilt,heading);
    const camera=mode==='2d'?new THREE.OrthographicCamera(-f.halfWidth,f.halfWidth,f.halfHeight,-f.halfHeight,.3,20000):new THREE.PerspectiveCamera(42,aspect,.3,20000);
    if(mode==='2d')camera.up.set(-Math.sin(heading),0,-Math.cos(heading));
    camera.position.copy(target).add(new THREE.Vector3(f.offset.x,f.offset.y,f.offset.z));camera.lookAt(target);camera.updateMatrixWorld();
    const raycaster=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
    for(let u=-10;u<=10;u++)for(let v=-10;v<=10;v++){
      raycaster.setFromCamera(new THREE.Vector2(u/10,v/10),camera);
      if(!raycaster.ray.intersectPlane(ground,point))continue;
      const depth=-point.clone().applyMatrix4(camera.matrixWorldInverse).z;if(depth>=view.fogFar)continue;
      assert.ok(Math.floor(point.x/64)>=view.minCx&&Math.floor(point.x/64)<=view.maxCx&&Math.floor(point.z/64)>=view.minCy&&Math.floor(point.z/64)<=view.maxCy,`visible edge at ${mode} / ${level} / ${tilt} / ${aspect} / ${heading}`);
    }
    largest=Math.max(largest,(view.maxCx-view.minCx+1)*(view.maxCy-view.minCy+1));
  }
  assert.ok(largest<=225,`chunk budget is finite across supported viewports: ${largest}`);
});

test('moving residents retain their owner chunks when seen from another part of their district',()=>{
  const places=[LIVING_ZONE.city,LIVING_ZONE.village];
  for(const resident of LIVING_RESIDENTS){
    const owner=livingChunkFor(livingRoutePose(resident,0));
    for(const time of[0,20,80,160,240]){
      const pose=livingRoutePose(resident,time),view=worldStreamWindow(pose,10,1.168,'3d',53,.636),retained=retainedSettlementChunks(view,places);
      assert.ok(retained.some(p=>p.cx===owner.cx&&p.cy===owner.cy),`${resident.id} remains loaded at another point on its route`);
      assert.ok(retained.length<=16,'district retention has a fixed small budget');
    }
  }
  const far=worldStreamWindow({x:19000,y:12000},7,1.168,'3d',53,.636);
  assert.deepEqual(retainedSettlementChunks(far,places),[],'distant districts unload completely');
});
