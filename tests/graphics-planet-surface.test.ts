import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createPlanetSurface, planetTerrainAt, planetTextureWidth } from '../lib/graphics/planet-surface.ts';
import { PLANET_ANCHOR, PLANET_RADIUS, geoToVector, worldToGeo } from '../lib/graphics/planet-data.ts';
import { WORLD_SETTLEMENTS } from '../lib/graphics/world-geography.ts';

test('the playable anchor and its surrounding district remain green inland ground', () => {
  for (const dLat of [-3,0,3]) for (const dLon of [-3,0,3]) {
    const sample = planetTerrainAt(PLANET_ANCHOR.lat+dLat,PLANET_ANCHOR.lon+dLon);
    assert.ok(sample.land && sample.elevation > .08);
    assert.ok(sample.moisture > .65, 'the introductory district is green rather than desert or ice');
  }
  assert.deepEqual(planetTerrainAt(12,-35),planetTerrainAt(12,-35));
  for (const lat of [-70,-30,0,35,70]) {
    const left=planetTerrainAt(lat,-180),right=planetTerrainAt(lat,180);
    assert.ok(Math.abs(left.elevation-right.elevation)<1e-8, 'geography joins across the longitude seam');
  }
});

test('the fixed geography has distinct oceans, land and mountain relief', () => {
  let land=0,ocean=0,mountains=0;
  for(let lat=-75;lat<=75;lat+=5)for(let lon=-180;lon<180;lon+=5){const sample=planetTerrainAt(lat,lon);if(sample.land)land++;else ocean++;if(sample.elevation>.5)mountains++;}
  assert.ok(land>180 && ocean>land*2,'the fictional continents sit within substantial deep oceans');
  assert.ok(mountains>8,'geography includes actual high mountain ranges');
});

test('the planet is finite, textured, geographically aligned and bounded for 4K rendering', () => {
  const surface=createPlanetSurface('fullhd');
  let calls=0,triangles=0;
  surface.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;calls++;
    const positions=object.geometry.getAttribute('position');for(const value of positions.array)assert.ok(Number.isFinite(value));
    triangles+=(object.geometry.index?.count??positions.count)/3;
  });
  assert.equal(surface.radius,PLANET_RADIUS);
  assert.ok(calls<=6&&triangles<120_000,`${calls} draws and ${triangles} triangles fit the planetary LOD budget`);
  const material=surface.planet.material as THREE.MeshStandardMaterial;
  assert.ok(material.map instanceof THREE.DataTexture&&material.bumpMap instanceof THREE.DataTexture&&material.roughnessMap instanceof THREE.DataTexture);
  assert.equal(material.map.image.width,2048);assert.equal(material.map.image.height,1024);
  assert.equal(material.map.flipY,true,'north-first generated pixels match SphereGeometry v=1 at the north pole');
  const col=Math.floor((PLANET_ANCHOR.lon+180)/360*material.map.image.width),row=Math.floor((90-PLANET_ANCHOR.lat)/180*(material.map.image.height-1));
  const pixel=(row*material.map.image.width+col)*4,data=material.map.image.data as Uint8Array;
  assert.ok(data[pixel+1]>data[pixel]*1.35&&data[pixel+1]>data[pixel+2],'the visible texture under the playable marker is green');
  const roughness=material.roughnessMap.image.data as Uint8Array;
  assert.ok(roughness[pixel+1]>180,'the visible anchor is rough land, not a glossy ocean');
  const anchor=geoToVector(PLANET_ANCHOR.lat,PLANET_ANCHOR.lon,PLANET_RADIUS);
  assert.ok(Math.abs(Math.hypot(anchor.x,anchor.y,anchor.z)-PLANET_RADIUS)<.001);
  assert.ok(surface.group.getObjectByName('planet-atmosphere') instanceof THREE.Mesh);
  assert.ok(surface.group.getObjectByName('planet-low-clouds') instanceof THREE.Mesh);
  assert.ok(material.emissiveIntensity>0&&material.emissiveIntensity<.15,'the night side keeps subtle surface visibility');
  surface.dispose();
});

test('cloud animation preserves surface coordinates and reduced motion freezes the shells', () => {
  const surface=createPlanetSurface('performance'),clouds=surface.group.getObjectByName('planet-low-clouds')!;
  const position=surface.planet.position.clone(),rotation=surface.planet.rotation.clone();
  surface.animate(10,false);const moved=clouds.rotation.y;surface.animate(20,false);assert.notEqual(clouds.rotation.y,moved);
  assert.deepEqual(surface.planet.rotation.toArray(),rotation.toArray());assert.deepEqual(surface.planet.position,position);
  surface.animate(25,true);const still=clouds.rotation.clone();surface.animate(40,true);assert.deepEqual(clouds.rotation.toArray(),still.toArray());
  assert.equal(planetTextureWidth('performance'),512);assert.equal(planetTextureWidth('auto'),1024);assert.equal(planetTextureWidth('4k'),2048);
  surface.dispose();
});

test('orbital pixels match the glacial, tropical and desert cities on the ground', () => {
  const surface=createPlanetSurface('fullhd'),material=surface.planet.material as THREE.MeshStandardMaterial;
  const map=material.map as THREE.DataTexture,width=map.image.width,height=map.image.height,data=map.image.data as Uint8Array;
  const pixelAt=(lat:number,lon:number)=>((Math.floor((90-lat)/180*(height-1))*width)+Math.floor((lon+180)/360*width))*4;
  for(const name of ['Reino del Hielo','Ciudad del Sol','Ciudad de los Areneros']) {
    const city=WORLD_SETTLEMENTS.find(place=>place.name===name)!;assert.ok(city);
    const geo=worldToGeo(city.x,city.y),index=pixelAt(geo.lat,geo.lon),[r,g,b]=data.slice(index,index+3);
    if(city.biome==='ice') {
      assert.ok(Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<30,'permanent polar ice is pale rather than deep blue');
      assert.ok(((material.roughnessMap as THREE.DataTexture).image.data as Uint8Array)[index]>225,'the polar cap has rough ice rather than glossy ocean');
      assert.ok(((material.bumpMap as THREE.DataTexture).image.data as Uint8Array)[index]>0,'ice has subtle relief above the ocean');
    } else if(city.biome==='desert')assert.ok(r>g*1.12&&g>b*1.25,'the desert city sits on visible warm sand');
    else assert.ok(g>r*1.5&&g>b*1.3,'the tropical city sits on visible green vegetation');
  }
  // Every longitude beyond the ground sampler's polar boundary is ice, even
  // where the unchanged continental field underneath is deep ocean.
  for(const lat of [-81,-77.5,77.5,81])for(const lon of [-150,-30,90,150]) {
    const index=pixelAt(lat,lon);assert.ok(Math.min(data[index],data[index+1],data[index+2])>180);
  }
  surface.dispose();
});

test('planet teardown releases every owned texture, material and geometry exactly once', () => {
  const surface=createPlanetSurface('performance'),resources=new Set<THREE.EventDispatcher<{dispose:{}}>>();
  surface.group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    resources.add(object.geometry);
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials){resources.add(material);if(material instanceof THREE.MeshStandardMaterial)for(const map of[material.map,material.bumpMap,material.roughnessMap,material.emissiveMap])if(map)resources.add(map);}
  });
  const disposals=new Map<unknown,number>();for(const resource of resources)resource.addEventListener('dispose',()=>disposals.set(resource,(disposals.get(resource)??0)+1));
  surface.dispose();surface.dispose();
  assert.equal(surface.group.children.length,0);
  for(const resource of resources)assert.equal(disposals.get(resource),1);
});
