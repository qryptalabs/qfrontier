import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalHarborWaterGeometry,royalHarborWaterAt,royalHarborBankEdge} from '../lib/graphics/royal-harbor-water.ts';
import {royalRiverEdge} from '../lib/graphics/royal-harbor-layout.ts';

test('both water qualities have the same real coastline, with no water plane beneath the castle or forests',()=>{
  const normal=new THREE.Mesh(createRoyalHarborWaterGeometry(),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})),mirror=new THREE.Mesh(createRoyalHarborWaterGeometry('reflector'),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mirror.rotation.x=-Math.PI/2;normal.updateMatrixWorld(true);mirror.updateMatrixWorld(true);
  try{
    const dry=[[-4000,-3000],[-4000,-5000],[-2500,-5800],[4000,-3000],[2000,-6000],[-6000,-8000],[0,-121],[0,-3800],[400,-800],[250,-50],[1000,500]];
    for(const [x,z]of dry){assert.equal(royalHarborWaterAt(x,z),false);for(const mesh of[normal,mirror]){const hits=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0),0,200).intersectObject(mesh);assert.equal(hits.length,0,`no overlapping sea exists under dry ground ${x},${z}`);}}
    for(let z=-119;z<760;z+=4)for(const x of[-royalHarborBankEdge(z)*.98,0,royalHarborBankEdge(z)*.98]){
      assert.equal(royalHarborWaterAt(x,z),true);for(const mesh of[normal,mirror])assert.ok(new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0),0,20).intersectObject(mesh).length,'the entire inlet and harbor retain their actual water');
    }
    for(const [x,z]of [[0,800],[-17000,800],[17000,29000],[0,1700]])for(const mesh of[normal,mirror])assert.ok(new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0),0,20).intersectObject(mesh).length,'the harbor still opens into the full ocean');
    assert.ok(normal.geometry.attributes.position.count<200,'a fixed shoreline is bounded geometry, not a giant submerged grid');
  }finally{for(const mesh of[normal,mirror]){mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}}
});

test('water matches the authored straight bank segments and preserves every sailing vessel and fishing berth',()=>{
  for(let z=-110;z<=760;z+=15)assert.ok(Math.abs(royalHarborBankEdge(z)-royalRiverEdge(z))<1e-9);
  for(const[x,z]of [[-39,331],[42,345],[69,171],[62,80],[55,-2],[-53,35],[-26,-23],[0,-88],[0,1500],[82,220]])assert.equal(royalHarborWaterAt(x,z),true);
  assert.equal(royalHarborWaterAt(Number.NaN,0),false);assert.equal(royalHarborWaterAt(0,Infinity),false);
});
