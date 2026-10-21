import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createExplorationTrafficLayer} from '../lib/graphics/exploration-traffic-layer.ts';
import {physicalTerrainSample} from '../lib/graphics/world-collision.ts';
import {publicRoadAt,publicInfrastructureAt} from '../lib/mvp/exploration-network-data.ts';
import {sampleWorld} from '../lib/graphics/world-geography.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import type {ExplorationMovement} from '../lib/mvp/exploration-data.ts';

function fixture(){
  let start:{x:number;y:number}|undefined;
  for(let x=480;x<600&&!start;x+=4)for(let y=120;y<240&&!start;y+=4)if([[-1,-1],[-1,1],[4,-1],[4,1]].every(([dx,dy])=>{const p={x:x+dx,y:y+dy};return!sampleWorld(p.x,p.y).water&&physicalTerrainSample(p).walkable&&!publicInfrastructureAt(p)&&!publicRoadAt(p,2);}))start={x,y};
  assert.ok(start);
  const movement:ExplorationMovement={points:[start,{x:start.x+3,y:start.y}],startsAt:1000,endsAt:5000,legs:[{mode:'walk',fromIndex:0,toIndex:1,startsAt:1000,endsAt:5000,routeId:'home-access:example'}]};
  const state={version:1 as const,appearance:'pine'as const,profession:'carrier'as const,position:{x:0,y:1.5},buildings:[],exploration:{version:1 as const,position:start,homePosition:{x:0,y:1.5},departedAt:1000,movement}},publicPlayer={id:'traffic-visual',habitable:state,inventory:[{itemId:'timber',qty:5}]};
  const input={view:{now:1000,player:publicPlayer,habitable:{actors:[{playerId:publicPlayer.id,plot:{x:0,y:0},state:{appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[]}}]}},player:publicPlayer,selected:'tile',mode:'settlement',quality:'performance',reducedMotion:false}as unknown as SceneInput;return{input,start,movement,state};
}

test('only the active confirmed home access gets a bounded translucent terrain-following guide',()=>{
  const{input,start,movement}=fixture(),before=JSON.stringify(input),ground=(x:number,y:number)=>2+x*.01-y*.005,layer=createExplorationTrafficLayer(ground),origin={x:Math.floor(start.x/64)*64,y:Math.floor(start.y/64)*64};
  try{
    layer.update(input,1500,start,origin,'loaded');const trail=layer.group.getObjectByName('sendero-de-incorporacion-activo')as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>,buffer=trail.geometry.attributes.position;assert.equal(trail.visible,true);assert.ok(buffer.count>0&&buffer.count<=512*6);assert.equal(trail.material.transparent,true);assert.equal(trail.material.depthWrite,false);assert.ok(trail.material.opacity<.5);
    for(let i=0;i<buffer.count;i++){const x=buffer.getX(i)+origin.x,y=buffer.getZ(i)+origin.y;assert.ok(Math.abs(buffer.getY(i)-ground(x,y)-.024)<1e-5);}
    layer.update(input,1600,start,origin,'loaded');assert.equal(trail.geometry.attributes.position,buffer,'normal frames reuse the guide geometry');layer.update(input,1700,start,{x:origin.x+64,y:origin.y},'loaded');assert.equal(layer.group.position.x,-64);
    const originalGeometry=trail.geometry;let released=0;originalGeometry.addEventListener('dispose',()=>released++);
    layer.update(input,5000,start,origin,'loaded');assert.equal(trail.visible,false);assert.equal(trail.geometry.attributes.position.count,0);assert.equal(released,1,'expired guide GPU buffers are released instead of accumulating replacements');assert.equal(JSON.stringify(input),before);
    movement.legs![0].routeId='public-road:example';layer.update(input,1500,start,origin);assert.equal(trail.visible,false);movement.legs![0].routeId='home-access:example';movement.legs![0].mode='boat';layer.update(input,1500,start,origin);assert.equal(trail.visible,false);
  }finally{layer.dispose();layer.dispose();}
});

test('the yield marker follows the authoritative hold helper and disappears on expiry',()=>{
  const{input,start,movement}=fixture(),hold={pointIndex:0,startsAt:1800,endsAt:2500,resourceId:'traffic:crossing-a'},layer=createExplorationTrafficLayer(()=>3);movement.holds=[hold];
  try{layer.update(input,2000,start,{x:0,y:0});const rings=layer.group.getObjectByName('traffic-yield-markers')as THREE.InstancedMesh;assert.equal(rings.count,1);assert.equal(rings.visible,true);const matrix=new THREE.Matrix4();rings.getMatrixAt(0,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix).add(layer.group.position);assert.ok(Math.abs(position.x-start.x)<1e-6&&Math.abs(position.z-start.y)<1e-6&&position.y>3.135&&position.y<3.3);layer.update(input,2500,start,{x:0,y:0});assert.equal(rings.visible,false);assert.equal(rings.count,0);}finally{layer.dispose();}
});

test('a future confirmed walking lay-by exposes only its short access spur, not the whole public itinerary',()=>{
  const{input,start,movement}=fixture(),layer=createExplorationTrafficLayer(()=>2);movement.points=[start,{x:start.x+1,y:start.y+1.5},{x:start.x+3,y:start.y},{x:start.x+40,y:start.y}];movement.legs![0].toIndex=3;movement.legs![0].routeId='public-road:route';movement.holds=[{pointIndex:1,startsAt:2200,endsAt:3000,resourceId:'traffic-yield:layby-a'}];
  try{layer.update(input,1500,start,{x:0,y:0});const trail=layer.group.getObjectByName('sendero-de-incorporacion-activo')as THREE.Mesh<THREE.BufferGeometry>;assert.equal(trail.visible,true);const positions=trail.geometry.attributes.position;for(let i=0;i<positions.count;i++)assert.ok(positions.getX(i)+layer.group.position.x<start.x+5,'farther public road receives no temporary dirt overlay');layer.update(input,3000,start,{x:0,y:0});assert.equal(trail.visible,false);assert.equal(trail.geometry.attributes.position.count,0);}finally{layer.dispose();}
});

test('access guides never create a water surface and repeated nearby segments stay under the geometry cap',()=>{
  const{input,start,movement,state}=fixture(),layer=createExplorationTrafficLayer(()=>2);
  try{movement.points=Array.from({length:1024},(_,i)=>({x:start.x+i%2,y:start.y}));movement.legs![0].toIndex=1023;layer.update(input,1500,start,{x:0,y:0});const trail=layer.group.getObjectByName('sendero-de-incorporacion-activo')as THREE.Mesh<THREE.BufferGeometry>;assert.equal(trail.geometry.attributes.position.count,512*6);
    let sea:{x:number;y:number}|undefined;for(let x=-1000;x<1000&&!sea;x+=100)for(let y=-1000;y<1000&&!sea;y+=100)if(sampleWorld(x,y).water)sea={x,y};assert.ok(sea);movement.points=[sea,{x:sea.x+1,y:sea.y}];movement.legs![0].toIndex=1;state.exploration.position=sea;layer.update(input,1500,sea,{x:0,y:0});assert.equal(trail.visible,false);assert.equal(trail.geometry.attributes.position.count,0);
  }finally{layer.dispose();}
});
