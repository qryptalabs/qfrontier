import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reserveTrafficMovement,settleExplorationTraffic,worldTrafficActors,manualTrafficLineClear,TRAFFIC_MAX_WAIT_MS,type TrafficActor} from '../lib/mvp/exploration-traffic.ts';
import {explorationPositionAt,explorationHeadingAt,type ExplorationMovement,type ExplorationPoint,type ExplorationTransport} from '../lib/mvp/exploration-data.ts';
import {blockingTrafficHold,explorationTimedSegments} from '../lib/mvp/exploration-timing.ts';
import {capsulesOverlap,type PhysicalCapsule} from '../lib/graphics/kinematic-physics.ts';
import {compileJourney} from '../lib/mvp/exploration-network.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp} from '../lib/mvp/engine.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpWorld,Player} from '../lib/mvp/types.ts';

const NOW=1792287000000;
const point=(x:number,y=0):ExplorationPoint=>({x,y});
function move(points:ExplorationPoint[],duration:number,mode:ExplorationTransport='walk',start=NOW):ExplorationMovement{return{points,startsAt:start,endsAt:start+duration,legs:[{mode,fromIndex:0,toIndex:points.length-1,startsAt:start,endsAt:start+duration,routeId:'test-road'}]};}
const actor=(id:string,movement:ExplorationMovement,mode:ExplorationTransport='walk'):TrafficActor=>({id,movement,position:movement.points[0],mode});
const open={clear:()=>true,roadSupport:()=>true};
const pose=(movement:ExplorationMovement,now:number)=>explorationPositionAt({position:movement.points[0],movement},now);
function body(movement:ExplorationMovement,now:number,id:string,stationaryMode:ExplorationTransport='walk'):PhysicalCapsule{
 const p=pose(movement,now),part=explorationTimedSegments(movement).find(s=>now>=s.startsAt&&now<s.endsAt),mode=part?.mode??stationaryMode;
 return{id,...p,radius:mode==='carriage'?1.15:.3,height:1.6,yaw:explorationHeadingAt({position:movement.points[0],movement},now),...(mode==='carriage'?{length:5.2,offset:1.55}:{})};
}
function noOverlap(a:ExplorationMovement,b:ExplorationMovement,step=20){const end=Math.max(a.endsAt,b.endsAt)+1000;for(let t=Math.min(a.startsAt,b.startsAt);t<=end;t+=step)assert.equal(capsulesOverlap(body(a,t,'a'),body(b,t,'b')),false,`bodies overlap at ${t-NOW}ms`);}
function fixture(){const world=createMvpWorld('traffic-owner',NOW),base={ownerId:'traffic-owner',requestId:crypto.randomUUID(),now:NOW,actor:null};const add=(name:string)=>{const p=createPlayer(world,{...base,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:name,faction:'cartographers'});p.habitable={version:1,appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[]};return p;};return{world,a:add('Primero'),b:add('Segundo')};}
function outside(p:Player,position:ExplorationPoint,movement?:ExplorationMovement){p.habitable!.exploration={version:1,position,homePosition:{...p.habitable!.position},departedAt:NOW,...(movement?{movement,destinationId:'npc-valleverde'}:{})};}
function protectedWorld(world:MvpWorld){const copy=structuredClone(world);for(const p of Object.values(copy.players))if(p.habitable)delete p.habitable.exploration;return copy;}

test('a perpendicular crossing yields continuously, preserving its committed input and earlier reservation',()=>{
 const first=move([point(-10),point(10)],6000),requested=move([point(0,-10),point(0,10)],6000),saved=JSON.stringify({first,requested}),scheduled=reserveTrafficMovement(requested,[actor('earlier',first)],NOW,open);
 assert.ok(scheduled.holds?.some(h=>!blockingTrafficHold(h)));assert.ok(scheduled.endsAt>requested.endsAt);assert.equal(JSON.stringify({first,requested}),saved);noOverlap(scheduled,first);
 for(const hold of scheduled.holds??[]){assert.deepEqual(pose(scheduled,hold.startsAt),scheduled.points[hold.pointIndex]);assert.deepEqual(pose(scheduled,hold.endsAt-1),scheduled.points[hold.pointIndex]);const before=pose(scheduled,hold.startsAt-.01),after=pose(scheduled,hold.endsAt+.01);assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<.001);}
});

test('relative velocities below one unit per second are still swept rather than ignored by an epsilon in milliseconds',()=>{
 const first=move([point(2),point(32),point(32,10)],40000/3),requested=move([point(0),point(35)],10000),scheduled=reserveTrafficMovement(requested,[actor('slow-leader',first)],NOW,open);
 assert.ok(scheduled.holds?.length,'The faster follower must not pass through the slow leader.');noOverlap(scheduled,first,10);
});

