import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLivingActorLibrary,type LivingActor} from './living-actors.ts';
import type {RoyalCitadelBody,RoyalCitadelLife,RoyalCitadelPose} from './royal-citadel-life.ts';
import {ROYAL_INTERIOR_POSTS,ROYAL_INTERIOR_PATROLS,ROYAL_INTERIOR_SERVICE_ROUTES,royalInteriorWalkHeight} from './royal-citadel-interior-layout.ts';

export interface RoyalCitadelInteriorWaypoint {readonly x:number;readonly y:number;readonly z:number}
export interface RoyalCitadelInteriorPost extends RoyalCitadelInteriorWaypoint {readonly id:string;readonly yaw:number}
export interface RoyalCitadelInteriorRoute {readonly id:string;readonly route:readonly RoyalCitadelInteriorWaypoint[];readonly offsetMeters?:number}
export interface RoyalCitadelInteriorPeoplePlan {
  readonly posts:readonly RoyalCitadelInteriorPost[];
  readonly patrols:readonly RoyalCitadelInteriorRoute[];
  readonly serviceRoutes:readonly RoyalCitadelInteriorRoute[];
}
const DEFAULT_PLAN:RoyalCitadelInteriorPeoplePlan={posts:ROYAL_INTERIOR_POSTS,patrols:ROYAL_INTERIOR_PATROLS,serviceRoutes:ROYAL_INTERIOR_SERVICE_ROUTES};
const ACTOR_SCALE=1.55,GUARD_SPEED=1.45,SERVANT_SPEED=1.35;
const safe=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
const length=(a:RoyalCitadelInteriorWaypoint,b:RoyalCitadelInteriorWaypoint)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
const totalLength=(route:readonly RoyalCitadelInteriorWaypoint[])=>route.slice(1).reduce((sum,b,i)=>sum+length(route[i],b),0);

/** Authored polylines are measured in world metres. No interpolation takes a
 * shortcut across their corners, furniture or the walls of a grand hall. */
export function royalCitadelInteriorRoutePose(route:readonly RoyalCitadelInteriorWaypoint[],meters:number):RoyalCitadelPose {
  const total=totalLength(route),first=route[0]??{x:0,y:0,z:0};
  if(total<=1e-8)return{...first,yaw:0,moving:false,working:false};
  let left=((safe(meters)%total)+total)%total;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],span=length(a,b);if(span<=1e-8)continue;
    if(left<=span||i===route.length-1){const t=Math.min(1,Math.max(0,left/span));return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z),moving:true,working:false};}left-=span;
  }
  return{...first,yaw:0,moving:false,working:false};
}

/** The inhabited royal interior is visual ambient life, never an economic
 * job. The architecture supplies each post and route. Human equipment and
 * collision bodies never inherit the monumental castle's thirtyfold scale. */
