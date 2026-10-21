import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleWorld, WORLD_SETTLEMENTS } from '../lib/graphics/world-geography.ts';
import { FISHING_COMMUNITY, FISHING_STRUCTURES, FISHING_BOAT_ROUTES, FISHING_CART_ROUTES, fishingSnapshot, fishingPathPose, fishingPathLength } from '../lib/graphics/fishing-community-data.ts';
import { FISHING_COMMUNITIES, FISHING_NETWORK_PLACES, FISHING_NETWORK_STRUCTURES, FISHING_NETWORK_LAND_PATHS, FISHING_NETWORK_BOAT_ROUTES, FISHING_NETWORK_CART_ROUTES, fishingCommunitySnapshot, fishingNetworkSnapshot, fishingNetworkTerrainHeight, fishingNetworkRoadAt, fishingNetworkOccupiedAt, fishingNetworkSurfaceHeight, resolveFishingCommunity, getFishingCommunityData } from '../lib/graphics/fishing-network-data.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} equals ${b}`);

test('five named fishing communities retain the original port and add truthful forest, desert, tropical and polar settings',()=>{
  assert.equal(FISHING_COMMUNITIES.length,5);assert.equal(FISHING_NETWORK_PLACES.length,10);assert.equal(WORLD_SETTLEMENTS.length,35);assert.equal(FISHING_NETWORK_STRUCTURES.length,220);
  const original=FISHING_COMMUNITIES[0];assert.equal(original.id,FISHING_COMMUNITY.id);assert.equal(original.name,FISHING_COMMUNITY.name);assert.equal(original.x,FISHING_COMMUNITY.x);assert.equal(original.y,FISHING_COMMUNITY.y);assert.equal(original.city.id,FISHING_COMMUNITY.city.id);assert.deepEqual(original.boats.map(b=>b.id),FISHING_COMMUNITY.boats.map(b=>b.id));
  assert.deepEqual(FISHING_COMMUNITIES.map(c=>c.biome),['coast','forest','desert','tropical','ice']);assert.equal(new Set(FISHING_NETWORK_PLACES.map(p=>p.id)).size,10);assert.equal(new Set(FISHING_NETWORK_PLACES.map(p=>p.alias)).size,10);
  for(const site of FISHING_COMMUNITIES){for(const place of[site.port,site.city]){const sample=sampleWorld(place.x,place.y);assert.ok(!sample.water);assert.equal(sample.biome,place.biome);assert.equal(resolveFishingCommunity(place.id),site);}assert.equal(FISHING_NETWORK_STRUCTURES.filter(b=>b.owner===site.port.id).length,10);assert.equal(FISHING_NETWORK_STRUCTURES.filter(b=>b.owner===site.city.id).length,34);assert.ok(site.city.width*site.city.depth>site.port.width*site.port.depth);}
});

test('quarter-turn transforms preserve footprints, route lengths, clearances and inverse coordinates without rescaling',()=>{
  assert.deepEqual(new Set(FISHING_COMMUNITIES.map(c=>c.quarterTurns)),new Set([0,1,2,3]));
  for(const site of FISHING_COMMUNITIES){for(const point of[{x:1152,y:6723},{x:890,y:6790},{x:1320,y:6644}])assert.deepEqual(site.toTemplate(site.toWorld(point)),point);
    const data=getFishingCommunityData(site.id);assert.equal(data.structures.length,44);for(let i=0;i<FISHING_STRUCTURES.length;i++){const original=FISHING_STRUCTURES[i],b=data.structures[i];close(b.width*b.depth,original.width*original.depth);close(b.yaw,original.yaw-site.rotation);}
    for(let i=0;i<2;i++){const boat=FISHING_NETWORK_BOAT_ROUTES.filter(r=>r.communityId===site.id)[i],cart=FISHING_NETWORK_CART_ROUTES.filter(r=>r.communityId===site.id)[i];close(fishingPathLength(boat.points),fishingPathLength(FISHING_BOAT_ROUTES[i].points));close(fishingPathLength(cart.points),fishingPathLength(FISHING_CART_ROUTES[i].points));close(fishingPathLength(cart.returnPoints),fishingPathLength(FISHING_CART_ROUTES[i].returnPoints));assert.equal(boat.offset,site.boats[i].effectiveOffset);}
  }
});

