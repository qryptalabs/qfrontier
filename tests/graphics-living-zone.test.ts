import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIVING_BUILDINGS,LIVING_PATHS,LIVING_PROPS,LIVING_RESIDENTS,LIVING_ZONE,livingBuildingContains,livingChunkFor,livingOccupiedAt,livingRoadAt,livingRoutePose,livingTerrainHeight } from '../lib/graphics/living-zone-data.ts';
import { createLivingZoneChunk } from '../lib/graphics/living-zone.ts';
import { WORLD_LANDMARKS,sampleWorld } from '../lib/graphics/world-geography.ts';
import { createWorldAssetLibrary } from '../lib/graphics/world-models.ts';
import {physicalNpcPose,type PhysicalCapsule} from '../lib/graphics/world-collision.ts';

test('the model city and improved village keep catalog coordinates and have distinct scale and development',()=>{
  for(const place of[LIVING_ZONE.city,LIVING_ZONE.village]){const catalog=WORLD_LANDMARKS.find(p=>p.id===place.id)!;assert.equal(catalog.x,place.x);assert.equal(catalog.y,place.y);assert.equal(sampleWorld(place.x,place.y).biome,'forest');}
  const city=LIVING_BUILDINGS.filter(b=>b.owner===LIVING_ZONE.city.id),village=LIVING_BUILDINGS.filter(b=>b.owner===LIVING_ZONE.village.id);
  assert.equal(city.length,86);assert.equal(village.length,16);assert.ok(LIVING_ZONE.city.width*LIVING_ZONE.city.depth>7*LIVING_ZONE.village.width*LIVING_ZONE.village.depth);
  assert.ok(city.some(b=>b.kind==='keep'));assert.ok(city.some(b=>b.kind==='hall'));assert.equal(city.filter(b=>b.kind==='market').length,6);assert.equal(city.filter(b=>b.kind==='windmill').length,2);
  for(let i=0;i<LIVING_BUILDINGS.length;i++)for(let j=i+1;j<LIVING_BUILDINGS.length;j++){const a=LIVING_BUILDINGS[i],b=LIVING_BUILDINGS[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2||Math.abs(a.y-b.y)>=(a.depth+b.depth)/2,`${a.id} and ${b.id} have separate footprints`);}
  const chunks=new Set(city.map(b=>{const c=livingChunkFor(b);return`${c.cx}:${c.cy}`;}));assert.ok(chunks.size>=9,'capital structures are distributed across streamed chunks');
});

test('the inter-settlement road joins both gates continuously and terrain grading leaves unrelated regions untouched',()=>{
  const road=LIVING_PATHS.find(p=>p.owner==='road')!,start=road.points[0],end=road.points.at(-1)!;
  assert.deepEqual(start,{x:LIVING_ZONE.city.x,y:LIVING_ZONE.city.y+72});assert.deepEqual(end,{x:LIVING_ZONE.village.x,y:LIVING_ZONE.village.y-30});
  let distance=0;for(let segment=1;segment<road.points.length;segment++){const a=road.points[segment-1],b=road.points[segment],length=Math.hypot(b.x-a.x,b.y-a.y);distance+=length;for(let i=0;i<=40;i++){const t=i/40,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;assert.equal(livingRoadAt(x,y),true);assert.equal(livingOccupiedAt(x,y,1),true);const h=livingTerrainHeight(x,y,sampleWorld(x,y).height);assert.ok(Number.isFinite(h));const h2=livingTerrainHeight(x+1e-5,y,sampleWorld(x+1e-5,y).height);assert.ok(Math.abs(h2-h)<.001,'height has no chunk seam');}}
  assert.ok(distance>400&&distance<600);for(const point of[{x:0,y:0},{x:25000,y:14000},{x:-700,y:-700}]){assert.equal(livingTerrainHeight(point.x,point.y,42),42);assert.equal(livingOccupiedAt(point.x,point.y),false);assert.equal(livingRoadAt(point.x,point.y),false);}
});

test('workers follow shared streets and stop at fields, markets or workstations without crossing structures or fountain',()=>{
  assert.equal(LIVING_RESIDENTS.filter(r=>r.owner===LIVING_ZONE.city.id).length,40);assert.equal(LIVING_RESIDENTS.filter(r=>r.owner===LIVING_ZONE.village.id).length,12);
  for(const resident of LIVING_RESIDENTS)for(let time=0;time<1800;time+=3.25){const p=livingRoutePose(resident,time);assert.ok(Number.isFinite(p.yaw));assert.equal(livingRoadAt(p.x,p.y),true,`${resident.id} uses a real path`);assert.equal(livingBuildingContains(p.x,p.y,.15),false,`${resident.id} avoids buildings and solid props`);assert.deepEqual(p,livingRoutePose(resident,time));}
  for(const farmer of LIVING_RESIDENTS.filter(r=>r.role==='farmer')){const end=farmer.route.at(-1)!;assert.ok(LIVING_BUILDINGS.some(b=>b.kind==='garden'&&Math.hypot(end.x-b.x,end.y-b.y)<8),'farmers work beside actual crops');}
  assert.equal(livingBuildingContains(LIVING_PROPS[0].x,LIVING_PROPS[0].y),true);
});

