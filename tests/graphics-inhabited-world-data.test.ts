import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD_SETTLEMENTS, sampleWorld, WORLD_CHUNK_SIZE } from '../lib/graphics/world-geography.ts';
import { LIVING_ZONE, livingRoutePose, isLivingSettlement, distanceToSegment } from '../lib/graphics/living-zone-data.ts';
import { INHABITED_PLACES,INHABITED_BUILDINGS,INHABITED_FOUNDATIONS,INHABITED_PATHS,INHABITED_RESIDENTS,INHABITED_CARTS,INHABITED_PROPS,INHABITED_PROFILES,inhabitedChunkData,inhabitedRoadAt,inhabitedOccupiedAt,inhabitedTerrainHeight,inhabitedSolidAt,inhabitedWaterClearedAt,inhabitedBuildingPadAt,inhabitedRoadDeckHeight,isInhabitedSettlement } from '../lib/graphics/inhabited-world-data.ts';

test('all remaining 33 catalog settlements retain their permanent coordinates, names, owners, biomes and tiers',()=>{
  const expected=WORLD_SETTLEMENTS.filter(p=>!isLivingSettlement(p.id));assert.equal(expected.length,33);assert.equal(INHABITED_PLACES.length,33);assert.equal(new Set(INHABITED_PLACES.map(p=>p.id)).size,33);
  for(const original of expected){const place=INHABITED_PLACES.find(p=>p.id===original.id)!;assert.ok(place);for(const key of['id','name','alias','x','y','biome','tier','stage']as const)assert.equal(place[key],original[key]);assert.equal(isInhabitedSettlement(original.id),true);assert.ok(Number.isFinite(place.height));assert.equal(place.profile,INHABITED_PROFILES[place.biome]);assert.ok(!/\bNPC\b/i.test(`${place.name} ${place.alias}`));}
  assert.equal(isInhabitedSettlement(LIVING_ZONE.city.id),false);assert.equal(isInhabitedSettlement(LIVING_ZONE.village.id),false);assert.equal(WORLD_SETTLEMENTS.length,35);
});

test('cities have developed districts while construction villages and tiers retain visible progression and varied layouts',()=>{
  const cities=INHABITED_PLACES.filter(p=>p.kind==='city'),villages=INHABITED_PLACES.filter(p=>p.kind==='village'),largestVillage=Math.max(...villages.map(p=>p.width*p.depth));
  assert.equal(cities.length,4);for(const city of cities){assert.equal(city.buildingCount,70);assert.ok(city.width*city.depth>largestVillage*3);const buildings=INHABITED_BUILDINGS.filter(b=>b.owner===city.id);assert.equal(buildings.length,70);for(const kind of['keep','hall','market','windmill','tower','garden'])assert.ok(buildings.some(b=>b.kind===kind));assert.equal(city.residentCount,42);}
  assert.ok(new Set(villages.map(p=>p.layout)).size>=3);assert.ok(new Set(INHABITED_PLACES.map(p=>p.boundaryShape)).size===2);assert.ok(INHABITED_PLACES.some(p=>p.boundary==='open'));
  for(const village of villages){assert.ok(village.buildingCount>=12&&village.buildingCount<=18);assert.ok(INHABITED_BUILDINGS.some(b=>b.owner===village.id&&b.kind==='windmill'));if(village.stage==='construction'){assert.ok(village.buildingCount<16);assert.ok(INHABITED_BUILDINGS.filter(b=>b.owner===village.id&&b.construction).length>=4);assert.ok(INHABITED_RESIDENTS.filter(r=>r.owner===village.id&&r.role==='builder').length>=6);}}
  const blueprints=villages.map(p=>INHABITED_BUILDINGS.filter(b=>b.owner===p.id).map(b=>`${(b.x-p.x).toFixed(2)}:${(b.y-p.y).toFixed(2)}:${b.variant}:${b.kind}`).join('|'));assert.equal(new Set(blueprints).size,villages.length,'seeded layouts avoid identical stamped villages');
});

test('workers and biome transports stay on connected streets and outside building and work-prop footprints',()=>{
  assert.equal(INHABITED_CARTS.length,33);assert.equal(INHABITED_RESIDENTS.length,514);
  for(const resident of[...INHABITED_RESIDENTS,...INHABITED_CARTS])for(let time=0;time<1000;time+=6.125){const pose=livingRoutePose(resident,time);assert.equal(inhabitedRoadAt(pose.x,pose.y),true,`${resident.id} follows the visible street graph`);assert.equal(inhabitedSolidAt(pose.x,pose.y,.15),false,`${resident.id} clears buildings and solid props`);assert.ok(Number.isFinite(pose.yaw));}
  for(const cart of INHABITED_CARTS){assert.equal(cart.kind,cart.biome==='ice'?'sled':cart.biome==='desert'?'camel':'cart');assert.ok(cart.route.length>=2);}
  for(const place of INHABITED_PLACES){const farmers=INHABITED_RESIDENTS.filter(r=>r.owner===place.id&&r.role==='farmer');assert.ok(farmers.length);for(const farmer of farmers){const end=farmer.route.at(-1)!;assert.ok(INHABITED_BUILDINGS.some(b=>b.owner===place.id&&b.kind==='garden'&&Math.hypot(end.x-b.x,end.y-b.y)<15),'field workers finish beside actual garden models');}}
});