test('every building footprint and every paved street width stays on real dry land at each chosen shoreline',()=>{
  for(const b of FISHING_NETWORK_STRUCTURES)for(let x=-b.width/2;x<=b.width/2+.001;x+=b.width/6)for(let y=-b.depth/2;y<=b.depth/2+.001;y+=b.depth/6)assert.ok(!sampleWorld(b.x+x,b.y+y).water,`${b.id} has a dry foundation footprint`);
  for(const path of FISHING_NETWORK_LAND_PATHS.filter(p=>p.surface==='land'))for(let j=1;j<path.points.length;j++){const a=path.points[j-1],b=path.points[j],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length)),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;for(let i=0;i<=steps;i++)for(const lateral of[-path.width/2,0,path.width/2])assert.ok(!sampleWorld(a.x+(b.x-a.x)*i/steps+nx*lateral,a.y+(b.y-a.y)*i/steps+ny*lateral).water,`${path.id} never paves across ocean or river`);}
});

test('all fleets and net sweeps use navigable ocean with wave and hull clearance, never frozen polar water',()=>{
  for(const route of FISHING_NETWORK_BOAT_ROUTES){for(let i=0;i<=500;i++){const pose=fishingPathPose(route.points,i/500);for(const forward of[-2.8,0,2.8])for(const lateral of[-1.8,0,1.8]){const sample=sampleWorld(pose.x+Math.sin(pose.yaw)*forward+Math.cos(pose.yaw)*lateral,pose.y+Math.cos(pose.yaw)*forward-Math.sin(pose.yaw)*lateral);assert.ok(sample.water&&!sample.river&&sample.biome!=='ice',`${route.id} has unfrozen ocean under the entire hull`);assert.ok(sample.waterLevel-sample.height>=.7);}}
    const end=route.points.at(-1)!;for(let angle=0;angle<Math.PI*2;angle+=Math.PI/32){const sample=sampleWorld(end.x+Math.cos(angle)*3.1,end.y+Math.sin(angle)*3.1);assert.ok(sample.water&&!sample.river&&sample.biome!=='ice');assert.ok(sample.waterLevel-sample.height>=.7);}}
  const polar=FISHING_COMMUNITIES.find(c=>c.biome==='ice')!;assert.ok(sampleWorld(polar.port.x,polar.port.y).lat>=77);for(const route of FISHING_NETWORK_BOAT_ROUTES.filter(r=>r.communityId===polar.id))assert.ok(route.points.every(p=>sampleWorld(p.x,p.y).lat<77));
});

test('the rotated full draft-animal and cart footprints remain on dry ground or physically supported wharves for complete cycles',()=>{
  for(const site of FISHING_COMMUNITIES)for(let time=0;time<540;time+=1){const snapshot=fishingCommunitySnapshot(site.id,time);for(const cart of snapshot.carts)for(const[x,z]of[[-1.25,-2.3],[1.25,-2.3],[1.25,5.4],[-1.25,5.4]]){const point={x:cart.x+x*Math.cos(cart.yaw)+z*Math.sin(cart.yaw),y:cart.y-x*Math.sin(cart.yaw)+z*Math.cos(cart.yaw)},sample=sampleWorld(point.x,point.y);if(sample.water)assert.ok(fishingNetworkSurfaceHeight(point.x,point.y,sample.height)>sample.waterLevel+.5,`${cart.id} has deck under animal and wheels`);}for(const worker of snapshot.workers){const sample=sampleWorld(worker.x,worker.y);if(sample.water)assert.equal(worker.height,site.dock.deckHeight);}}
});

test('delivery streets and shore access ramps have gradual relief suitable for animal drawn transport',()=>{
  const height=(point:{x:number;y:number})=>{const sample=sampleWorld(point.x,point.y);return fishingNetworkSurfaceHeight(point.x,point.y,fishingNetworkTerrainHeight(point.x,point.y,sample.height,sample));};
  for(const route of FISHING_NETWORK_CART_ROUTES)for(const points of[route.points,route.returnPoints,route.approachPoints]){const steps=Math.ceil(fishingPathLength(points)*2);let previous=fishingPathPose(points,0),previousHeight=height(previous);for(let step=1;step<=steps;step++){const point=fishingPathPose(points,step/steps),currentHeight=height(point),distance=Math.hypot(point.x-previous.x,point.y-previous.y);assert.ok(Math.abs(currentHeight-previousHeight)/distance<=.15,`${route.id} has no steep quay, road or foundation jump`);previous=point;previousHeight=currentHeight;}}
});

