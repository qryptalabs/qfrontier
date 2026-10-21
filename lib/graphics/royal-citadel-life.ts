import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLivingActorLibrary,type LivingActor} from './living-actors.ts';
import {citadelWorldPoint} from './royal-citadel-layout.ts';
import {ROYAL_CITADEL_WORK_SITES,type RoyalCitadelGroundHeight} from './royal-citadel-gardens.ts';

export interface RoyalCitadelBody {readonly id:string;readonly x:number;readonly y:number;readonly z:number;readonly radius:number;readonly height:number}
export interface RoyalCitadelPose {readonly x:number;readonly y:number;readonly z:number;readonly yaw:number;readonly moving:boolean;readonly working:boolean}
export interface RoyalCitadelLife {
  readonly group:THREE.Group;
  update(elapsedSeconds:number):void;
  setFocus(x:number,y:number,z:number):void;
  colliders():readonly RoyalCitadelBody[];
  dispose():void;
}
type Waypoint={readonly x:number;readonly y:number;readonly z:number};
const ACTOR_SCALE=1.55;
const finite=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
const local=(x:number,z:number,y=1.3)=>Object.freeze(citadelWorldPoint(x,y,z));
const distance=(a:Waypoint,b:Waypoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const routeLength=(route:readonly Waypoint[])=>route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0);

/** Actual patrol footprints, on the side avenues outside the eight parterres.
 * Two guards share each loop with half a route between them; the processional
 * avenue and both gate openings remain available to the visitor. */
export function royalCitadelPatrolRoute(side:number):readonly Waypoint[]{
  const sign=side<0?-1:1;
  return Object.freeze([local(sign*9.5,47),local(sign*9.5,66),local(sign*11.7,66),local(sign*11.7,47),local(sign*9.5,47)]);
}
function sampleRoute(route:readonly Waypoint[],meters:number):RoyalCitadelPose{
  const total=routeLength(route);let left=((meters%total)+total)%total;
  for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],span=distance(a,b);if(left<=span||i===route.length-1){const t=span?Math.max(0,Math.min(1,left/span)):0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z),moving:true,working:false};}left-=span;}
  return{...route[0],yaw:0,moving:false,working:false};
}
export function royalCitadelPatrolPose(side:number,index:number,seconds:number):RoyalCitadelPose {
  const route=royalCitadelPatrolRoute(side);return sampleRoute(route,finite(seconds)*1.65+(index%2)*routeLength(route)/2);
}
/** Gardener walks between two work sites on the same clear garden path, then
 * stops to rake/prune. No arbitrary wandering cuts through flower beds. */
export function royalCitadelGardenerPose(side:number,index:number,seconds:number):RoyalCitadelPose {
  const sign=side<0?-1:1,back=index%2===0,bed=local(sign*(back?18.2:34.8),back?47.5:65),edge=77.9;
  // The garden grows with the palace, but tending one section remains a short
  // human task next to the planting, not a walk dozens of metres from it.
  const a={x:bed.x-sign*7,y:bed.y,z:bed.z+(back?edge:-edge)},b={...a,x:bed.x+sign*7},travel=distance(a,b)/1.65,work=12,period=travel*2+work*2,t=((finite(seconds)+index*7)%period+period)%period;
  if(t<travel){const u=t/travel;return{x:a.x+(b.x-a.x)*u,y:a.y,z:a.z,yaw:sign*Math.PI/2,moving:true,working:false};}
  if(t<travel+work)return{...b,yaw:back?Math.PI:0,moving:false,working:true};
  if(t<travel*2+work){const u=(t-travel-work)/travel;return{x:b.x+(a.x-b.x)*u,y:a.y,z:a.z,yaw:-sign*Math.PI/2,moving:true,working:false};}
  return{...a,yaw:back?Math.PI:0,moving:false,working:true};
}
/** The citadel's people are an authored ambient visit, separate from resource
 * production and server jobs. Every body has a height-aware collision volume.
 * All armor, tools and bodies share viewer-owned pools; far actors are baked. */
