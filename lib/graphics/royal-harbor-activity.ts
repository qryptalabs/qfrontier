import * as THREE from 'three';
import type {RoyalHarborSnapshot} from '../mvp/royal-harbor.ts';
import {createFishingModelLibrary} from './fishing-community-models.ts';
import {royalQuayLane,royalRiverEdge} from './royal-harbor-layout.ts';

export interface RoyalHarborPoint {readonly x:number;readonly z:number}
export interface RoyalHarborPose extends RoyalHarborPoint {readonly yaw:number;readonly moving:boolean}
export interface RoyalHarborBody extends RoyalHarborPoint {readonly id:string;readonly radius:number}
export interface RoyalHarborActivity {
  readonly group:THREE.Group;
  /** UTC seconds, extrapolated from the last authenticated server clock. At the
   * next phase boundary movement waits for another authoritative snapshot. */
  update(utcSeconds:number,snapshot:RoyalHarborSnapshot|null):void;
  /** Nearby walkers retain moving joints; the aerial panorama uses one baked
   * mesh per distant pedestrian. Coordinates are the actual camera position. */
  setFocus(x:number,y:number,z:number):void;
  colliders():readonly RoyalHarborBody[];
  dispose():void;
}
const GROUND=4.3,DOCK_Z=220,MARKET_Z=30,ACTOR_SCALE=1.5,CART_SCALE=2,BOAT_SCALE=3;
const edge=royalRiverEdge(DOCK_Z),berth=Object.freeze({x:edge-36,z:DOCK_Z});
const point=(x:number,z:number):RoyalHarborPoint=>Object.freeze({x,z});
/** Coordinates also used by the authored pier, loading yard and quay paving.
 * The fleet stays east of the central galleons. Freight follows the curved
 * east-bank road; there is no straight-line cut across the river. */
export const ROYAL_FISHING_ROUTE:readonly RoyalHarborPoint[]=Object.freeze([
  berth,point(edge-30,245),point(86,280),point(84,360),point(35,460),point(0,550),
]);
const cartRoad:RoyalHarborPoint[]=[point(edge+22,209),point(royalQuayLane(203),203)];
for(let z=197;z>=41;z-=6)cartRoad.push(point(royalQuayLane(z),z));
cartRoad.push(point(royalQuayLane(36),36),point(royalRiverEdge(MARKET_Z)+22,MARKET_Z));
export const ROYAL_FREIGHT_ROUTE:readonly RoyalHarborPoint[]=Object.freeze(cartRoad);
const lengthOf=(a:RoyalHarborPoint,b:RoyalHarborPoint)=>Math.hypot(b.x-a.x,b.z-a.z);
const totalLength=(route:readonly RoyalHarborPoint[])=>route.slice(1).reduce((sum,p,i)=>sum+lengthOf(route[i],p),0);
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const finite=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;

/** Arc-length interpolation gives continuous velocity through route segments.
 * Heading blends at bends while every position remains on the real road. */
export function sampleRoyalHarborRoute(route:readonly RoyalHarborPoint[],progress:number):RoyalHarborPose {
  if(!route.length)return{x:0,z:0,yaw:0,moving:false};
  if(route.length===1)return{...route[0],yaw:0,moving:false};
  const t=clamp(finite(progress)),length=totalLength(route);let distance=t*length;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],span=lengthOf(a,b);
    if(distance<=span||i===route.length-1){
      const u=span>0?clamp(distance/span):0,dx=b.x-a.x,dz=b.z-a.z;
      return{x:a.x+dx*u,z:a.z+dz*u,yaw:Math.atan2(dx,dz),moving:t>0&&t<1&&length>0};
    }
    distance-=span;
  }
  return{...route.at(-1)!,yaw:0,moving:false};
}
const reverse=(route:readonly RoyalHarborPoint[])=>[...route].reverse();
const returningBoat=reverse(ROYAL_FISHING_ROUTE),returningCart=reverse(ROYAL_FREIGHT_ROUTE);
/** A visual projection only. No timer settles jobs or creates goods. Clamping
 * prevents stale client clocks showing a catch/delivery before the server. */
