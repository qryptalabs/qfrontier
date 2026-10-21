import * as THREE from 'three';
import {createRoyalTownLibrary} from './royal-harbor-town.ts';
import {createLivingActorLibrary} from './living-actors.ts';
import {ROYAL_URBAN_BUILDINGS,ROYAL_URBAN_STREETS,ROYAL_URBAN_PLAZAS,royalUrbanWalkHeight,royalUrbanRoadAt} from './royal-urban-plan.ts';
import {royalRiver,ROYAL_GRAND_BRIDGE as B} from './royal-canal-layout.ts';
import {ROYAL_SERVICE_GATE as G} from './royal-urban-plan.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {createRoyalOldTown} from './royal-old-town.ts';
import {OLD_TOWN_VENUES} from './royal-old-town-plan.ts';

export function createRoyalUrbanDistrict(ground:(x:number,z:number)=>number){
 const group=new THREE.Group();group.name='corona-del-alba-coordinated-urban-plan';
 const oldTown=createRoyalOldTown();group.add(oldTown.group);
 const town=createRoyalTownLibrary(),people=createLivingActorLibrary(),cube=new THREE.BoxGeometry(),geometries=new Set<THREE.BufferGeometry>([cube]);
 const stone=new THREE.MeshStandardMaterial({color:0xc4bea6,roughness:.95}),paving=new THREE.MeshStandardMaterial({color:0xafa18a,roughness:.96}),wood=new THREE.MeshStandardMaterial({color:0x6e4c30,roughness:.87}),gold=new THREE.MeshStandardMaterial({color:0xc4a654,roughness:.55,metalness:.22}),blue=new THREE.MeshStandardMaterial({color:0x234e72,roughness:.9}),leaf=new THREE.MeshStandardMaterial({color:0x527440,roughness:1}),glow=new THREE.MeshStandardMaterial({color:0xffd889,emissive:0xe0a240,emissiveIntensity:.45,roughness:.8});
 const materials=[stone,paving,wood,gold,blue,leaf,glow];applyRoyalSurfaceDetail(stone,'masonry');applyRoyalSurfaceDetail(paving,'masonry');applyRoyalSurfaceDetail(wood,'wood');
 type Batch={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[]};const batches=new Map<string,Batch>(),instances:THREE.InstancedMesh[]=[],actors:ReturnType<typeof people.get>[]=[];
 const obstacles:RoyalObstacle[]=[...oldTown.obstacles],buildings:{id:string;kind:string;district:string;x:number;z:number;width:number;depth:number;height:number;door:{x:number;z:number};doorHeight:number;floorHeight:number;oldTown?:true}[]=[];
 const matrix=(x:number,y:number,z:number,sx=1,sy=sx,sz=sx,yaw=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(sx,sy,sz));
 const add=(g:THREE.BufferGeometry,m:THREE.Material|THREE.Material[],transform:THREE.Matrix4)=>{const key=g.uuid+':'+(Array.isArray(m)?m.map(a=>a.uuid).join(':'):m.uuid);let b=batches.get(key);if(!b){b={geometry:g,material:m,matrices:[]};batches.set(key,b);}b.matrices.push(transform);};
 const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0)=>add(cube,m,matrix(x,y,z,w,h,d,yaw));
 const solid=(x:number,y:number,z:number,w:number,h:number,d:number)=>obstacles.push({x,z,halfWidth:w/2,halfDepth:d/2,minY:y,maxY:y+h});
 function street(points:readonly {x:number;z:number;y:number}[],width:number,curbs=false){
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(length/2),yaw=Math.atan2(b.x-a.x,b.z-a.z);
   for(let j=0;j<count;j++){const t=(j+.5)/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(royalRiver(x,z).water)continue;const y=royalUrbanWalkHeight(x,z)??a.y+(b.y-a.y)*t;box(paving,x,y-.06,z,width,.12,length/count+.03,yaw);
    if(curbs)for(const side of[-1,1])box(stone,x+Math.cos(yaw)*side*(width/2+.1),y+.035,z-Math.sin(yaw)*side*(width/2+.1),.22,.18,length/count+.03,yaw);
   }
  }
 }
 for(const road of ROYAL_URBAN_STREETS)street(road.points,road.width,road.width>=8);
 // An actual masonry portal closes the cut edges of the castle's service gate.
 const portal=new THREE.Shape();portal.moveTo(-5,0);portal.lineTo(5,0);portal.lineTo(5,7);portal.lineTo(-5,7);portal.closePath();const opening=new THREE.Path();opening.moveTo(-4,0);opening.lineTo(-4,4);for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI;opening.lineTo(Math.cos(a)*4,4+Math.sin(a)*2);}opening.lineTo(4,0);opening.closePath();portal.holes.push(opening);
 const portalGeometry=new THREE.ExtrudeGeometry(portal,{depth:4,bevelEnabled:false,steps:1,curveSegments:24});portalGeometry.rotateY(Math.PI/2);portalGeometry.translate(69.2,G.y,-69);geometries.add(portalGeometry);const gateMesh=new THREE.Mesh(portalGeometry,stone);gateMesh.name='royal-service-gate-open-masonry-arch';gateMesh.castShadow=true;gateMesh.receiveShadow=true;group.add(gateMesh);
 box(paving,71,G.y-.06,-69,12,.12,8);for(const side of[-1,1]){solid(71.2,G.y,-69+side*4.6,4,7,.8);box(wood,75,G.y+2.5,-69+side*4.2,5,5,.18);box(gold,75,G.y+2.5,-69+side*4.32,4.8,.12,.09);solid(75,G.y,-69+side*4.2,5,5,.18);box(blue,73.35,G.y+5.8,-69+side*4.65,.07,2.2,.8);}
 function lamp(x:number,y:number,z:number){box(stone,x,y+.2,z,.8,.4,.8);box(wood,x,y+2.2,z,.15,4.1,.15);box(gold,x,y+4.3,z,.85,.16,.85);box(glow,x,y+3.95,z,.45,.58,.45);box(wood,x,y+3.6,z,.65,.15,.65);solid(x,y,z,.6,4.5,.6);}
 for(const plaza of ROYAL_URBAN_PLAZAS){box(stone,plaza.x,plaza.y-.08,plaza.z,plaza.width,.16,plaza.depth);
  for(const side of[-1,1]){box(gold,plaza.x+side*(plaza.width/2-1),plaza.y+.005,plaza.z,.18,.012,plaza.depth-2);box(gold,plaza.x,plaza.y+.005,plaza.z+side*(plaza.depth/2-1),plaza.width-2,.012,.18);}
  if(plaza.id.startsWith('bridge-square')){
   for(const dz of[-11,11])lamp(plaza.x-8,plaza.y,plaza.z+dz);
   const x=plaza.x+13,z=plaza.z+11;box(stone,x,plaza.y+1.7,z,4,3.4,4);box(wood,x,plaza.y+3.6,z,4.6,.3,4.6);box(blue,x,plaza.y+2.2,z+2.05,1.3,1.5,.08);solid(x,plaza.y,z,4,3.8,4);
   const guard=people.get('guard',plaza.x<0?42:43);guard.group.position.set(x-3,plaza.y,z);guard.group.scale.setScalar(.9);guard.group.name='royal-bridge-sentry-'+plaza.id;group.add(guard.group);actors.push(guard);solid(x-3,plaza.y,z,.65,1.8,.65);
  }else if(plaza.id==='royal-lower-square'){
   for(const sign of[-1,1]){const x=sign*13;box(stone,x,plaza.y+.3,plaza.z,4,.6,4);box(gold,x,plaza.y+.7,plaza.z,3,.2,3);box(blue,x,plaza.y+.81,plaza.z,2.7,.02,2.7);solid(x,plaza.y,plaza.z,4,.85,4);lamp(sign*17,plaza.y,plaza.z-10);box(wood,sign*14,plaza.y+.5,plaza.z+9,3,.2,.8);}
  }
 }
 // Every frontage has its own paved approach; no object is placed in a major lane.
 for(const b of ROYAL_URBAN_BUILDINGS){const model=town.get(b.kind,b.variant),spec=model.userData.royalTown,quarter=Math.abs(Math.sin(b.yaw))>.5,w=quarter?spec.footprintDepth:spec.footprintWidth,d=quarter?spec.footprintWidth:spec.footprintDepth;
  if([-w/2,0,w/2].some(dx=>[-d/2,0,d/2].some(dz=>royalRiver(b.x+dx,b.z+dz).water||royalUrbanRoadAt(b.x+dx,b.z+dz,b.oldTown?.15:1))))continue;
  if(OLD_TOWN_VENUES.some(v=>Math.abs(v.x-b.x)<(v.width+w)/2+.3&&Math.abs(v.z-b.z)<(v.depth+d)/2+.3))continue;
  const y=ground(b.x,b.z);model.updateMatrixWorld(true);const placement=matrix(b.x,y,b.z,1,1,1,b.yaw);model.traverse(o=>{if(o instanceof THREE.Mesh)add(o.geometry,o.material,placement.clone().multiply(o.matrixWorld));});
  const doorLocal={x:-spec.width*.22,z:spec.depth/2+1},door={x:b.x+Math.cos(b.yaw)*doorLocal.x+Math.sin(b.yaw)*doorLocal.z,z:b.z-Math.sin(b.yaw)*doorLocal.x+Math.cos(b.yaw)*doorLocal.z};
  let front=b.district==='upper'?{x:door.x,z:65,y:B.deck}:{x:Math.sign(b.x)*(b.district==='port'?32:Math.abs(b.x)<100?64:Math.abs(b.x)<150?104:Math.abs(b.x)<200?156:204),z:door.z,y:.92};
  if(b.oldTown){let nearest=Infinity;for(const road of ROYAL_URBAN_STREETS)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],c=road.points[i],dx=c.x-a.x,dz=c.z-a.z,t=Math.max(0,Math.min(1,((door.x-a.x)*dx+(door.z-a.z)*dz)/(dx*dx+dz*dz||1))),x=a.x+dx*t,z=a.z+dz*t,distance=Math.hypot(x-door.x,z-door.z);if(Math.abs(a.y-.92)>.2||(x-door.x)*Math.sin(b.yaw)+(z-door.z)*Math.cos(b.yaw)<-.3||distance>=nearest)continue;nearest=distance;front={x,z,y:.92};}}
  street([front,{...door,y:y+.12}],b.oldTown?5:1.8);buildings.push({id:b.id,kind:b.kind,district:b.district,x:b.x,z:b.z,width:w,depth:d,height:spec.height,door,doorHeight:spec.doorHeight,floorHeight:spec.floorHeight,...(b.oldTown?{oldTown:true as const}:{})});solid(b.x,y,b.z,w,spec.height,d);
 }
 // Gardens and street furniture use batches rather than individual draw calls.
 for(const side of[-1,1])for(const z of[135,184,226,280,314]){if(side<0)lamp(side*70.5,.92,z);for(const dz of[-1,1]){box(stone,side*151,1.1,z+dz*5,2,.4,2);box(leaf,side*151,1.6,z+dz*5,1.5,.65,1.5);}}
 for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);instances.push(mesh);}
 group.userData.urbanPlan={buildings,streets:ROYAL_URBAN_STREETS,plazas:ROYAL_URBAN_PLAZAS};
 let disposed=false;return{group,buildings,obstacles,oldTown,update(t:number,reduced:boolean){oldTown.update(t,reduced);for(const actor of actors)actor.animate(reduced?0:t,0,false);},dispose(){if(disposed)return;disposed=true;oldTown.dispose();group.removeFromParent();instances.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());actors.forEach(a=>a.dispose());people.dispose();town.dispose();group.clear();}};
}
