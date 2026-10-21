import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createInhabitedWorldChunk } from '../lib/graphics/inhabited-world.ts';
import { createBiomeSettlementLibrary } from '../lib/graphics/biome-settlement-models.ts';
import { createWorldAssetLibrary } from '../lib/graphics/world-models.ts';
import { INHABITED_PLACES,INHABITED_BUILDINGS,INHABITED_RESIDENTS,INHABITED_PROPS,INHABITED_PATHS,inhabitedTerrainHeight,inhabitedChunkData } from '../lib/graphics/inhabited-world-data.ts';
import { sampleWorld } from '../lib/graphics/world-geography.ts';
import { livingChunkFor,livingRoutePose } from '../lib/graphics/living-zone-data.ts';
import { worldStreamWindow,retainedSettlementChunks } from '../lib/graphics/world-camera.ts';
import { continuousTerrainHeight,buildWorldTerrainGeometry } from '../lib/graphics/world-terrain-renderer.ts';
import { SETTLEMENT_ANCHORS } from '../lib/graphics/settlement-layout.ts';
const heightAt=(x:number,y:number)=>inhabitedTerrainHeight(x,y,sampleWorld(x,y).height);

test('all ambient extensions render detailed architecture at their permanent coordinates with bounded chunk budgets',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary();
  for(const place of INHABITED_PLACES){
    const index=livingChunkFor(place),chunk=createInhabitedWorldChunk(index.cx,index.cy,{quality:'fullhd',heightAt,assets,worldAssets});
    assert.ok(chunk.picks.some(p=>p.userData.npcId===place.id),`${place.name} is selectable in its own district`);
    assert.ok(chunk.group.children.some(o=>o.name==='inhabited-static-batch'||o.name==='inhabited-roads-boundaries-props'),`${place.name} has visible district detail`);
    let triangles=0,batches=0;chunk.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o instanceof THREE.InstancedMesh?o.count:1);if(o.name==='inhabited-static-batch')batches++;});
    assert.ok(triangles>100&&triangles<500000,`${place.name} fits the streamed triangle budget`);assert.ok(batches<50,`${place.name} merges architecture by shared material: ${batches}`);chunk.dispose();
  }
  assets.dispose();worldAssets.dispose();
});

test('large cities span multiple independently rendered chunks instead of one catalog square',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary();
  for(const city of INHABITED_PLACES.filter(p=>p.kind==='city')){
    const center=livingChunkFor(city),buildings=INHABITED_BUILDINGS.filter(b=>b.owner===city.id),indices=new Map(buildings.map(b=>{const c=livingChunkFor(b);return[`${c.cx}:${c.cy}`,c];}));
    assert.ok(indices.size>=6,`${city.name} extends over multiple world sectors`);
    const other=[...indices.values()].find(c=>c.cx!==center.cx||c.cy!==center.cy)!,chunk=createInhabitedWorldChunk(other.cx,other.cy,{quality:'fullhd',heightAt,assets,worldAssets});
    assert.ok(chunk.group.children.some(o=>o.name==='inhabited-static-batch'));assert.ok(chunk.picks.some(p=>p.userData.npcId===city.id));chunk.dispose();
  }
  assets.dispose();worldAssets.dispose();
});

test('mills and residents animate deterministically and keep a frozen viewer timestamp',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary();
  for(const biome of['ice','desert','tropical','mountain','coast','forest','plains']){
    const mill=INHABITED_BUILDINGS.find(b=>b.biome===biome&&b.kind==='windmill');if(!mill)continue;
    const index=livingChunkFor(mill),chunk=createInhabitedWorldChunk(index.cx,index.cy,{quality:'fullhd',heightAt,assets,worldAssets}),rotor=chunk.group.getObjectByName('windmill-rotor');assert.ok(rotor,`${biome} has an articulated mill`);
    chunk.animate(40,false);const rotation=rotor!.rotation.z;chunk.animate(40,true);assert.equal(rotor!.rotation.z,rotation);chunk.animate(52,false);assert.notEqual(rotor!.rotation.z,rotation);chunk.dispose();
  }
  const resident=INHABITED_RESIDENTS[0],index=livingChunkFor(livingRoutePose(resident,0)),chunk=createInhabitedWorldChunk(index.cx,index.cy,{quality:'fullhd',heightAt,assets,worldAssets});
  chunk.setDetail(10);chunk.animate(0,false);const actor=chunk.group.getObjectByName(resident.id)!;assert.ok(actor);const atZero=actor.position.clone();chunk.animate(37,false);assert.ok(actor.position.distanceTo(atZero)>.01);const at37=actor.position.clone();chunk.animate(37,true);assert.deepEqual(actor.position,at37);chunk.dispose();assets.dispose();worldAssets.dispose();
});

