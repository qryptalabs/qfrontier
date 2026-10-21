import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';

/** A repair site with a fixed physical footprint. Only verified deliveries reveal its restored parts. */
export function createCityGranary(){
 const group=new THREE.Group();group.name='paso-del-norte-community-granary';group.position.set(-64,1.14,156);const geometry:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[],stages:THREE.Group[]=[];
 const cube=new THREE.BoxGeometry(),wood=new THREE.MeshStandardMaterial({color:0x865932,roughness:.85}),stone=new THREE.MeshStandardMaterial({color:0xada68c,roughness:1}),roof=new THREE.MeshStandardMaterial({color:0x52704c,roughness:.8}),trim=new THREE.MeshStandardMaterial({color:0xd3b479,roughness:.65});geometry.push(cube);materials.push(wood,stone,roof,trim);applyRoyalSurfaceDetail(wood,'wood');applyRoyalSurfaceDetail(stone,'masonry');
 const batches=new Map<THREE.Group,Map<THREE.Material,THREE.BufferGeometry[]>>();
 function box(parent:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,angle=0){const g=cube.clone();g.scale(w,h,d);g.rotateZ(angle);g.translate(x,y,z);let map=batches.get(parent);if(!map){map=new Map();batches.set(parent,map);}const list=map.get(m)??[];list.push(g);map.set(m,list);}
 box(group,stone,0,.25,0,12,.5,10);for(const x of[-5.6,5.6])box(group,stone,x,1.6,0,.5,2.8,9.6);box(group,stone,0,1.6,-4.6,11.2,2.8,.5);for(const x of[-4,4])box(group,stone,x,1.6,4.6,3.5,2.8,.5);
 for(const x of[-5.5,0,5.5]){box(group,wood,x,4,0,.3,7,9.6);for(const z of[-4.5,0,4.5])box(group,wood,x,4,z,.35,7,.35);}
 box(group,wood,0,7,0,11.7,.3,.3);for(const z of[-4.5,0,4.5])for(const sign of[-1,1])box(group,wood,sign*2.8,6.2,z,6.7,.25,.28,sign*-.42);
 // Ten delivery tranches: walls, storage loft, roof sections, doors and trim.
 for(let i=0;i<10;i++){const stage=new THREE.Group();stage.name='granary-repair-stage-'+(i+1);stage.visible=false;group.add(stage);stages.push(stage);}
 for(const x of[-5.65,5.65])box(stages[x<0?0:1],wood,x,4.5,0,.25,3.2,9.4);box(stages[2],wood,0,4.5,-4.65,11.2,3.2,.25);
 for(let i=0;i<18;i++)box(stages[i<9?3:4],wood,-5.3+i*.62,3.35,0,.58,.2,9.1);for(const x of[-4.5,-3,-1.5,1.5,3,4.5])box(stages[4],trim,x,4.1,4.7,.5,.7,.15);
 for(const sign of[-1,1]){const p=new THREE.Group();p.position.set(sign*3,6.25,0);p.rotation.z=-sign*.42;stages[sign<0?5:7].add(p);for(let i=0;i<20;i++){const target=new THREE.Group();target.position.copy(p.position);target.rotation.copy(p.rotation);stages[(sign<0?5:7)+(i<10?0:1)].add(target);box(target,roof,0,0,-5+i*.53,6.7,.18,.5);}}
 for(const sign of[-1,1]){box(stages[9],wood,sign*.9,1.65,4.8,1.75,2.8,.25);box(stages[9],trim,sign*.9,.6,4.97,1.7,.1,.05);box(stages[9],trim,sign*.9,2.7,4.97,1.7,.1,.05);box(stages[9],trim,sign*2.1,3.2,4.78,.15,.2,.2);}
 const scaffold=new THREE.Group();scaffold.name='granary-active-repair-scaffold';group.add(scaffold);for(const x of[-6.5,6.5])for(const z of[-4.8,0,4.8]){box(scaffold,wood,x,2.7,z,.18,5.4,.18);box(scaffold,trim,x,3.8,z,.3,.12,.3);}for(const x of[-6.5,6.5])for(const y of[1.6,3.4])box(scaffold,wood,x,y,0,.7,.12,10.4);
 for(const [parent,map]of batches)for(const [m,parts]of map){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());geometry.push(g);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);}
 if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');if(c){c.fillStyle='#24412d';c.fillRect(0,0,512,128);c.strokeStyle='#d3b479';c.lineWidth=5;c.strokeRect(5,5,502,118);c.fillStyle='#f3e4ba';c.font='bold 33px Georgia';c.textAlign='center';c.fillText('GRANERO COMUNITARIO',256,49);c.font='24px Georgia';c.fillText('OBRA DE PASO DEL NORTE',256,91);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const m=new THREE.MeshBasicMaterial({map:t});materials.push(m);const g=new THREE.PlaneGeometry(6,1.5);geometry.push(g);const sign=new THREE.Mesh(g,m);sign.position.set(0,4.7,4.9);group.add(sign);}}
 return{group,setDelivered(units:number){const phase=Math.min(10,Math.floor(Math.max(0,units)/2));stages.forEach((s,i)=>s.visible=i<phase);scaffold.visible=phase<10;group.userData.delivered=units;group.userData.repairStage=phase;},dispose(){group.removeFromParent();geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();}};
}
