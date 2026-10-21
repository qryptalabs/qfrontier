import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLD_SETTLEMENTS,sampleWorld } from '../lib/graphics/world-geography.ts';
import { FISHING_COMMUNITY,FISHING_PLACES,FISHING_STRUCTURES,FISHING_PROPS,FISHING_BOAT_ROUTES,FISHING_CART_ROUTES,FISHING_CYCLE_SECONDS,fishingSnapshot,fishingPathPose,fishingPathLength,fishingSurfaceHeight,fishingTerrainHeight,fishingRoadAt,fishingOccupiedAt } from '../lib/graphics/fishing-community-data.ts';

test('the fishing port uses a real coastal bay and delivers to a larger separate ambient city without moving the existing catalog',()=>{
  assert.equal(WORLD_SETTLEMENTS.length,35);assert.equal(FISHING_PLACES.length,2);const[port,city]=FISHING_PLACES;assert.equal(port.name,'Bahía del Viento');assert.equal(city.name,'Ciudad del Estuario');assert.ok(city.width*city.depth>port.width*port.depth);assert.equal(FISHING_STRUCTURES.filter(b=>b.owner===port.id).length,10);assert.equal(FISHING_STRUCTURES.filter(b=>b.owner===city.id).length,34);assert.ok(FISHING_STRUCTURES.some(b=>b.owner===city.id&&b.kind==='warehouse'));assert.equal(FISHING_COMMUNITY.dock.deckHeight,.95);
  for(const route of FISHING_BOAT_ROUTES){const sample=sampleWorld(route.points[0].x,route.points[0].y);assert.ok(sample.water&&!sample.river);assert.ok(sample.waterLevel-sample.height>.7);}assert.ok(Math.hypot(FISHING_BOAT_ROUTES[0].points[0].x-960,FISHING_BOAT_ROUTES[0].points[0].y-6912)<400);
});

test('every boat hull and fishing-net sweep stays over deep ocean water clear of shoreline and low river bridges',()=>{
  for(const route of FISHING_BOAT_ROUTES)for(let step=0;step<=500;step++){const pose=fishingPathPose(route.points,step/500);for(const forward of[-2.8,0,2.8])for(const lateral of[-1.8,0,1.8]){const x=pose.x+Math.sin(pose.yaw)*forward+Math.cos(pose.yaw)*lateral,y=pose.y+Math.cos(pose.yaw)*forward-Math.sin(pose.yaw)*lateral,sample=sampleWorld(x,y);assert.ok(sample.water&&!sample.river);assert.ok(sample.waterLevel-sample.height>=.7,'draft, waves and clearance fit over the bed');}}
  for(const route of FISHING_BOAT_ROUTES){const end=route.points.at(-1)!;for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24){const sample=sampleWorld(end.x+Math.cos(angle)*3.1,end.y+Math.sin(angle)*3.1);assert.ok(sample.water&&!sample.river);assert.ok(sample.waterLevel-sample.height>.7,'the working net has clear water around the fishing station');}}
});

test('fishing voyages include departure, catch, return and unloading with stable globally timed identities',()=>{
  const states=new Set<string>();for(let time=0;time<FISHING_CYCLE_SECONDS;time++){const snapshot=fishingSnapshot(time);assert.deepEqual(snapshot,fishingSnapshot(time));states.add(snapshot.boats[0].state);assert.equal(snapshot.boats[0].crew.length,2);assert.notEqual(snapshot.boats[0].dockSlot,snapshot.boats[1].dockSlot);}
  assert.deepEqual([...states],['preparing','outbound','fishing','inbound','unloading','resting']);assert.equal(fishingSnapshot(100).boats[0].cargo,0);assert.ok(fishingSnapshot(170).boats[0].cargo>0);assert.equal(fishingSnapshot(220).boats[0].cargo,6);assert.equal(fishingSnapshot(384).boats[0].cargo,0);
  const before=fishingSnapshot(227),next=fishingSnapshot(227+540);for(let i=0;i<2;i++){assert.equal(before.boats[i].state,next.boats[i].state);assert.equal(before.boats[i].x,next.boats[i].x);assert.equal(before.boats[i].y,next.boats[i].y);assert.notEqual(before.boats[i].batchId,next.boats[i].batchId);}
});

