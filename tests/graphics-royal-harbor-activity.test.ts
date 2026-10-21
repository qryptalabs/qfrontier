import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import type {RoyalHarborSnapshot,RoyalHarborPhase} from '../lib/mvp/royal-harbor.ts';
import {createRoyalHarborActivity,ROYAL_FISHING_ROUTE,ROYAL_FREIGHT_ROUTE,royalHarborFleetPose,royalHarborVisualClock,royalResidentPose,sampleRoyalHarborRoute} from '../lib/graphics/royal-harbor-activity.ts';
import {royalRiverEdge,royalQuayLane} from '../lib/graphics/royal-harbor-layout.ts';

const start=1_792_345_600_000;
const phases:readonly[RoyalHarborPhase,number,number][]=[['outbound',0,16],['fishing',16,40],['returning',40,60],['docking',60,66],['unloading',66,72],['warehousing',72,88],['transporting',88,112],['market',112,120]];
function snapshot(phase:RoyalHarborPhase,elapsed?:number):RoyalHarborSnapshot {
  const definition=phases.find(entry=>entry[0]===phase)??['idle',0,120],at=elapsed??definition[1]+1;
  return{revision:2,now:start+at*1000,serverEpoch:start,initialized:true,available:true,reason:null,city:{id:'corona-del-alba',name:'Corona del Alba'},cycle:{index:0,durationMs:120000,startsAt:start,endsAt:start+120000,phase,phaseStartsAt:start+definition[1]*1000,phaseEndsAt:start+definition[2]*1000,nextTransitionAt:start+definition[2]*1000,fishUnits:8},stock:{ship:phase==='returning'||phase==='unloading'?8:0,warehouse:phase==='warehousing'?8:0,cart:phase==='transporting'?8:0,market:phase==='market'?20:12,fisheryRemaining:980},goods:[],account:{credits:20},merchantCredits:512,deliveries:[],totalDelivered:0};
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} ~= ${b}`);

test('freight follows the curved east quay and fishing stays inside the river',()=>{
  for(let step=0;step<=1000;step++){
    const boat=sampleRoyalHarborRoute(ROYAL_FISHING_ROUTE,step/1000),cart=sampleRoyalHarborRoute(ROYAL_FREIGHT_ROUTE,step/1000);
    assert.ok(Math.abs(boat.x)<royalRiverEdge(boat.z)-9,'fishing hull and its net clear the bank');
    assert.ok(cart.x>royalRiverEdge(cart.z)+9,'animal and cart stay on dry paving');
    assert.ok(cart.x<royalRiverEdge(cart.z)+25,'freight never cuts through the shops');
    if(step){const last=sampleRoyalHarborRoute(ROYAL_FISHING_ROUTE,(step-1)/1000);assert.ok(Math.hypot(last.x-boat.x,last.z-boat.z)<1,'continuous route, no teleport');}
  }
  const mid=ROYAL_FREIGHT_ROUTE[Math.floor(ROYAL_FREIGHT_ROUTE.length/2)];near(mid.x,royalQuayLane(mid.z));
});

test('phase projection uses UTC server time and waits at a stale snapshot boundary',()=>{
  const snap=snapshot('outbound',4),original=JSON.stringify(snap),end=royalHarborFleetPose(snap,(start+99_000)/1000);
  near(end.boat.x,ROYAL_FISHING_ROUTE.at(-1)!.x);near(end.boat.z,ROYAL_FISHING_ROUTE.at(-1)!.z);
  assert.equal(end.phase,'outbound','the renderer does not advance business phases');
  assert.equal(royalHarborVisualClock(snap,-100),snap.now);assert.equal(royalHarborVisualClock(snap,Infinity),snap.now);
  assert.equal(royalHarborVisualClock(null,100),null);assert.equal(JSON.stringify(snap),original);
  const dock=royalHarborFleetPose(snapshot('docking',60),start/1000+60),returned=royalHarborFleetPose(snapshot('returning',59),(start+60_000)/1000);near(dock.boat.x,returned.boat.x);near(dock.boat.z,returned.boat.z);
});

test('the same cart returns empty during the next fishing trip without jumping across the city',()=>{
  const market=royalHarborFleetPose(snapshot('market',119),(start+120000)/1000),next=snapshot('outbound',0);next.cycle.startsAt+=120000;next.cycle.endsAt+=120000;next.cycle.phaseStartsAt+=120000;next.cycle.phaseEndsAt+=120000;next.cycle.nextTransitionAt+=120000;next.now+=120000;
  const returnStart=royalHarborFleetPose(next,next.now/1000);near(market.cart.x,returnStart.cart.x);near(market.cart.z,returnStart.cart.z);
  const departure=royalHarborFleetPose(snapshot('transporting',88),(start+88000)/1000),empty=royalHarborFleetPose(snapshot('fishing',39),(start+40000)/1000);near(departure.cart.x,empty.cart.x);near(departure.cart.z,empty.cart.z);
});

test('sixteen residents stay spaced on separate promenades and clear the freight and porter crossings',()=>{
  for(let second=0;second<200;second+=.5){
    const residents=[-1,1].flatMap(side=>[false,true].flatMap(far=>[0,1,2,3].map(index=>royalResidentPose(side,far,index,second))));
    for(let i=0;i<residents.length;i++){
      const a=residents[i];assert.ok(Math.abs(a.x)>royalRiverEdge(a.z)+5.2);assert.ok(Math.abs(a.x)<royalRiverEdge(a.z)+9);
      assert.ok(a.z>=60&&a.z<=175||a.z>=250&&a.z<=330,'no pedestrian crosses loading yard or fishmonger connector');
      for(const b of residents.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>2.1,'residents do not overlap');
    }
  }
});

test('workers carry confirmed cargo, the horse pulls the cart and absent snapshots remain idle',()=>{
  const activity=createRoyalHarborActivity();
  try{
    assert.equal(activity.group.userData.serverPhase,'idle');assert.equal(activity.group.getObjectByName('actor-load')!.visible,false);
    const cart=activity.group.getObjectByName('royal-fish-cart-with-horse-and-driver')!;assert.ok(cart.getObjectByName('haulage-animal-body'));assert.ok(cart.getObjectByName('haulage-driver'));assert.ok(cart.getObjectByName('haulage-yoke-harness-reins'));
    const snap=snapshot('warehousing',80),before=JSON.stringify(snap);activity.update(snap.now/1000,snap);
    for(let index=0;index<2;index++)assert.equal(activity.group.getObjectByName(`royal-port-worker-${index}`)!.getObjectByName('actor-load')!.visible,true);
    assert.deepEqual(activity.group.userData.confirmedCargo,{ship:0,warehouse:8,cart:0,market:12});assert.equal(JSON.stringify(snap),before);
    assert.equal(activity.colliders().length,21);assert.ok(activity.colliders().some(body=>body.id.endsWith('-animal')),'horse has its own collision body');
    const transporting=snapshot('transporting',100);activity.update(transporting.now/1000,transporting);assert.equal(cart.getObjectByName('haulage-cargo')!.children.filter(c=>c.visible).length,4,'two food units per visual crate, sourced from snapshot');
    for(let index=0;index<2;index++)assert.equal(activity.group.getObjectByName(`royal-port-worker-${index}`)!.getObjectByName('actor-load')!.visible,false);
    activity.update(0,null);const pos=cart.position.clone();activity.update(100,null);assert.deepEqual(cart.position.toArray(),pos.toArray());assert.equal(cart.getObjectByName('haulage-cargo')!.children.filter(c=>c.visible).length,0);
  }finally{activity.dispose();}
});

test('viewer activity pools release their own live resources exactly once',()=>{
  const first=createRoyalHarborActivity(),second=createRoyalHarborActivity(),resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
  first.group.traverse(object=>{if(!(object instanceof THREE.Mesh))return;resources.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material]){resources.add(material);const texture=(material as THREE.MeshStandardMaterial).map;if(texture)resources.add(texture);}});
  const events=new Map<object,number>();resources.forEach(resource=>resource.addEventListener('dispose',()=>events.set(resource,(events.get(resource)??0)+1)));
  first.dispose();first.dispose();for(const resource of resources)assert.equal(events.get(resource),1,`${resource.type} disposed once`);assert.equal(first.colliders().length,0);assert.equal(first.group.children.length,0);
  const snap=snapshot('fishing');second.update(snap.now/1000,snap);assert.equal(second.group.userData.serverPhase,'fishing');assert.ok(second.group.getObjectByName('boat-net'));second.dispose();
});

test('a nearby pedestrian walks with articulated legs while the aerial view keeps the cheap distant body',()=>{
  const activity=createRoyalHarborActivity(),snap=snapshot('fishing',20);
  try{
    activity.update(snap.now/1000,snap);const walker=activity.group.getObjectByName('royal-resident-1-false-0')!,distant=walker.getObjectByName('actor-distant-body')!;
    assert.equal(distant.visible,true);activity.setFocus(walker.position.x+2,6,walker.position.z+2);activity.update(snap.now/1000,snap);assert.equal(distant.visible,false);assert.equal(walker.getObjectByName('actor-torso')!.visible,true);
    const hip=walker.getObjectByName('actor-left-hip')!,before=hip.rotation.x;activity.update(snap.now/1000+.1,snap);assert.notEqual(hip.rotation.x,before);
    activity.setFocus(0,400,300);activity.update(snap.now/1000+.2,snap);assert.equal(distant.visible,true);
  }finally{activity.dispose();}
});
