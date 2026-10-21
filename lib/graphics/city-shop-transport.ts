import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ShopAssetKind} from '../mvp/city-shop.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {createTripoTransportAppearance} from './tripo-transport.ts';

export const SHOP_DRIVER_SEAT=Object.freeze({x:0,y:.6,z:.62});
/** Actual displacement drives feet and wheels. A blocked vehicle cannot trot in place. */
export function createTransportOdometer(){
 let previous:{x:number;z:number;time:number}|null=null,distance=0;
 return{sample(time:number,x:number,z:number,yaw=0){const dt=previous?time-previous.time:0,dx=previous?x-previous.x:0,dz=previous?z-previous.z:0,step=Math.hypot(dx,dz),direction=dx*Math.sin(yaw)+dz*Math.cos(yaw)<-1e-6?-1:1,valid=dt>0&&dt<.3&&Number.isFinite(step)&&step<=2,speed=valid?step*direction/dt:0;previous={x,z,time};if(valid)distance+=step*direction;return{distance,speed};}};
}

/** Metre-scale equipment; appearance never grants ownership, cargo or movement. */
export function createShopTransport(kind:ShopAssetKind,animalKind:'horse'|'mule'='horse',hitched=false){
 const group=new THREE.Group(),geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),legs:THREE.Group[]=[],wheels:THREE.Group[]=[],odometer=createTransportOdometer();group.name='owned-'+kind;
 const animalOnly=kind==='horse'||kind==='mule',horseKind=animalOnly?kind:animalKind,cart=kind==='cart',radius=cart?.285:.48;
 const mat=(color:number,wood=false)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88});materials.add(m);if(wood)applyRoyalSurfaceDetail(m,'wood');return m;},fur=mat(horseKind==='mule'?0x776b61:0x7b4930),dark=mat(0x29231e),wood=mat(0x805633,true),iron=mat(0x424b4b),gold=mat(0xb79b61),blue=mat(0x294f65),light=mat(0xb2986d,true),cube=new THREE.BoxGeometry();geometry.add(cube);
 function box(parent:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){const mesh=new THREE.Mesh(cube,m);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function beam(parent:THREE.Object3D,m:THREE.Material,a:THREE.Vector3,b:THREE.Vector3,width:number){const o=box(parent,m,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,width,a.distanceTo(b),width);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
 const animal=new THREE.Group(),animalFallback=new THREE.Group(),body=new THREE.Group(),fixtures=new THREE.Group();animal.name='draft-animal';animalFallback.name='draft-animal-original';body.name='owned-vehicle-original-body';fixtures.name='owned-vehicle-fittings';animal.position.z=animalOnly?0:2.7;animal.visible=animalOnly||hitched;animal.add(animalFallback);group.add(animal,body,fixtures);
 box(animalFallback,fur,0,1.27,0,.66,.72,1.75);box(animalFallback,fur,0,1.65,.7,.42,.9,.48).rotation.x=.27;box(animalFallback,fur,0,2.03,.98,.4,.43,.72);box(animalFallback,dark,0,1.92,1.31,.4,.2,.16);
 for(const x of[-.15,.15])box(animalFallback,fur,x,2.37,.88,.11,horseKind==='mule'?.55:.28,.13);
 for(const x of[-.21,.21])box(animalFallback,dark,x,2.12,1.13,.04,.055,.045);
 for(let i=0;i<8;i++)box(animalFallback,dark,0,1.8+i*.065,.49+i*.045,.13,.18,.12);box(animalFallback,dark,0,1.26,-.98,.12,.65,.15).rotation.x=.35;
 for(const x of[-.24,.24])for(const z of[-.6,.57]){const pivot=new THREE.Group();pivot.position.set(x,1.08,z);animalFallback.add(pivot);box(pivot,fur,0,-.38,0,.17,.76,.18);box(pivot,dark,0,-.91,.025,.2,.25,.25);legs.push(pivot);}
 const load=new THREE.Group();load.name='owned-vehicle-cargo';group.add(load);
 if(!animalOnly){
  const width=cart?1.22:kind==='wagon'?1.95:1.65,depth=cart?3:kind==='wagon'?2.9:2.3,floor=cart?.49:.8,center=cart?-.1:-.3;
  box(body,wood,0,floor,center,width,.16,depth);for(const x of[-width/2,width/2])box(body,wood,x,floor+.36,center,.09,.65,depth);box(body,wood,0,floor+.36,center-depth/2,width,.65,.1);
  for(const x of[-.46,.46])box(fixtures,wood,x,.9,.62,.1,.64,.62);box(fixtures,wood,0,1.2,.62,1.14,.16,.66);box(fixtures,blue,0,1.31,.62,1.08,.08,.58);box(fixtures,wood,0,1.55,.31,1.14,.48,.09);box(fixtures,wood,0,.88,1.13,1.1,.1,.45);
  for(const z of cart?[-.967,.734]:[-1.1,.55]){if(!cart)box(fixtures,iron,0,.55,z,width+.3,.1,.1);for(const x of cart?[-.615,.615]:[-width/2-.1,width/2+.1]){const wheel=new THREE.Group();wheel.name='owned-wheel-'+x+'-'+z;wheel.position.set(x,radius,z);group.add(wheel);const rimGeo=new THREE.TorusGeometry(radius,.035,5,16);geometry.add(rimGeo);const rim=new THREE.Mesh(rimGeo,iron);rim.rotation.y=Math.PI/2;wheel.add(rim);for(let i=0;i<8;i++)box(wheel,wood,0,0,0,.07,radius*1.8,.055).rotation.x=i*Math.PI/4;box(wheel,gold,0,0,0,.14,.15,.15);wheels.push(wheel);}}
  const harness=new THREE.Group();harness.name='owned-harness-and-reins';harness.visible=hitched;fixtures.add(harness);
  for(const x of[-.49,.49]){beam(fixtures,wood,new THREE.Vector3(x,.95,.55),new THREE.Vector3(x,1.04,3.12),.075);beam(harness,dark,new THREE.Vector3(x,1.04,3.12),new THREE.Vector3(x*.86,1.43,3.08),.035);beam(harness,dark,new THREE.Vector3(x*.35,1.65,.9),new THREE.Vector3(x*.48,1.92,3.57),.022);}
  box(harness,dark,0,1.43,3.08,.87,.14,.08);for(const x of[-.41,.41])box(harness,dark,x,1.36,2.77,.055,.6,.13);
  if(kind==='carriage'){box(fixtures,blue,0,2.27,-.3,1.9,.22,2.6);for(const x of[-.82,.82])for(const z of[-1.3,.75])box(fixtures,gold,x,1.72,z,.08,1.1,.08);}
  for(let i=0;i<6;i++){const crate=new THREE.Group();crate.name='owned-cargo-crate-'+i;crate.position.set((i%2-.5)*.54,cart?.57:.97,-1+Math.floor(i/2)*.6);box(crate,wood,0,.23,0,.5,.46,.5);for(const x of[-.17,.17])box(crate,iron,x,.23,0,.025,.48,.52);box(crate,light,0,.47,0,.48,.035,.48);crate.visible=false;load.add(crate);}
 }
 // Merge static siblings while preserving articulation pivots and load visibility.
 const parents:THREE.Object3D[]=[];group.traverse(o=>{if(o.children.some(c=>c instanceof THREE.Mesh))parents.push(o);});for(const parent of parents){const batches=new Map<THREE.Material,THREE.Mesh[]>();for(const o of parent.children)if(o instanceof THREE.Mesh&&!Array.isArray(o.material)){const list=batches.get(o.material)??[];list.push(o);batches.set(o.material,list);}for(const[m,meshes]of batches){if(meshes.length<2)continue;const parts=meshes.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix);}),g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometry.add(g);const merged=new THREE.Mesh(g,m);merged.castShadow=true;merged.receiveShadow=true;meshes.forEach(o=>o.removeFromParent());parent.add(merged);}}
 const appearance=createTripoTransportAppearance({...(horseKind==='horse'&&(animalOnly||hitched)?{horse:{parent:animal,fallback:animalFallback}}:{}),...(cart?{cart:{parent:group,fallback:body,wheels}}:{})});let disposed=false;
 return{group,setNear(near:boolean){appearance.setNear(near);},setCargo(units:number){load.children.forEach((c,i)=>c.visible=Number.isFinite(units)&&units>i*10);},animate(time:number,_speed:number){if(disposed)return;const motion=odometer.sample(time,group.position.x,group.position.z,group.rotation.y);group.userData.distance=motion.distance;group.userData.travelSpeed=motion.speed;const moving=Math.min(1,Math.abs(motion.speed)/2);legs.forEach((l,i)=>l.rotation.x=Math.sin(motion.distance/1.25*Math.PI*2+(i===0||i===3?0:Math.PI))*.3*moving);wheels.forEach(w=>w.rotation.x=motion.distance/radius);appearance.update(time,motion.distance,motion.speed);},dispose(){if(disposed)return;disposed=true;appearance.dispose();group.removeFromParent();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}};
}