test('the same six fish crates pass through hands, staging, horse carts and the city warehouse exactly once',()=>{
  const batch='fishing-boat-aurora-batch-0';for(const time of[220,307,314,325,352,380,390,405,429,460,500,540,625,631,646,670,720]){const snapshot=fishingSnapshot(time),loads=snapshot.loads.filter(load=>load.batchId===batch),ids=loads.flatMap(load=>load.cargoIds);assert.equal(ids.length,6,`all six crates are conserved at ${time}`);assert.equal(new Set(ids).size,6);assert.ok(ids.every(id=>id.startsWith(batch)));for(const load of loads)assert.equal(load.quantity,load.cargoIds.length);}
  for(let time=0;time<1080;time+=.5){const snapshot=fishingSnapshot(time),ids=snapshot.loads.flatMap(load=>load.cargoIds);assert.equal(new Set(ids).size,ids.length,'a crate cannot be in two locations at once');}
  assert.ok(fishingSnapshot(314).workers.some(w=>w.carrying&&w.cargoId?.startsWith(batch)));assert.ok(fishingSnapshot(540).carts.some(cart=>cart.cargo===6&&cart.batchId===batch&&cart.destinationId===FISHING_COMMUNITY.city.id));assert.ok(fishingSnapshot(720).loads.some(load=>load.batchId===batch&&load.location==='city'&&load.quantity===6));
});

type Point={x:number;y:number};
function vehiclePolygon(pose:{x:number;y:number;yaw:number}):Point[]{return[[-1.25,-2.3],[1.25,-2.3],[1.25,5.4],[-1.25,5.4]].map(([x,z])=>({x:pose.x+x*Math.cos(pose.yaw)+z*Math.sin(pose.yaw),y:pose.y-x*Math.sin(pose.yaw)+z*Math.cos(pose.yaw)}));}
function overlaps(a:readonly Point[],b:readonly Point[]):boolean {for(const polygon of[a,b])for(let i=0;i<polygon.length;i++){const j=(i+1)%polygon.length,dx=polygon[j].x-polygon[i].x,dy=polygon[j].y-polygon[i].y,pa=a.map(q=>q.x*-dy+q.y*dx),pb=b.map(q=>q.x*-dy+q.y*dx);if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;}return true;}

test('dock reservations and staggered hauling keep people, whole horse-carriages and structures apart for complete cycles',()=>{
  for(let time=0;time<1080;time+=.25){const snapshot=fishingSnapshot(time),[a,b]=snapshot.carts;assert.equal(overlaps(vehiclePolygon(a),vehiclePolygon(b)),false,'the horse and carriage footprint clears the other vehicle');for(const cart of snapshot.carts){for(const structure of FISHING_STRUCTURES){const box=[{x:structure.x-structure.width/2,y:structure.y-structure.depth/2},{x:structure.x+structure.width/2,y:structure.y-structure.depth/2},{x:structure.x+structure.width/2,y:structure.y+structure.depth/2},{x:structure.x-structure.width/2,y:structure.y+structure.depth/2}];assert.equal(overlaps(vehiclePolygon(cart),box),false,`${cart.id} clears ${structure.id}, including animal and turn sweep`);}for(const worker of snapshot.workers){const dx=worker.x-cart.x,dy=worker.y-cart.y,x=dx*Math.cos(cart.yaw)-dy*Math.sin(cart.yaw),z=dx*Math.sin(cart.yaw)+dy*Math.cos(cart.yaw);assert.ok(Math.abs(x)>=1.5||z<=-2.55||z>=5.65,'workers never walk through the draft animal, harness or cart');}}
    for(let i=0;i<snapshot.workers.length;i++)for(let j=i+1;j<snapshot.workers.length;j++)assert.ok(Math.hypot(snapshot.workers[i].x-snapshot.workers[j].x,snapshot.workers[i].y-snapshot.workers[j].y)>=.6,'dock workers use separate boarding and carrying lanes');assert.ok(Math.hypot(snapshot.boats[0].x-snapshot.boats[1].x,snapshot.boats[0].y-snapshot.boats[1].y)>10);}
});

