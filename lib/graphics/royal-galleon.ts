import * as THREE from 'three';
import {createTripoShip} from './tripo-ship.ts';
import {ROYAL_GALLEON as G} from './royal-maritime-layout.ts';
import {createLivingActorLibrary} from './living-actors.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {clipTripoShipCamera} from './ship-camera.ts';

export function createBoardableRoyalGalleon(fallback:THREE.Group){
 const ship=createTripoShip('galleon',fallback),group=ship.group;group.position.set(G.x,0,G.z);
 const materials=[new THREE.MeshStandardMaterial({color:0x805837,roughness:.92}),new THREE.MeshStandardMaterial({color:0xc2a468,roughness:.8}),new THREE.MeshStandardMaterial({color:0x24466a,roughness:.85})],batches:THREE.BufferGeometry[][]=[[],[],[]];
 applyRoyalSurfaceDetail(materials[0],'wood');applyRoyalSurfaceDetail(materials[1],'wood');
 function box(x:number,y:number,z:number,w:number,h:number,d:number,m=0){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);batches[m].push(g);}
 // Each tread matches the floor returned by authoritative movement.
 for(let i=0;i<42;i++)box(0,G.deck-.09,-10.25+i*.56,6.45,.18,.54);
 for(let i=0;i<13;i++){const x=14+i*.72;box(x,1.2-(x-14)/9*.28-.09,0,.7,.18,2.04);}
 for(let i=0;i<22;i++){const x=3.1+i*.5,y=G.deck+(1.2-G.deck)*Math.max(0,(x-4)/10);box(x,y-.08,0,.52,.16,2.04);}
 for(const side of[-1,1]){
  for(let i=0;i<22;i++){const y=G.deck+(i+1)/22*(G.upper-G.deck),z=5+(i+.5)*4/22;box(side*2.4,y-.08,z,1.28,.16,4/22+.015,1);box(side*3.13,y+.55,z,.08,1.1,.08,1);}
  box(side*2.1,3.1,11.8,.18,3.1,3.4);box(side*1.3,3.1,9,.5,3.1,.18);
  for(const z of[-10,-7,-4,-1,2,5,8]){if(side>0&&Math.abs(z)<1.2)continue;box(side*3.35,2.1,z,.12,1.1,.12,1);}
 }
 box(0,G.upper-.1,11.15,6.4,.2,4.3);box(0,3.1,13.1,4.3,3.1,.18);box(0,4.6,9,1.9,.28,.2,1);
 for(const x of[-1.4,-.2])for(const z of[11.3,12.1])box(x,2.02,z,.12,.94,.12);
 box(-.8,2.55,11.7,1.7,.15,1.05,1);box(-.8,2.64,11.7,1,.025,.6,1);
 for(const z of[11.5,11.7,11.9])box(-.85,2.66,z,.65,.015,.035,2);
 box(.6,2.03,12.2,.85,.9,.8,2);box(.6,2.55,12.55,.85,.8,.13);
 for(const side of[-1,1])box(side*1.99,3.2,11.4,.03,.9,1.1,2);
 const geometry:THREE.BufferGeometry[]=[];for(let i=0;i<batches.length;i++){const g=mergeGeometries(batches[i]);batches[i].forEach(b=>b.dispose());geometry.push(g);const mesh=new THREE.Mesh(g,materials[i]);mesh.name='galleon-traversable-fittings-'+i;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 const people=createLivingActorLibrary(),captain=people.get('guard',31),sailor=people.get('worker',26);captain.group.scale.setScalar(.9);captain.group.position.set(-1.1,G.upper,11.8);sailor.group.scale.setScalar(.9);group.add(captain.group,sailor.group);
 return{group,setNear:ship.setNear,clipCamera:(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number})=>Math.hypot(from.x-G.x,from.z-G.z)<30?clipTripoShipCamera(group,from,to):to,colliders:()=>[captain,sailor].map(a=>({x:G.x+a.group.position.x,z:G.z+a.group.position.z,halfWidth:.35,halfDepth:.35,minY:a.group.position.y,maxY:a.group.position.y+1.9,allowEgress:true})),update(t:number){ship.update(t);captain.animate(t,false);const q=(t*.65)%12,z=q<6?-8+q:-2-(q-6);sailor.group.position.set(-1.8,G.deck,z);sailor.group.rotation.y=q<6?0:Math.PI;sailor.animate(t,true);},dispose(){captain.dispose();sailor.dispose();people.dispose();ship.dispose();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
