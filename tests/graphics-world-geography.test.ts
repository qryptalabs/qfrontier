import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NPC_SETTLEMENTS, geoToWorld, worldToGeo } from '../lib/graphics/planet-data.ts';
import { planetTerrainAt as visiblePlanetTerrainAt } from '../lib/graphics/planet-surface.ts';
import {
  WORLD_CHUNK_SIZE, WORLD_LANDMARKS, WORLD_SETTLEMENTS, chunkCoordinates,
  chunkKey, chunkOrigin, getBiomeStyle, planetTerrainAt, sampleWorld,
  type WorldBiome,
} from '../lib/graphics/world-geography.ts';

test('the visible sphere and the ground use one sampler without changing the original geography', () => {
  assert.equal(visiblePlanetTerrainAt, planetTerrainAt);
  // Regression values recorded before extracting the published sphere sampler.
  const snapshots = [
    {lat:12,lon:-35,elevation:.14,moisture:.82,land:true},
    {lat:36,lon:90,elevation:.5018276026546348,moisture:.5101928952719751,land:true},
    {lat:-24,lon:111,elevation:.18564499275997082,moisture:.40777830041262825,land:true},
    {lat:81,lon:18,elevation:-1,moisture:.36498455344618264,land:false},
    {lat:0,lon:0,elevation:-.676260186137385,moisture:.8019444794036508,land:false},
  ];
  for (const expected of snapshots) {
    const sample = planetTerrainAt(expected.lat,expected.lon);
    assert.equal(sample.land,expected.land);
    assert.ok(Math.abs(sample.elevation-expected.elevation)<1e-12);
    assert.ok(Math.abs(sample.moisture-expected.moisture)<1e-12);
    const point=geoToWorld(expected.lat,expected.lon),ground=sampleWorld(point.x,point.y);
    assert.equal(ground.moisture,sample.moisture);
    assert.deepEqual({lat:ground.lat,lon:ground.lon},worldToGeo(point.x,point.y));
  }
  for(const latitude of [-75,-30,0,45,81]) {
    assert.ok(Math.abs(planetTerrainAt(latitude,-180).elevation-planetTerrainAt(latitude,180).elevation)<1e-10);
  }
});

test('the introductory station stays grounded on its original green plain', () => {
  const center=sampleWorld(0,0);
  assert.equal(center.biome,'forest');
  assert.equal(center.height,2);
  assert.equal(center.water,false);
  for(const x of [-20,-10,0])for(const y of [-18,0,18]) {
    const ground=sampleWorld(x,y);
    assert.equal(ground.biome,'forest');
    assert.ok(ground.height>1.5&&ground.height<2.5,'station anchors stay compatible with the authored 3D village');
  }
});

test('chunk addressing handles negative coordinates, corners and both call forms', () => {
  assert.equal(WORLD_CHUNK_SIZE,64);
  assert.deepEqual(chunkCoordinates(-.001,-64),{cx:-1,cy:-1});
  assert.deepEqual(chunkCoordinates({x:64,y:128}),{cx:1,cy:2});
  assert.equal(chunkKey(-.001,64),'-1:1');
  assert.equal(chunkKey({x:-.001,y:64}),'-1:1');
  assert.deepEqual(chunkOrigin(-2,3),{x:-128,y:192});
  assert.throws(()=>chunkCoordinates(Infinity,0),RangeError);
  assert.throws(()=>chunkOrigin(1.5,0),RangeError);
});

test('neighbor chunks share identical border geometry, water levels and roads', () => {
  // A renderer may independently build any of these neighbors or LOD levels.
  // Their common vertices must sample the same world coordinate exactly.
  for(const cx of [-3,-1,0,1,3])for(const cy of [-2,0,2]) {
    const left=chunkOrigin(cx,cy),right=chunkOrigin(cx+1,cy);
    for(const dz of [0,7,32,63,64]) {
      const a=sampleWorld(left.x+64,left.y+dz),b=sampleWorld(right.x,right.y+dz);
      assert.deepEqual(a,b);
      const before=sampleWorld(right.x-.0001,right.y+dz),after=sampleWorld(right.x+.0001,right.y+dz);
      assert.ok(Math.abs(before.height-after.height)<.001,'relief does not restart at a chunk border');
    }
  }
  const channel=sampleWorld(9.78,0);
  assert.ok(channel.river&&channel.water&&channel.waterLevel>channel.height,'the local river has an actual bed and surface');
  for(const borderY of [-128,-64,64,128]) {
    let crossings=0;
    for(let x=-80;x<=80;x+=.5) {
      const north=sampleWorld(x,borderY-.0001),south=sampleWorld(x,borderY+.0001);
      if(!north.river||!south.river)continue;
      crossings++;
      assert.ok(Math.abs(north.waterLevel-south.waterLevel)<.001,'river surfaces remain continuous between north/south chunks');
    }
    assert.ok(crossings>0,'the river continues beyond each neighboring chunk');
  }
});