test('land vehicles use dry ground or a supported wharf while workers remain on real dock surfaces',()=>{
  for(let time=0;time<540;time+=1){const snapshot=fishingSnapshot(time);for(const cart of snapshot.carts)for(const corner of vehiclePolygon(cart)){const sample=sampleWorld(corner.x,corner.y);if(sample.water)assert.ok(fishingSurfaceHeight(corner.x,corner.y,sample.height)>sample.waterLevel+.5,'the entire animal and carriage remain over a physical deck when offshore');}for(const worker of snapshot.workers){const sample=sampleWorld(worker.x,worker.y);if(sample.water)assert.equal(worker.height,FISHING_COMMUNITY.dock.deckHeight);}}
  for(const route of FISHING_CART_ROUTES){for(const points of[route.points,route.returnPoints])for(let index=0;index<=600;index++){const pose=fishingPathPose(points,index/600);if(pose.x>=1112)continue;const sample=sampleWorld(pose.x,pose.y);assert.ok(!sample.water,'the delivery road never shortcuts ocean water');}}
});

test('reported speeds match route distance and timed phases instead of unrelated wheel or hoof animation rates',()=>{
  for(const time of[40,80,210,260]){const snapshot=fishingSnapshot(time);for(const boat of snapshot.boats)if(boat.speed){const route=FISHING_BOAT_ROUTES.find(r=>r.id===boat.id)!;assert.ok(Math.abs(boat.speed-fishingPathLength(route.points)/95)<1e-9);}}
  for(const route of FISHING_CART_ROUTES)for(const[phase,points,seconds]of[[5,route.approachPoints,10],[170,route.points,100],[340,route.returnPoints,100],[410,route.approachPoints,10]]as const){const time=375-route.offset+phase,snapshot=fishingSnapshot(time),cart=snapshot.carts.find(c=>c.id===route.id)!;assert.ok(Math.abs(cart.speed-fishingPathLength(points)/seconds)<1e-9);}
});

test('only local foundations grade terrain and remote world queries remain unchanged',()=>{
  for(const building of FISHING_STRUCTURES){const sample=sampleWorld(building.x,building.y),height=fishingTerrainHeight(building.x,building.y,sample.height,sample);assert.ok(Number.isFinite(height));assert.equal(height,fishingTerrainHeight(building.x+.01,building.y+.01,sample.height,sample));}
  const water=sampleWorld(1260,6700);assert.ok(water.water);assert.equal(fishingTerrainHeight(water.x,water.y,water.height,water),water.height);for(const point of[{x:0,y:0},{x:48,y:0},{x:30000,y:-9000}]){assert.equal(fishingTerrainHeight(point.x,point.y,123),123);assert.equal(fishingRoadAt(point.x,point.y),false);assert.equal(fishingOccupiedAt(point.x,point.y),false);}assert.ok(FISHING_PROPS.some(p=>p.kind==='rack'));
});

test('dock routes preserve ocean water and seabed while dry streets retain their road surface',()=>{
  for(const point of[{x:1152,y:6723},{x:1178,y:6702},{x:1182,y:6744}]){
    const sample=sampleWorld(point.x,point.y);assert.ok(sample.water);assert.equal(fishingRoadAt(point.x,point.y),false,'wooden dock circulation must not paint sand on the seabed');assert.equal(fishingTerrainHeight(point.x,point.y,sample.height,sample),sample.height);
  }
  assert.equal(fishingOccupiedAt(1152,6723),true,'the wharf still excludes vegetation despite having no ground road');assert.equal(fishingRoadAt(920,6784),true,'the dry city delivery street remains paved');
});
