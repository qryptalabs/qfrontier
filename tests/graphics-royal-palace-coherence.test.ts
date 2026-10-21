import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {createRoyalSurface,ROYAL_WORLD_BASE_Y,ROYAL_TOWN_TO_THRONE} from '../lib/graphics/royal-world-surface.ts';
import {HUMAN_ROOMS,HUMAN_ASCENTS,HUMAN_INTERIOR_STAIRS as S,HUMAN_INTERIOR_THRONE,ROYAL_PORT_OFFSET as O} from '../lib/graphics/royal-proportions.ts';
import {royalPalaceStructure} from '../lib/graphics/royal-palace-structure.ts';
import {royalRiver,royalRegionalTerrain,royalVegetationAllowed} from '../lib/graphics/royal-regional-terrain.ts';
import {ROYAL_WORLD_LOCATION as site} from '../lib/graphics/royal-world-location.ts';
import {moveRoyalWalker,clipRoyalCameraBoom} from '../lib/graphics/royal-harbor-layout.ts';

test('palace halls and steps have usable dimensions, real stairwell openings and camera ceilings',()=>{
 const throne=HUMAN_ROOMS.find(r=>r.id==='throne')!;assert.equal(throne.maxX-throne.minX,20);assert.equal(throne.maxZ-throne.minZ,30);assert(throne.ceiling>=10);
 assert(S.maxZ-S.minZ>=4);assert((S.maxX-S.minX)/S.steps>=.28);assert((S.endY-S.startY)/S.steps<=.16);
 for(const a of HUMAN_ASCENTS){assert(Math.abs(a.endZ-a.startZ)/a.steps>=.28);assert(a.width>=4);}
 const parts=royalPalaceStructure();assert(parts.some(p=>p.finish==='ceiling'));
 assert(!parts.some(p=>p.finish==='floor'&&p.x-p.halfWidth<S.maxX-1e-6&&p.x+p.halfWidth>S.minX+1e-6&&p.z-p.halfDepth<S.maxZ-1e-6&&p.z+p.halfDepth>S.minZ+1e-6),'no slab over the imperial flight');
 const head={x:0,y:throne.y+1.6,z:-150},desired={x:0,y:throne.y+14,z:-150},camera=clipRoyalCameraBoom(head,desired,parts,.24);
 assert(camera.y<throne.y+throne.ceiling-.17,'camera stays below ceiling');assert(camera.y>head.y);
});

test('forests cannot grow in the plaza, masonry or river banks, including tree crowns',async()=>{
 const layer=createRoyalWorldLayer(ROYAL_WORLD_BASE_Y);try{
  const data=layer.group.userData.royalCity;
  for(const r of data.roots)assert(royalVegetationAllowed(r.x,r.z,6));
  for(const r of data.integration.roots)assert(royalVegetationAllowed(r.x,r.z-O,9));
  for(const x of[-45,0,45])for(const z of[-82,-65,-55])assert(!royalVegetationAllowed(x,z));
  for(let z=-180;z<1500;z+=3){const r=royalRiver(0,z);for(const side of[-1,1])assert(!royalVegetationAllowed(r.center+side*(r.halfWidth+3),z,6));}
  const palace=await layer.loadPalace();assert(palace);const ray=new THREE.Raycaster(),shell=layer.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!;layer.group.updateMatrixWorld(true);
  for(const z of[-140,-150,-159]){ray.set(new THREE.Vector3(0,HUMAN_INTERIOR_THRONE.y+1.6,z+O),new THREE.Vector3(0,0,-1));const hit=ray.intersectObject(shell,true)[0];assert(!hit||hit.distance>=Math.abs(-164-z)-.5,'no old masonry crosses the throne room');}
 }finally{layer.dispose();}
});

test('river and banks form one level unobstructed watercourse through the old district edge',()=>{
 const surface=createRoyalSurface();let previous=royalRiver(0,-180);
 for(let z=-179;z<=1500;z++){
  const r=royalRiver(0,z);assert(Math.abs(r.center-previous.center)<3.1,'the widened western bend has no river direction discontinuity');assert(Math.abs(r.halfWidth-previous.halfWidth)<1.6);previous=r;
  const bed=royalRegionalTerrain(site.x+r.center,site.y+z+O,40,ROYAL_WORLD_BASE_Y)-ROYAL_WORLD_BASE_Y;
  assert(bed<=-3.49,'channel cannot rise onto a hill');
  if(z<296)assert(surface.ground(r.center,z)<-1.3,'rendered surface leaves water headroom');
 }
});

test('route passes real palace furniture and guards, with headroom at every step',async()=>{
 const layer=createRoyalWorldLayer(ROYAL_WORLD_BASE_Y);try{
  const palace=await layer.loadPalace();assert(palace);layer.animate(0,false);
  const bodies=palace.citadelLife.colliders().map(b=>({x:b.x,z:b.z,halfWidth:b.radius,halfDepth:b.radius,minY:b.y,maxY:b.y+b.height}));
  const obstacles=[...layer.obstacles,...palace.interior.obstacles,...bodies];
  const route=ROYAL_TOWN_TO_THRONE.filter(p=>p.z<=-110.8);let p={...route[0],y:layer.surface.walk(route[0].x,route[0].z)!};
  for(const b of route.slice(1)){let ticks=0;while(Math.hypot(p.x-b.x,p.z-b.z)>.01){assert(ticks++<2000);const dx=b.x-p.x,dz=b.z-p.z,d=Math.hypot(dx,dz),step=Math.min(.12,d),q=moveRoyalWalker(p,dx/d*step,dz/d*step,obstacles,.4,layer.surface.walk);assert(Math.hypot(q.x-p.x,q.z-p.z)>.001,'no blocked route');const ceiling=palace.interior.cameraObstacles.filter(o=>o.minY!>q.y+.1&&Math.abs(q.x-o.x)<o.halfWidth&&Math.abs(q.z-o.z)<o.halfDepth).reduce((h,o)=>Math.min(h,o.minY!),Infinity);assert(ceiling-q.y>2.1,'no head intersects floor or ceiling');p=q;}}
 }finally{layer.dispose();}
});
