import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createTerrainSurfaceGrid} from '../lib/graphics/terrain-surface.ts';
import {buildWorldTerrainGeometry,continuousTerrainHeight} from '../lib/graphics/world-terrain-renderer.ts';

test('rendered surface records actual Float32 tops and isolated prepared-cell subdivisions',()=>{
  const grid=createTerrainSurfaceGrid(-2,3,4);grid.record(0,0,4,4,1.123456789);grid.record(4,0,1.3,4,7);grid.record(5.3,0,2.7,4,2);
  assert.equal(grid.heightAt(-127,193),Math.fround(1.123456789));assert.equal(grid.heightAt(-123,193),7);assert.equal(grid.heightAt(-122,193),2);assert.equal(grid.heightAt(-119,193),null);assert.equal(grid.heightAt(-129,193),null);assert.equal(grid.heightAt(NaN,193),null);
});

function groundRay(geometry:THREE.BufferGeometry,cx:number,cy:number,x:number,y:number){
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.set(cx*64,0,cy*64);mesh.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(x,1000,y),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(mesh)[0];(mesh.material as THREE.Material).dispose();return hit?.point.y??null;
}

test('ground sampling matches the terrain faces actually drawn at both retained and nearby LOD',()=>{
  let changedFromPoint=0;
  for(const step of[2,4]){const cx=4,cy=2,built=buildWorldTerrainGeometry(cx,cy,step);try{
    for(let x=cx*64+.17;x<(cx+1)*64;x+=5.13)for(let y=cy*64+.29;y<(cy+1)*64;y+=5.27){const actual=built.surface.heightAt(x,y),drawn=groundRay(built.terrain,cx,cy,x,y);assert.notEqual(actual,null);assert.ok(Math.abs(actual!-drawn!)<1e-5);if(Math.abs(actual!-continuousTerrainHeight(x,y))>.1)changedFromPoint++;}
  }finally{built.terrain.dispose();built.water.dispose();}}
  assert.ok(changedFromPoint>0,'sloping voxel ground must use the drawn top, not the analytic height under a fraction of the cell');
});

test('Costa Ámbar entrance and centre remain at the existing flat level in both meshes',()=>{
  for(const point of[{x:-356.5,y:-302.9},{x:-368.5,y:-305},{x:-408,y:-312}])for(const step of[2,4]){
    const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64),built=buildWorldTerrainGeometry(cx,cy,step);try{assert.equal(built.surface.heightAt(point.x,point.y),1.5);assert.equal(groundRay(built.terrain,cx,cy,point.x,point.y),1.5);}finally{built.terrain.dispose();built.water.dispose();}
  }
});

test('authored home terrain and prepared land stay in their existing layers rather than gaining a duplicate top',()=>{
  const own={x:0,y:0,land:{cells:{land_12_0:{clearedAt:1,claimedAt:2}}}},built=buildWorldTerrainGeometry(0,0,4,own);
  try{assert.equal(built.surface.heightAt(0,1.5),null);assert.equal(continuousTerrainHeight(0,1.5,own),2);}finally{built.terrain.dispose();built.water.dispose();}
});

test('ground lookup selects the correct negative chunk at a seam and never borrows the adjacent terrace',()=>{
  const left=createTerrainSurfaceGrid(-1,-1,2),right=createTerrainSurfaceGrid(0,-1,2);left.record(62,62,2,2,7);right.record(0,62,2,2,1);
  assert.equal(left.heightAt(-.001,-.001),7);assert.equal(left.heightAt(0,-.001),null);assert.equal(right.heightAt(0,-.001),1);
});
