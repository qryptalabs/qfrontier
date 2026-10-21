import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROYAL_CITADEL_ASCENTS,ROYAL_CITADEL_LANDINGS,ROYAL_CITADEL_TRANSFORM,royalApproachHeight} from './royal-citadel-layout.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';

type Finish='paving'|'stone'|'foliage'|'flowers'|'bronze'|'cloth';
type Point={x:number;y:number;z:number};
const PALE=0xd6ccb0,LIGHT=0xeee2c8,SHADE=0xa39f8c;

/** Three genuinely stepped approaches to the enlarged citadel. All tread
 * heights come from the same authored plan as walking. This is architecture
 * only: it neither reads nor changes a saved village or expedition. */
export function createRoyalCitadelTerraces(){
 const group=new THREE.Group();group.name='royal-citadel-three-processional-terraces';
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),parts=new Map<Finish,THREE.BufferGeometry[]>(),obstacles:RoyalObstacle[]=[];
 const finishes:Record<Finish,THREE.MeshStandardMaterial>={
  paving:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96}),
  stone:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88}),
  foliage:new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}),
  flowers:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9}),
  bronze:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.46,metalness:.58}),
  cloth:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide}),
 };
 Object.values(finishes).forEach(material=>materials.add(material));
 const unit=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
 function add(finish:Finish,colour:number,source:THREE.BufferGeometry,x=0,y=0,z=0,w=1,h=1,d=1,ry=0){
  const geometry=source.index?source.toNonIndexed():source.clone();
  matrix.compose(position.set(x,y,z),quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,ry),scale.set(w,h,d));geometry.applyMatrix4(matrix);
  for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
  if(!geometry.attributes.normal)geometry.computeVertexNormals();
  if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
  const rgb=new Float32Array(geometry.attributes.position.count*3),c=new THREE.Color(colour);for(let i=0;i<rgb.length;i+=3)c.toArray(rgb,i);geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));
  const list=parts.get(finish)??[];list.push(geometry);parts.set(finish,list);
 }
 const box=(finish:Finish,colour:number,x:number,y:number,z:number,w:number,h:number,d:number)=>add(finish,colour,unit,x,y,z,w,h,d);
 function primitive(finish:Finish,colour:number,geometry:THREE.BufferGeometry,x:number,y:number,z:number){add(finish,colour,geometry,x,y,z);geometry.dispose();}
 function obstacle(x:number,z:number,w:number,d:number,minY:number,maxY:number){obstacles.push(Object.freeze({x,z,halfWidth:w/2,halfDepth:d/2,minY,maxY}));}
 function beam(finish:Finish,colour:number,a:Point,b:Point,width:number){
  const geometry=new THREE.BoxGeometry(width,1,width),from=new THREE.Vector3(a.x,a.y,a.z),to=new THREE.Vector3(b.x,b.y,b.z),delta=to.clone().sub(from),transform=new THREE.Matrix4().compose(from.add(to).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP,delta.clone().normalize()),new THREE.Vector3(1,delta.length(),1));
  geometry.applyMatrix4(transform);add(finish,colour,geometry);geometry.dispose();
 }
 /** An arch-shaped opening cut all the way through the wall. */
 function archWall(span:number,height:number,radius:number,spring:number,rise:number,depth:number){
  const shape=new THREE.Shape();shape.moveTo(-span/2,0);shape.lineTo(-radius,0);shape.lineTo(-radius,spring);
  for(let i=1;i<=24;i++){const angle=Math.PI-i*Math.PI/24;shape.lineTo(Math.cos(angle)*radius,spring+Math.sin(angle)*rise);}
  shape.lineTo(radius,0);shape.lineTo(span/2,0);shape.lineTo(span/2,height);shape.lineTo(-span/2,height);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:1});geometry.translate(0,0,-depth/2);return geometry;
 }
 let stairTriangles=0;
 for(const ascent of ROYAL_CITADEL_ASCENTS){
  // A single extruded tread profile replaces thousands of separate boxes and
  // shares the navigation's lower-tread convention at every exact boundary.
  const length=ascent.startZ-ascent.endZ,run=length/ascent.steps,profile=new THREE.Shape();
  profile.moveTo(0,4);profile.lineTo(0,ascent.startY);
  for(let i=0;i<ascent.steps;i++){
   const y=royalApproachHeight(ascent.startZ-(i+.5)*run),next=(i+1)*run;
   profile.lineTo(next,y);if(i<ascent.steps-1)profile.lineTo(next,royalApproachHeight(ascent.startZ-(i+1.5)*run));
  }
  profile.lineTo(length,ascent.endY);profile.lineTo(length,4);profile.closePath();
  const stairs=new THREE.ExtrudeGeometry(profile,{depth:ascent.width,bevelEnabled:false,curveSegments:1,steps:1});
  stairs.applyMatrix4(new THREE.Matrix4().set(0,0,1,-ascent.width/2,0,1,0,0,-1,0,0,ascent.startZ,0,0,0,1));
  stairTriangles+=(stairs.index?.count??stairs.attributes.position.count)/3;add('paving',LIGHT,stairs);stairs.dispose();
  // The broad avenue is framed by human-height parapets, not a fence across
  // its walking surface. Posts and sloping coping follow the same staircase.
  for(const side of[-1,1]){
   const x=side*(ascent.width/2+1.7),segments=Math.ceil(length/9);
   for(let i=0;i<segments;i++){
    const za=ascent.startZ-i/segments*length,zb=ascent.startZ-(i+1)/segments*length;
    const ya=royalApproachHeight(za),yb=royalApproachHeight(zb);
    beam('stone',PALE,{x,y:ya+.58,z:za},{x,y:yb+.58,z:zb},1.15);
    box('stone',LIGHT,x,ya+.65,za,1.8,1.3,1.8);
    obstacle(x,(za+zb)/2,2.3,Math.abs(za-zb)+.1,Math.min(ya,yb),Math.max(ya,yb)+1.4);
   }
  }
 }
 let gardenCount=0,gateCount=0,arcadeCount=0;
 function garden(x:number,y:number,z:number,width:number,depth:number){
  gardenCount++;
  box('stone',SHADE,x,y+.3,z,width+2,.6,depth+2);box('foliage',0x718347,x,y+.63,z,width,.14,depth);
  for(const side of[-1,1]){
   box('stone',LIGHT,x,y+.8,z+side*depth/2,width+2,.45,1.1);
   box('stone',LIGHT,x+side*width/2,y+.8,z,1.1,.45,depth+2);
   box('foliage',0x325d35,x,y+1.3,z+side*(depth/2-2.6),width-3,1.4,3.1);
   box('foliage',0x406b3a,x+side*(width/2-2.6),y+1.3,z,3.1,1.4,depth-6);
  }
  // Two opposed flower ribbons keep the formal parterre legible at distance.
  for(const side of[-1,1])for(let i=0;i<15;i++){
   const px=x+(i-7)*Math.min(3,(width-14)/15),pz=z+side*depth*.22;
   primitive('flowers',[0xe8d59b,0xba7790,0xc9a24d][i%3],new THREE.IcosahedronGeometry(1.1,0),px,y+1.1,pz);
  }
  const topiary=new THREE.ConeGeometry(4,13,9);for(const side of[-1,1])add('foliage',0x37613c,topiary,x+side*(width/2-7),y+7.3,z);topiary.dispose();
  obstacle(x,z,width+2,depth+2,y,y+14);
 }
 function gateway(z:number,y:number,index:number){
  gateCount++;
  const wall=archWall(82,65,25,24,25,9);add('stone',PALE,wall,0,y,z);wall.dispose();
  // The entrance stays open to the sky below its real arch. Side piers carry
  // the same explicit solids used for visitor and camera collision.
  for(const side of[-1,1]){
   const x=side*33;
   box('stone',SHADE,x,y+1,z,18,2,15);box('stone',LIGHT,x,y+66,z,19,3,14);
   for(let i=0;i<4;i++)box('stone',LIGHT,x+(i-1.5)*4.7,y+70,z,2.4,5,12);
   obstacle(x,z,16,10,y,y+72);
   box('bronze',0xa78a49,x,y+45,z+5.1,.5,24,.5);
   box('cloth',0x194e87,x+side*3.8,y+44,z+5.2,7.2,17,.18);
   box('bronze',0xdfb85f,x+side*3.8,y+44,z+5.35,.9,11,.22);
   box('bronze',0xdfb85f,x+side*3.8,y+46,z+5.35,4.3,.9,.22);
  }
  const medal=new THREE.CylinderGeometry(3.5,3.5,.8,12);medal.rotateX(Math.PI/2);primitive('bronze',0xd7b05e,medal,0,y+58,z+4.9);
  group.userData[`gate-${index}`]={x:0,y,z,clearWidth:50,clearHeight:24};
 }
 for(const[index,terrace]of ROYAL_CITADEL_LANDINGS.entries()){
  const depth=terrace.startZ-terrace.endZ,z=(terrace.startZ+terrace.endZ)/2,y=terrace.y,width=terrace.width;
  if(!('existingCitadelFloor'in terrace&&terrace.existingCitadelFloor)){
   // The foundation meets the ground. Recessed frontal arcades are physically
   // open at their mouths, beneath a load-bearing slab and rear retaining mass.
   box('stone',SHADE,0,(y+1)/2,z-12,width,y-7,depth-24);
   box('paving',PALE,0,y-1.5,z,width,3,depth);
   const archWidth=80,archCount=Math.floor(width/archWidth),spring=Math.min(34,(y-4)*.33),rise=21;
   for(let i=0;i<archCount;i++){
    const x=(i-(archCount-1)/2)*archWidth,arch=archWall(archWidth,y-7,24,spring,rise,16);
    add('stone',i%2?PALE:SHADE,arch,x,4,terrace.startZ-8);arch.dispose();arcadeCount++;
   }
   // Open paths across each landing connect the ascent flights; paving is
   // deliberately smooth and never uses landscape displacement or bump maps.
   box('paving',LIGHT,0,y-.04,z,48,.08,depth);
   for(const side of[-1,1])box('paving',0xb9b098,side*(width/4+30),y-.03,z,width/2-60,.06,18);
   gateway(terrace.startZ-4,y,index);
   for(const side of[-1,1]){
    const frontZ=terrace.startZ-4,wallStart=52,wallEnd=width/2,span=wallEnd-wallStart,x=side*(wallStart+span/2);
    box('stone',PALE,x,y+5.5,frontZ,span,11,8);obstacle(x,frontZ,span,8,y,y+13);
    box('stone',LIGHT,x,y+11.3,frontZ,span+1,1.6,10);
    for(let along=wallStart+5;along<wallEnd;along+=22)box('stone',LIGHT,side*along,y+14,frontZ,7,5,9);
    const edgeX=side*(width/2-3.5);box('stone',PALE,edgeX,y+1.1,z,7,2.2,depth);
    obstacle(edgeX,z,7,depth,y,y+2.2);
    for(let along=95;along<width/2-80;along+=240)garden(side*along,y,terrace.endZ+depth*.52,74,Math.min(66,depth*.45));
   }
  }else{
   // The third terrace is the already-built royal forecourt. Only side wings
   // outside the palace's 144-local-unit foundation are added here, avoiding
   // a second coplanar sheet across its gates and gardens.
   const palaceHalfWidth=72*ROYAL_CITADEL_TRANSFORM.scale,wingWidth=width/2-palaceHalfWidth;
   for(const side of[-1,1])if(wingWidth>0){
    const x=side*(palaceHalfWidth+wingWidth/2);
    box('stone',SHADE,x,(y+3)/2,z,wingWidth,y-5,depth);
    box('paving',PALE,x,y-.5,z,wingWidth,1,depth);
    // The pediment supports stand outside the original footprint, reaching
    // the court elevation without filling its central open approach.
    box('stone',PALE,side*(palaceHalfWidth+wingWidth-4),y+1.1,z,8,2.2,depth);
    obstacle(side*(palaceHalfWidth+wingWidth-4),z,8,depth,y,y+2.2);
    garden(x,y,z,Math.max(30,wingWidth-32),Math.min(80,depth*.3));
   }
  }
 }
 for(const[finish,list]of parts){
  const geometry=mergeGeometries(list,false)!;list.forEach(part=>part.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries.add(geometry);
  const mesh=new THREE.Mesh(geometry,finishes[finish]);mesh.name=`royal-citadel-terraces:${finish}`;mesh.castShadow=finish!=='cloth';mesh.receiveShadow=true;group.add(mesh);
 }
 unit.dispose();
 const metrics=Object.freeze({terraces:ROYAL_CITADEL_LANDINGS.length,ascentFlights:ROYAL_CITADEL_ASCENTS.length,treads:ROYAL_CITADEL_ASCENTS.reduce((n,a)=>n+a.steps,0),gateCount,gardenCount,arcadeCount,stairTriangles,drawCalls:group.children.length,clearAvenueWidth:48,existingForecourt:true});
 group.userData.royalCitadelTerraces=metrics;
 let disposed=false;
 return{group,obstacles,metrics,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();}};
}