test('independent globally timed communities conserve each uniquely named fish crate through boat, workers, carts and delivery',()=>{
  for(const site of FISHING_COMMUNITIES){for(const sourceTime of[220,314,380,405,540,631,670,720]){const time=sourceTime+540-site.phaseOffset,snapshot=fishingCommunitySnapshot(site.id,time),batch=site.mapId('fishing-boat-aurora-batch-1'),loads=snapshot.loads.filter(load=>load.batchId===batch),ids=loads.flatMap(load=>load.cargoIds);assert.equal(ids.length,6,`${site.id} conserves all six crates at phase ${sourceTime}`);assert.equal(new Set(ids).size,6);}for(const boat of site.boats)assert.equal(resolveFishingCommunity(`${boat.id}-haulage`),site);assert.equal(resolveFishingCommunity(site.mapId('fishing-city-porter-0')),site);}
  for(let time=0;time<1080;time+=3){const snapshot=fishingNetworkSnapshot(time),ids=snapshot.loads.flatMap(load=>load.cargoIds);assert.equal(snapshot.boats.length,10);assert.equal(snapshot.carts.length,10);assert.equal(snapshot.workers.length,30);assert.equal(new Set(ids).size,ids.length,'a fish crate exists in precisely one community and location');assert.equal(new Set([...snapshot.boats,...snapshot.carts,...snapshot.workers].map(e=>e.id)).size,50);}
  assert.deepEqual(fishingNetworkSnapshot(713),fishingNetworkSnapshot(713));assert.equal(fishingCommunitySnapshot(FISHING_COMMUNITIES.find(c=>c.biome==='ice')!.id,100).carts[0].animal,'ox');
  const names=fishingNetworkSnapshot(713);assert.equal(new Set(names.workers.map(w=>w.name)).size,30);assert.equal(new Set(names.carts.map(c=>c.name)).size,10);assert.deepEqual(fishingCommunitySnapshot(FISHING_COMMUNITY.id,713).workers.map(w=>w.name),fishingSnapshot(713).workers.map(w=>w.name));
});

test('transformed actors preserve the proven work lanes, headings, route timings and individual cargo identity',()=>{
  for(const site of FISHING_COMMUNITIES)for(let time=0;time<540;time+=2){const template=fishingSnapshot(time+site.phaseOffset),snapshot=fishingCommunitySnapshot(site.id,time);for(const kind of['boats','workers','carts']as const){for(let i=0;i<snapshot[kind].length;i++){const actual=snapshot[kind][i],source=template[kind][i],local=site.toTemplate(actual);close(local.x,source.x);close(local.y,source.y);close(actual.yaw,source.yaw-site.rotation);assert.equal(actual.state,source.state);assert.equal(actual.speed,source.speed);assert.equal(actual.id,site.mapId(source.id));}}
    for(let i=0;i<snapshot.workers.length;i++)for(let j=i+1;j<snapshot.workers.length;j++)assert.ok(Math.hypot(snapshot.workers[i].x-snapshot.workers[j].x,snapshot.workers[i].y-snapshot.workers[j].y)>=.6,'worker lanes stay separate after rotation');}
});

test('indexed terrain helpers preserve seawater and original foundations, leave player plots untouched and distinguish decks from paved ground',()=>{
  for(const site of FISHING_COMMUNITIES){const wharf=site.toWorld({x:1152,y:6723}),street=site.toWorld({x:920,y:6784}),sea=site.toWorld({x:1260,y:6700}),sample=sampleWorld(sea.x,sea.y);assert.ok(sample.water);assert.equal(fishingNetworkTerrainHeight(sea.x,sea.y,sample.height,sample),sample.height);assert.equal(fishingNetworkRoadAt(wharf.x,wharf.y),false);assert.equal(fishingNetworkOccupiedAt(wharf.x,wharf.y),true);assert.equal(fishingNetworkRoadAt(street.x,street.y),true);assert.equal(fishingNetworkSurfaceHeight(wharf.x,wharf.y,-1),site.dock.deckHeight);for(const b of getFishingCommunityData(site.id).structures){const ground=sampleWorld(b.x,b.y),height=fishingNetworkTerrainHeight(b.x,b.y,ground.height,ground);assert.equal(height,fishingNetworkTerrainHeight(b.x+.01,b.y+.01,ground.height,ground));}}
  for(const point of[{x:0,y:0},{x:48,y:0},{x:30000,y:-9000}]){assert.equal(fishingNetworkTerrainHeight(point.x,point.y,123),123);assert.equal(fishingNetworkRoadAt(point.x,point.y),false);assert.equal(fishingNetworkOccupiedAt(point.x,point.y),false);assert.equal(fishingNetworkSurfaceHeight(point.x,point.y,123),123);}
});