test('player plots take precedence and eviction frees local resources without disposing shared architecture',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary(),building=INHABITED_BUILDINGS.find(b=>!b.construction&&b.kind==='home'&&b.biome==='ice')!,index=livingChunkFor(building);
  const blocked=createInhabitedWorldChunk(index.cx,index.cy,{quality:'fullhd',heightAt,assets,worldAssets,occupiedByPlayer:()=>true});assert.equal(blocked.group.children.length,0);assert.equal(blocked.picks.length,0);blocked.dispose();
  const borrowed=assets.get(building.kind,building.biome,building.level,building.variant),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();borrowed.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  let freedBorrowed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>freedBorrowed++));materials.forEach(m=>m.addEventListener('dispose',()=>freedBorrowed++));
  const chunk=createInhabitedWorldChunk(index.cx,index.cy,{quality:'fullhd',heightAt,assets,worldAssets}),local=new Set<THREE.BufferGeometry>();chunk.group.traverse(o=>{if(o instanceof THREE.Mesh&&(o.name==='inhabited-roads-boundaries-props'||o.name==='inhabited-static-batch'))local.add(o.geometry);});let freedLocal=0;local.forEach(g=>g.addEventListener('dispose',()=>freedLocal++));chunk.dispose();chunk.dispose();assert.equal(freedLocal,local.size);assert.equal(freedBorrowed,0);assets.dispose();assert.equal(freedBorrowed,geometries.size+materials.size);worldAssets.dispose();
});

test('unrelated world chunks do not read terrain or allocate settlement models',()=>{
  let cx=400;const cy=-200;while(inhabitedChunkData(cx,cy).places.length||inhabitedChunkData(cx,cy).pathSegments.length)cx++;
  const chunk=createInhabitedWorldChunk(cx,cy,{quality:'4k',heightAt(){throw new Error('Empty chunk must not sample terrain');},assets:{get(){throw new Error('Empty chunk must not allocate models');},dispose(){throw new Error('Viewer owns models');}},worldAssets:{get(){throw new Error('Empty chunk must not allocate vegetation');},dispose(){throw new Error('Viewer owns vegetation');}}});
  assert.equal(chunk.group.children.length,0);chunk.animate(40,false);chunk.setDetail(10);chunk.dispose();chunk.dispose();
});

test('the extended worlds retain walking owner chunks while nearby and unload distant populations',()=>{
  let largest=0;
  for(const resident of INHABITED_RESIDENTS){const owner=livingChunkFor(livingRoutePose(resident,0));for(const time of[0,40,130]){const pose=livingRoutePose(resident,time),view=worldStreamWindow(pose,10,1.168,'3d',53,.636),kept=retainedSettlementChunks(view,INHABITED_PLACES);assert.ok(kept.some(c=>c.cx===owner.cx&&c.cy===owner.cy));largest=Math.max(largest,kept.length);}}
  assert.ok(largest<40,'only nearby settlement chunks are retained');
});

test('a real player foundation overrides ambient city grading without moving its authored buildings',()=>{
  const city=INHABITED_PLACES.find(p=>p.kind==='city'&&p.biome==='ice')!,own={x:city.x,y:city.y};
  for(const[name,anchor]of Object.entries(SETTLEMENT_ANCHORS)){if(name==='bridge')continue;const actual=continuousTerrainHeight(own.x+anchor[0],own.y+anchor[2],own);assert.ok(Math.abs(actual-(anchor[1]+sampleWorld(own.x,own.y).height-2))<.001,`${name} keeps its player foundation above any ambient layout`);}
});