test('the horse and full carriage capsule reserve space even when the vehicle centres do not meet',()=>{
 const first=move([point(-10,4),point(10,4)],10000),wagon=move([point(0,-10),point(0,10)],10000,'carriage'),scheduled=reserveTrafficMovement(wagon,[actor('pedestrian',first)],NOW,open);
 assert.ok(scheduled.holds?.length);noOverlap(scheduled,first,10);
 for(const hold of scheduled.holds??[])assert.equal(explorationHeadingAt({position:scheduled.points[0],movement:scheduled},hold.startsAt+1),0);
});

test('opposing carriages wait at a safe approach before a one-lane bridge instead of clipping or inventing a field bypass',()=>{
 const first=move([point(0,15),point(0,-15),point(-15,-15)],12000,'carriage'),second=move([point(15,-15),point(0,-15),point(0,15)],12000,'carriage'),scheduled=reserveTrafficMovement(second,[actor('bridge-holder',first,'carriage')],NOW,{...open,roadSupport:()=>false});
 assert.ok(scheduled.holds?.some(h=>scheduled.points[h.pointIndex].x>6));assert.ok((scheduled.holds??[]).every(h=>!blockingTrafficHold(h)));noOverlap(scheduled,first,10);assert.deepEqual(scheduled.points.filter(p=>p.x!==0&&p.y!==-15),[]);
});

test('a pedestrian yielding sideways stays inside the existing road width and a narrow bridge rejects an impossible exchange',()=>{
 const first=move([point(-20),point(20)],12000),second=move([point(20),point(-20)],12000),support=(p:ExplorationPoint,pad:number)=>Math.abs(p.y)<=1.5+pad;
 const scheduled=reserveTrafficMovement(second,[actor('oncoming',first)],NOW,{clear:()=>true,roadSupport:support});assert.ok(scheduled.points.some(p=>Math.abs(p.y)>.7));assert.ok(scheduled.points.every(p=>Math.abs(p.y)<=1.14));noOverlap(scheduled,first,10);
 const before=JSON.stringify(second);assert.throws(()=>reserveTrafficMovement(second,[actor('oncoming',first)],NOW,{clear:()=>true,roadSupport:(p,pad)=>Math.abs(p.y)<=.5+pad}),/paso|tráfico/);assert.equal(JSON.stringify(second),before);
});

test('arriving first may not leave a parked character in a crossing already reserved for a later traveller',()=>{
 const earlier=move([point(-10),point(10)],10000),requested=move([point(0,-10),point(0)],2000),scheduled=reserveTrafficMovement(requested,[actor('older-crossing',earlier)],NOW,open);
 assert.ok(scheduled.endsAt>earlier.startsAt+5000);assert.ok(scheduled.holds?.length);noOverlap(scheduled,earlier,10);
});

test('two holds across two transport legs consume time without distance, reverse motion, boundary jumps or lost carriage heading',()=>{
 const saved:ExplorationMovement={points:[point(0),point(5),point(10),point(20),point(30)],startsAt:NOW,endsAt:NOW+11000,legs:[{mode:'walk',fromIndex:0,toIndex:2,startsAt:NOW,endsAt:NOW+6000,routeId:'first-road'},{mode:'carriage',fromIndex:2,toIndex:4,startsAt:NOW+6000,endsAt:NOW+11000,routeId:'second-road'}],holds:[{pointIndex:1,startsAt:NOW+2000,endsAt:NOW+4000,resourceId:'traffic-yield:one'},{pointIndex:3,startsAt:NOW+8000,endsAt:NOW+9000,resourceId:'traffic-yield:two'}]},restored=JSON.parse(JSON.stringify(saved)) as ExplorationMovement;
 let last=-Infinity;for(let t=NOW;t<=saved.endsAt;t+=25){const current=pose(restored,t);assert.ok(current.x>=last);last=current.x;assert.equal(current.y,0);assert.deepEqual(current,pose(saved,t));}
 for(const[offset,x]of[[2000,5],[4000,5],[6000,10],[8000,20],[9000,20],[11000,30]]){const at=NOW+offset;assert.deepEqual(pose(saved,at),point(x));assert.ok(Math.abs(pose(saved,at-.01).x-pose(saved,at+.01).x)<.001);}
 assert.equal(explorationHeadingAt({position:point(0),movement:restored},NOW+8500),Math.PI/2);assert.equal(pose(saved,NOW+10000).x,25);assert.equal(JSON.stringify(restored),JSON.stringify(saved));
});

