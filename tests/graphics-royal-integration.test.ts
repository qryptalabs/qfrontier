import {ROYAL_PORT_OFFSET} from '../lib/graphics/royal-proportions.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {ROYAL_WORLD_LOCATION as site,royalCameraWeight,royalWorldVisible,royalContextZoom,royalViewHalfHeight} from '../lib/graphics/royal-world-location.ts';
import {royalRiver,royalRegionalTerrain} from '../lib/graphics/royal-regional-terrain.ts';
import {WORLD_LANDMARKS} from '../lib/graphics/world-geography.ts';
import {INHABITED_BUILDINGS} from '../lib/graphics/inhabited-world-data.ts';
import {plotForIndex} from '../lib/mvp/settlements.ts';
import type {PublicSettlement} from '../lib/mvp/view.ts';
import {publicStationLayout} from '../lib/graphics/public-station-layout.ts';
import {LIVING_BUILDINGS} from '../lib/graphics/living-zone-data.ts';

test('royal regional context uses existing locality plans, connected access roads and grounded native-scale forests',()=>{
 const layer=createRoyalWorldLayer(1);try{
  layer.setOrigin(site);layer.group.updateMatrixWorld(true);const data=layer.group.userData.royalCity.integration;
  assert(data.roots.length>2000);assert(data.terrainCells<60000);
  const actual=new Map(WORLD_LANDMARKS.map(p=>[p.id,p]));
  for(const p of data.settlements){const source=actual.get(p.id);assert(source);assert.equal(p.x,source.x-site.x);assert.equal(p.z,source.y-site.y);assert.equal(p.buildings,INHABITED_BUILDINGS.filter(b=>b.owner===p.id&&!b.construction).length+LIVING_BUILDINGS.filter(b=>b.owner===p.id).length);}
  const route=data.routes.find((r:{id:string})=>r.id==='royal-east-gate-to-paso-del-norte');assert(route);const destination=actual.get('npc-paso-del-norte')!;assert.deepEqual(route.points.at(-1),[destination.x-site.x,destination.y-site.y]);
  assert(layer.group.getObjectByName('royal-accesses-joined-to-existing-regional-roads'));assert(layer.group.getObjectByName('existing-planet-geography-around-the-realm'));assert(layer.group.getObjectByName('royal-river-connected-through-the-region'));
  const terrain=layer.group.getObjectByName('royal-continuous-valley-and-mountains')!,ray=new THREE.Raycaster();for(let i=0;i<data.roots.length;i+=47){const p=data.roots[i];ray.set(new THREE.Vector3(p.x,10000,p.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(terrain)[0];assert(hit);assert(Math.abs(hit.point.y-1-p.y)<.004);}
  const player:PublicSettlement={id:'projection-player',playerId:'projection-owner',name:'Test',ownerName:'Test',faction:'cartographers',clanName:null,plot:plotForIndex(16),buildings:{workshop:1,garden:1,kitchen:1,laboratory:1,barracks:1,warehouse:1,logistics:1},own:false,protectionUntil:0};const saved=JSON.stringify(player);layer.setPlayers([player]);const preview=layer.group.getObjectByName('actual-player-station-context:'+player.id)!;assert.equal(preview.children.length,publicStationLayout(player).length);layer.setPlayers([player]);assert.equal(layer.group.getObjectByName(preview.name),preview,'unchanged public state reuses its preview');assert.equal(JSON.stringify(player),saved);
  const city=layer.group.getObjectByName('existing-settlement-context:npc-costa-ambar')!;layer.setView({x:0,y:0});assert(city.visible);layer.setView({x:-408,y:-312});assert(!city.visible,'the actual close-range city takes over without a duplicate');
  const forest=layer.group.getObjectByName('royal-forest-joining-existing-biomes')!;const meshes=forest.children.filter(o=>o instanceof THREE.InstancedMesh)as THREE.InstancedMesh[];const full=meshes.map(m=>m.count);layer.setView(site,true);assert(meshes.every((m,i)=>m.count<full[i]));layer.setView(site,false);assert.deepEqual(meshes.map(m=>m.count),full);
 }finally{layer.dispose();}
});

test('royal camera lens blends continuously into neighboring regions and river continues across the old district edge',()=>{
 assert(!royalWorldVisible(0,0));assert.equal(royalCameraWeight(site.x,site.y),1);assert.equal(royalCameraWeight(30000,15000),0);const near=royalContextZoom(0,0,6.2),weight=royalCameraWeight(0,0),actual=95*Math.pow(.5,(near-6)*.74)*(1-weight)+royalViewHalfHeight(near)*weight;assert(Math.abs(actual-95*Math.pow(.5,.2*.74))<.001,'existing towns keep their auto-framing footprint');
 for(let x=site.x+3000;x<site.x+10000;x+=17)assert(Math.abs(royalCameraWeight(x,site.y)-royalCameraWeight(x+.01,site.y))<.00001);
 for(const z of[110,125,264,288]){const a=royalRiver(0,z-.001),b=royalRiver(0,z+.001);assert(Math.abs(a.center-b.center)<.1);assert(Math.abs(a.halfWidth-b.halfWidth)<.1);}
 for(const z of[639.99,640,640.01,800]){const river=royalRiver(0,z-ROYAL_PORT_OFFSET);assert(river.halfWidth>1);assert(royalRiver(river.center,z-ROYAL_PORT_OFFSET).water);assert.equal(royalRegionalTerrain(site.x+river.center,site.y+z,2,1),-2.5);}
});

test('the outer kingdom does not raise unrelated ocean floor into a rectangular platform',()=>{
 for(const x of[-4200,4200])for(const z of[400,800,1200])assert(Math.abs(royalRegionalTerrain(site.x+x,site.y+z,-7,1)+7)<1e-10);
});