test('distant views reduce pedestrians while performance preserves nearby physical bodies and architecture',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary(),city=INHABITED_PLACES.find(p=>p.kind==='city')!;
  let fullCount=0,performanceCount=0,overviewCount=0;
  const residentIds=new Set(INHABITED_RESIDENTS.filter(r=>r.owner===city.id).map(r=>r.id)),chunks=new Map([...residentIds].map(id=>{const r=INHABITED_RESIDENTS.find(r=>r.id===id)!,c=livingChunkFor(livingRoutePose(r,0));return[`${c.cx}:${c.cy}`,c];}));
  for(const c of chunks.values()){
    const full=createInhabitedWorldChunk(c.cx,c.cy,{quality:'fullhd',heightAt,assets,worldAssets}),performance=createInhabitedWorldChunk(c.cx,c.cy,{quality:'performance',heightAt,assets,worldAssets});
    full.setDetail(10);performance.setDetail(10);full.group.traverse(o=>{if(residentIds.has(o.name)&&o.visible)fullCount++;});performance.group.traverse(o=>{if(residentIds.has(o.name)&&o.visible)performanceCount++;});
    const structures=full.group.children.filter(o=>o.name==='inhabited-static-batch').length;full.setDetail(6.2);full.group.traverse(o=>{if(residentIds.has(o.name)&&o.visible)overviewCount++;});assert.equal(full.group.children.filter(o=>o.name==='inhabited-static-batch').length,structures);full.dispose();performance.dispose();
  }
  assert.ok(fullCount>20);assert.equal(performanceCount,fullCount,'nearby low-quality players must not collide with invisible residents');assert.ok(overviewCount>0&&overviewCount<fullCount);assets.dispose();worldAssets.dispose();
});

test('rotated workbenches render inside their planned footprint instead of turning their world bounds twice',()=>{
  const assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary(),cache=new Map<string,ReturnType<typeof createInhabitedWorldChunk>>(),matrix=new THREE.Matrix4(),unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5));let checked=0;
  for(const prop of INHABITED_PROPS.filter(p=>p.kind==='workbench')){
    const c=livingChunkFor(prop),key=`${c.cx}:${c.cy}`;let chunk=cache.get(key);if(!chunk){chunk=createInhabitedWorldChunk(c.cx,c.cy,{quality:'fullhd',heightAt:continuousTerrainHeight,assets,worldAssets});cache.set(key,chunk);}
    const mesh=chunk.group.getObjectByName('inhabited-roads-boundaries-props')as THREE.InstancedMesh;assert.ok(mesh);let top:THREE.Box3|null=null;
    for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const position=new THREE.Vector3().setFromMatrixPosition(matrix);if(Math.abs(position.x+c.cx*64-prop.x)<.001&&Math.abs(position.z+c.cy*64-prop.y)<.001&&Math.abs(position.y-(continuousTerrainHeight(prop.x,prop.y)+.8))<.001){top=unit.clone().applyMatrix4(matrix).translate(new THREE.Vector3(c.cx*64,0,c.cy*64));break;}}
    assert.ok(top,`${prop.id} has a rendered table top`);assert.ok(Math.abs(top!.max.x-top!.min.x-prop.width)<.002);assert.ok(Math.abs(top!.max.z-top!.min.z-prop.depth)<.002);
    for(const resident of INHABITED_RESIDENTS.filter(r=>r.owner===prop.owner))for(const point of resident.route)assert.ok(point.x<top!.min.x-.14||point.x>top!.max.x+.14||point.y<top!.min.z-.14||point.y>top!.max.z+.14,`${resident.id} clears the actual rotated workbench`);
    checked++;
  }
  assert.ok(checked>20);cache.forEach(chunk=>chunk.dispose());assets.dispose();worldAssets.dispose();
});

