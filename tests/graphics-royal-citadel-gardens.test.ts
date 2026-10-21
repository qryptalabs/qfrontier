import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelGardens,ROYAL_CITADEL_PUBLIC_PLAZA,ROYAL_CITADEL_WORK_SITES} from '../lib/graphics/royal-citadel-gardens.ts';
import {citadelWorldPoint,ROYAL_CITADEL_COURT_Y} from '../lib/graphics/royal-citadel-layout.ts';

test('formal gardens and monuments preserve the full processional avenue through the castle',()=>{
  const gardens=createRoyalCitadelGardens();
  try{
    assert.deepEqual(gardens.metrics,{parterres:8,statues:2,fountains:2});
    assert.equal(gardens.group.userData.royalCitadelGardens.simulation,false);
    for(let z=ROYAL_CITADEL_PUBLIC_PLAZA.minZ;z<=ROYAL_CITADEL_PUBLIC_PLAZA.maxZ;z+=.5)for(const x of[-18,0,18])assert.ok(!gardens.obstacles.some(body=>Math.abs(x-body.x)<body.halfWidth+1&&Math.abs(z-body.z)<body.halfDepth+1),'central gate avenue is genuinely free');
    gardens.group.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,ROYAL_CITADEL_COURT_Y+20,citadelWorldPoint(0,0,55).z),new THREE.Vector3(0,-1,0)),center=ray.intersectObject(gardens.group,true)[0]?.point.y;
    assert.ok(center!==undefined&&Math.abs(center-ROYAL_CITADEL_COURT_Y)<.12,'stone plaza is at the shared collision height');
    for(const b of gardens.obstacles)assert.equal(b.y,ROYAL_CITADEL_COURT_Y);
  }finally{gardens.dispose();}
});

test('fountain droplets move continuously while fixed masonry and flower geometry stay unchanged',()=>{
  const gardens=createRoyalCitadelGardens();
  try{
    const spray=gardens.group.getObjectByName('royal-citadel-fountain-moving-droplets')as THREE.InstancedMesh;
    assert.equal(spray.count,64);const before=spray.instanceMatrix.array.slice(),fixed=gardens.group.getObjectByName('royal-citadel-garden:stone')as THREE.Mesh,positions=fixed.geometry.attributes.position.array.slice();
    gardens.update(.2);assert.notDeepEqual(spray.instanceMatrix.array,before);assert.deepEqual(fixed.geometry.attributes.position.array,positions);
    gardens.update(NaN);for(const value of spray.instanceMatrix.array)assert.ok(Number.isFinite(value));
  }finally{gardens.dispose();}
});

test('garden resources are batched, viewer scoped and disposed once',()=>{
  const first=createRoyalCitadelGardens(),second=createRoyalCitadelGardens(),resources=new Set<THREE.BufferGeometry|THREE.Material>(),counts=new Map<object,number>();let meshes=0;
  first.group.traverse(node=>{if(!(node instanceof THREE.Mesh))return;meshes++;resources.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])resources.add(material);});
  assert.ok(meshes<=8,'hundreds of paving and flower pieces share seven material batches');
  for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)??0)+1));
  first.dispose();first.dispose();for(const r of resources)assert.equal(counts.get(r),1);assert.equal(first.group.children.length,0);
  second.update(100);assert.equal(second.group.children.length,8);second.dispose();
});

test('plaza paving uses a plain rough finish while architectural stone retains its surface detail',()=>{
  const gardens=createRoyalCitadelGardens();
  try{
    const paving=gardens.group.getObjectByName('royal-citadel-garden:paving')as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    const stone=gardens.group.getObjectByName('royal-citadel-garden:stone')as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
    assert.equal(paving.material.roughness,.96);assert.equal(paving.material.vertexColors,true);
    assert.equal(paving.material.onBeforeCompile,THREE.Material.prototype.onBeforeCompile,'no masonry bump shader on paving');
    assert.notEqual(stone.material.onBeforeCompile,THREE.Material.prototype.onBeforeCompile,'stone monument detail remains enabled');
  }finally{gardens.dispose();}
});

test('the enlarged civic district has continuous monumental paving, human work furniture and proportional gardens',()=>{
  const gardens=createRoyalCitadelGardens();
  try{
    gardens.group.updateMatrixWorld(true);
    const paving=gardens.group.getObjectByName('royal-citadel-garden:paving')as THREE.Mesh;
    const bounds=new THREE.Box3().setFromObject(paving),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x>=2859&&size.x<=2861);assert.ok(size.z>=829&&size.z<=831);
    for(const x of[-44,-23,0,23,44])for(const z of[44,52,60,69]){
      const point=citadelWorldPoint(x,1.3,z),hit=new THREE.Raycaster(new THREE.Vector3(point.x,point.y+.15,point.z),new THREE.Vector3(0,-1,0),0,.3).intersectObject(paving)[0];
      assert.ok(hit&&Math.abs(hit.point.y-point.y)<.08,'paving spans the full enlarged court instead of detached tiny tiles');
    }
    const bench=gardens.obstacles.find(b=>b.x===ROYAL_CITADEL_WORK_SITES.bench.x&&b.z===ROYAL_CITADEL_WORK_SITES.bench.z)!;
    assert.equal(bench.halfWidth,2.65);assert.equal(bench.halfDepth,1.25);assert.equal(bench.height,3);
    const beds=gardens.obstacles.filter(b=>b.halfWidth>100&&b.height<3);assert.equal(beds.length,8);
    const monuments=gardens.obstacles.filter(b=>b.height>=120);assert.equal(monuments.length,2);
    const fountains=gardens.obstacles.filter(b=>b.height===44);assert.equal(fountains.length,2);
  }finally{gardens.dispose();}
});
