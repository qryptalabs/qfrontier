import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';

export type RoyalTownKind='home'|'warehouse'|'market'|'workshop';
type Finish='walls'|'timber'|'roof'|'glass'|'cloth';

/** Authored merchant houses. Shared material batches retain balconies, shop
 * counters, tiled roofs and joinery when viewed from the street. */
export function createRoyalTownLibrary(){
 const templates=new Map<string,THREE.Group>(),geometries=new Set<THREE.BufferGeometry>();
 const materials:Record<Finish,THREE.MeshStandardMaterial>={
  walls:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.93}),
  timber:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83}),
  roof:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84}),
  glass:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.23,metalness:.15,emissive:0x2f2110,emissiveIntensity:.16}),
  cloth:new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),
 };
 applyRoyalSurfaceDetail(materials.walls,'masonry');applyRoyalSurfaceDetail(materials.timber,'wood');
 const palette=[0xe9d6a9,0xd8c9a5,0xf0e2c0,0xcbbd98,0xddc8a6,0xe6d2b8],roofs=[0xa84b25,0xba6235,0x8e4930,0xbb713c,0x97603d,0xa65b34];
 let disposed=false;
 function get(kind:RoyalTownKind,variant=0){
  if(disposed)throw new Error('The royal town library is disposed.');
  const n=((Math.floor(variant)%12)+12)%12,key=`${kind}-${n}`,cached=templates.get(key);if(cached)return cached;
  const group=new THREE.Group();group.name=`merchant-${key}`;
  const parts:Record<Finish,THREE.BufferGeometry[]>={walls:[],timber:[],roof:[],glass:[],cloth:[]};
  const w=kind==='warehouse'?14.2:kind==='market'?9.6+(n%3)*.6:kind==='workshop'?10.2:8+(n%3)*.6,d=kind==='warehouse'?11.4:kind==='market'?9.4+(n%2)*.6:kind==='workshop'?9.8:8.4+(n%2)*.7,floors=kind==='warehouse'?2:2+(n%3===0?1:0),floorH=kind==='warehouse'?3.1:2.8,h=floors*floorH;
  function add(g:THREE.BufferGeometry,finish:Finish,color:number){const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();const c=new THREE.Color(color),a=new Float32Array(flat.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3)c.toArray(a,i);flat.setAttribute('color',new THREE.BufferAttribute(a,3));parts[finish].push(flat);}
  function box(x:number,y:number,z:number,sx:number,sy:number,sz:number,finish:Finish,color:number,rotation=0){const g=new THREE.BoxGeometry(sx,sy,sz);g.rotateZ(rotation);g.translate(x,y,z);add(g,finish,color);}
  function beam(a:THREE.Vector3,b:THREE.Vector3,thickness:number,color=0x59402c){const dir=b.clone().sub(a),g=new THREE.BoxGeometry(thickness,dir.length(),thickness);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);add(g,'timber',color);}
  const plaster=palette[n%palette.length],wood=0x67462e;
  box(0,.23,0,w+.26,.46,d+.28,'walls',0x9e9d86);
  box(0,1.4,0,w,2.35,d,'walls',0xc0bba0);
  for(let f=1;f<floors;f++)box(0,f*floorH+1.3,0,w+.15,2.45,d+.12,'walls',plaster);
  // Ground-floor stone voussoirs, corners and upper timber framing.
  for(const sign of[-1,1]){
   for(let f=1;f<=floors;f++)box(0,f*floorH,sign*(d/2+.1),w+.48,.17,.18,'timber',wood);
   for(let i=0;i<5;i++){const x=-w/2+i*w/4;box(x,(h+2.4)/2,sign*(d/2+.13),.14,h-2.4,.16,'timber',wood);}
   for(const x of[-w/2,w/2])for(let row=0;row<7;row++)box(x,.55+row*.29,sign*(d/2+.1),.42,.22,.24,'walls',row%2?0xe2d7b9:0xb2ad93);
   for(let f=1;f<floors;f++)for(const side of[-1,1])beam(new THREE.Vector3(side*w*.5,f*floorH+.2,sign*(d/2+.24)),new THREE.Vector3(side*w*.23,(f+1)*floorH-.15,sign*(d/2+.24)),.12);
  }
  for(const x of[-w/2-.05,w/2+.05]){box(x,h/2+.15,0,.16,h,.19,'timber',wood);for(let f=1;f<=floors;f++)box(x,f*floorH,0,.17,.17,d+.35,'timber',wood);}
  // Windows are framed panes with shutters, sills and projecting flower boxes.
  for(const side of[-1,1])for(let f=1;f<floors;f++)for(let col=0;col<2;col++){
   const x=(col-.5)*w*.52,y=f*floorH+1.22,z=side*(d/2+.23);
   box(x,y,z,.83,1.23,.11,'timber',0x382f25);box(x,y,z+side*.07,.65,1.05,.08,'glass',n%3?0x748f8b:0xc4ae73);
   box(x,y,z+side*.14,.07,1.09,.06,'timber',0xc8ae7c);box(x,y,z+side*.14,.7,.07,.06,'timber',0xc8ae7c);
   for(const s of[-1,1]){box(x+s*.55,y,z,.25,1.2,.13,'timber',n%2?0x476557:0x826443);for(let l=0;l<5;l++)box(x+s*.55,y-.45+l*.22,z+side*.08,.23,.045,.035,'timber',0xb79b65);}
   box(x,y-.69,z,.99,.12,.36,'walls',0xe2d2ad);
   if((n+f+col)%3===0){box(x,y-.82,z+side*.22,.9,.23,.4,'timber',wood);for(let i=0;i<5;i++){box(x-.34+i*.17,y-.68,z+side*.28,.2,.17,.24,'walls',0x52753b);box(x-.3+i*.17,y-.56,z+side*.28,.07,.08,.09,'walls',i%2?0xebd68a:0xdca1b0);}}
  }
  // A recessed door and visible shop frontage face +Z.
  box(-w*.22,1.25,d/2+.16,1.12,2.2,.13,'timber',0x352a21);
  for(let i=0;i<6;i++)box(-w*.22-.45+i*.18,1.19,d/2+.25,.15,2.05,.09,'timber',i%2?0x97754a:0x85633f);
  for(const y of[.65,1.64])box(-w*.22,y,d/2+.32,.98,.11,.09,'timber',0x3f423a);
  box(-w*.22+.32,1.22,d/2+.4,.08,.13,.09,'timber',0xd4b66a);
  box(-w*.22,.16,d/2+.5,1.5,.3,.9,'walls',0xc9c0a1);
  if(kind!=='home'||n%3!==1){
   box(w*.24,1.47,d/2+.21,w*.38,1.35,.12,'timber',0x3e3327);
   box(w*.24,.92,d/2+.71,w*.46,.16,1.07,'timber',0xb4915e);
   for(let i=0;i<8;i++)box(w*.24-w*.2+i*w*.057,1.1,d/2+.76,.16,.17,.34,'walls',kind==='market'?(i%2?0xcc9146:0x778b3f):kind==='workshop'?0xad7951:0xb0b7a1);
   const awning=new THREE.PlaneGeometry(w*.77,1.7,8,1);awning.rotateX(-Math.PI*.36);awning.translate(w*.12,2.55,d/2+.65);add(awning,'cloth',n%2?0x326477:0xd5b579);
   for(const x of[-w*.32,w*.58])box(x,1.4,d/2+1.42,.095,2.7,.095,'timber',wood);
   box(w*.52,3,d/2+.56,.13,.15,1.22,'timber',wood);box(w*.52,2.68,d/2+1.08,.75,.63,.15,'timber',0xa58451);
   // Sign has a physical fish/loaf/tool silhouette, without raster text.
   box(w*.52,2.68,d/2+1.18,.46,.13,.08,'walls',kind==='market'?0xc7d2bb:0xe2c478,kind==='workshop'?-.5:0);
  }
  if(n%3===0){
   const z=d/2+.85;box(0,5.22,z,w*.75,.22,1.45,'timber',wood);
   for(const x of[-w*.36,w*.36])beam(new THREE.Vector3(x,4.2,d/2),new THREE.Vector3(x,5.1,z+.6),.14);
   for(let i=0;i<9;i++)box(-w*.35+i*w*.087,5.67,z+.69,.075,.85,.075,'timber',wood);box(0,6.08,z+.69,w*.8,.11,.13,'timber',0xb89969);
  }
  // True gabled roof, with individually raised tile courses and ridge caps.
  const roofH=2.4+(n%2)*.3,roofW=w/2+.5,roofD=d/2+.47,slope=Math.atan2(roofH,roofW),length=Math.hypot(roofW,roofH),roofColor=roofs[n%roofs.length];
  for(const side of[-1,1]){
   const roof=new THREE.BoxGeometry(length,.15,roofD*2);roof.rotateZ(-side*slope);roof.translate(side*roofW/2,h+roofH/2,0);add(roof,'roof',roofColor);
   for(let row=0;row<10;row++)for(let col=0;col<Math.ceil(d/.48)+2;col++){
    const t=(row+.5)/10,x=side*roofW*t,y=h+roofH*(1-t)+.095,z=-roofD+.24+col*.47+(row%2?.12:0);
    if(z>roofD)continue;box(x,y,z,length/10+.055,.075,.43,'roof',row%3?roofColor:roofs[(n+1)%roofs.length],-side*slope);
   }
   const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,roofH-.1);shape.closePath();const g=new THREE.ShapeGeometry(shape);if(side<0)g.rotateY(Math.PI);g.translate(0,h,side*d/2);add(g,'walls',plaster);
   beam(new THREE.Vector3(-w/2,h,side*(d/2+.12)),new THREE.Vector3(0,h+roofH,side*(d/2+.12)),.15);beam(new THREE.Vector3(w/2,h,side*(d/2+.12)),new THREE.Vector3(0,h+roofH,side*(d/2+.12)),.15);
  }
  for(let i=0;i<Math.ceil(d/.43)+2;i++)box(0,h+roofH+.1,-roofD+.2+i*.43,.28,.19,.42,'roof',0xc3824c);
  box(w*.26,h+1.6,-d*.2,.62,2.7,.69,'walls',0xa99b7e);box(w*.26,h+2.98,-d*.2,.84,.22,.91,'walls',0xd0bfa1);box(w*.26,h+3.11,-d*.2,.54,.05,.59,'timber',0x302c25);
  for(const finish of Object.keys(parts)as Finish[]){if(!parts[finish].length)continue;const g=mergeGeometries(parts[finish],false)!;parts[finish].forEach(p=>p.dispose());g.computeBoundingSphere();geometries.add(g);const mesh=new THREE.Mesh(g,materials[finish]);mesh.name=`${key}:${finish}`;mesh.castShadow=finish!=='glass';mesh.receiveShadow=true;group.add(mesh);}
  group.userData.royalTown={kind,variant:n,width:w,depth:d,footprintWidth:w+1,footprintDepth:d+3.4,height:h+roofH,doorHeight:2.2,floorHeight:floorH,front: '+Z'};templates.set(key,group);return group;
 }
 return{get,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());templates.clear();}};
}