test('neighboring city chunks retain visible streets and buildings when the catalog center chunk is absent',()=>{
  const assets=createWorldAssetLibrary(),center=livingChunkFor(LIVING_ZONE.city),far={cx:center.cx+1,cy:center.cy};
  const chunk=createLivingZoneChunk(far.cx,far.cy,{quality:'fullhd',heightAt:(x,y)=>livingTerrainHeight(x,y,sampleWorld(x,y).height),assets});
  assert.ok(chunk.group.children.some(o=>o.name==='living-static-material-batch'));assert.ok(chunk.picks.some(o=>o.userData.npcId===LIVING_ZONE.city.id));
  let triangles=0;chunk.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof THREE.InstancedMesh?o.count:1);});
  assert.ok(triangles>1000&&triangles<450000,'district details have a bounded mesh budget');const materialBatches=chunk.group.children.filter(o=>o.name==='living-static-material-batch').length;assert.ok(materialBatches<40,'static city details merge by material rather than drawing each house separately');chunk.dispose();assets.dispose();
});

test('chunk animation moves rotors and resident routines deterministically without resetting a frozen viewer time',()=>{
  const assets=createWorldAssetLibrary(),mill=LIVING_BUILDINGS.find(b=>b.owner===LIVING_ZONE.village.id&&b.kind==='windmill')!,index=livingChunkFor(mill),chunk=createLivingZoneChunk(index.cx,index.cy,{quality:'fullhd',heightAt:(x,y)=>livingTerrainHeight(x,y,sampleWorld(x,y).height),assets});
  const rotor=chunk.group.getObjectByName('windmill-rotor');assert.ok(rotor);chunk.animate(12,false);const rotation=rotor!.rotation.z;chunk.animate(12,true);assert.equal(rotor!.rotation.z,rotation);chunk.animate(20,false);assert.notEqual(rotor!.rotation.z,rotation);chunk.dispose();chunk.dispose();assets.dispose();
});

test('player plot exclusion takes priority over authored scenery and chunk disposal preserves borrowed world assets',()=>{
  const assets=createWorldAssetLibrary(),index=livingChunkFor(LIVING_ZONE.city),empty=createLivingZoneChunk(index.cx,index.cy,{quality:'fullhd',heightAt:()=>1.5,assets,occupiedByPlayer:()=>true});
  assert.equal(empty.group.children.length,0);assert.equal(empty.picks.length,0);empty.dispose();
  const borrowed=assets.get('windmill'),borrowedGeometry=new Set<THREE.BufferGeometry>(),borrowedMaterial=new Set<THREE.Material>();borrowed.traverse(o=>{if(o instanceof THREE.Mesh){borrowedGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])borrowedMaterial.add(m);}});
  let disposedBorrowed=0;borrowedGeometry.forEach(g=>g.addEventListener('dispose',()=>disposedBorrowed++));borrowedMaterial.forEach(m=>m.addEventListener('dispose',()=>disposedBorrowed++));
  const chunk=createLivingZoneChunk(index.cx,index.cy,{quality:'fullhd',heightAt:()=>1.5,assets}),ownedGeometry=new Set<THREE.BufferGeometry>();chunk.group.traverse(o=>{if(o instanceof THREE.Mesh&&(o.name==='living-static-material-batch'||o.name==='living-streets-fortifications-props'))ownedGeometry.add(o.geometry);});let released=0;ownedGeometry.forEach(g=>g.addEventListener('dispose',()=>released++));chunk.dispose();chunk.dispose();assert.equal(released,ownedGeometry.size);assert.equal(disposedBorrowed,0,'shared library assets survive chunk eviction');assert.ok(assets.get('windmill'));assets.dispose();assert.equal(disposedBorrowed,borrowedGeometry.size+borrowedMaterial.size);
});

test('unrelated continents skip district models, terrain reads and asset allocations',()=>{
  const chunk=createLivingZoneChunk(230,-180,{quality:'4k',heightAt(){throw new Error('Distant district should not read terrain');},assets:{get(){throw new Error('Distant district should not allocate assets');},dispose(){throw new Error('Chunk must not own the viewer library');}}});
  assert.equal(chunk.group.children.length,0);assert.equal(chunk.picks.length,0);chunk.setDetail(10);chunk.animate(120,false);chunk.dispose();chunk.dispose();
});

test('all quality levels draw the shared physical resident pose at the same absolute clock, including yielding to players',()=>{
  const assets=createWorldAssetLibrary(),resident=LIVING_RESIDENTS[1],owner=livingChunkFor(livingRoutePose(resident,0)),now=1792287441817,base=physicalNpcPose(resident.id,now)!;
  assert.ok(base);const players:PhysicalCapsule[]=[{id:'confirmed-player',x:base.x,y:base.y,radius:.3,height:1.6}],expected=physicalNpcPose(resident.id,now,players);
  for(const quality of['performance','fullhd','4k']as const){const chunk=createLivingZoneChunk(owner.cx,owner.cy,{quality,assets,heightAt:()=>3,playerBodies:()=>players});try{
    chunk.setDetail(6.5);chunk.animate(now/1000,true);const actor=chunk.group.getObjectByName(resident.id)!;assert.ok(actor);assert.equal(actor.visible,!!expected);if(!expected)continue;
    assert.ok(Math.abs(actor.position.x+owner.cx*64-expected.x)<1e-8);assert.ok(Math.abs(actor.position.z+owner.cy*64-expected.y)<1e-8);assert.equal(actor.position.y,3.18);assert.equal(actor.rotation.y,expected.yaw);assert.equal(actor.scale.x,.72);
    chunk.animate(now/1000,false);assert.ok(Math.abs(actor.position.x+owner.cx*64-expected.x)<1e-8,'animation preferences cannot change physical positions');
  }finally{chunk.dispose();}}
  assets.dispose();
});