test('regional roads join local gates on the same landmass and never take straight shortcuts across ocean water',()=>{
  const roads=INHABITED_PATHS.filter(p=>p.external);assert.equal(roads.length,29);assert.ok(roads.some(p=>p.id.includes('world-village-13')&&p.points.length>50),'the coastal connection contains a precomputed land detour');
  for(const road of roads){for(const endpoint of[road.points[0],road.points.at(-1)!]){assert.ok(INHABITED_PATHS.some(p=>!p.external&&p.points.slice(1).some((b,i)=>distanceToSegment(endpoint.x,endpoint.y,p.points[i],b).distance<=p.width/2+.01)),'regional endpoint meets a local gate street');}
    let length=0;for(let segment=1;segment<road.points.length;segment++){const a=road.points[segment-1],b=road.points[segment],distance=Math.hypot(b.x-a.x,b.y-a.y);length+=distance;assert.ok(distance<=96.001);const count=Math.ceil(distance/16);for(let i=0;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,sample=sampleWorld(x,y);assert.ok(!sample.water||sample.river,`${road.id} stays on land or a bridgeable river`);assert.equal(inhabitedRoadAt(x,y),true);}}
    assert.ok(length<6500,'connections remain regional rather than spanning oceans or ice caps');}
  for(const place of INHABITED_PLACES.filter(p=>p.biome==='ice'))assert.equal(roads.some(r=>r.id.startsWith(`regional-${place.id}-`)||r.id.endsWith(`-${place.id}`)),false,'isolated polar communities are not joined by artificial world-spanning roads');
});

test('coastal bays remain water outside actual building pads and paths',()=>{
  // Inject a submerged base to exercise coastal shore/micro-terrain variations;
  // the fixed catalog centers happen to be on dry land at their current scale.
  let wetPreserved=0,pads=0;for(const place of INHABITED_PLACES.filter(p=>p.biome==='coast'))for(let x=place.x-place.width/2;x<=place.x+place.width/2;x+=4)for(let y=place.y-place.depth/2;y<=place.y+place.depth/2;y+=4){const base=-.5;if(inhabitedWaterClearedAt(x,y)){pads++;assert.ok(inhabitedTerrainHeight(x,y,base)>=.4);}else{wetPreserved++;assert.equal(inhabitedTerrainHeight(x,y,base),base);}}
  assert.ok(wetPreserved>0,'unoccupied coastal ground can remain submerged');assert.ok(pads>0,'only real pads and causeways can rise over water');
});

test('regional river crossings preserve their riverbed and raise bridge decks above the water independently',()=>{
  let crossings=0;for(const road of INHABITED_PATHS.filter(p=>p.external))for(let segment=1;segment<road.points.length;segment++){const a=road.points[segment-1],b=road.points[segment],count=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.75);for(let i=0;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,sample=sampleWorld(x,y);if(!sample.river||inhabitedBuildingPadAt(x,y))continue;crossings++;const bed=inhabitedTerrainHeight(x,y,sample.height,sample);assert.equal(bed,sample.height);const quantized=Math.round(bed*2)/2,deck=inhabitedRoadDeckHeight(quantized,sample.waterLevel);assert.ok(deck>=sample.waterLevel+.45);}}
  assert.ok(crossings>10,'fixed routes cross actual sampled rivers');assert.equal(inhabitedRoadDeckHeight(3,null),3);assert.equal(inhabitedRoadDeckHeight(5,2),5);
});

test('height grading and spatial queries are deterministic at positive and negative chunk seams',()=>{
  for(const place of INHABITED_PLACES){const cx=Math.floor(place.x/WORLD_CHUNK_SIZE),cy=Math.floor(place.y/WORLD_CHUNK_SIZE);assert.equal(inhabitedChunkData(cx,cy),inhabitedChunkData(cx,cy),'lookups reuse the immutable spatial bucket');for(const point of[{x:cx*64,y:place.y},{x:place.x,y:cy*64}]){const h=inhabitedTerrainHeight(point.x,point.y,sampleWorld(point.x,point.y).height),near=inhabitedTerrainHeight(point.x+.000001,point.y+.000001,sampleWorld(point.x+.000001,point.y+.000001).height);assert.ok(Math.abs(h-near)<.0001);assert.equal(h,inhabitedTerrainHeight(point.x,point.y,sampleWorld(point.x,point.y).height));}}
  for(const place of[LIVING_ZONE.city,LIVING_ZONE.village,{x:0,y:0},{x:48,y:0}])assert.equal(inhabitedTerrainHeight(place.x,place.y,17),17,'the original zone and current player plots keep their terrain');
});

