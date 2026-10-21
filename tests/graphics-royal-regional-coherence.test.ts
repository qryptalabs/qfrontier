import {ROYAL_PORT_OFFSET,ROYAL_ARCHITECTURE_SCALE as K,ROYAL_CASTLE_SCALE} from '../lib/graphics/royal-proportions.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {royalRegionalTerrain,royalRiver,royalCityRoad,ROYAL_CITY_PLAN} from '../lib/graphics/royal-regional-terrain.ts';
import {ROYAL_WORLD_LOCATION as site,ROYAL_WORLD_BOUNDS as bounds} from '../lib/graphics/royal-world-location.ts';
import {sampleWorld} from '../lib/graphics/world-geography.ts';
import {createWorldAssetLibrary} from '../lib/graphics/world-models.ts';
import {ROYAL_CITADEL_TRANSFORM} from '../lib/graphics/royal-citadel-layout.ts';
import {createRoyalCitadel,disposeRoyalHarborCastleResources} from '../lib/graphics/royal-harbor-castle.ts';
import {royalViewHalfHeight} from '../lib/graphics/royal-world-location.ts';
import {buildWorldTerrainGeometry} from '../lib/graphics/world-terrain-renderer.ts';

test('regional mountain feet meet the existing world and the streamed terrain never duplicates the authored ground',()=>{
 const fallback=(x:number,z:number)=>Math.round(sampleWorld(site.x+x,site.y+z).height*2)/2;
 for(let x=bounds.minX;x<=bounds.maxX;x+=16)for(const z of[bounds.minZ,bounds.maxZ])assert.equal(royalRegionalTerrain(site.x+x,site.y+z,fallback(x,z),1),royalRiver(x,z-ROYAL_PORT_OFFSET).water?Math.min(-2.5,fallback(x,z)):fallback(x,z));
 for(let z=bounds.minZ;z<=bounds.maxZ;z+=16)for(const x of[bounds.minX,bounds.maxX])assert.equal(royalRegionalTerrain(site.x+x,site.y+z,fallback(x,z),1),royalRiver(x,z-ROYAL_PORT_OFFSET).water?-2.5:fallback(x,z));
 const chunk=buildWorldTerrainGeometry(site.x/64,site.y/64,2);
 try{assert.equal(chunk.terrain.getAttribute('position').count,0);assert.equal(chunk.water.getAttribute('position').count,0);assert(Number.isFinite(chunk.surface.heightAt(site.x+5,site.y+5)));}finally{chunk.terrain.dispose();chunk.water.dispose();}
});
test('houses, trees and residents share metre-scale proportions; roots and bridge/pier foundations meet the rendered ground',()=>{
 const layer=createRoyalWorldLayer(1),assets=createWorldAssetLibrary();
 try{
  layer.setOrigin(site);layer.animate(0,true);layer.group.updateMatrixWorld(true);
  const data=layer.group.userData.royalCity,ground=layer.group.getObjectByName('royal-continuous-valley-and-mountains')as THREE.Mesh;
  assert((ground.geometry.index?.count??0)<288*264*6,'the regional mesh leaves existing settlements and the detailed harbor in their own terrain layers');
  assert(data.buildings.length>=30);assert(data.roots.length>500);assert.equal(data.units,'metres');
  const treeHeight=new THREE.Box3().setFromObject(assets.get('pine')).getSize(new THREE.Vector3()).y;
  for(const b of data.buildings){assert(b.height>5&&b.height<16);assert(treeHeight/b.height>.35&&treeHeight/b.height<3);}
  const ray=new THREE.Raycaster();const port=layer.group.getObjectByName('royal-port-detailed-ground')as THREE.Mesh;const surface=(x:number,z:number)=>{ray.set(new THREE.Vector3(x,10000,z+data.harborOffsetZ),new THREE.Vector3(0,-1,0));const hits=[...ray.intersectObject(ground),...ray.intersectObject(port)].sort((a,b)=>b.point.y-a.point.y);const hit=hits[0];assert(hit);return hit.point.y-1;};
  for(let i=0;i<data.roots.length;i+=7){const p=data.roots[i];assert(Math.abs(p.y-surface(p.x,p.z))<.002,`root ${i} must sit on an actual ground triangle`);}
  for(const p of data.supports){assert(p.top>p.bottom);assert(Math.abs(p.bottom-surface(p.x,p.z))<.002,`${p.name} is supported by the riverbed or hill`);}
  const castle=layer.group.getObjectByName('royal-citadel-on-the-fourth-terrace')!;
  const box=new THREE.Box3().setFromObject(castle);assert(box.max.y-box.min.y>80);assert(Math.abs(box.min.y-1-ROYAL_CITY_PLAN.castleBase)<.01);
  ray.set(new THREE.Vector3(0,10000,0),new THREE.Vector3(0,-1,0));assert(Math.abs(ray.intersectObject(ground)[0].point.y-1-ROYAL_CITY_PLAN.castleBase)<.002);
  const reference=createRoyalCitadel();reference.scale.setScalar(ROYAL_CASTLE_SCALE);reference.position.set(0,ROYAL_CITADEL_TRANSFORM.baseY*K+1,0);reference.updateMatrixWorld(true);const referenceBox=new THREE.Box3().setFromObject(reference);assert(box.min.distanceTo(referenceBox.min)<.001);assert(box.max.distanceTo(referenceBox.max)<.001,'planet palace retains the exact authored geometry at the approved human scale');disposeRoyalHarborCastleResources();
  assert(box.getSize(new THREE.Vector3()).x>140);assert(layer.group.getObjectByName('royal-citadel-three-processional-terraces'));assert.equal(royalViewHalfHeight(6),320);assert(Math.abs(royalViewHalfHeight(10)-8)<.00001);
 }finally{layer.dispose();assets.dispose();}
});
test('the city leaves connected streets clear, ships sit within the real shoreline and workers follow separated closed routes',()=>{
 const layer=createRoyalWorldLayer(1);
 try{
  layer.setOrigin(site);layer.group.updateMatrixWorld(true);const data=layer.group.userData.royalCity;
  for(let i=0;i<data.buildings.length;i++)for(let j=i+1;j<data.buildings.length;j++){const a=data.buildings[i],b=data.buildings[j];assert(!(Math.abs(a.x-b.x)<(a.width+b.width)/2&&Math.abs(a.z-b.z)<(a.depth+b.depth)/2),'houses/warehouses cannot intersect');}
  for(const b of data.buildings)for(const dx of[-b.width/2,0,b.width/2])for(const dz of[-b.depth/2,0,b.depth/2])assert(!royalRiver(b.x+dx,b.z+dz).water,'no building floats on the widened canal');
  for(const b of data.buildings)for(let x=b.x-b.width/2;x<=b.x+b.width/2;x+=.5)for(let z=b.z-b.depth/2;z<=b.z+b.depth/2;z+=.5)assert(!royalCityRoad(x,z),'shop foundations leave the streets free');
  for(const [x,z]of data.berths)for(const dx of[-2.25,0,2.25])for(const dz of[-8.1,0,8.1])assert(royalRiver(x+dx,z+dz).water,'a ship hull must stay inside the channel');
  for(let seconds=0;seconds<400;seconds+=11){layer.animate(seconds,false);const residents:THREE.Object3D[]=[];layer.group.traverse(o=>{if(o.name.startsWith('royal-city-resident-'))residents.push(o);});assert.equal(residents.length,12);for(const actor of residents){assert(royalCityRoad(actor.position.x,actor.position.z));assert.equal(actor.scale.x,ROYAL_CITY_PLAN.personScale);}for(let i=0;i<residents.length;i++)for(let j=i+1;j<residents.length;j++)assert(residents[i].position.distanceTo(residents[j].position)>2.5,'residents retain separation on the closed circuit');}
 }finally{layer.dispose();}
});