export function royalHarborVisualClock(snapshot:RoyalHarborSnapshot|null,utcSeconds:number){
  if(!snapshot||!snapshot.available)return null;
  const end=Math.max(snapshot.now,finite(snapshot.cycle.nextTransitionAt,snapshot.now));
  return clamp(finite(utcSeconds,snapshot.now/1000)*1000,snapshot.now,end);
}
export function royalHarborFleetPose(snapshot:RoyalHarborSnapshot|null,utcSeconds:number){
  const now=royalHarborVisualClock(snapshot,utcSeconds),cycle=snapshot?.cycle;
  const elapsed=now!==null&&cycle?Math.max(0,(now-cycle.startsAt)/1000):0;
  const phase=cycle?.phase??'idle',active=!!snapshot?.available&&phase!=='idle';
  let boat:RoyalHarborPose={...berth,yaw:0,moving:false};
  if(active&&phase==='outbound')boat=sampleRoyalHarborRoute(ROYAL_FISHING_ROUTE,elapsed/16);
  else if(active&&phase==='fishing')boat={...ROYAL_FISHING_ROUTE.at(-1)!,yaw:-.35,moving:false};
  else if(active&&phase==='returning')boat=sampleRoyalHarborRoute(returningBoat,(elapsed-40)/20);
  let cart:RoyalHarborPose={...ROYAL_FREIGHT_ROUTE[0],yaw:Math.PI,moving:false};
  if(active&&elapsed<40)cart=sampleRoyalHarborRoute(returningCart,elapsed/40);
  else if(active&&phase==='transporting')cart=sampleRoyalHarborRoute(ROYAL_FREIGHT_ROUTE,(elapsed-88)/24);
  else if(active&&phase==='market')cart={...ROYAL_FREIGHT_ROUTE.at(-1)!,yaw:Math.PI,moving:false};
  return{boat,cart,phase,elapsed,now,active};
}

/** Two pedestrians use separated return lanes and never cross the freight
 * connector. Four equally spaced residents share each closed promenade. */
export function royalResidentRoute(side:number,far:boolean):readonly RoyalHarborPoint[]{
  const from=far?250:60,to=far?330:175,result:RoyalHarborPoint[]=[];
  for(let z=from;z<=to;z+=5)result.push(point(side*(royalRiverEdge(z)+5.5),z));
  for(let z=to;z>=from;z-=5)result.push(point(side*(royalRiverEdge(z)+8.5),z));
  result.push(result[0]);return result;
}
export function royalResidentPose(side:number,far:boolean,index:number,seconds:number):RoyalHarborPose {
  const route=royalResidentRoute(side,far),length=totalLength(route),distance=finite(seconds)*2.15+index*length/4;
  return sampleRoyalHarborRoute(route,((distance%length+length)%length)/length);
}
const unitCrates=(units:number)=>clamp(Math.ceil(Math.max(0,finite(units))/2),0,6);

/** Viewer-owned articulated workers, animal-drawn freight and a real fishing
 * vessel. Ambient residents are low-cost baked bodies; workers near cargo keep
 * their articulated hands, legs, fishing net, load and harness. */
