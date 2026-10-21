import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelLife,royalCitadelPatrolPose,royalCitadelGardenerPose} from '../lib/graphics/royal-citadel-life.ts';
import {createRoyalCitadelGardens,ROYAL_CITADEL_WORK_SITES} from '../lib/graphics/royal-citadel-gardens.ts';
import {citadelLocalPoint,ROYAL_CITADEL_COURT_Y} from '../lib/graphics/royal-citadel-layout.ts';
import {citadelWorldPoint,ROYAL_CITADEL_TRANSFORM} from '../lib/graphics/royal-citadel-layout.ts';
import {createRoyalCitadel,disposeRoyalHarborCastleResources,ROYAL_CITADEL_LOCAL_PLAN} from '../lib/graphics/royal-harbor-castle.ts';

test('royal guards and gardeners walk actual clear side avenues without crossing monuments or each other',()=>{
  const gardens=createRoyalCitadelGardens();
  try{
    for(let seconds=0;seconds<180;seconds+=.2){
      const actors=[-1,1].flatMap(side=>[0,1].flatMap(index=>[royalCitadelPatrolPose(side,index,seconds),royalCitadelGardenerPose(side,index,seconds)]));
      for(let i=0;i<actors.length;i++){
        const pose=actors[i],local=citadelLocalPoint(pose.x,pose.y,pose.z);assert.ok(Math.abs(local.x)>9,'central avenue remains open');assert.ok(local.z>=47&&local.z<=66);assert.equal(pose.y,ROYAL_CITADEL_COURT_Y);
        assert.ok(!gardens.obstacles.some(b=>Math.abs(pose.x-b.x)<b.halfWidth+.8&&Math.abs(pose.z-b.z)<b.halfDepth+.8),'NPC feet never enter a statue, bench, fountain or parterre');
        for(const other of actors.slice(i+1))assert.ok(Math.hypot(pose.x-other.x,pose.z-other.z)>1.6,'NPCs retain physical separation');
      }
    }
    const first=royalCitadelPatrolPose(1,0,0),after=royalCitadelPatrolPose(1,0,.05);assert.ok(Math.hypot(after.x-first.x,after.z-first.z)<.09,'fixed speed uses arc length');
  }finally{gardens.dispose();}
});

test('guards have distinct metal armor and uniforms and real interior posts at the raised palace vestibule',()=>{
  const life=createRoyalCitadelLife();
  try{
    assert.deepEqual(life.group.userData.royalCitadelLife,{guards:12,gardeners:5,artisans:2,simulation:false});
    const guard=life.group.getObjectByName('royal-outer-gate-sentinel-1')!;assert.ok(guard.getObjectByName('royal-guard-plumed-visored-helmet'));assert.ok(guard.getObjectByName('royal-guard-blue-gold-uniform'));assert.ok(guard.getObjectByName('royal-guard-engraved-cuirass'));
    for(const side of[-1,1]){const body=life.colliders().find(body=>body.id==='royal-vestibule-sentinel-'+side)!;const p=citadelLocalPoint(body.x,body.y,body.z);assert.ok(Math.abs(p.y-22)<1e-9);assert.ok(Math.abs(p.z-11.5)<1e-9);assert.ok(body.height<4);}
    assert.equal(life.colliders().length,19);assert.ok(life.colliders().every(body=>Number.isFinite(body.y)&&body.radius>0));
  }finally{life.dispose();}
});

test('gardeners stop to work, artisans animate tools and stone carrier returns empty',()=>{
  const life=createRoyalCitadelLife();
  try{
    let working=false,walking=false;for(let i=0;i<100;i++){const pose=royalCitadelGardenerPose(1,0,i);working ||=pose.working;walking ||=pose.moving;}assert.ok(working&&walking);
    const porter=life.group.getObjectByName('royal-court-stone-carrier')!,load=porter.getObjectByName('actor-load')!;
    const sites=ROYAL_CITADEL_WORK_SITES,span=Math.hypot(sites.bench.x+3.7-(sites.stonePile.x-2),sites.bench.z+2.45-sites.stonePile.z)/1.65;
    life.update(1);assert.equal(load.visible,true);life.update(span+6);assert.equal(load.visible,false);
    const mason=life.group.getObjectByName('royal-court-stonemason')!;life.setFocus(mason.position.x,mason.position.y+3,mason.position.z+3);life.update(20);const arm=mason.getObjectByName('actor-right-shoulder')!,before=arm.rotation.x;life.update(20.2);assert.notEqual(arm.rotation.x,before);
    life.update(NaN);for(const body of life.colliders())assert.ok(Number.isFinite(body.x)&&Number.isFinite(body.z));
  }finally{life.dispose();}
});

