import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalHarborScene,ROYAL_HARBOR_CAMERAS} from '../lib/graphics/royal-harbor-scene.ts';
import {ROYAL_CITADEL_LOCAL_PLAN} from '../lib/graphics/royal-harbor-castle.ts';
import {citadelWorldPoint,ROYAL_CITADEL_SIDE_CROSSING_Z} from '../lib/graphics/royal-citadel-layout.ts';
import {moveRoyalWalker,royalWalkHeight} from '../lib/graphics/royal-harbor-layout.ts';

test('both routes from quay to royal vestibule remain continuous on real rendered steps and open gates',()=>{
 const district=createRoyalHarborScene();try{
  district.group.updateMatrixWorld(true);
  const fixed=[district.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!,district.group.getObjectByName('royal-connected-stone-promenade')!,district.group.getObjectByName('great-seven-arch-harbor-bridge')!,district.group.getObjectByName('royal-citadel-three-processional-terraces')!];
  for(const sign of[-1,1]){
   const w=(x:number,z:number)=>citadelWorldPoint(x,0,z);
   const route=[{x:sign*122,z:-39.5},{x:sign*122,z:-81.5},{x:sign*122,z:-88},{x:0,z:-88},{x:0,z:-120},w(0,83),w(0,57),w(0,28),w(sign*18.6,28),w(sign*18.6,19.5),w(sign*3,19.5),w(0,19.5),w(0,12)];
   let p={...route[0],y:4.3};
   for(const goal of route.slice(1)){
    const start={...p},distance=Math.hypot(goal.x-p.x,goal.z-p.z),steps=Math.ceil(distance/.4);
    for(let i=1;i<=steps;i++){
     const target={x:start.x+(goal.x-start.x)*i/steps,z:start.z+(goal.z-start.z)*i/steps};
     p=moveRoyalWalker(p,target.x-p.x,target.z-p.z,district.obstacles);
     assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.001,`a physical obstruction at ${target.x},${target.z}`);
     if(i%25===0||i===steps){const ray=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.08,p.z),new THREE.Vector3(0,-1,0),0,.25),hits=ray.intersectObjects(fixed,true);
      assert.ok(hits.length&&Math.abs(hits[0].point.y-p.y)<.081,`feet must meet rendered paving at ${p.x},${p.z}; y=${p.y}, hit=${hits[0]?.point.y}`);}
    }
   }
   assert.ok(Math.abs(p.y-citadelWorldPoint(0,22,0).y)<1e-6);
  }
 }finally{district.dispose();}
});

test('the landscape cannot be used to bypass gates or walk off elevated courts',()=>{
 const district=createRoyalHarborScene();try{
  const p=citadelWorldPoint(0,22,12),inside=moveRoyalWalker(p,0,-190,district.obstacles);
  assert.ok(Math.abs(inside.z-(p.z-190))<.01,'the former vestibule rear wall now opens into the royal reception hall');
  const cliff=citadelWorldPoint(46.5,1.3,60),end=moveRoyalWalker(cliff,50,0,[]);assert.ok(end.x<=citadelWorldPoint(47,0,0).x+.01,'the garden court has an edge');
  const before=citadelWorldPoint(0,1.3,23.5),jump=moveRoyalWalker(before,0,-45,[]);assert.ok(jump.z>citadelWorldPoint(0,0,22.25).z,'the raised landing must be reached via stairs');
  for(const sign of[-1,1])for(let x=2000;x<3450;x+=12)assert.equal(royalWalkHeight(sign*x,ROYAL_CITADEL_SIDE_CROSSING_Z),citadelWorldPoint(0,1.3,0).y);
  assert.ok(ROYAL_CITADEL_LOCAL_PLAN.solidColliders.length>20);
 }finally{district.dispose();}
});

test('both detached forts have a connected side avenue and an unobstructed real stone bridge through the cliffs',()=>{
 const district=createRoyalHarborScene();try{district.group.updateMatrixWorld(true);
  const floor=citadelWorldPoint(0,1.3,0).y,solid=district.group.getObjectByName('royal-quays-terraces-and-port-cargo')!;
  for(const sign of[-1,1]){
   const route=[citadelWorldPoint(0,1.3,43.03),citadelWorldPoint(sign*64,1.3,43.03),citadelWorldPoint(sign*64,1.3,4),{x:sign*3600,z:ROYAL_CITADEL_SIDE_CROSSING_Z,y:floor}];let p={...route[0]};
   for(const goal of route.slice(1)){const start={...p},steps=Math.ceil(Math.hypot(goal.x-p.x,goal.z-p.z)/.25);for(let i=1;i<=steps;i++){const target={x:start.x+(goal.x-start.x)*i/steps,z:start.z+(goal.z-start.z)*i/steps};p=moveRoyalWalker(p,target.x-p.x,target.z-p.z,district.obstacles);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.01,`annexes must remain connected at ${target.x},${target.z}; stopped ${p.x},${p.z}`);}}
   const ray=new THREE.Raycaster(new THREE.Vector3(sign*2200,floor+1.3,ROYAL_CITADEL_SIDE_CROSSING_Z),new THREE.Vector3(sign,0,0),0,1260);assert.equal(ray.intersectObject(solid,true).length,0,'cliff geology must leave the side bridge open');
  }
 }finally{district.dispose();}
});

test('the plaza camera looks over the curtain wall at the gardens instead of showing a solid gate facade',()=>{
 const district=createRoyalHarborScene();try{district.group.updateMatrixWorld(true);const castle=district.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!,origin=new THREE.Vector3(...ROYAL_HARBOR_CAMERAS.plaza.position);
  for(const x of[-41.5,0,41.5]){const p=citadelWorldPoint(x,1.5,55.7),target=new THREE.Vector3(p.x,p.y,p.z),delta=target.sub(origin);assert.equal(new THREE.Raycaster(origin,delta.clone().normalize(),.1,delta.length()-.1).intersectObject(castle,true).length,0,'the outer fortification must not hide the formal garden view');}
 }finally{district.dispose();}
});
