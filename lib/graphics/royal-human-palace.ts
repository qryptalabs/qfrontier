import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createLivingActorLibrary} from './living-actors.ts';
import {HUMAN_ROOMS,HUMAN_INTERIOR_STAIRS as S,HUMAN_TOWER as T,HUMAN_INTERIOR_THRONE,HUMAN_INTERIOR_LOOKOUT,humanTowerPoint,ROYAL_PORT_OFFSET,ROYAL_COURT_Y} from './royal-proportions.ts';
import {royalPalaceStructure} from './royal-palace-structure.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {ROYAL_CLERK,ROYAL_REPAIR,royalWorkPose} from './royal-worksite.ts';
/** Human-size fit-out inside the unchanged castle silhouette. Rooms have real
 * headroom; lamps, seats, guards, doors and rails are NOT miniature scenery. */
export function createHumanRoyalPalace(){
 const group=new THREE.Group();group.name='shared-world-royal-palace-interior';group.position.z=ROYAL_PORT_OFFSET;
 const parts=new Map<number,THREE.BufferGeometry[]>(),geometry=new Set<THREE.BufferGeometry>(),materials:THREE.MeshStandardMaterial[]=[],obstacles:RoyalObstacle[]=[],unit=new THREE.BoxGeometry(1,1,1),lights:THREE.PointLight[]=[];
 const gold=0xd8b362,ivory=0xded5bd,wood=0x64432d,blue=0x17466d;
 function add(g:THREE.BufferGeometry,color:number){const list=parts.get(color)??[];list.push(g);parts.set(color,list);}
 function box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,yaw=0){const g=unit.clone();g.scale(w,h,d);g.rotateY(yaw);g.translate(x,y,z);add(g,color);}
 function ball(x:number,y:number,z:number,r:number,color:number){const g=new THREE.SphereGeometry(r,8,6);g.translate(x,y,z);add(g,color);}
 function solid(x:number,z:number,w:number,d:number,y:number,h:number){obstacles.push({x,z,halfWidth:w/2,halfDepth:d/2,minY:y,maxY:y+h});}
 function rail(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},height=.95){const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),length=delta.length(),g=unit.clone();g.scale(.065,.065,length);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2+height,(a.z+b.z)/2);add(g,gold);const count=Math.ceil(length/.75);for(let i=0;i<=count;i++){const t=i/count;box(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t+height/2,a.z+(b.z-a.z)*t,.055,height,.055,gold);}}
 const structure=royalPalaceStructure(),cameraObstacles:RoyalObstacle[]=[];
 for(const part of structure){
  box(part.x,part.y+part.height/2,part.z,part.halfWidth*2,part.height,part.halfDepth*2,part.finish==='ceiling'?0x8b7450:part.finish==='floor'?0xbeb8a5:ivory);
  cameraObstacles.push(part);if(part.finish==='wall')obstacles.push(part);
  if(part.finish==='wall'){box(part.x,part.y+.15,part.z,part.halfWidth*2+.025,.3,part.halfDepth*2+.025,0xaba18a);box(part.x,part.maxY!-.18,part.z,part.halfWidth*2+.04,.12,part.halfDepth*2+.04,gold);}
 }
 const F=HUMAN_ROOMS[0].y,U=HUMAN_INTERIOR_THRONE.y;
 // Marble courses, embroidered runners and gold edging use the actual room floor.
 for(const r of HUMAN_ROOMS){const w=r.maxX-r.minX,d=r.maxZ-r.minZ,cx=(r.minX+r.maxX)/2,cz=(r.minZ+r.maxZ)/2;
  for(let x=r.minX+.4;x<r.maxX;x+=.8)for(let z=r.minZ+.4;z<r.maxZ;z+=.8){if(x>S.minX&&x<S.maxX&&z>S.minZ&&z<S.maxZ)continue;if(HUMAN_ROOMS.some(o=>o!==r&&o.y===r.y&&HUMAN_ROOMS.indexOf(o)<HUMAN_ROOMS.indexOf(r)&&x>=o.minX&&x<=o.maxX&&z>=o.minZ&&z<=o.maxZ))continue;box(x,r.y+.003,z,Math.min(.79,r.maxX-x+.39),.006,Math.min(.79,r.maxZ-z+.39),(Math.round(x/.8)+Math.round(z/.8))%2?ivory:0xb5ae9a);}
  if(w>=8&&d>=8){const carpetWidth=r.id==='throne'?4:3.2;
   const carpetCenter=r.id==='reception'?-122.8:cz,carpetDepth=r.id==='reception'?2.4:d-1;
   box(cx,r.y+.015,carpetCenter,carpetWidth,.024,carpetDepth,r.id==='throne'?blue:0x702c3a);
   for(const sign of[-1,1]){box(cx+sign*(carpetWidth/2-.08),r.y+.03,carpetCenter,.06,.012,carpetDepth-.1,gold);box(cx+sign*(carpetWidth/2-.18),r.y+.031,carpetCenter,.025,.012,carpetDepth-.2,0xb5924a);}
   for(let z=carpetCenter-carpetDepth/2+.5;z<carpetCenter+carpetDepth/2-.4;z+=1.2){box(cx,r.y+.033,z,.16,.012,.16,gold,Math.PI/4);for(const sign of[-1,1])box(cx+sign*(carpetWidth/2-.35),r.y+.033,z,.12,.012,.12,gold,Math.PI/4);}
   for(const sign of[-1,1])for(let i=0;i<14;i++)box(cx-carpetWidth/2+(i+.5)*carpetWidth/14,r.y+.02,carpetCenter+sign*(carpetDepth/2+.07),.035,.016,.16,gold);
  }
  if(w>=8&&d>=8){const count=r.id==='throne'?3:1;for(let c=0;c<count;c++){const z=count===1?cz:r.minZ+5+c*10,ly=r.y+r.ceiling-1.8;
   box(cx,r.y+r.ceiling-.5,z,.08,1,.08,gold);const ring=new THREE.TorusGeometry(1.35,.06,6,28);ring.rotateX(Math.PI/2);ring.translate(cx,ly,z);add(ring,gold);
   for(let i=0;i<12;i++){const x=cx+Math.cos(i*Math.PI/6)*1.35,zz=z+Math.sin(i*Math.PI/6)*1.35;box(x,ly+.2,zz,.09,.4,.09,0xf5e7bc);ball(x,ly+.43,zz,.07,0xffc568);}
   const light=new THREE.PointLight(0xffd9aa,65,24,2);light.position.set(cx,ly-.4,z);group.add(light);lights.push(light);
  }}
 }
 // Full-depth 30 cm treads and a continuous gilt handrail share the stair plan.
 for(const z of[S.minZ-.06,S.maxZ+.06]){rail({x:S.minX,y:S.startY,z},{x:S.maxX,y:S.endY,z});for(let i=0;i<32;i++){const x=S.minX+(i+.5)/32*(S.maxX-S.minX),y=S.startY+(i+.5)/32*(S.endY-S.startY);solid(x,z,.3,.08,y,.98);}}
 for(let i=0;i<S.steps;i++){const x=S.minX+(i+.5)/S.steps*(S.maxX-S.minX),y=S.startY+(i+1)/S.steps*(S.endY-S.startY);box(x,y+.006,(S.minZ+S.maxZ)/2,(S.maxX-S.minX)/S.steps-.02,.012,2.3,0x702c3a);for(const sign of[-1,1])box(x,y+.014,(S.minZ+S.maxZ)/2+sign*1.12,.28,.012,.04,gold);}
 rail({x:1.2,y:U,z:-124},{x:6,y:U,z:-124});rail({x:6,y:U,z:-124},{x:6,y:U,z:-130});solid(3.6,-124,4.8,.08,U,1);solid(6,-127,.08,6,U,1);
 // Carved doors stand open beside generous portals rather than blocking the route.
 for(const [z,y]of[[-121.5,F],[-134,U]])for(const side of[-1,1]){
  box(side*2.7,y+2.5,z,.3,5,.42,wood);box(side*2.85,y+2.4,z-.95,.16,4.8,1.8,wood);solid(side*2.85,z-.95,.18,1.8,y,4.8);
  for(const band of[.3,1.2,2.3,3.4,4.5])box(side*2.85,y+band,z-.95,.19,.055,1.82,gold);
  for(const panel of[1.2,3.5])box(side*2.96,y+panel,z-.95,.06,1.4,1.4,0x865f39);ball(side*2.95,y+2.25,z-.55,.07,gold);
 }
 // Raised royal dais, carved throne and tall embroidered heraldic banners.
 const z=-160.5;box(0,U+.12,z,6,.24,4.6,ivory);box(0,U+.56,z,1.9,.24,1.3,wood);box(0,U+.73,z+.1,1.65,.18,1.1,blue);box(0,U+2.25,z-.52,2,3.8,.22,wood);box(0,U+2.2,z-.38,1.7,3.4,.1,blue);
 for(const side of[-1,1]){box(side*1.02,U+2.2,z-.5,.16,4.3,.25,gold);box(side*.99,U+1.12,z,.16,.8,1.3,gold);ball(side*.99,U+1.6,z+.4,.15,gold);}
 for(let i=-2;i<=2;i++)ball(i*.29,U+4.45+Math.abs(i)*.09,z-.5,.12,gold);solid(0,z,2.3,1.6,U,4.8);
 for(let row=0;row<7;row++)for(let col=0;col<5;col++)ball((col-2)*.29,U+1.1+row*.43,z-.3,.035,gold);
 for(const side of[-1,1]){const x=side*6;box(x,U+4.4,-163.78,2.2,7,.06,side<0?blue:0x852d39);for(const edge of[-1,1])box(x+edge*1.04,U+4.4,-163.73,.045,7,.04,gold);box(x,U+8,-163.7,2.6,.09,.12,gold);
  for(let fold=0;fold<13;fold++)box(x-1+fold*.166,U+4.4,-163.7+Math.sin(fold)*.025,.025,6.9,.04,side<0?0x32638a:0x9a3a4a);
  for(const leaf of[-1,0,1]){const g=new THREE.SphereGeometry(.3,8,6);g.scale(.8,1.8,.12);g.rotateZ(-leaf*.5);g.translate(x+leaf*.34,U+4.6,-163.62);add(g,gold);}box(x,U+3.5,-163.6,.95,.08,.06,gold);
 }
 function statue(x:number,y:number,z:number){box(x,y+.25,z,1,.5,1,ivory);box(x,y+1.2,z,.55,1.7,.45,0xb5bdb7);ball(x,y+2.35,z,.28,0xb5bdb7);box(x+.45,y+1.6,z,.09,2.2,.09,gold);solid(x,z,1.1,1.1,y,2.7);}
 for(const [x,y,z]of[[-10,F,-123],[10,F,-123],[-8,U,-143],[8,U,-143],[-8,U,-154],[8,U,-154],[17,U,-132]]as const)statue(x,y,z);
 for(const side of[-1,1])for(const z of[-145,-151,-157]){const x=side*8.8;box(x,U+.5,z,.8,.16,2.8,wood);box(x+side*.35,U+1,z,.12,.95,2.8,blue);for(const dz of[-1,1])box(x,U+.22,z+dz,.55,.44,.1,gold);solid(x,z,1,3,U,1.5);}
 for(const side of[-1,1])for(const z of[-138,-148,-158]){const x=side*7.5;box(x,U+.9,z,.09,1.8,.09,gold);box(x,U+.09,z,.5,.18,.5,gold);for(const dx of[-.3,0,.3]){box(x+dx,U+1.95,z,.07,.3,.07,0xf6e3ae);ball(x+dx,U+2.15,z,.045,0xffc568);}solid(x,z,.8,.4,U,2.2);}
 // Service furniture stays against walls, outside the imperial stair and doors.
 for(const side of[-1,1]){const x=side*10.8;box(x,F+.85,-122.6,1.3,.14,2,wood);for(const dx of[-.45,.45])for(const dz of[-.7,.7])box(x+dx,F+.4,-122.6+dz,.09,.8,.09,wood);solid(x,-122.6,1.4,2.1,F,.95);}
 // Spiral treads, rails and a real top landing preserve access to the tower.
 for(let i=0;i<T.steps;i++){const p=humanTowerPoint(i+1),a=T.startAngle+(i+.5)*T.stride/T.radius;box(p.x,p.y-.08,p.z,T.width,.16,T.stride+.02,ivory,-a);for(const sign of[-1,1]){const r=T.radius+sign*T.width/2,point={x:T.x+Math.cos(a)*r,y:p.y,z:T.z+Math.sin(a)*r};if(i%3===0){box(point.x,p.y+.47,point.z,.04,.94,.04,gold);}box(point.x,p.y+.95,point.z,.05,.055,T.stride+.04,gold,-a);}}
 const end=HUMAN_INTERIOR_LOOKOUT;box(end.x,end.y-.1,end.z,1.5,.2,1.5,ivory);
 // A carved reception lectern leaves the centre of the vestibule open.
 box(2.75,F+.53,-119.2,.55,1.06,.55,wood);box(2.75,F+1.1,-119.2,.78,.1,.8,wood);box(2.75,F+1.16,-119.2,.5,.015,.48,0xe6dab6);for(const z of[-119.52,-118.88])box(2.75,F+1.17,z,.78,.02,.035,gold);solid(2.75,-119.2,.82,.84,F,1.2);
 for(const [color,list]of parts){const g=mergeGeometries(list,false)!;list.forEach(p=>p.dispose());geometry.add(g);const material=new THREE.MeshStandardMaterial({color,roughness:color===gold?.38:.85,metalness:color===gold?.5:0});if(color===wood)applyRoyalSurfaceDetail(material,'wood');else if(color===ivory)applyRoyalSurfaceDetail(material,'masonry');materials.push(material);const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);}unit.dispose();
 const people=createLivingActorLibrary(),actors:ReturnType<typeof people.get>[]=[],bodies:{x:number;y:number;z:number;radius:number;height:number}[]=[];
 const clerk=people.get('merchant',73);clerk.group.name='royal-supply-receptionist';clerk.group.scale.setScalar(.9);clerk.group.position.set(ROYAL_CLERK.x,ROYAL_CLERK.y,ROYAL_CLERK.z);clerk.group.rotation.y=-Math.PI/2;group.add(clerk.group);actors.push(clerk);bodies.push({...ROYAL_CLERK,radius:.32,height:1.85});
 const carpenter=people.get('builder',74);carpenter.group.name='royal-supply-repair-carpenter';carpenter.group.scale.setScalar(.9);group.add(carpenter.group);actors.push(carpenter);
 const repair=new THREE.Group();repair.name='royal-delivered-planks-repair';group.add(repair);
 const repairGeometry=new THREE.BoxGeometry(1,.08,.4),repairMaterial=new THREE.MeshStandardMaterial({color:wood,roughness:.72});geometry.add(repairGeometry);materials.push(repairMaterial);
 const carried=new THREE.Group();carried.name='actor-load';carried.position.set(0,1.02,.48);for(let i=0;i<2;i++){const plank=new THREE.Mesh(repairGeometry,repairMaterial);plank.position.y=i*.12;carried.add(plank);}carpenter.group.getObjectByName('actor-torso')!.add(carried);
 for(let i=0;i<2;i++){const plank=new THREE.Mesh(repairGeometry,repairMaterial);plank.position.set(ROYAL_REPAIR.x,F+.9+i*.09,ROYAL_REPAIR.z);plank.castShadow=true;repair.add(plank);}
 const supportGeometry=new THREE.BoxGeometry(.12,.9,.12);geometry.add(supportGeometry);for(const side of[-1,1])for(const dz of[-.25,.25]){const leg=new THREE.Mesh(supportGeometry,repairMaterial);leg.position.set(ROYAL_REPAIR.x+side*.4,F+.45,ROYAL_REPAIR.z+dz);repair.add(leg);}solid(ROYAL_REPAIR.x,ROYAL_REPAIR.z,1.3,.95,F,1.2);
 let workAt:number|null=null,workNow=0;
 const posts=[{x:-3.4,y:F,z:-116.5},{x:3.4,y:F,z:-116.5},{x:-4,y:U,z:-159},{x:4,y:U,z:-159},{x:23.3,y:U,z:-111.5},{x:-4,y:ROYAL_COURT_Y,z:-70},{x:4,y:ROYAL_COURT_Y,z:-70}];
 posts.forEach((p,i)=>{const a=people.get('guard',i);a.group.scale.setScalar(.82);a.group.position.set(p.x,p.y,p.z);a.group.name='human-royal-guard-'+i;group.add(a.group);actors.push(a);bodies.push({...p,radius:.28,height:1.85});});
 const workers=[-1,1].map((side,i)=>{const a=people.get('worker',i+41);a.group.scale.setScalar(.9);a.group.name='human-court-gardener-'+i;group.add(a.group);actors.push(a);return{actor:a,side};});
 const noLife={colliders:()=>[] as typeof bodies};
 let disposed=false;return{group,interior:{group,obstacles,cameraObstacles:[...cameraObstacles,...obstacles],metrics:{humanScale:true,minimumDoorHeight:4.8,minimumCorridorWidth:3.9,throneHeight:4.8},setFocus(){},update(){}},citadelLife:{colliders:()=>{const p=royalWorkPose(workAt,workNow);return[...bodies,...(p.visible?[{x:p.x,y:p.y,z:p.z,radius:.3,height:1.85}]:[])];}},interiorLife:noLife,setWorks(at:number|null,now:number){workAt=at;workNow=now;},setFocus(x:number,y:number,z:number){for(const light of lights)light.visible=light.position.distanceTo(new THREE.Vector3(x,y,z))<30;},update(t:number){actors.forEach(a=>a.animate(t,0,false));const task=royalWorkPose(workAt,workNow);carpenter.group.visible=task.visible;carpenter.group.position.set(task.x,task.y,task.z);carpenter.group.rotation.y=task.working?Math.PI/2:task.yaw;carpenter.animate(t,task.moving?1:0,task.working);carpenter.group.getObjectByName('actor-load')!.visible=task.carrying;repair.visible=workAt!==null&&!task.carrying;repair.children.slice(0,2).forEach((p,i)=>{p.position.y=F+(task.completed?.94:1.05);p.position.z=ROYAL_REPAIR.z+(i-.5)*.42;});workers.forEach(({actor,side},i)=>{const phase=(t*.2+i*3)%12,moving=phase<6,z=-68+(moving?phase:6)*.5;actor.group.position.set(side*20,ROYAL_COURT_Y,z);actor.group.rotation.y=moving?0:side*Math.PI/2;actor.animate(t,moving?.5:0,!moving);});},dispose(){if(disposed)return;disposed=true;actors.forEach(a=>a.dispose());people.dispose();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();group.clear();}};
}