test('citadel people use articulated near LOD and pooled distant meshes and free all resources once',()=>{
  const life=createRoyalCitadelLife(),other=createRoyalCitadelLife(),guard=life.group.getObjectByName('royal-core-gate-sentinel-1')!,resources=new Set<THREE.BufferGeometry|THREE.Material>(),events=new Map<object,number>();
  try{
    assert.equal(guard.getObjectByName('actor-distant-body')!.visible,true);life.setFocus(guard.position.x,guard.position.y+2,guard.position.z+2);life.update(1);assert.equal(guard.getObjectByName('actor-distant-body')!.visible,false);assert.equal(guard.getObjectByName('actor-torso')!.visible,true);
    life.group.traverse(node=>{if(!(node instanceof THREE.Mesh))return;resources.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])resources.add(m);});for(const r of resources)r.addEventListener('dispose',()=>events.set(r,(events.get(r)??0)+1));
    life.dispose();life.dispose();for(const r of resources)assert.equal(events.get(r),1,r.type+' disposed once');assert.equal(life.colliders().length,0);assert.equal(life.group.children.length,0);other.update(100);assert.equal(other.colliders().length,19);
  }finally{life.dispose();other.dispose();}
});

test('all palace people clear the actual fortification collision plan, work furniture and one another',()=>{
  const life=createRoyalCitadelLife(),gardens=createRoyalCitadelGardens(),scale=ROYAL_CITADEL_TRANSFORM.scale;
  try{
    const walls=ROYAL_CITADEL_LOCAL_PLAN.solidColliders.map(body=>{
      const w=citadelWorldPoint(body.x,body.minY,body.z);
      return{...body,x:w.x,y:w.y,z:w.z,halfWidth:body.halfWidth*scale,halfDepth:body.halfDepth*scale,height:(body.maxY-body.minY)*scale};
    });
    for(let seconds=0;seconds<1500;seconds+=1){
      life.update(seconds);const bodies=life.colliders();
      for(let i=0;i<bodies.length;i++){
        const a=bodies[i];
        for(const b of[...walls,...gardens.obstacles])assert.ok(!(a.y+a.height>b.y+.01&&a.y<b.y+b.height&&Math.abs(a.x-b.x)<b.halfWidth+a.radius&&Math.abs(a.z-b.z)<b.halfDepth+a.radius),a.id+' clears masonry/furniture at '+seconds);
        for(const b of bodies.slice(i+1))assert.ok(Math.abs(a.y-b.y)>=3||Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius,a.id+' retains body clearance from '+b.id);
      }
    }
  }finally{life.dispose();gardens.dispose();}
});

test('the enlarged palace keeps people human sized, artisans within tool reach and every post on real rendered floors',()=>{
  const life=createRoyalCitadelLife(),gardens=createRoyalCitadelGardens(),castle=createRoyalCitadel();
  castle.scale.setScalar(ROYAL_CITADEL_TRANSFORM.scale);castle.position.set(0,ROYAL_CITADEL_TRANSFORM.baseY,ROYAL_CITADEL_TRANSFORM.originZ);castle.updateMatrixWorld(true);gardens.group.updateMatrixWorld(true);
  try{
    for(const seconds of[0,60,180,360,720]){
      life.update(seconds);
      for(const body of life.colliders()){
        assert.ok(body.height<4&&body.radius<1,'human dimensions do not inherit tenfold architecture scale');
        const ray=new THREE.Raycaster(new THREE.Vector3(body.x,body.y+.15,body.z),new THREE.Vector3(0,-1,0),0,.3),hit=ray.intersectObjects([castle,gardens.group],true)[0];
        assert.ok(hit&&Math.abs(hit.point.y-body.y)<.08,body.id+' stands on real palace paving');
      }
    }
    const mason=life.colliders().find(body=>body.id==='royal-court-stonemason')!,gardener=life.colliders().find(body=>body.id==='royal-inner-garden-caretaker')!;
    assert.ok(Math.abs(mason.z-ROYAL_CITADEL_WORK_SITES.bench.z-2.45)<1e-9,'bench work uses metre clearance');
    assert.ok(Math.abs(gardener.z-ROYAL_CITADEL_WORK_SITES.planter.z-2.6)<1e-9,'planter work uses metre clearance');
  }finally{life.dispose();gardens.dispose();disposeRoyalHarborCastleResources();}
});
