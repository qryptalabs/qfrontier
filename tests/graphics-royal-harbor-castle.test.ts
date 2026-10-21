import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadel,createRoyalArchBridge,disposeRoyalHarborCastleResources,ROYAL_CITADEL_LOCAL_PLAN,ROYAL_CITADEL_DEFENSIVE_TOWERS,ROYAL_CITADEL_MONUMENT_SCALE} from '../lib/graphics/royal-harbor-castle.ts';
import {ROYAL_CITADEL_TRANSFORM,ROYAL_CITADEL_FLIGHT_STEPS} from '../lib/graphics/royal-citadel-layout.ts';

function meshes(root:THREE.Object3D){const result:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)result.push(o);});return result;}

test('the royal citadel has a tall layered silhouette inside its144×132outer precinct and bounded material batches',()=>{
  const castle=createRoyalCitadel(),bounds=new THREE.Box3().setFromObject(castle,true),parts=meshes(castle);assert.ok(bounds.min.x>=-72&&bounds.max.x<=72);assert.ok(bounds.min.z>=-49&&bounds.max.z<=83);assert.ok(bounds.min.y>=-.01);assert.ok(bounds.max.y>=140&&bounds.max.y<=142);assert.ok(parts.length<=6);
  let triangles=0;for(const mesh of parts){for(const p of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(p));triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;}assert.ok(triangles>30_000&&triangles<360_000,'the monument and 8,280 real stair treads are built once within a finite geometry budget');assert.equal(castle.userData.royalCitadel.terraces,3);assert.ok(parts.some(m=>m.name.endsWith(':cloth')));disposeRoyalHarborCastleResources();
});

test('every royal bridge arch is genuinely open through its volume and piers remain solid',()=>{
  for(const length of[72,150,220]){
    const bridge=createRoyalArchBridge(length);bridge.updateMatrixWorld(true);const data=bridge.userData.royalBridge as {arches:{x:number;radius:number;spring:number;rise:number}[]};assert.ok(data.arches.length>=3);
    for(const arch of data.arches)for(const y of[2,arch.spring,arch.spring+arch.rise*.5]){const ray=new THREE.Raycaster(new THREE.Vector3(arch.x,y,20),new THREE.Vector3(0,0,-1),0,40);assert.equal(ray.intersectObject(bridge,true).length,0,`span${arch.x} has transparent air beneath its real arch at${y}`);}
    const pierX=(data.arches[0].x+data.arches[1].x)/2,solid=new THREE.Raycaster(new THREE.Vector3(pierX,7,20),new THREE.Vector3(0,0,-1),0,40);assert.ok(solid.intersectObject(bridge,true).length>0);
    const deck=new THREE.Raycaster(new THREE.Vector3(0,40,0),new THREE.Vector3(0,-1,0));assert.ok(Math.abs(deck.intersectObject(bridge,true)[0].point.y-19.95)<.01);const box=new THREE.Box3().setFromObject(bridge,true);assert.ok(box.min.z>=-6.01&&box.max.z<=6.01);assert.ok(meshes(bridge).length<=6);
  }disposeRoyalHarborCastleResources();
});

test('a palace window is recessed behind a genuinely perforated facade rather than painted onto solid stone',()=>{
  const castle=createRoyalCitadel();castle.updateMatrixWorld(true);const shoot=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,28,44),new THREE.Vector3(0,0,-1)).intersectObject(castle,true)[0],pane=shoot(-8.3),wall=shoot(-10.5);
  assert.ok(pane.object.name.endsWith(':glass'));assert.ok(wall.object.name.endsWith(':stone'));assert.ok(wall.point.z-pane.point.z>.45);disposeRoyalHarborCastleResources();
});

test('royal landmark instances share geometry and only their explicit owner frees GPU buffers',()=>{
  const a=createRoyalCitadel(),b=createRoyalCitadel(),aa=meshes(a),bb=meshes(b);assert.notEqual(a,b);let disposed=0;for(let i=0;i<aa.length;i++){assert.equal(aa[i].geometry,bb[i].geometry);assert.equal(aa[i].material,bb[i].material);aa[i].geometry.addEventListener('dispose',()=>disposed++);}a.clear();assert.equal(disposed,0);disposeRoyalHarborCastleResources();disposeRoyalHarborCastleResources();assert.equal(disposed,aa.length);
});


test('the royal precinct has an open lower court below its uneven cathedral wings',()=>{
  const castle=createRoyalCitadel();castle.updateMatrixWorld(true);
  const floor=new THREE.Raycaster(new THREE.Vector3(0,20,32),new THREE.Vector3(0,-1,0),0,21).intersectObject(castle,true)[0];
  assert.ok(floor&&Math.abs(floor.point.y-1.3)<.01,'the lower courtyard is not filled by a solid 14m terrace block');
  const bell=new THREE.Raycaster(new THREE.Vector3(-41,83,44),new THREE.Vector3(0,0,-1),0,90).intersectObject(castle,true)[0];
  assert.ok(bell,'the separate western belfry rises well above the lower wings');
  assert.equal(castle.userData.royalCitadel.asymmetric,true);assert.equal(castle.userData.royalCitadel.flyingButtresses,6);
  disposeRoyalHarborCastleResources();
});