test('real river crossings render raised bridge decks while their water and riverbed remain below',()=>{
  let crossing:{x:number;y:number}|null=null;
  outer:for(const path of INHABITED_PATHS.filter(p=>p.external))for(let segment=1;segment<path.points.length;segment++){const a=path.points[segment-1],b=path.points[segment],length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(1,Math.ceil(length/1.7));for(let i=0;i<count;i++){const t=(i+.5)/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,sample=sampleWorld(x,y);if(sample.water&&sample.river){crossing={x,y};break outer;}}}
  assert.ok(crossing,'fixed regional roads cross an actual sampled river');
  const p=crossing!,sample=sampleWorld(p.x,p.y),c=livingChunkFor(p),assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary(),chunk=createInhabitedWorldChunk(c.cx,c.cy,{quality:'fullhd',heightAt:continuousTerrainHeight,assets,worldAssets}),mesh=chunk.group.getObjectByName('inhabited-roads-boundaries-props')as THREE.InstancedMesh,matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  let deckBottom=-Infinity;
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);if(Math.abs(position.x+c.cx*64-p.x)<.002&&Math.abs(position.z+c.cy*64-p.y)<.002){const box=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)).applyMatrix4(matrix);if(box.max.y-box.min.y<.2)deckBottom=Math.max(deckBottom,box.min.y);}}
  assert.ok(deckBottom>=sample.waterLevel+.44,'the real rendered deck clears the water');assert.equal(continuousTerrainHeight(p.x,p.y),Math.round(sample.height*2)/2,'bridge does not raise the riverbed into a dam');
  const terrain=buildWorldTerrainGeometry(c.cx,c.cy,2);assert.ok(terrain.water.attributes.position.count>0,'water still flows through the bridge chunk');terrain.terrain.dispose();terrain.water.dispose();chunk.dispose();assets.dispose();worldAssets.dispose();
});

test('a resident crossing the real desert-city river stands on its bridge instead of below the water',()=>{
  const resident=INHABITED_RESIDENTS.find(r=>r.id==='world-ciudad-areneros-resident-34')!,pose=livingRoutePose(resident,0),sample=sampleWorld(pose.x,pose.y);assert.equal(sample.water,true,'fixed seed includes this pedestrian river crossing');
  const c=livingChunkFor(pose),assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary(),chunk=createInhabitedWorldChunk(c.cx,c.cy,{quality:'fullhd',heightAt:continuousTerrainHeight,assets,worldAssets});
  chunk.setDetail(10);chunk.animate(0,false);const actor=chunk.group.getObjectByName(resident.id)!;assert.ok(actor);assert.ok(actor.position.y>=sample.waterLevel+.62,'feet remain above the raised bridge deck');const paused=actor.position.clone();chunk.animate(0,true);assert.deepEqual(actor.position,paused);chunk.dispose();assets.dispose();worldAssets.dispose();
});

test('city selection bounds follow actual hillside roofs instead of the catalog center height',()=>{
  const keep=INHABITED_BUILDINGS.find(b=>b.kind==='keep'&&b.biome==='desert')!,place=INHABITED_PLACES.find(p=>p.id===keep.owner)!,c=livingChunkFor(keep),assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary();
  const hillside=(x:number,y:number)=>80+(x-place.x)*.3+(y-place.y)*.2,chunk=createInhabitedWorldChunk(c.cx,c.cy,{quality:'fullhd',heightAt:hillside,assets,worldAssets}),pick=chunk.picks.find(p=>p.userData.npcId===place.id)!;assert.ok(pick);chunk.group.updateMatrixWorld(true);
  const pickBounds=new THREE.Box3().setFromObject(pick),roofs=new THREE.Box3();for(const child of chunk.group.children)if(child.name==='inhabited-static-batch')roofs.union(new THREE.Box3().setFromObject(child));assert.ok(!roofs.isEmpty());assert.ok(pickBounds.min.y<=roofs.min.y&&pickBounds.max.y>=roofs.max.y,'the picking volume covers the actual rendered district elevation');
  assert.ok(pickBounds.min.y>place.height+12,'a high district does not keep an oversized selection column from low catalog ground');assert.equal((pick as THREE.Mesh).material instanceof THREE.MeshBasicMaterial,true);assert.equal(((pick as THREE.Mesh).material as THREE.Material).visible,false,'selection adds no opaque geometry');chunk.dispose();assets.dispose();worldAssets.dispose();
});
