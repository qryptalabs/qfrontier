import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {EXPLORATION_PUBLIC_LANDINGS,publicInfrastructureAt} from '../lib/mvp/exploration-network-data.ts';
import {createExplorationInfrastructureChunk} from '../lib/graphics/exploration-infrastructure.ts';
import {continuousTerrainHeight} from '../lib/graphics/world-terrain-height.ts';
import {physicalTerrainSample} from '../lib/graphics/world-collision.ts';

test('every public landing visibly supports its boarding point and extended end at the shared physical height',()=>{
  const ray=new THREE.Raycaster();for(const landing of EXPLORATION_PUBLIC_LANDINGS){const end=landing.end??landing.water;for(const point of[landing.water,{x:landing.land.x+(end.x-landing.land.x)*.97,y:landing.land.y+(end.y-landing.land.y)*.97}]){
    const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64),chunk=createExplorationInfrastructureChunk(cx,cy,continuousTerrainHeight);try{chunk.group.position.set(cx*64,0,cy*64);chunk.group.updateMatrixWorld(true);ray.set(new THREE.Vector3(point.x,10000,point.y),new THREE.Vector3(0,-1,0));const actual=ray.intersectObject(chunk.group,true)[0]?.point.y,physical=publicInfrastructureAt(point);assert.ok(physical,`${landing.id} boarding point has support`);assert.notEqual(actual,undefined,`${landing.id} support is visible`);assert.ok(Math.abs(actual!-physical.height)<.025,`${landing.id} visible=${actual}, physical=${physical.height}`);}finally{chunk.dispose();}
  }}
});

test('real hillside road joins and exact plank seams draw the same support height as the shared ramp geometry',()=>{
  const chunks=new Map<string,ReturnType<typeof createExplorationInfrastructureChunk>>(),ray=new THREE.Raycaster();try{for(const point of[{x:704,y:256.5},{x:28629.5,y:5822.6},{x:28701.68,y:5760},{x:28671.09184,y:5795.84704}]){
    const cx=Math.floor(point.x/64),cy=Math.floor(point.y/64);for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++){const key=`${x}:${y}`;if(chunks.has(key))continue;const chunk=createExplorationInfrastructureChunk(x,y,(gx,gy)=>physicalTerrainSample({x:gx,y:gy}).height);chunk.group.position.set(x*64,0,y*64);chunk.group.updateMatrixWorld(true);chunks.set(key,chunk);}
    const support=publicInfrastructureAt(point);assert.equal(support?.kind,'ramp');ray.set(new THREE.Vector3(point.x,10000,point.y),new THREE.Vector3(0,-1,0));const top=ray.intersectObjects([...chunks.values()].map(c=>c.group),true)[0];assert.ok(top,`real plank seam ${point.x},${point.y} is sealed`);assert.ok(Math.abs(top.point.y-support!.height)<.025,`road join must not leave a raised dirt block over the ramp: visible=${top.point.y}, physical=${support!.height}`);
  }}finally{for(const chunk of chunks.values())chunk.dispose();}
});