test('both gatehouses and the public vestibule have real traversable openings above their exact physical floors',()=>{
  const castle=createRoyalCitadel();castle.updateMatrixWorld(true);
  try{
    for(const [startZ,endZ] of [[84,70],[44,31]])for(const x of[-6.3,0,6.3]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,2.3,startZ),new THREE.Vector3(0,0,-1),0,startZ-endZ).intersectObject(castle,true);
      assert.equal(hits.length,0,`the avenue passes through the actual ${startZ===84?'outer':'inner'} arch at x=${x}`);
    }
    for(const x of[-2.8,0,2.8]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,23,22),new THREE.Vector3(0,0,-1),0,13.7).intersectObject(castle,true);
      assert.equal(hits.length,0,'the palace doorway is a hole and its vestibule remains clear to z8.3');
    }
    const rear=new THREE.Raycaster(new THREE.Vector3(0,24,14),new THREE.Vector3(0,0,-1),0,10).intersectObject(castle,true);
    assert.equal(rear.length,0,'the former rear wall and closed doors have been physically removed for the public palace');
    assert.equal(castle.userData.royalCitadel.publicPalace,true);
    assert.ok(!ROYAL_CITADEL_LOCAL_PLAN.solidColliders.some(c=>c.id==='vestibule-rear'));
  }finally{disposeRoyalHarborCastleResources();}
});

test('the shared surface contract matches authored plaza, landings, vestibule and individual stair treads',()=>{
  const castle=createRoyalCitadel();castle.updateMatrixWorld(true);
  try{
    assert.deepEqual(castle.userData.royalCitadel.walkSurfaces,ROYAL_CITADEL_LOCAL_PLAN.surfaces);
    for(const surface of ROYAL_CITADEL_LOCAL_PLAN.surfaces){
      const probes:{x:number;z:number;y:number}[]=[];
      if(surface.kind==='flat')probes.push({x:(surface.minX+surface.maxX)/2,z:(surface.minZ+surface.maxZ)/2,y:surface.y});
      else{
        assert.equal(surface.steps,ROYAL_CITADEL_FLIGHT_STEPS);assert.equal(surface.steps,2070);assert.ok((surface.toY-surface.fromY)*ROYAL_CITADEL_TRANSFORM.scale/surface.steps<=.153);
        for(const step of[0,1,17,Math.floor(surface.steps*.5),surface.steps-2,surface.steps-1])probes.push({x:surface.startX+(step+.5)/surface.steps*(surface.endX-surface.startX),z:surface.z,y:surface.fromY+(step+1)/surface.steps*(surface.toY-surface.fromY)});
      }
      for(const p of probes){const floor=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.2,p.z),new THREE.Vector3(0,-1,0),0,1).intersectObject(castle,true)[0];assert.ok(floor,`${surface.id}: a solid floor exists`);assert.ok(Math.abs(floor.point.y-p.y)<2e-6,`${surface.id}: its visible tread agrees with the movement contract`);}
    }
    const left=ROYAL_CITADEL_LOCAL_PLAN.surfaces.find(s=>s.id==='turn-landing--1')!;
    assert.equal(left.maxX,-18,'the elevated landing begins where the descending flight ends, without masking its top steps');
    const plan=castle.userData.royalCitadel;assert.equal(plan.defensiveRings,2);assert.equal(plan.routes.length,2);assert.ok(plan.solidColliders.every((c:{minY:number;maxY:number})=>c.maxY>c.minY));
  }finally{disposeRoyalHarborCastleResources();}
});

test('the palace is ten times its former physical dimensions and defensive towers gain fivefold height from their own feet',()=>{
  const castle=createRoyalCitadel();
  try{
    const scale=ROYAL_CITADEL_TRANSFORM.scale,baseline=ROYAL_CITADEL_MONUMENT_SCALE.baselineScale;
    assert.equal(scale/baseline,10);assert.ok(Math.abs(144*scale-144*baseline*10)<1e-8);assert.ok(Math.abs(132*scale-132*baseline*10)<1e-8);
    assert.equal(ROYAL_CITADEL_DEFENSIVE_TOWERS.length,10);
    const data=castle.userData.royalCitadel;
    assert.equal(data.enlargement.defensiveTowerHeightFactor,5);
    for(const tower of data.defensiveTowers){assert.ok(Math.abs(tower.localHeight*scale-tower.baselineHeight*baseline*5)<1e-8);assert.ok(Math.abs(tower.worldHeight-tower.localHeight*scale)<1e-8);}
    castle.updateMatrixWorld(true);
    for(const sign of[-1,1]){
      const actual=new THREE.Raycaster(new THREE.Vector3(sign*63,80,71.1),new THREE.Vector3(0,-1,0)).intersectObject(castle,true)[0];
      assert.ok(actual&&Math.abs(actual.point.y-14.3)<1e-5,'the actual bastion crown is scaled around its foot, rather than only reporting an altered metadata height');
    }
    assert.ok(data.enlargement.stairRiseWorld<=.153);assert.equal(data.enlargement.railingHeightWorld,1.05);
  }finally{disposeRoyalHarborCastleResources();}
});

test('the peripheral rampart crossings are vaulted bridges rather than solid stone walls',()=>{
  const castle=createRoyalCitadel();castle.updateMatrixWorld(true);
  try{for(const sign of[-1,1]){
    const opening=new THREE.Raycaster(new THREE.Vector3(sign*57.75,6,-15),new THREE.Vector3(0,0,-1),0,20).intersectObject(castle,true);
    assert.equal(opening.length,0,'a pedestrian can see through the complete arch beneath the rampart bridge');
    const pier=new THREE.Raycaster(new THREE.Vector3(sign*62,6,-15),new THREE.Vector3(0,0,-1),0,20).intersectObject(castle,true);
    assert.ok(pier.length>0,'the crossing still has real solid piers');
    const deck=new THREE.Raycaster(new THREE.Vector3(sign*57.75,20,-25),new THREE.Vector3(0,-1,0),0,10).intersectObject(castle,true)[0];
    assert.ok(deck&&Math.abs(deck.point.y-13.8)<1e-5,'the actual bridge deck supports the rampart walkway');
  }}finally{disposeRoyalHarborCastleResources();}
});
