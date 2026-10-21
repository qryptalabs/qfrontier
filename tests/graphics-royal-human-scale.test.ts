import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {ROYAL_WORLD_BASE_Y} from '../lib/graphics/royal-world-surface.ts';
import {HUMAN_ROOMS,HUMAN_ASCENTS,HUMAN_INTERIOR_STAIRS,HUMAN_TOWER,humanTowerPoint,humanInteriorWalkHeight,ROYAL_PORT_OFFSET,HUMAN_INTERIOR_LOOKOUT} from '../lib/graphics/royal-proportions.ts';
import {moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';

test('castle silhouette, people, houses and navigable fit-out use coherent metres rather than a miniature character',async()=>{
 const layer=createRoyalWorldLayer(ROYAL_WORLD_BASE_Y);try{const palace=await layer.loadPalace();assert(palace);const castle=layer.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!,size=new THREE.Box3().setFromObject(castle).getSize(new THREE.Vector3());assert(size.x>140&&size.x<155);assert(size.y>135&&size.y<150);assert(size.z<145);
  const guard=palace.group.getObjectByName('human-royal-guard-0')!,height=new THREE.Box3().setFromObject(guard).getSize(new THREE.Vector3()).y;assert(height>1.7&&height<2.1);assert(size.y/height<90);
  for(const b of layer.group.userData.royalCity.buildings)assert(b.height>5&&b.height<16);assert(HUMAN_ROOMS.every(r=>r.ceiling>=3.4));assert(palace.interior.metrics.minimumDoorHeight>=4.8);assert(palace.interior.metrics.minimumCorridorWidth>=3.9);
  for(const a of HUMAN_ASCENTS)assert((a.endY-a.startY)/a.steps<=.16&&a.width>=2.4);assert((HUMAN_INTERIOR_STAIRS.endY-HUMAN_INTERIOR_STAIRS.startY)/HUMAN_INTERIOR_STAIRS.steps<=.16);
  assert(palace.group.getObjectByName('human-court-gardener-0'));assert.equal(palace.group.position.z,ROYAL_PORT_OFFSET);
 }finally{layer.dispose();}
});

test('human-sized spiral reaches the lookout and returns without jumping floors or crossing its rails',()=>{
 const first=humanTowerPoint(0);let p={...first};for(let i=1;i<=HUMAN_TOWER.steps;i++){const target=humanTowerPoint(i);const q=moveRoyalWalker(p,target.x-p.x,target.z-p.z,[],.3,humanInteriorWalkHeight);assert(Math.hypot(q.x-target.x,q.z-target.z)<.001);assert(Math.abs(q.y-p.y)<.32);p=q;}assert(Math.abs(p.y-HUMAN_INTERIOR_LOOKOUT.y)<.2);
 for(let i=HUMAN_TOWER.steps-1;i>=0;i--){const target=humanTowerPoint(i);p=moveRoyalWalker(p,target.x-p.x,target.z-p.z,[],.3,humanInteriorWalkHeight);}assert(Math.abs(p.y-first.y)<.2);
});