export function createRoyalHarborActivity():RoyalHarborActivity {
  const group=new THREE.Group();group.name='royal-harbor-server-projected-activity';
  const library=createFishingModelLibrary('coast'),boat=library.boat('royal-harbor-fishers'),cart=library.haulage('horse',17);
  boat.group.name='royal-working-fishing-boat';boat.group.scale.setScalar(BOAT_SCALE);
  cart.group.name='royal-fish-cart-with-horse-and-driver';cart.group.scale.setScalar(CART_SCALE);group.add(boat.group,cart.group);
  const porters=[0,1].map(index=>{const actor=library.worker('porter',`royal-porter-${index}`);actor.group.name=`royal-port-worker-${index}`;actor.group.scale.setScalar(ACTOR_SCALE);group.add(actor.group);return actor;});
  const merchant=library.worker('merchant','royal-fishmonger');merchant.group.name='royal-working-fishmonger';merchant.group.scale.setScalar(ACTOR_SCALE);merchant.group.position.set(royalRiverEdge(MARKET_Z)+29,GROUND,MARKET_Z);merchant.group.rotation.y=-Math.PI/2;group.add(merchant.group);
  const residents=[-1,1].flatMap(side=>[false,true].flatMap(far=>[0,1,2,3].map(index=>{const actor=library.worker('worker',`royal-resident-${side}-${far}-${index}`);actor.group.name=`royal-resident-${side}-${far}-${index}`;actor.group.scale.setScalar(ACTOR_SCALE);group.add(actor.group);return{actor,side,far,index};})));
  const stores=[{name:'royal-warehouse-confirmed-fish',x:edge+29,z:226,stock:'warehouse'as const},{name:'royal-market-confirmed-fish',x:royalRiverEdge(MARKET_Z)+31,z:36,stock:'market'as const}].map(store=>{
    const node=new THREE.Group();node.name=store.name;const crates=Array.from({length:12},(_,index)=>{const crate=library.get('crate',index);crate.scale.setScalar(2);crate.position.set((index%3-1)*1.8,Math.floor(index/6)*1.2,Math.floor(index%6/3)*1.8);node.add(crate);return crate;});node.position.set(store.x,GROUND,store.z);group.add(node);return{...store,node,crates};
  });
  const foamGeometry=new THREE.PlaneGeometry(1,1);foamGeometry.rotateX(-Math.PI/2);const foamMaterial=new THREE.MeshBasicMaterial({color:0xe6f7ef,transparent:true,opacity:.42,depthWrite:false});
  const wake=new THREE.InstancedMesh(foamGeometry,foamMaterial,24);wake.name='royal-fishing-boat-trailing-wake';wake.count=0;wake.frustumCulled=false;group.add(wake);const dummy=new THREE.Object3D();
  const birdGeometry=new THREE.BoxGeometry(1,1,1),birdMaterial=new THREE.MeshStandardMaterial({color:0xe9e8d5,roughness:1});
  const birds=Array.from({length:4},(_,i)=>{const node=new THREE.Group();node.name=`royal-harbor-gull-${i}`;const body=new THREE.Mesh(birdGeometry,birdMaterial),left=new THREE.Mesh(birdGeometry,birdMaterial),right=new THREE.Mesh(birdGeometry,birdMaterial);body.scale.set(.22,.23,.65);left.scale.set(1.1,.045,.25);right.scale.copy(left.scale);left.position.x=-.55;right.position.x=.55;node.add(body,left,right);group.add(node);return{node,left,right};});
  let disposed=false,bodies:RoyalHarborBody[]=[],focus:readonly[number,number,number]=[0,1000,0];
  const nearFocus=(x:number,y:number,z:number)=>Math.hypot(x-focus[0],y-focus[1],z-focus[2])<95;
  function update(utcSeconds:number,snapshot:RoyalHarborSnapshot|null){
    if(disposed)return;const state=royalHarborFleetPose(snapshot,utcSeconds),visual=state.now===null?0:state.now/1000;
    const setPose=(object:THREE.Group,pose:RoyalHarborPose,height:number)=>{object.position.set(pose.x,height,pose.z);object.rotation.y=pose.yaw;};
    setPose(boat.group,state.boat,.16+(state.active?Math.sin(visual*.9)*.11:0));boat.group.rotation.z=state.active?Math.sin(visual*.76)*.012:0;
    const boatSpeed=state.boat.moving?totalLength(ROYAL_FISHING_ROUTE)/(state.phase==='outbound'?16:20):0;
    boat.animate({time:visual,speed:boatSpeed/BOAT_SCALE,state:state.phase,cargo:unitCrates(snapshot?.stock.ship??0),wind:state.active?1:0});
    setPose(cart.group,state.cart,GROUND);cart.animate({time:visual,speed:state.cart.moving?totalLength(ROYAL_FREIGHT_ROUTE)/(state.phase==='transporting'?24:40)/CART_SCALE:0,cargo:unitCrates(snapshot?.stock.cart??0)});
    bodies=[{id:cart.group.name,x:state.cart.x-Math.sin(state.cart.yaw)*1.2,z:state.cart.z-Math.cos(state.cart.yaw)*1.2,radius:2.7},{id:`${cart.group.name}-animal`,x:state.cart.x+Math.sin(state.cart.yaw)*6.8,z:state.cart.z+Math.cos(state.cart.yaw)*6.8,radius:2.3},{id:merchant.group.name,x:merchant.group.position.x,z:merchant.group.position.z,radius:.9}];
    let carried=0;
    porters.forEach((actor,index)=>{
      const z=DOCK_Z+(index?1:-1),pickup=point(edge-18,z),staging=point(edge-7,z),store=point(edge+30,z);
      let pose:RoyalHarborPose={...pickup,yaw:Math.PI/2,moving:false},carrying=false;
      if(state.active&&state.phase==='unloading'){pose=sampleRoyalHarborRoute([pickup,staging],(state.elapsed-66)/6);carrying=!!snapshot?.stock.ship;}
      else if(state.active&&state.phase==='warehousing'){pose=sampleRoyalHarborRoute([staging,store],(state.elapsed-72)/16);carrying=!!snapshot?.stock.warehouse;}
      else if(state.active&&state.phase==='transporting')pose=sampleRoyalHarborRoute([store,staging,pickup],(state.elapsed-88)/24);
      if(carrying)carried+=2;
      setPose(actor.group,pose,pose.x<=edge?4.5:GROUND);const load=actor.group.getObjectByName('actor-load');if(load)load.visible=carrying;
      actor.setVisualDetail?.(nearFocus(pose.x,GROUND,pose.z));actor.animate(visual,pose.moving?1:0,state.phase==='unloading'&&!pose.moving);bodies.push({id:actor.group.name,x:pose.x,z:pose.z,radius:.9});
    });
    residents.forEach(({actor,side,far,index})=>{const pose=royalResidentPose(side,far,index,state.active?visual:0);setPose(actor.group,pose,GROUND);actor.setVisualDetail?.(nearFocus(pose.x,GROUND,pose.z));actor.animate(visual,state.active?.85:0,false);bodies.push({id:actor.group.name,x:pose.x,z:pose.z,radius:.8});});
    merchant.setVisualDetail?.(nearFocus(merchant.group.position.x,GROUND,merchant.group.position.z));merchant.animate(visual,false,state.active&&state.phase==='market');
    stores.forEach(store=>{const units=Math.max(0,(snapshot?.stock[store.stock]??0)-(store.stock==='warehouse'&&state.phase==='warehousing'?carried:0)),count=Math.min(store.crates.length,Math.ceil(units/2));store.crates.forEach((crate,index)=>crate.visible=index<count);store.node.userData.confirmedUnits=snapshot?.stock[store.stock]??0;});
    wake.count=state.boat.moving?24:0;
    for(let i=0;i<wake.count;i++){const distance=5+i*1.2,drift=(visual*.8+i*.21)%1;dummy.position.set(state.boat.x-Math.sin(state.boat.yaw)*distance,.07,state.boat.z-Math.cos(state.boat.yaw)*distance);dummy.rotation.set(0,state.boat.yaw+Math.sin(i*3)*.1,0);dummy.scale.set(1.5+i*.16+drift,.8,.35+i*.022);dummy.updateMatrix();wake.setMatrixAt(i,dummy.matrix);}wake.instanceMatrix.needsUpdate=true;
    birds.forEach((bird,index)=>{const angle=visual*.13+index*1.7;bird.node.position.set(edge-24+Math.cos(angle)*(20+index*5),26+index*2+Math.sin(angle*2),DOCK_Z+Math.sin(angle)*(25+index*4));bird.node.rotation.y=-angle;bird.left.rotation.z=state.active?Math.sin(visual*4+index)*.38:0;bird.right.rotation.z=-bird.left.rotation.z;});
    group.userData.serverPhase=state.phase;group.userData.serverClock=state.now;group.userData.confirmedCargo={ship:snapshot?.stock.ship??0,warehouse:snapshot?.stock.warehouse??0,cart:snapshot?.stock.cart??0,market:snapshot?.stock.market??0};
  }
  update(0,null);
  return{group,update,setFocus(x,y,z){focus=[finite(x),finite(y,1000),finite(z)];},colliders:()=>bodies,dispose(){if(disposed)return;disposed=true;boat.dispose();cart.dispose();porters.forEach(actor=>actor.dispose());merchant.dispose();residents.forEach(({actor})=>actor.dispose());wake.dispose();foamGeometry.dispose();foamMaterial.dispose();birdGeometry.dispose();birdMaterial.dispose();library.dispose();bodies=[];group.clear();group.removeFromParent();}};
}