export function createRoyalCitadelLife(options:{groundHeight?:RoyalCitadelGroundHeight}={}):RoyalCitadelLife {
  const group=new THREE.Group();group.name='royal-citadel-guards-and-court-workers';
  const library=createLivingActorLibrary(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const armor=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.64,roughness:.37}),cloth=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}),unit=new THREE.BoxGeometry(1,1,1);materials.add(armor);materials.add(cloth);
  type DetailPart={color:number;x:number;y:number;z:number;w:number;h:number;d:number};
  function mesh(parts:DetailPart[],name:string,material=armor){const shapes=parts.map(part=>{const g=unit.clone().scale(part.w,part.h,part.d).translate(part.x,part.y,part.z),color=new THREE.Color(part.color),values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3)color.toArray(values,i);g.setAttribute('color',new THREE.BufferAttribute(values,3));return g;});const g=mergeGeometries(shapes,false)!;shapes.forEach(part=>part.dispose());geometries.add(g);const result=new THREE.Mesh(g,material);result.name=name;result.castShadow=true;result.receiveShadow=true;return result;}
  const part=(color:number,x:number,y:number,z:number,w:number,h:number,d:number):DetailPart=>({color,x,y,z,w,h,d});
  // Templates are cloned below the existing skeletal pivots so equipment stays
  // attached during marching and is included in the library's far-distance LOD.
  const guardCuirass=mesh([part(0x9daeb0,0,1.13,.20,.49,.49,.11),part(0x1c4b78,0,.91,.235,.39,.19,.08),part(0xddb65f,0,1.13,.27,.07,.37,.035),part(0xddb65f,0,1.17,.27,.27,.06,.035),part(0x9ba7a4,-.34,1.4,0,.26,.2,.46),part(0x9ba7a4,.34,1.4,0,.26,.2,.46)],'royal-guard-engraved-cuirass');
  const guardHelmet=mesh([part(0x91a4aa,0,.25,0,.57,.24,.51),part(0xb5c4bf,0,.38,.02,.44,.1,.4),part(0x31444d,0,.09,.235,.43,.11,.025),part(0xb1beb9,0,-.01,.245,.07,.24,.07),part(0xdfb65e,0,.25,.273,.06,.27,.035),part(0x1d5288,0,.49,-.01,.10,.23,.30),part(0x3375a7,0,.58,-.13,.12,.20,.22)],'royal-guard-plumed-visored-helmet');
  const guardCloak=mesh([part(0x1d4d7c,0,1.0,-.235,.61,.85,.10),part(0xd4ad57,0,1.40,-.25,.63,.06,.12)],'royal-guard-blue-gold-uniform',cloth);
  const guardGreaves=mesh([part(0x93a6a6,0,-.12,.135,.235,.29,.06),part(0xdbc17c,0,.02,.14,.25,.07,.06)],'royal-guard-steel-greave');
  function guard(seed:number,name:string){const actor=library.get('guard',seed),torso=actor.group.getObjectByName('actor-torso')!,head=actor.group.getObjectByName('actor-head')!;torso.add(guardCuirass.clone(),guardCloak.clone());head.add(guardHelmet.clone());for(const side of['left','right'])actor.group.getObjectByName(`actor-${side}-knee`)!.add(guardGreaves.clone());actor.group.name=name;actor.group.scale.setScalar(ACTOR_SCALE);group.add(actor.group);return actor;}
  function worker(role:'farmer'|'builder'|'worker',seed:number,name:string){const actor=library.get(role,seed);actor.group.name=name;actor.group.scale.setScalar(ACTOR_SCALE);group.add(actor.group);return actor;}
  const posts=[
    ...[-1,1].map(side=>({id:`royal-outer-gate-sentinel-${side}`,point:local(side*7.8,74),yaw:0})),
    ...[-1,1].map(side=>({id:`royal-core-gate-sentinel-${side}`,point:local(side*7.8,39.5),yaw:0})),
    ...[-1,1].map(side=>({id:`royal-inner-court-sentinel-${side}`,point:local(side*8.8,33),yaw:0})),
    ...[-1,1].map(side=>({id:`royal-vestibule-sentinel-${side}`,point:local(side*3.4,11.5,22),yaw:0})),
  ].map((post,index)=>({...post,actor:guard(index,post.id)}));
  const patrols=[-1,1].flatMap(side=>[0,1].map(index=>({side,index,actor:guard(20+index,`royal-plaza-patrol-${side}-${index}`)})));
  const gardeners=[-1,1].flatMap(side=>[0,1].map(index=>({side,index,actor:worker('farmer',index+4,`royal-garden-caretaker-${side}-${index}`)})));
  const mason=worker('builder',4,'royal-court-stonemason'),porter=worker('worker',2,'royal-court-stone-carrier'),annexGardener=worker('farmer',7,'royal-inner-garden-caretaker');
  const carriedStone=mesh([part(0xc8c0a5,0,.03,0,.55,.32,.54),part(0x968f7c,0,.2,-.05,.4,.05,.38)],'royal-artisan-carried-stone',cloth);
  const load=porter.group.getObjectByName('actor-load')!;load.clear();load.add(carriedStone);unit.dispose();
  const actors=[...posts.map(post=>post.actor),...patrols.map(patrol=>patrol.actor),...gardeners.map(gardener=>gardener.actor),mason,porter,annexGardener];
  let disposed=false,bodies:RoyalCitadelBody[]=[],focus:readonly[number,number,number]=[0,1000,0];
  const ground=(pose:RoyalCitadelPose)=>options.groundHeight?.(pose.x,pose.z)??pose.y;
  function place(actor:LivingActor,pose:RoyalCitadelPose,time:number){const y=ground(pose);actor.group.position.set(pose.x,y,pose.z);actor.group.rotation.y=pose.yaw;actor.setVisualDetail?.(Math.hypot(pose.x-focus[0],y-focus[1],pose.z-focus[2])<100);actor.animate(time,pose.moving?.85:0,pose.working);bodies.push({id:actor.group.name,x:pose.x,y,z:pose.z,radius:.8,height:3.35});}
  function update(seconds:number){
    if(disposed)return;const time=finite(seconds);bodies=[];
    posts.forEach(({actor,point,yaw})=>place(actor,{...point,yaw,moving:false,working:true},time));
    patrols.forEach(({actor,side,index})=>place(actor,royalCitadelPatrolPose(side,index,time),time));
    gardeners.forEach(({actor,side,index})=>place(actor,royalCitadelGardenerPose(side,index,time),time));
    const sites=ROYAL_CITADEL_WORK_SITES;
    place(mason,{...sites.bench,z:sites.bench.z+2.45,yaw:Math.PI,moving:false,working:true},time);
    place(annexGardener,{...sites.planter,z:sites.planter.z+2.6,yaw:Math.PI,moving:false,working:true},time);
    // Stones travel along the open east service street to the stonemason's
    // workbench; the return trip is empty and never crosses the royal stairs.
    const a={...sites.stonePile,x:sites.stonePile.x-2},b={...sites.bench,x:sites.bench.x+3.7,z:sites.bench.z+2.45},span=distance(a,b)/1.65,cycle=span*2+10,t=((time%cycle)+cycle)%cycle;
    let pose:RoyalCitadelPose;
    if(t<span){const u=t/span;pose={x:a.x+(b.x-a.x)*u,y:a.y,z:a.z+(b.z-a.z)*u,yaw:Math.atan2(b.x-a.x,b.z-a.z),moving:true,working:false};}
    else if(t<span+5)pose={...b,yaw:-Math.PI/2,moving:false,working:true};
    else if(t<span*2+5){const u=(t-span-5)/span;pose={x:b.x+(a.x-b.x)*u,y:a.y,z:b.z+(a.z-b.z)*u,yaw:Math.atan2(a.x-b.x,a.z-b.z),moving:true,working:false};}
    else pose={...a,yaw:Math.PI/2,moving:false,working:true};
    const carrying=t<span+2.5||t>=span*2+7.5;load.visible=carrying;place(porter,pose,time);
    group.userData.elapsedSeconds=time;group.userData.visualOnly=true;
  }
  group.userData.royalCitadelLife={guards:posts.length+patrols.length,gardeners:gardeners.length+1,artisans:2,simulation:false};update(0);
  return{group,update,setFocus(x,y,z){focus=[finite(x),finite(y,1000),finite(z)];},colliders:()=>bodies,dispose(){if(disposed)return;disposed=true;actors.forEach(actor=>actor.dispose());library.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());bodies=[];group.clear();group.removeFromParent();}};
}
