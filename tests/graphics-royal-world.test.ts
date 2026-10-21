import {ROYAL_PORT_OFFSET} from '../lib/graphics/royal-proportions.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {ROYAL_WORLD_LOCATION as location,royalLocalToWorld,royalWorldContains,royalWorldVisible} from '../lib/graphics/royal-world-location.ts';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {WORLD_LANDMARKS,sampleWorld} from '../lib/graphics/world-geography.ts';
import {worldToGeo,geoToWorld} from '../lib/graphics/planet-data.ts';

test('royal district is fixed on forest land, distinct from existing settlements and round-trips through the globe',()=>{
  assert.equal(sampleWorld(location.x,location.y).biome,'forest');
  assert(WORLD_LANDMARKS.every(p=>Math.hypot(p.x-location.x,p.y-location.y)>600));
  const geo=worldToGeo(location.x,location.y);assert.deepEqual(geoToWorld(geo.lat,geo.lon),{x:location.x,y:location.y});
  assert.deepEqual(royalLocalToWorld(0,-ROYAL_PORT_OFFSET),{x:location.x,y:location.y});
  assert(royalWorldContains(location.x,location.y));assert(royalWorldVisible(location.x+300,location.y));
  assert(!royalWorldVisible(0,0));assert(!royalWorldVisible(30000,15000));assert(!royalWorldContains(NaN,0));
});
test('planet mounts actual authored castle, fleet, bridges and town, rebases without moving the district, then frees resources',()=>{
  const layer=createRoyalWorldLayer(1);
  try{
    layer.setOrigin({x:-2304,y:-4608});layer.group.updateMatrixWorld(true);
    const castle=layer.group.getObjectByName('royal-citadel-on-the-fourth-terrace');assert(castle);
    assert(layer.group.getObjectByName('royal-harbor-galleon-1'));
    assert(layer.group.getObjectByName('royal-world-river-and-estuary'));
    let meshes=0;layer.group.traverse(o=>{if(o instanceof THREE.Mesh)meshes++;assert(!(o instanceof THREE.Sprite));});assert(meshes>80);
    const p=castle.getWorldPosition(new THREE.Vector3());layer.setOrigin({x:0,y:0});layer.group.updateMatrixWorld(true);
    const q=castle.getWorldPosition(new THREE.Vector3());assert(Math.abs(q.x-p.x+2304)<1e-6);assert(Math.abs(q.z-p.z+4608)<1e-6);
    assert.equal(layer.group.position.z,location.y);
    layer.animate(60,false);layer.animate(61,true);
    let freed=0;const mesh=layer.group.getObjectByName('royal-world-river-and-estuary') as THREE.Mesh;mesh.geometry.addEventListener('dispose',()=>freed++);
    layer.dispose();layer.dispose();assert.equal(freed,1);
  }finally{layer.dispose();}
});