test('global samples are deterministic, finite and agree with the spherical projection', () => {
  const biomes=new Set<WorldBiome>();
  for(let lat=-90;lat<=90;lat+=9)for(let lon=-180;lon<=180;lon+=9) {
    const point=geoToWorld(lat,lon),sample=sampleWorld(point.x,point.y);
    assert.deepEqual(sample,sampleWorld(point.x,point.y));
    assert.equal(sample.lat,lat);assert.equal(sample.lon,lon);
    for(const value of [sample.x,sample.y,sample.height,sample.waterLevel,sample.moisture])assert.ok(Number.isFinite(value));
    assert.ok(sample.moisture>=0&&sample.moisture<=1);
    if(sample.water)assert.ok(sample.waterLevel>sample.height,'water never floats beneath its river or ocean bed');
    if(sample.river)assert.equal(sample.water,true);
    if(sample.road)assert.equal(sample.water,false);
    biomes.add(sample.biome);
  }
  assert.deepEqual([...biomes].sort(),['coast','desert','forest','ice','mountain','ocean','plains','tropical']);
  assert.throws(()=>sampleWorld(NaN,0),RangeError);
  assert.throws(()=>sampleWorld(1e9,0),RangeError);
});

test('the environmental catalogue contains exactly thirty villages and five cities with preserved legacy places', () => {
  assert.equal(WORLD_SETTLEMENTS.length,35);
  assert.equal(WORLD_SETTLEMENTS.filter(place=>place.kind==='village').length,30);
  assert.equal(WORLD_SETTLEMENTS.filter(place=>place.kind==='city').length,5);
  assert.equal(WORLD_LANDMARKS.length,43);
  assert.equal(new Set(WORLD_LANDMARKS.map(place=>place.id)).size,43);
  assert.equal(new Set(WORLD_SETTLEMENTS.map(place=>place.alias)).size,35);
  assert.ok(Object.isFrozen(WORLD_LANDMARKS)&&Object.isFrozen(WORLD_SETTLEMENTS));
  for(const legacy of NPC_SETTLEMENTS) {
    const place=WORLD_SETTLEMENTS.find(candidate=>candidate.id===legacy.id)!;
    assert.ok(place);
    assert.deepEqual([place.name,place.alias,place.x,place.y,place.stage],[legacy.name,legacy.alias,legacy.x,legacy.y,legacy.stage]);
  }
  assert.deepEqual(new Set(WORLD_SETTLEMENTS.map(place=>place.tier)),new Set([1,2,3]));
  assert.ok(WORLD_SETTLEMENTS.some(place=>place.stage==='construction'));
});

test('named cities and global landmarks occupy their actual immutable biomes', () => {
  for(const place of WORLD_LANDMARKS) {
    assert.ok(Object.isFrozen(place));
    assert.equal(sampleWorld(place.x,place.y).biome,place.biome);
    if(place.kind==='village'||place.kind==='city')assert.equal(sampleWorld(place.x,place.y).water,false,`${place.name} has dry foundations`);
  }
  for(const [name,biome] of [['Ciudad del Sol','tropical'],['Reino del Hielo','ice'],['Ciudad de los Areneros','desert']]) {
    const city=WORLD_SETTLEMENTS.find(place=>place.name===name)!;
    assert.ok(city);assert.equal(city.kind,'city');assert.equal(city.biome,biome);assert.equal(city.tier,3);
  }
  const allBiomes=new Set(WORLD_LANDMARKS.map(place=>place.biome));
  assert.equal(allBiomes.size,8);
  for(const quadrant of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    assert.ok(WORLD_SETTLEMENTS.some(place=>place.x*quadrant[0]>5000&&place.y*quadrant[1]>3000),'settlements spread across the planet rather than around one station');
  }
  const generated=WORLD_LANDMARKS.filter(place=>place.id.startsWith('world-'));
  for(let a=0;a<generated.length;a++)for(let b=a+1;b<generated.length;b++)assert.ok(Math.hypot(generated[a].x-generated[b].x,generated[a].y-generated[b].y)>900,'distinct locations retain room for surrounding terrain');
});

test('each biome supplies a complete distinct color palette without browser state', () => {
  const groundColors=new Set<number>();
  for(const biome of ['ice','desert','forest','tropical','mountain','coast','ocean','plains'] as const) {
    const style=getBiomeStyle(biome);assert.ok(Object.isFrozen(style)&&style.label.length>0);
    for(const key of ['ground','rock','water','sky','foliage','building','roof'] as const)assert.ok(Number.isInteger(style[key])&&style[key]>=0&&style[key]<=0xffffff);
    groundColors.add(style.ground);
  }
  assert.equal(groundColors.size,8);
});