export function createRoyalCitadelInteriorLife(options:{plan?:RoyalCitadelInteriorPeoplePlan;groundHeight?:(x:number,z:number,referenceY?:number)=>number|null}={}):RoyalCitadelLife {
  const group=new THREE.Group();group.name='royal-citadel-interior-royal-guard-and-attendants';
  const library=createLivingActorLibrary(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const armor=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.78,roughness:.28}),cloth=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86}),porcelain=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.3}),amber=new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xfbb85e,emissiveIntensity:.7,roughness:.3});
  for(const m of[armor,cloth,porcelain,amber])materials.add(m);
  const unit=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  type Piece={source:THREE.BufferGeometry;color:number;x:number;y:number;z:number;w:number;h:number;d:number;rx:number;ry:number;rz:number};
  const part=(color:number,x:number,y:number,z:number,w:number,h:number,d:number,rz=0):Piece=>({source:unit,color,x,y,z,w,h,d,rx:0,ry:0,rz});
  function mesh(parts:Piece[],name:string,material=armor){
    const shapes=parts.map(part=>{const g=part.source.index?part.source.toNonIndexed():part.source.clone();matrix.compose(position.set(part.x,part.y,part.z),q.setFromEuler(new THREE.Euler(part.rx,part.ry,part.rz)),scale.set(part.w,part.h,part.d));g.applyMatrix4(matrix);
      for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);if(!g.attributes.normal)g.computeVertexNormals();const color=new THREE.Color(part.color),values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3)color.toArray(values,i);g.setAttribute('color',new THREE.BufferAttribute(values,3));return g;});
    const geometry=mergeGeometries(shapes,false)!;shapes.forEach(part=>part.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.add(geometry);const result=new THREE.Mesh(geometry,material);result.name=name;result.castShadow=true;result.receiveShadow=true;return result;
  }
  const steel=0xb3c2c9,edge=0xd8dfdb,shadow=0x687c88,gold=0xe3bd63,blue=0x173f77,lightBlue=0x2b64a6,white=0xe4dfc8;
  const torso=mesh([
    part(steel,0,1.15,.19,.53,.49,.15),part(shadow,0,.86,.16,.58,.12,.16),part(gold,0,.89,.254,.5,.04,.035),
    part(edge,0,1.35,.20,.48,.07,.18),part(gold,0,1.13,.28,.045,.37,.025),part(gold,0,1.19,.28,.33,.045,.025),
    ...[-1,1].flatMap(sign=>[part(gold,sign*.12,1.08,.28,.035,.16,.025,-sign*.6),part(edge,sign*.19,.98,.26,.09,.04,.035),part(gold,sign*.245,1.2,.27,.025,.27,.035)]),
    ...[-1,1].map(sign=>part(steel,sign*.19,.73,.2,.22,.21,.12,-sign*.09)),part(gold,0,.8,.28,.13,.1,.04),
  ],'royal-interior-guard-gilded-steel-cuirass');
  const cape=mesh([
    part(blue,0,1.02,-.25,.65,.87,.09),part(blue,-.26,.72,-.26,.2,.39,.08,-.04),part(blue,.26,.72,-.26,.2,.39,.08,.04),
    part(gold,0,1.42,-.27,.69,.055,.11),part(gold,-.29,.96,-.31,.035,.81,.025),part(gold,.29,.96,-.31,.035,.81,.025),part(gold,0,.59,-.31,.62,.045,.025),
    part(lightBlue,0,1.16,-.31,.13,.31,.025),part(gold,0,1.18,-.33,.045,.27,.02),
  ],'royal-interior-guard-blue-gold-ceremonial-cape',cloth);
  const helmet=mesh([
    part(steel,0,.25,-.015,.59,.26,.53),part(edge,0,.40,-.025,.45,.09,.42),part(shadow,0,.10,.263,.48,.12,.025),
    part(steel,0,-.025,.27,.49,.12,.065),part(gold,0,.13,.3,.048,.39,.035),part(edge,-.25,.05,.04,.085,.39,.42),part(edge,.25,.05,.04,.085,.39,.42),
    ...[-1,1].map(sign=>part(gold,sign*.19,.23,.3,.025,.17,.025)),part(gold,0,.42,.0,.11,.065,.4),
    ...Array.from({length:7},(_,i)=>part(i%2?lightBlue:blue,0,.54+Math.sin(i*Math.PI/6)*.14,.14-i*.065,.105,.20,.075,-.08)),
    part(gold,0,.48,.12,.12,.07,.12),
  ],'royal-interior-guard-plumed-great-helm');
  const pauldron=mesh([part(steel,0,-.02,.0,.30,.23,.48),part(edge,0,.065,.0,.32,.055,.5),part(gold,0,-.12,.21,.3,.04,.035),part(gold,0,.08,.0,.055,.04,.46)],'royal-interior-guard-gilded-pauldron');
  const greave=mesh([part(steel,0,-.13,.14,.245,.32,.075),part(edge,0,.02,.14,.27,.095,.12),part(gold,0,-.1,.19,.04,.27,.025),part(gold,0,.02,.21,.23,.035,.025)],'royal-interior-guard-articulated-greave');
  const glove=mesh([part(steel,0,-.16,.02,.22,.29,.26),part(edge,0,-.32,.03,.23,.13,.27),part(gold,0,-.025,.13,.23,.035,.025)],'royal-interior-guard-steel-gauntlet');
  const shield=mesh([
    part(shadow,-.10,-.18,.24,.63,.78,.09),part(blue,-.10,-.17,.3,.55,.67,.045),part(gold,-.10,.18,.33,.61,.045,.035),part(gold,-.38,-.16,.33,.035,.66,.035),part(gold,.18,-.16,.33,.035,.66,.035),
    part(gold,-.10,-.52,.33,.40,.045,.035),part(gold,-.10,-.17,.34,.065,.49,.035),part(gold,-.10,-.16,.34,.31,.06,.035),
    part(gold,-.19,-.32,.34,.05,.19,.035,-.45),part(gold,-.01,-.32,.34,.05,.19,.035,.45),part(edge,-.10,-.14,.37,.10,.10,.035),
  ],'royal-interior-guard-sun-emblem-shield');
  const spearPieces=[part(0x69513a,.03,.40,.10,.065,2.65,.065),part(gold,.03,-.70,.10,.095,.15,.095),part(steel,.03,1.63,.10,.12,.18,.11),part(gold,.03,1.75,.10,.20,.055,.12),part(edge,.03,1.94,.10,.055,.34,.055)];
  for(const sign of[-1,1])spearPieces.push(part(steel,.03+sign*.055,1.9,.1,.055,.24,.05,sign*.28));
  const spear=mesh(spearPieces,'royal-interior-guard-gilded-spear');
  const livery=mesh([part(blue,0,1.08,.18,.57,.58,.055),part(white,0,.89,.22,.43,.29,.04),part(gold,0,1.35,.22,.56,.045,.03),part(gold,0,.8,.25,.58,.06,.04),part(gold,0,1.12,.22,.055,.26,.025)],'royal-interior-attendant-royal-livery',cloth);
  const tray=mesh([part(gold,0,-.10,0,.68,.045,.46),part(gold,0,-.075,-.23,.7,.065,.025),part(gold,0,-.075,.23,.7,.065,.025),part(gold,-.34,-.075,0,.025,.065,.46),part(gold,.34,-.075,0,.025,.065,.46)],'royal-interior-attendant-golden-serving-tray');
  const service=mesh([part(white,-.17,.01,.0,.18,.19,.18),part(white,.17,.01,.0,.18,.19,.18),part(gold,-.17,.12,.0,.19,.025,.19),part(gold,.17,.12,.0,.19,.025,.19),part(white,0,-.055,.05,.16,.055,.20)],'royal-interior-attendant-porcelain-and-goblets',porcelain);
  const lantern=mesh([part(gold,0,-.12,0,.32,.055,.28),part(gold,0,.22,0,.34,.07,.3),...[-1,1].flatMap(x=>[-1,1].map(z=>part(gold,x*.14,.05,z*.12,.035,.34,.035))),part(gold,-.12,.32,0,.035,.18,.05),part(gold,.12,.32,0,.035,.18,.05),part(gold,0,.4,0,.27,.035,.05)],'royal-interior-attendant-brass-lantern');
  const flame=mesh([part(0xffce79,0,.05,0,.24,.25,.20)],'royal-interior-attendant-lantern-glass',amber);
  unit.dispose();
  function guard(seed:number,id:string){
    const actor=library.get('guard',seed%2),body=actor.group.getObjectByName('actor-torso')!,head=actor.group.getObjectByName('actor-head')!;
    body.add(torso.clone(),cape.clone());head.add(helmet.clone());for(const side of['left','right']){actor.group.getObjectByName(`actor-${side}-shoulder`)!.add(pauldron.clone());actor.group.getObjectByName(`actor-${side}-knee`)!.add(greave.clone());actor.group.getObjectByName(`actor-${side}-forearm`)!.visible=false;actor.group.getObjectByName(`actor-${side}-elbow`)!.add(glove.clone(),(side==='left'?shield:spear).clone());}
    actor.group.scale.setScalar(ACTOR_SCALE);actor.group.name=id;group.add(actor.group);return actor;
  }
  function attendant(seed:number,id:string){const actor=library.get('worker',seed%2+2);actor.group.getObjectByName('actor-torso')!.add(livery.clone());const load=actor.group.getObjectByName('actor-load')!;load.clear();load.add(...(id.includes('lamp')?[lantern.clone(),flame.clone()]:[tray.clone(),service.clone()]));actor.group.scale.setScalar(ACTOR_SCALE);actor.group.name=id;group.add(actor.group);return actor;}
  const plan=options.plan??DEFAULT_PLAN;
  const posts=plan.posts.map((post,i)=>({post,actor:guard(i,post.id)}));
  const patrols=plan.patrols.map((route,i)=>({route,actor:guard(i,route.id)}));
  const servants=plan.serviceRoutes.map((route,i)=>({route,actor:attendant(i,route.id)}));
  const actors=[...posts.map(p=>p.actor),...patrols.map(p=>p.actor),...servants.map(p=>p.actor)];
  let disposed=false,bodies:RoyalCitadelBody[]=[],focus:readonly[number,number,number]=[0,1e8,0];
  function place(actor:LivingActor,pose:RoyalCitadelPose,seconds:number){const floor=options.groundHeight??royalInteriorWalkHeight,y=floor(pose.x,pose.z,pose.y)??pose.y;actor.group.position.set(pose.x,y,pose.z);actor.group.rotation.y=pose.yaw;actor.setVisualDetail?.(Math.hypot(pose.x-focus[0],y-focus[1],pose.z-focus[2])<95);actor.animate(seconds,pose.moving?.8:0,pose.working);bodies.push({id:actor.group.name,x:pose.x,y,z:pose.z,radius:.82,height:3.9});}
  function update(seconds:number){
    if(disposed)return;const time=safe(seconds);bodies=[];
    posts.forEach(({post,actor})=>place(actor,{...post,moving:false,working:false},time));
    patrols.forEach(({route,actor})=>place(actor,royalCitadelInteriorRoutePose(route.route,time*GUARD_SPEED+(route.offsetMeters??0)),time));
    servants.forEach(({route,actor})=>{const pathLength=totalLength(route.route),travel=pathLength/SERVANT_SPEED,period=travel+8,t=((time+(route.offsetMeters??0)/SERVANT_SPEED)%period+period)%period,pose=royalCitadelInteriorRoutePose(route.route,Math.min(t,travel)*SERVANT_SPEED);place(actor,t<travel?pose:{...pose,moving:false,working:true},time);});
    group.userData.elapsedSeconds=time;
  }
  group.userData.royalCitadelInteriorLife={guards:posts.length+patrols.length,attendants:servants.length,simulation:false,actorScale:ACTOR_SCALE};group.userData.visualOnly=true;update(0);
  return{group,update,setFocus(x,y,z){focus=[safe(x),safe(y,1e8),safe(z)];},colliders:()=>bodies,dispose(){if(disposed)return;disposed=true;actors.forEach(actor=>actor.dispose());library.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());bodies=[];group.clear();group.removeFromParent();}};
}