test('a stationary road blocker creates a persistent barrier, resumes when clear, and stops at the held position on timeout without touching the economy',()=>{
 const{world,a,b}=fixture(),request=move([point(-20),point(20)],10000);outside(b,point(0));const reserved=reserveTrafficMovement(request,worldTrafficActors(world,NOW,a.id),NOW,open);outside(a,reserved.points[0],reserved);const hold=reserved.holds!.find(blockingTrafficHold)!;assert.ok(hold);assert.equal(hold.endsAt-hold.startsAt,TRAFFIC_MAX_WAIT_MS);const protectedBefore=JSON.stringify(protectedWorld(world)),saved=JSON.parse(JSON.stringify(world)) as MvpWorld;
 assert.deepEqual(explorationPositionAt(a.habitable!.exploration!,hold.endsAt+90000),reserved.points[hold.pointIndex]);settleExplorationTraffic(saved,hold.endsAt+1);assert.equal(saved.players[a.id].habitable!.exploration!.movement,undefined);assert.deepEqual(saved.players[a.id].habitable!.exploration!.position,reserved.points[hold.pointIndex]);assert.equal(saved.players[a.id].habitable!.exploration!.destinationId,undefined);assert.equal(JSON.stringify(protectedWorld(saved)),protectedBefore);
 b.habitable!.exploration!.position=point(100,100);settleExplorationTraffic(world,hold.startsAt+100);const resumed=a.habitable!.exploration!.movement!;assert.ok(resumed);assert.deepEqual(resumed.points[0],reserved.points[hold.pointIndex]);assert.ok(!resumed.holds?.some(blockingTrafficHold));assert.deepEqual(resumed.points.at(-1),point(20));assert.equal(resumed.startsAt,hold.startsAt+100);assert.equal(JSON.stringify(protectedWorld(world)),protectedBefore);
});

test('stationary carriages retain their real travel yaw while checking the horse footprint',()=>{
 const requested=move([point(0,-10),point(0,10)],10000),parked:TrafficActor={id:'cart',position:point(-4),mode:'carriage',yaw:Math.PI/2},scheduled=reserveTrafficMovement(requested,[parked],NOW,{...open,roadSupport:()=>false});
 const hold=scheduled.holds!.find(blockingTrafficHold)!;assert.ok(hold);assert.ok(scheduled.points[hold.pointIndex].y< -1.5);assert.ok(scheduled.holds?.length);
});

test('a blocked queue timeout cannot leave its stationary tail in an older journey arriving after two minutes',()=>{
 const requested=move([point(-20),point(20)],10000),blocker:TrafficActor={id:'stationary',position:point(0),mode:'walk'},options={...open,roadSupport:()=>false},first=reserveTrafficMovement(requested,[blocker],NOW,options),unsafe=first.points[first.holds!.find(blockingTrafficHold)!.pointIndex],later=move([point(unsafe.x,-1000),point(unsafe.x,1000)],500000),before=JSON.stringify({requested,later});
 const scheduled=reserveTrafficMovement(requested,[blocker,actor('older-late-crossing',later)],NOW,options),hold=scheduled.holds!.find(blockingTrafficHold)!;
 assert.ok(hold);assert.equal(hold.endsAt-hold.startsAt,TRAFFIC_MAX_WAIT_MS);assert.notDeepEqual(scheduled.points[hold.pointIndex],unsafe);assert.ok(hold.endsAt<NOW+250000);noOverlap(scheduled,later,25);assert.equal(JSON.stringify({requested,later}),before);
});

test('a manual lease cannot park in the future sweep of a journey that was already confirmed',()=>{
 const{world,a,b}=fixture();outside(a,point(0,-5));const earlier=move([point(-10),point(10)],10000);outside(b,earlier.points[0],earlier);assert.equal(manualTrafficLineClear(world,a,point(0,-5),point(0),NOW,NOW+900),false);assert.equal(manualTrafficLineClear(world,a,point(0,-5),point(0,-4),NOW,NOW+900),true);
});

class MemoryStore implements MvpStore{record:{revision:number;world:MvpWorld};constructor(record:{revision:number;world:MvpWorld}){this.record=record;}async read(){return structuredClone(this.record);}async insert(){}async compareAndSwap(revision:number,world:MvpWorld){if(this.record.revision!==revision)return false;this.record={revision:revision+1,world:structuredClone(world)};return true;}}
test('an impossible new stop rejects its whole transaction instead of retaining a known conflicting old journey',async()=>{
 const{world,a,b}=fixture(),travel=compileJourney([{mode:'walk',points:[point(0),point(20)],routeId:'test-road'}],NOW);outside(a,point(0),travel);outside(b,point(.5),move([point(.5),point(.5,5)],2000));const store=new MemoryStore({revision:4,world}),before=JSON.stringify(store.record);
 await assert.rejects(executeMvp(store,b.ownerId,{type:'habitat.explore.stop',playerId:b.id},crypto.randomUUID(),undefined,NOW),/reservado|segura|ocupado/);assert.equal(JSON.stringify(store.record),before);
});

test('an exhausted safety budget fails closed and never changes either committed trajectory',()=>{
 const a=move([point(-10),point(10)],6000),b=move([point(0,-10),point(0,10)],6000),before=JSON.stringify({a,b});assert.throws(()=>reserveTrafficMovement(b,[actor('first',a)],NOW,{...open,maxChecks:0}),/demasiado tráfico/);assert.equal(JSON.stringify({a,b}),before);
});
