import assert from 'node:assert/strict';
import test from 'node:test';
import { SphereGeometry } from 'three';
import { plotForIndex, tileToGlobal } from '../lib/mvp/settlements.ts';
import { clampPlanetZoomLevel, geoToVector, geoToWorld, interpolateWorldFlight, NPC_SETTLEMENTS, PLANET_ANCHOR, PLANET_NPC_SETTLEMENTS, PLANET_RADIUS, PLANET_ZOOM_LEVELS, planetZoomLevel, smoothFlyProgress, UNITS_PER_DEGREE, WORLD_MANIFEST, worldToGeo, worldToPlanet } from '../lib/graphics/planet-data.ts';
const close=(a:number,b:number,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} differs from ${b}`);

test('fixed geographic projection preserves existing parcel coordinates and all 81 sector centers',()=>{
  assert.deepEqual(worldToGeo(0,0),PLANET_ANCHOR);
  assert.equal(UNITS_PER_DEGREE,192);
  for(let index=0;index<1000;index++){const plot=plotForIndex(index),geo=worldToGeo(plot.x,plot.y),back=geoToWorld(geo.lat,geo.lon);close(back.x,plot.x);close(back.y,plot.y);}
  for(let row=0;row<9;row++)for(let col=0;col<9;col++){const point=tileToGlobal(`t_${row}_${col}`),geo=worldToGeo(point.x,point.y);close(geo.lat,12-(row-4));close(geo.lon,-35+(col-4));assert.deepEqual(geoToWorld(geo.lat,geo.lon),point);}
  assert.equal(WORLD_MANIFEST.resourceOrigin,'t_4_4');
  close(worldToGeo(0,-4.5*192).lat-worldToGeo(0,4.5*192).lat,9);
});

test('planet mapping aligns markers to actual Three SphereGeometry UV vertices',()=>{
  const sphere=new SphereGeometry(PLANET_RADIUS,72,36),positions=sphere.getAttribute('position'),uvs=sphere.getAttribute('uv');
  try{for(let index=73;index<positions.count-73;index+=11){const lon=uvs.getX(index)*360-180,lat=uvs.getY(index)*180-90,point=geoToVector(lat,lon);close(point.x,positions.getX(index),.00006);close(point.y,positions.getY(index),.00006);close(point.z,positions.getZ(index),.00006);}}finally{sphere.dispose();}
  const zero=geoToVector(0,0);close(zero.x,100);close(zero.y,0);close(zero.z,0);
  const east=geoToVector(0,90);close(east.x,0);close(east.z,-100);
  for(const point of [worldToPlanet(0,0),worldToPlanet(48,0),geoToVector(90,180),geoToVector(-90,-180)])close(Math.hypot(point.x,point.y,point.z),PLANET_RADIUS);
});

test('geographic bounds are explicit and malformed values are never silently coerced or wrapped onto another lot',()=>{
  for(const value of [NaN,Infinity,-Infinity,'48',null,undefined] as unknown as number[]){assert.throws(()=>worldToGeo(value,0),RangeError);assert.throws(()=>geoToVector(0,value),RangeError);assert.throws(()=>clampPlanetZoomLevel(value),RangeError);}
  for(const [lat,lon]of [[90.01,0],[-90.01,0],[0,180.01],[0,-180.01]])assert.throws(()=>geoToWorld(lat,lon),RangeError);
  assert.throws(()=>worldToGeo(1e6,0),RangeError);assert.throws(()=>geoToVector(0,0,0),RangeError);
  for(const [lat,lon]of [[90,180],[-90,-180],[0,0]]){const p=geoToWorld(lat,lon);assert.deepEqual(worldToGeo(p.x,p.y),{lat,lon});}
});

test('the ten immutable zoom anchors have strictly descending positive altitudes and bounded selection',()=>{
  assert.equal(PLANET_ZOOM_LEVELS.length,10);
  assert.deepEqual(PLANET_ZOOM_LEVELS.map(level=>level.level),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(PLANET_ZOOM_LEVELS[0].label,'Espacio');assert.equal(PLANET_ZOOM_LEVELS[9].label,'Aldea');
  PLANET_ZOOM_LEVELS.forEach((level,index)=>{assert.ok(level.altitude>0);assert.ok(Object.isFrozen(level));if(index)assert.ok(level.altitude<PLANET_ZOOM_LEVELS[index-1].altitude);});
  assert.equal(clampPlanetZoomLevel(-100),1);assert.equal(clampPlanetZoomLevel(100),10);assert.equal(clampPlanetZoomLevel(3.6),4);assert.equal(planetZoomLevel(10),PLANET_ZOOM_LEVELS[9]);
});

test('ambient settlements stay separate from real profiles and outside canonical parcel footprints',()=>{
  assert.equal(PLANET_NPC_SETTLEMENTS,NPC_SETTLEMENTS);assert.ok(NPC_SETTLEMENTS.length>=8&&NPC_SETTLEMENTS.length<=12);assert.equal(new Set(NPC_SETTLEMENTS.map(npc=>npc.id)).size,NPC_SETTLEMENTS.length);
  const serialized=JSON.stringify(NPC_SETTLEMENTS);for(const field of ['playerId','ownerName','ownerId','inventory','units','credits'])assert.ok(!serialized.includes(`"${field}"`));
  for(const npc of NPC_SETTLEMENTS){assert.equal(npc.kind,'npc');assert.ok(npc.id.startsWith('npc-'));assert.ok(Object.isFrozen(npc));assert.ok(['village','construction','city'].includes(npc.stage));assert.ok(Math.hypot(npc.x,npc.y)>100);worldToGeo(npc.x,npc.y);
    for(let index=0;index<3000;index++){const plot=plotForIndex(index);assert.ok(Math.abs(npc.x-plot.x)>plot.width/2||Math.abs(npc.y-plot.y)>plot.depth/2);}
  }
});

test('ambient display aliases are unique immutable fictional labels, never player identities',()=>{
  const aliases=NPC_SETTLEMENTS.map(location=>location.alias);
  assert.equal(new Set(aliases.map(alias=>alias.toLocaleLowerCase('es'))).size,aliases.length);
  for(const location of NPC_SETTLEMENTS){
    assert.match(location.alias,/^[A-Za-z][A-Za-z0-9_]{2,31}$/);
    assert.notEqual(location.alias,location.name);
    assert.ok(!Object.hasOwn(location,'playerId'));assert.ok(!Object.hasOwn(location,'ownerName'));
    const before=JSON.stringify(location);
    assert.equal(Reflect.set(location,'alias','OtroAlias'),false);
    assert.equal(JSON.stringify(location),before);
  }
});

test('population changes cannot alter fixed geography, NPC coordinates or a saved parcel location',()=>{
  const before=JSON.stringify({manifest:WORLD_MANIFEST,npcs:NPC_SETTLEMENTS,anchor:worldToPlanet(48,48)});
  const simulatedPopulation=Array.from({length:800},(_,i)=>plotForIndex(i));
  simulatedPopulation.reverse().forEach(plot=>worldToPlanet(plot.x,plot.y));
  assert.equal(JSON.stringify({manifest:WORLD_MANIFEST,npcs:NPC_SETTLEMENTS,anchor:worldToPlanet(48,48)}),before);
  assert.ok(Object.isFrozen(WORLD_MANIFEST));assert.ok(Object.isFrozen(PLANET_ANCHOR));
});

test('camera flight has exact endpoints, bounded smooth progress and monotonic altitude without moving world state',()=>{
  const from={x:0,y:0,altitude:420},to={x:48,y:-48,altitude:.12},snapshot=JSON.stringify({from,to});
  assert.deepEqual(interpolateWorldFlight(from,to,-1),from);assert.deepEqual(interpolateWorldFlight(from,to,2),to);
  let previous=Infinity;
  for(let i=0;i<=100;i++){const p=interpolateWorldFlight(from,to,i/100);assert.ok(p.x>=0&&p.x<=48);assert.ok(p.y>=-48&&p.y<=0);assert.ok(p.altitude<=previous);previous=p.altitude;}
  close(smoothFlyProgress(.5),.5);close(smoothFlyProgress(.001)/.001,0,.00001);
  assert.equal(JSON.stringify({from,to}),snapshot);assert.throws(()=>interpolateWorldFlight({...from,altitude:0},to,.5),RangeError);
});