test('features and actors have exactly one owner chunk while road segments are indexed locally',()=>{
  for(const building of INHABITED_BUILDINGS){const entry=inhabitedChunkData(Math.floor(building.x/64),Math.floor(building.y/64));assert.ok(entry.buildings.includes(building));assert.equal(entry.buildings.filter(b=>b.id===building.id).length,1);}
  for(const resident of INHABITED_RESIDENTS){const pose=livingRoutePose(resident,0),entry=inhabitedChunkData(Math.floor(pose.x/64),Math.floor(pose.y/64));assert.ok(entry.residents.includes(resident));}
  for(const place of INHABITED_PLACES){const entry=inhabitedChunkData(Math.floor(place.x/64),Math.floor(place.y/64));assert.ok(entry.pathSegments.length<120);assert.ok(entry.buildings.length<25);assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.pathSegments));}
  const empty=inhabitedChunkData(10000,-10000);assert.equal(empty.places.length,0);assert.equal(empty.pathSegments.length,0);assert.equal(inhabitedTerrainHeight(640000,-640000,123),123);assert.equal(inhabitedRoadAt(640000,-640000),false);assert.equal(inhabitedOccupiedAt(640000,-640000),false);assert.ok(INHABITED_PROPS.length>100);
});

test('Areneros retains its natural hillside and river banks instead of a city-sized stamped plateau',()=>{
  const city=INHABITED_PLACES.find(p=>p.id==='world-ciudad-areneros')!;
  const north=sampleWorld(city.x,city.y-96),south=sampleWorld(city.x+64,city.y+64),northHeight=inhabitedTerrainHeight(north.x,north.y,north.height,north),southHeight=inhabitedTerrainHeight(south.x,south.y,south.height,south);
  assert.ok(northHeight-southHeight>15,'a 20-unit natural slope is preserved across the capital');
  // This line crosses the former north edge of the fixed city rectangle, away
  // from building pads. The old 12-unit feather produced a cliff over 10 high.
  let previous:{base:number;height:number}|null=null;
  for(let y=-144;y<=-88;y+=2){const sample=sampleWorld(city.x,city.y+y),height=inhabitedTerrainHeight(sample.x,sample.y,sample.height,sample);assert.ok(Math.abs(height-sample.height)<=.701);if(previous)assert.ok(Math.abs((height-previous.height)-(sample.height-previous.base))<.18,'the district boundary does not introduce a cliff');previous={base:sample.height,height};}
  let riverBanks=0;for(let y=-120;y<=-50;y+=2)for(let x=-32;x<=0;x+=2){const sample=sampleWorld(city.x+x,city.y+y);if(!sample.river||inhabitedBuildingPadAt(sample.x,sample.y))continue;const bed=inhabitedTerrainHeight(sample.x,sample.y,sample.height,sample);assert.equal(bed,sample.height);const neighbor=sampleWorld(sample.x+4,sample.y);if(neighbor.river||inhabitedBuildingPadAt(neighbor.x,neighbor.y))continue;const bank=inhabitedTerrainHeight(neighbor.x,neighbor.y,neighbor.height,neighbor);assert.ok(Math.abs(bank-bed)<4.5,'nearby river banks are not flattened to a distant city center height');riverBanks++;}assert.ok(riverBanks>5);
});

test('individual foundations remain flat and indexed across chunk edges while regional grading stays close to natural ground',()=>{
  assert.equal(INHABITED_FOUNDATIONS.length,INHABITED_BUILDINGS.length);
  for(const pad of INHABITED_FOUNDATIONS){for(const point of[{x:pad.x,y:pad.y},{x:pad.x+pad.width*.22,y:pad.y+pad.depth*.22}]){const sample=sampleWorld(point.x,point.y);assert.equal(inhabitedTerrainHeight(point.x,point.y,sample.height,sample),pad.height);assert.ok(inhabitedChunkData(Math.floor(point.x/64),Math.floor(point.y/64)).foundations.includes(pad));}}
  let checked=0;for(const path of INHABITED_PATHS.filter(p=>p.external))for(const point of path.points){const cell=inhabitedChunkData(Math.floor(point.x/64),Math.floor(point.y/64));if(cell.places.length||cell.foundations.length)continue;const sample=sampleWorld(point.x,point.y);if(sample.river)continue;const height=inhabitedTerrainHeight(point.x,point.y,sample.height,sample);assert.ok(Math.abs(height-sample.height)<=.350001,'a road cannot become an elevated rail over its terrain');checked++;}assert.ok(checked>100);
});
