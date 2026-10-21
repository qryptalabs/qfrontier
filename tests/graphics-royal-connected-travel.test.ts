import {createRoyalWorldActivity} from '../lib/graphics/royal-world-activity.ts';
import {createRoyalVisitStream,royalTownVisitObstacles} from '../lib/graphics/royal-visit-stream.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {ROYAL_WORLD_BASE_Y,ROYAL_TOWN_TO_THRONE} from '../lib/graphics/royal-world-surface.ts';
import {moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';
import {royalLocalToWorld,ROYAL_WORLD_LOCATION} from '../lib/graphics/royal-world-location.ts';
import {HUMAN_INTERIOR_THRONE as ROYAL_INTERIOR_THRONE,ROYAL_PORT_OFFSET} from '../lib/graphics/royal-proportions.ts';
import {WORLD_LANDMARKS} from '../lib/graphics/world-geography.ts';

test('same world surface supports the entire town-to-throne route in both directions without teleports or ignoring masonry',async()=>{
 const layer=createRoyalWorldLayer(ROYAL_WORLD_BASE_Y);try{
  const palace=await layer.loadPalace();assert(palace);assert.equal(await layer.loadPalace(),palace,'one shared interior instance');
  const town=WORLD_LANDMARKS.find(p=>p.id==='npc-paso-del-norte')!;const townPoint=royalLocalToWorld(ROYAL_TOWN_TO_THRONE[0].x,ROYAL_TOWN_TO_THRONE[0].z);assert(Math.hypot(townPoint.x-town.x,townPoint.y-town.y)<1e-8);
  const obstacles=[...layer.obstacles,...palace.interior.obstacles];
  for(const route of[ROYAL_TOWN_TO_THRONE,[...ROYAL_TOWN_TO_THRONE].reverse()]){
   let p={...route[0],y:layer.surface.walk(route[0].x,route[0].z)!};assert(Number.isFinite(p.y));
   for(let j=1;j<route.length;j++){const b=route[j];let ticks=0;while(Math.hypot(p.x-b.x,p.z-b.z)>.01){
    assert(ticks++<30000,`route budget at ${j}`);const dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz),step=Math.min( .3,d);
    const q=moveRoyalWalker(p,dx/d*step,dz/d*step,[...obstacles,...royalTownVisitObstacles(p.x,p.z,layer.surface.ground)],.4,layer.surface.walk);assert(Math.hypot(q.x-p.x,q.z-p.z)>.001,`blocked at segment ${j}: ${JSON.stringify(p)}`);assert(Math.abs(q.y-p.y)<=1.7,`axis step at ${j}: ${JSON.stringify(p)} => ${JSON.stringify(q)}`);p=q;
   }}
   if(route===ROYAL_TOWN_TO_THRONE)assert(Math.abs(p.y-ROYAL_INTERIOR_THRONE.y)<.001);
  }
  layer.setOrigin(ROYAL_WORLD_LOCATION);layer.group.updateMatrixWorld(true);
  const interior=palace.interior.group.localToWorld(new THREE.Vector3(ROYAL_INTERIOR_THRONE.x,ROYAL_INTERIOR_THRONE.y,ROYAL_INTERIOR_THRONE.z));
  assert.equal(interior.z,ROYAL_INTERIOR_THRONE.z+ROYAL_PORT_OFFSET);assert.equal(interior.y,ROYAL_INTERIOR_THRONE.y+ROYAL_WORLD_BASE_Y);
  // Match visible world triangles, not a disconnected ground plane, around the approach.
  const mesh=layer.group.getObjectByName('royal-continuous-valley-and-mountains')!,ray=new THREE.Raycaster();
  for(const [x,z]of[[210,30],[260,150],[450,300]]){ray.set(new THREE.Vector3(x,10000,z+ROYAL_PORT_OFFSET),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(hit.point.y-ROYAL_WORLD_BASE_Y-layer.surface.ground(x,z))<.002);}
  assert.equal(layer.surface.walk(0,210),null,'open harbor water cannot be walked across');
 }finally{layer.dispose();}
});

test('Reino uses the planet layer and no longer constructs a separate landscape or reflective river',()=>{
 const source=readFileSync(new URL('../lib/graphics/royal-harbor-renderer.ts',import.meta.url),'utf8');
 assert(source.includes('createRoyalWorldLayer(ROYAL_WORLD_BASE_Y)'));assert(!source.includes('createRoyalHarborScene()'));assert(!source.includes('new Reflector'));assert(source.includes('district.surface.walk'));
});


test('nearby town detail stays bounded, replaces its real buildings, and fishing projection never accumulates transforms',()=>{
 const ground=()=>0,stream=createRoyalVisitStream(ground,true),activity=createRoyalWorldActivity(ground);
 try{
  let ready=false;for(let i=0;i<9;i++)ready=stream.setFocus(2376,3864-ROYAL_PORT_OFFSET,true);assert(ready);assert.equal(stream.group.children.length,18);
  for(let i=0;i<12;i++)stream.setFocus(2376,3864-ROYAL_PORT_OFFSET,true);assert.equal(stream.group.children.length,18,'no per-frame duplication');
  assert(stream.group.getObjectByName('inhabited-district:1:-12'));
  stream.setFocus(0,-3500,true);assert.equal(stream.group.children.length,0,'native town geometry is released outside its window');
  activity.update(0,null);const before=activity.group.children.map(o=>o.position.toArray());activity.update(0,null);assert.deepEqual(activity.group.children.map(o=>o.position.toArray()),before);
  const fish=activity.group.getObjectByName('royal-working-fishing-boat')!;assert(fish.position.y<0);assert(Number.isFinite(fish.position.x));
 }finally{activity.dispose();stream.dispose();}
});

test('a visitor can leave an initial overlap with a pedestrian but cannot enter another body or escape masonry',()=>{
 const start={x:0,y:0,z:0},npc={x:.1,z:0,halfWidth:.4,halfDepth:.4,allowEgress:true},floor=()=>0;
 assert(moveRoyalWalker(start,-.3,0,[npc],.3,floor).x<0);
 assert(moveRoyalWalker({x:-1,y:0,z:0},.8,0,[npc],.3,floor).x<=-.6+1e-9);
 assert.equal(moveRoyalWalker(start,-.3,0,[{...npc,allowEgress:false}],.3,floor).x,0);
});
