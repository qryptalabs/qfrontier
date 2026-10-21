import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROYAL_CITADEL_FLIGHT_STEPS,ROYAL_CITADEL_TRANSFORM} from './royal-citadel-layout.ts';

type Surface='stone'|'roof'|'glass'|'warm'|'cloth'|'metal';
type Point={x:number;y:number;z:number};
type Resources={templates:Map<string,THREE.Group>;geometries:Set<THREE.BufferGeometry>;materials:Record<Surface,THREE.MeshStandardMaterial>;textures:THREE.Texture[]};
export type RoyalCitadelLocalSurface={id:string;kind:'flat';minX:number;maxX:number;minZ:number;maxZ:number;y:number}|{id:string;kind:'stairs';minX:number;maxX:number;minZ:number;maxZ:number;startX:number;endX:number;z:number;fromY:number;toY:number;width:number;steps:number};
export interface RoyalCitadelLocalCollider {id:string;x:number;z:number;halfWidth:number;halfDepth:number;minY:number;maxY:number}
const flightSteps=ROYAL_CITADEL_FLIGHT_STEPS;
export const ROYAL_CITADEL_MONUMENT_SCALE=Object.freeze({baselineScale:3.05,linearFactor:10,defensiveTowerHeightFactor:5,stairRiseWorld:10.35*30.5/flightSteps,railingHeightWorld:1.05});
export const ROYAL_CITADEL_DEFENSIVE_TOWERS=Object.freeze([
  ...[-1,1].flatMap(sign=>[
    {id:`outer-front-${sign}`,x:sign*63,y:1.3,z:65,radius:6.1,baselineHeight:26},
    {id:`outer-rear-${sign}`,x:sign*63,y:1.3,z:-38,radius:5.8,baselineHeight:43.3},
    {id:`outer-gate-${sign}`,x:sign*14,y:1.3,z:75.5,radius:4.4,baselineHeight:45.3},
    {id:`inner-front-${sign}`,x:sign*46,y:0,z:29,radius:5.4,baselineHeight:23},
    {id:`inner-rear-${sign}`,x:sign*46,y:0,z:-29,radius:5.1,baselineHeight:27},
  ]),
]);
const PUBLIC_TOWER_SHAFT={x:25.8,z:14.3,radius:82/ROYAL_CITADEL_TRANSFORM.scale,minY:(1186.8-ROYAL_CITADEL_TRANSFORM.baseY)/ROYAL_CITADEL_TRANSFORM.scale,maxY:(2029.4-ROYAL_CITADEL_TRANSFORM.baseY)/ROYAL_CITADEL_TRANSFORM.scale};
/** Local coordinate contract. The scene applies its own origin and 30.5 scale;
 * no game position or terrain ownership is modified by this architectural plan. */
export const ROYAL_CITADEL_LOCAL_PLAN={
  footprint:{minX:-72,maxX:72,minZ:-49,maxZ:83,height:142},
  plaza:{minX:-47,maxX:47,minZ:43,maxZ:70,y:1.3},
  gardens:[{minX:-43,maxX:-13,minZ:46,maxZ:68,y:1.3},{minX:13,maxX:43,minZ:46,maxZ:68,y:1.3}],
  surfaces:[
    {id:'royal-plaza',kind:'flat',minX:-47,maxX:47,minZ:43,maxZ:70,y:1.3},
    {id:'outer-gate-avenue',kind:'flat',minX:-6.5,maxX:6.5,minZ:70,maxZ:83,y:1.3},
    {id:'inner-gate-avenue',kind:'flat',minX:-6.5,maxX:6.5,minZ:31,maxZ:43,y:1.3},
    {id:'lower-court',kind:'flat',minX:-20,maxX:20,minZ:31,maxZ:34.5,y:1.3},
    {id:'stair-apron',kind:'flat',minX:-3,maxX:3,minZ:25.25,maxZ:31,y:1.3},
    ...[-1,1].flatMap(sign=>[
      {id:`lower-flight-${sign}`,kind:'stairs' as const,minX:sign<0?-18:3,maxX:sign<0?-3:18,minZ:25.25,maxZ:30.75,startX:sign*3,endX:sign*18,z:28,fromY:1.3,toY:11.65,width:5.5,steps:flightSteps},
      {id:`turn-landing-${sign}`,kind:'flat' as const,minX:sign<0?-21:18,maxX:sign<0?-18:21,minZ:16.75,maxZ:30.75,y:11.65},
      {id:`upper-flight-${sign}`,kind:'stairs' as const,minX:sign<0?-18:3,maxX:sign<0?-3:18,minZ:16.75,maxZ:22.25,startX:sign*18,endX:sign*3,z:19.5,fromY:11.65,toY:22,width:5.5,steps:flightSteps},
      {id:`annex-walk-${sign}`,kind:'flat' as const,minX:sign<0?-67:54,maxX:sign<0?-54:67,minZ:-33,maxZ:54,y:1.3},
      {id:`annex-connector-${sign}`,kind:'flat' as const,minX:sign<0?-67:47,maxX:sign<0?-47:67,minZ:43,maxZ:54,y:1.3},
    ]),
    {id:'upper-landing',kind:'flat',minX:-3,maxX:3,minZ:14.8,maxZ:22.25,y:22},
    {id:'guard-vestibule',kind:'flat',minX:-4,maxX:4,minZ:8.3,maxZ:15.5,y:22},
  ] as RoyalCitadelLocalSurface[],
  solidColliders:[] as RoyalCitadelLocalCollider[],
};
for(const sign of[-1,1]){
  ROYAL_CITADEL_LOCAL_PLAN.solidColliders.push(
    {id:`outer-front-${sign}`,x:sign*43,z:77,halfWidth:29,halfDepth:1.5,minY:1.3,maxY:15.4},
    {id:`outer-gate-pier-${sign}`,x:sign*10.65,z:77,halfWidth:3.35,halfDepth:2.6,minY:1.3,maxY:17.3},
    {id:`outer-side-back-${sign}`,x:sign*70,z:-29,halfWidth:1.4,halfDepth:20,minY:1.3,maxY:15.4},
    {id:`outer-side-front-${sign}`,x:sign*70,z:46,halfWidth:1.4,halfDepth:29,minY:1.3,maxY:15.4},
    {id:`core-front-${sign}`,x:sign*32,z:36,halfWidth:20,halfDepth:1.4,minY:0,maxY:16.2},
    {id:`core-gate-pier-${sign}`,x:sign*9.53,z:36,halfWidth:2.23,halfDepth:2.5,minY:0,maxY:16},
    {id:`core-side-${sign}`,x:sign*51,z:0,halfWidth:1.4,halfDepth:35.5,minY:0,maxY:16.2},
    {id:`hall-front-${sign}`,x:sign*16.3,z:15.5,halfWidth:12.2,halfDepth:.75,minY:22,maxY:49},
    {id:`vestibule-side-${sign}`,x:sign*5.3,z:11.2,halfWidth:.45,halfDepth:4.2,minY:22,maxY:31},
    {id:`front-bastion-${sign}`,x:sign*63,z:65,halfWidth:6.8,halfDepth:6.8,minY:1.3,maxY:14.3},
    {id:`rampart-bridge-pier-${sign}`,x:sign*62,z:-25,halfWidth:1.25,halfDepth:2.85,minY:1.3,maxY:13.3},
  );
}
// The old front hall passes through the public east tower. Match its new
// physical shaft opening with finite AABB pieces instead of retaining one
// invisible wall across the spiral. The navigation floor bounds the opening.
const hallIndex=ROYAL_CITADEL_LOCAL_PLAN.solidColliders.findIndex(c=>c.id==='hall-front-1');
if(hallIndex>=0){const wall=ROYAL_CITADEL_LOCAL_PLAN.solidColliders[hallIndex],left=wall.x-wall.halfWidth,right=wall.x+wall.halfWidth,cutLeft=PUBLIC_TOWER_SHAFT.x-PUBLIC_TOWER_SHAFT.radius,cutRight=PUBLIC_TOWER_SHAFT.x+PUBLIC_TOWER_SHAFT.radius,pieces:RoyalCitadelLocalCollider[]=[];
  if(left<cutLeft)pieces.push({...wall,id:'hall-front-1-west',x:(left+cutLeft)/2,halfWidth:(cutLeft-left)/2});
  if(right>cutRight)pieces.push({...wall,id:'hall-front-1-east',x:(cutRight+right)/2,halfWidth:(right-cutRight)/2});
  if(wall.minY<PUBLIC_TOWER_SHAFT.minY)pieces.push({...wall,id:'hall-front-1-base',maxY:PUBLIC_TOWER_SHAFT.minY});
  if(wall.maxY>PUBLIC_TOWER_SHAFT.maxY)pieces.push({...wall,id:'hall-front-1-crown',minY:PUBLIC_TOWER_SHAFT.maxY});
  ROYAL_CITADEL_LOCAL_PLAN.solidColliders.splice(hallIndex,1,...pieces);
}
let resources:Resources|undefined;
const PALE=0xd8cfb5,LIGHT=0xeee5ce,SHADE=0x9caaab,COPPER=0xb66a3c,COPPER_LIGHT=0xd68c48,PATINA=0x427d7c,BLUE=0x174e8e,GOLD=0xe1b65c;

function texture(seed:number){
  const side=32,data=new Uint8Array(side*side*4);for(let y=0;y<side;y++)for(let x=0;x<side;x++){const hash=(Math.imul((x>>1)+seed,374761393)^Math.imul((y>>1)+31,668265263))>>>0,i=(y*side+x)*4,value=hash%9===0?222:hash%4===0?240:253;data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;}
  const result=new THREE.DataTexture(data,side,side,THREE.RGBAFormat);result.colorSpace=THREE.SRGBColorSpace;result.wrapS=result.wrapT=THREE.RepeatWrapping;result.magFilter=THREE.LinearFilter;result.minFilter=THREE.LinearMipmapLinearFilter;result.generateMipmaps=true;result.needsUpdate=true;return result;
}
function pool(){
  if(resources)return resources;const grain=texture(17),tiles=texture(41);
  resources={templates:new Map(),geometries:new Set(),textures:[grain,tiles],materials:{
    stone:new THREE.MeshStandardMaterial({vertexColors:true,map:grain,roughness:.88}),roof:new THREE.MeshStandardMaterial({vertexColors:true,map:tiles,roughness:.65,metalness:.12}),
    glass:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.24,metalness:.14}),warm:new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffbc64,emissiveIntensity:.34,roughness:.45}),
    cloth:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}),metal:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.44,metalness:.35}),
  }};return resources;
}

class Masonry {
  private batches=new Map<Surface,THREE.BufferGeometry[]>();
  private transform=new THREE.Matrix4();
  private quaternion=new THREE.Quaternion();
  private position=new THREE.Vector3();
  private scale=new THREE.Vector3();
  add(surface:Surface,colour:number,source:THREE.BufferGeometry,x=0,y=0,z=0,w=1,h=1,d=1,rx=0,ry=0,rz=0){
    const geometry=source.index?source.toNonIndexed():source.clone();this.transform.compose(this.position.set(x,y,z),this.quaternion.setFromEuler(new THREE.Euler(rx,ry,rz)),this.scale.set(w,h,d));geometry.applyMatrix4(this.transform);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    const color=new THREE.Color(colour),rgb=new Float32Array(geometry.getAttribute('position').count*3);for(let i=0;i<rgb.length;i+=3){rgb[i]=color.r;rgb[i+1]=color.g;rgb[i+2]=color.b;}geometry.setAttribute('color',new THREE.BufferAttribute(rgb,3));let batch=this.batches.get(surface);if(!batch){batch=[];this.batches.set(surface,batch);}batch.push(geometry);
  }
  box(surface:Surface,colour:number,x:number,y:number,z:number,w:number,h:number,d:number,ry=0,rz=0){this.add(surface,colour,UNIT,x,y,z,w,h,d,0,ry,rz);}
  /** Scale just this architectural part around its own foot. The palace and
   * its plan retain their tenfold size while defensive tower heights are fivefold. */
  vertical(pivot:number,factor:number,build:()=>void){
    const offsets=new Map([...this.batches].map(([surface,parts])=>[surface,parts.length]));build();
    for(const[surface,parts]of this.batches)for(let i=offsets.get(surface)??0;i<parts.length;i++){
      const geometry=parts[i],positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
      for(let vertex=0;vertex<positions.count;vertex++){
        positions.setY(vertex,pivot+(positions.getY(vertex)-pivot)*factor);
        const x=normals.getX(vertex),y=normals.getY(vertex)/factor,z=normals.getZ(vertex),length=Math.hypot(x,y,z)||1;
        normals.setXYZ(vertex,x/length,y/length,z/length);
      }
    }
  }
  beam(surface:Surface,colour:number,a:Point,b:Point,width:number,depth=width){const from=new THREE.Vector3(a.x,a.y,a.z),to=new THREE.Vector3(b.x,b.y,b.z),delta=to.clone().sub(from),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),angles=new THREE.Euler().setFromQuaternion(q),mid=from.add(to).multiplyScalar(.5);this.add(surface,colour,UNIT,mid.x,mid.y,mid.z,width,delta.length(),depth,angles.x,angles.y,angles.z);}
  finish(name:string){const group=new THREE.Group();group.name=name;for(const[surface,parts]of this.batches){const prepared=name==='royal-harbor-citadel'?parts.map(openPublicTowerShaft):parts;const geometry=mergeGeometries(prepared,false)!;new Set([...parts,...prepared]).forEach(part=>part.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();pool().geometries.add(geometry);const mesh=new THREE.Mesh(geometry,pool().materials[surface]);mesh.name=`${name}:${surface}`;mesh.castShadow=surface!=='warm'&&surface!=='cloth';mesh.receiveShadow=true;group.add(mesh);}this.batches.clear();group.userData.royalGeometryShared=true;return group;}
}
/** Subtract a bounded convex shaft from every crossing roof/cornice triangle.
 * Vertex normals, UVs and colours are interpolated along the cut; no external
 * facade is hidden and no triangle bounding box is simply thrown away. */
function openPublicTowerShaft(source:THREE.BufferGeometry){
  const t=PUBLIC_TOWER_SHAFT;source.computeBoundingBox();const box=source.boundingBox!,extent=t.radius/Math.cos(Math.PI/32);
  if(box.max.x<t.x-extent||box.min.x>t.x+extent||box.max.z<t.z-extent||box.min.z>t.z+extent||box.max.y<t.minY||box.min.y>t.maxY)return source;
  const planes:{x:number;y:number;z:number;c:number}[]=[{x:0,y:-1,z:0,c:-t.minY},{x:0,y:1,z:0,c:t.maxY}];
  for(let i=0;i<32;i++){const a=i*Math.PI/16,x=Math.cos(a),z=Math.sin(a);planes.push({x,y:0,z,c:t.radius+x*t.x+z*t.z});}
  const names=['position','normal','uv','color'] as const,sizes=[3,3,2,3],attributes=names.map(name=>source.getAttribute(name)),output:number[]=[],distance=(v:number[],plane:{x:number;y:number;z:number;c:number})=>v[0]*plane.x+v[1]*plane.y+v[2]*plane.z-plane.c;
  const emit=(poly:number[][])=>{for(let i=1;i<poly.length-1;i++)output.push(...poly[0],...poly[i],...poly[i+1]);};
  for(let start=0;start<attributes[0].count;start+=3){
    const triangle:number[][]=[];for(let vertex=0;vertex<3;vertex++){const values:number[]=[];for(let a=0;a<attributes.length;a++)for(let component=0;component<sizes[a];component++)values.push(attributes[a].array[(start+vertex)*sizes[a]+component]);triangle.push(values);}
    if(planes.some(plane=>triangle.every(v=>distance(v,plane)>1e-7))){emit(triangle);continue;}
    let remaining=triangle;
    for(const plane of planes){if(remaining.length<3)break;const inside:number[][]=[],outside:number[][]=[];
      for(let i=0;i<remaining.length;i++){const a=remaining[i],b=remaining[(i+1)%remaining.length],da=distance(a,plane),db=distance(b,plane),aInside=da<=0,bInside=db<=0;(aInside?inside:outside).push(a);
        if(aInside!==bInside){const ratio=da/(da-db),vertex=a.map((value,j)=>value+(b[j]-value)*ratio);inside.push(vertex);outside.push(vertex);}}
      if(outside.length>=3)emit(outside);remaining=inside;
    }
  }
  const geometry=new THREE.BufferGeometry(),stride=11,count=output.length/stride;let offset=0;for(let a=0;a<names.length;a++){const data=new Float32Array(count*sizes[a]);for(let v=0;v<count;v++)for(let k=0;k<sizes[a];k++)data[v*sizes[a]+k]=output[v*stride+offset+k];geometry.setAttribute(names[a],new THREE.BufferAttribute(data,sizes[a]));offset+=sizes[a];}
  geometry.normalizeNormals();return geometry;
}
// These tiny CPU primitives outlive template clones; only merged GPU buffers are
// owned by the exported resource pool.
const UNIT=new THREE.BoxGeometry(1,1,1),OCTAGON=new THREE.CylinderGeometry(1,1,1,8,1,false),CONE=new THREE.ConeGeometry(1,1,8,1,false);

/** A wall with an open arch cut out of its actual boundary, not a black decal. */
function archWall(span:number,height:number,radius:number,spring:number,rise:number,depth:number,pointed=false){
  const shape=new THREE.Shape();shape.moveTo(-span/2,0);shape.lineTo(-radius,0);shape.lineTo(-radius,spring);
  if(pointed){shape.quadraticCurveTo(-radius*.72,spring+rise*.69,0,spring+rise);shape.quadraticCurveTo(radius*.72,spring+rise*.69,radius,spring);}
  else for(let i=1;i<=20;i++){const a=Math.PI-i*Math.PI/20;shape.lineTo(Math.cos(a)*radius,spring+Math.sin(a)*rise);}
  shape.lineTo(radius,0);shape.lineTo(span/2,0);shape.lineTo(span/2,height);shape.lineTo(-span/2,height);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:6});geometry.translate(0,0,-depth/2);return geometry;
}
function pointedPanel(radius:number,spring:number,rise:number,depth:number){const shape=new THREE.Shape();shape.moveTo(-radius,0);shape.lineTo(-radius,spring);shape.quadraticCurveTo(-radius*.72,spring+rise*.69,0,spring+rise);shape.quadraticCurveTo(radius*.72,spring+rise*.69,radius,spring);shape.lineTo(radius,0);shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:6});geometry.translate(0,0,-depth/2);return geometry;}
function piercedTowerWall(span:number,height:number,radius:number,spring:number,rise:number,depth=.9,portals:{y:number;radius:number;spring:number;rise:number}[]=[]){
  const shape=new THREE.Shape();shape.moveTo(-span/2,0);shape.lineTo(span/2,0);shape.lineTo(span/2,height);shape.lineTo(-span/2,height);shape.closePath();
  for(const floor of[.32,.67]){const y=height*floor,hole=new THREE.Path();hole.moveTo(-radius,y);hole.lineTo(-radius,y+spring);hole.quadraticCurveTo(-radius*.72,y+spring+rise*.69,0,y+spring+rise);hole.quadraticCurveTo(radius*.72,y+spring+rise*.69,radius,y+spring);hole.lineTo(radius,y);hole.closePath();shape.holes.push(hole);}
  for(const portal of portals){const hole=new THREE.Path(),y=portal.y,r=portal.radius;hole.moveTo(-r,y);hole.lineTo(-r,y+portal.spring);hole.quadraticCurveTo(-r*.72,y+portal.spring+portal.rise*.69,0,y+portal.spring+portal.rise);hole.quadraticCurveTo(r*.72,y+portal.spring+portal.rise*.69,r,y+portal.spring);hole.lineTo(r,y);hole.closePath();shape.holes.push(hole);}
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:6});geometry.translate(0,0,-depth/2);return geometry;
}
function archRing(builder:Masonry,x:number,y:number,z:number,radius:number,spring:number,rise:number,depth:number,yaw=0,pointed=false){
  const segments=pointed?14:18,c=Math.cos(yaw),s=Math.sin(yaw),at=(u:number,v:number,n:number)=>({x:x+c*u+s*n,y:y+v,z:z-s*u+c*n});
  for(const sign of[-1,1])builder.beam('stone',LIGHT,at(sign*(radius+.28),0,0),at(sign*(radius+.28),spring,0),.55,depth);
  const arc=(t:number)=>{if(!pointed){const a=Math.PI*(1-t);return{x:Math.cos(a)*radius,y:spring+Math.sin(a)*rise};}const side=t<.5?-1:1,u=t<.5?t*2:(1-t)*2,q=1-u;return{x:side*radius*(q*q+1.44*q*u),y:spring+rise*(1.38*q*u+u*u)};};
  for(let i=0;i<segments;i++){const a=arc(i/segments),b=arc((i+1)/segments);builder.beam('stone',i%4?LIGHT:PALE,at(a.x,a.y,0),at(b.x,b.y,0),.58,depth);}
  builder.box('stone',LIGHT,x,y+spring+rise+.12,z,.9,.85,depth+.18,yaw);
}
function window(builder:Masonry,x:number,y:number,z:number,radius:number,spring:number,rise:number,yaw=0,warm=false){
  const c=Math.cos(yaw),s=Math.sin(yaw),panel=pointedPanel(radius,spring,rise,.1);builder.add(warm?'warm':'glass',warm?0xdfad65:0x315b74,panel,x-s*.65,y,z-c*.65,1,1,1,0,yaw);panel.dispose();archRing(builder,x,y,z,radius,spring,rise,.42,yaw,true);
  const height=spring+rise;for(const u of[-radius*.42,radius*.42])builder.box('stone',LIGHT,x+c*u,y+spring*.48,z-s*u,.16,spring*.96,.22,yaw);builder.box('stone',LIGHT,x,y+height*.4,z,.2,height*.8,.25,yaw);builder.box('stone',LIGHT,x,y+spring*.47,z,radius*1.95,.17,.25,yaw);
}
function rectangularHall(builder:Masonry,x:number,y:number,z:number,w:number,d:number,h:number,bays:number,floors=2,entrance=false){
  builder.box('stone',SHADE,x,entrance?y-.3:y+.6,z,w+1.4,entrance?.6:1.2,d+1.4);builder.box('stone',PALE,x,y+h-.4,z,w,.8,d);
  for(let side=0;side<4;side++){
    const yaw=side*Math.PI/2,c=Math.cos(yaw),s=Math.sin(yaw),length=side%2?d:w,n=(side%2?w:d)/2,count=side%2?Math.max(2,Math.round(bays*d/w)):bays,span=length/count,storey=h/floors;
    for(let floor=0;floor<floors;floor++){
      const yy=y+floor*storey,sill=1.7,radius=Math.min(1.45,span*.23),rise=2.2,spring=Math.max(2.6,storey-5.3),wall=archWall(span,storey-sill,radius,spring,rise,1.2,true);
      for(let bay=0;bay<count;bay++){
        const u=-length/2+(bay+.5)*span,px=x+c*u+s*n,pz=z-s*u+c*n,portal=entrance&&side===0&&floor===0&&bay===Math.floor(count/2);
        if(portal){const doorway=archWall(span,storey,3.8,6,4,1.2,true);builder.add('stone',LIGHT,doorway,px,yy,pz);doorway.dispose();archRing(builder,px,yy,pz+.68,3.8,6,4,.7,0,true);}
        else{builder.add('stone',bay%4?PALE:LIGHT,wall,px,yy+sill,pz,1,1,1,0,yaw);window(builder,px+s*.68,yy+sill,pz+c*.68,radius,spring,rise,yaw,(bay+floor)%4===0);}
      }
      wall.dispose();if(entrance&&side===0&&floor===0){for(const sign of[-1,1])builder.box('stone',PALE,x+sign*(length+span)/4,yy+sill/2,z+n,(length-span)/2,sill,1.2);}
      else builder.box('stone',PALE,x+s*n,yy+sill/2,z+c*n,side%2?1.2:length,sill,side%2?length:1.2);
      builder.box('stone',LIGHT,x+s*(n+.12),yy+storey-.18,z+c*(n+.12),side%2?1.5:length+.6,.55,side%2?length+.6:1.5);
    }
    for(let bay=0;bay<=count;bay++){const u=-length/2+bay*span;for(let step=0;step<3;step++){const hh=h*(1-step*.21),out=1.7-step*.45;builder.box('stone',step%2?PALE:LIGHT,x+c*u+s*(n+out/2),y+hh/2,z-s*u+c*(n+out/2),1.0,hh,out,yaw);}}
  }
}
function gableRoof(builder:Masonry,x:number,y:number,z:number,w:number,d:number,rise:number,patina=false){
  const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,rise);shape.closePath();const roof=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false});roof.translate(0,0,-d/2);builder.add('roof',patina?PATINA:COPPER,roof,x,y,z);roof.dispose();
  const slope=Math.atan2(rise,w/2),rows=7,columns=Math.max(3,Math.ceil(d/2.2));
  for(const side of[-1,1])for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const t=(row+.5)/rows;builder.box('roof',(row+col)%5===0?patina?0x66918a:COPPER_LIGHT:patina?PATINA:COPPER,x+side*w/2*(1-t),y+rise*t+.13,z-d/2+(col+.5)*d/columns,Math.hypot(w/2,rise)/rows+.08,.18,d/columns-.07,0,-side*slope);}
  for(const end of[-1,1])for(const side of[-1,1])builder.beam('stone',LIGHT,{x:x+side*w/2,y,z:z+end*d/2},{x,y:y+rise,z:z+end*d/2},.32);
  builder.box('roof',patina?0x6e9b91:COPPER_LIGHT,x,y+rise+.2,z,.45,.45,d+.65);
  for(const end of[-1,1])builder.box('metal',GOLD,x,y+rise+.85,z+end*d/2,.2,1.6,.2);
}
function banner(builder:Masonry,x:number,y:number,z:number,w:number,h:number,yaw=0){
  const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,-h);shape.lineTo(0,-h-w*.3);shape.lineTo(-w/2,-h);shape.closePath();const geometry=new THREE.ShapeGeometry(shape);builder.add('cloth',BLUE,geometry,x,y,z,1,1,1,0,yaw);geometry.dispose();
  const c=Math.cos(yaw),s=Math.sin(yaw),put=(u:number,v:number,ww:number,hh:number,roll=0)=>builder.box('metal',GOLD,x+c*u+s*.09,y+v,z-s*u+c*.09,ww,hh,.09,yaw,roll);
  put(0,-h*.46,w*.12,h*.48);put(0,-h*.62,w*.52,h*.065);put(-w*.2,-h*.39,w*.16,h*.24,-.48);put(w*.2,-h*.39,w*.16,h*.24,.48);put(0,-h*.2,w*.21,h*.15);put(0,-h*.8,w*.3,h*.07);
  builder.box('metal',GOLD,x,y+.17,z,w+.7,.2,.2,yaw);for(const side of[-1,1])builder.box('metal',GOLD,x+c*side*(w/2+.4),y+.17,z-s*side*(w/2+.4),.28,.4,.28);
}
function tower(builder:Masonry,x:number,y:number,z:number,r:number,h:number,spire:number,patina=false,crenellated=false,publicInterior=false){
  const radius=Math.min(.6,r*.16),spring=Math.min(3,h*.12),normal=r*Math.cos(Math.PI/8),scale=ROYAL_CITADEL_TRANSFORM.scale,depth=publicInterior?normal-82/scale:.9;
  for(const yy of[.6,h*.3,h*.67,h-.7]){
    if(publicInterior){const shape=new THREE.Shape(),hole=new THREE.Path();for(let i=0;i<=8;i++){const a=i*Math.PI/4,xx=Math.sin(a)*(r+.38),zz=Math.cos(a)*(r+.38);if(i)shape.lineTo(xx,zz);else shape.moveTo(xx,zz);}for(let i=0;i<=32;i++){const a=-i*Math.PI/16,xx=Math.sin(a)*82/scale,zz=Math.cos(a)*82/scale;if(i)hole.lineTo(xx,zz);else hole.moveTo(xx,zz);}shape.holes.push(hole);const ring=new THREE.ExtrudeGeometry(shape,{depth:.55,bevelEnabled:false,curveSegments:1});ring.rotateX(Math.PI/2);ring.translate(0,.275,0);builder.add('stone',yy===.6?SHADE:LIGHT,ring,x,y+yy,z);ring.dispose();}
    else builder.add('stone',yy===.6?SHADE:LIGHT,OCTAGON,x,y+yy,z,r+.38,.55,r+.38);
  }
  for(let side=0;side<8;side++){
    const yaw=side*Math.PI/4,xx=x+Math.sin(yaw)*normal,zz=z+Math.cos(yaw)*normal,portals:{y:number;radius:number;spring:number;rise:number}[]=[];
    if(publicInterior){portals.push({y:(2010+1.2-(480+y*scale))/scale,radius:19/scale,spring:12/scale,rise:4/scale});if(side===6)portals.push({y:(1187-(480+y*scale))/scale,radius:6/scale,spring:12/scale,rise:4/scale});}
    const panel=piercedTowerWall(2*r*Math.sin(Math.PI/8)+.04,h,radius,spring,1.1,depth,portals);builder.add('stone',side%3?PALE:LIGHT,panel,xx-Math.sin(yaw)*depth/2,y,zz-Math.cos(yaw)*depth/2,1,1,1,0,yaw);panel.dispose();
    for(const floor of[.32,.67])window(builder,xx+Math.sin(yaw)*.35,y+h*floor,zz+Math.cos(yaw)*.35,radius,spring,1.1,yaw,floor===.67&&side%3===0);
  }
  if(crenellated){for(let side=0;side<12;side++){const a=side*Math.PI/6;builder.box('stone',LIGHT,x+Math.sin(a)*r,y+h+1,z+Math.cos(a)*r,1.7,2,1.7,a);}return;}
  builder.add('roof',patina?PATINA:COPPER,CONE,x,y+h+spire/2,z,r+1.1,spire,r+1.1);
  for(let side=0;side<8;side++){const a=side*Math.PI/4;builder.beam('roof',patina?0x74a294:COPPER_LIGHT,{x:x+Math.sin(a)*(r+1.08),y:y+h,z:z+Math.cos(a)*(r+1.08)},{x,y:y+h+spire,z},.18);}
  builder.box('metal',GOLD,x,y+h+spire+.65,z,.18,1.3,.18);builder.add('metal',GOLD,OCTAGON,x,y+h+spire+.1,z,.34,.4,.34);
}
function defensiveTower(builder:Masonry,x:number,y:number,z:number,r:number,h:number,spire:number,patina=false,crenellated=false){builder.vertical(y,.5,()=>tower(builder,x,y,z,r,h,spire,patina,crenellated));}
/** Open flying buttresses support the nave while leaving visible air beneath. */
function flyingButtress(builder:Masonry,x:number,y:number,z:number,sign:number,height:number){
  const outer=x+sign*8.2;
  builder.box('stone',PALE,outer,y+height*.31,z,1.9,height*.62,2.4);
  builder.box('stone',LIGHT,outer,y+height*.63,z,2.5,.55,3.0);
  builder.beam('stone',LIGHT,{x:outer,y:y+height*.6,z},{x,y:y+height*.94,z},.9,1.7);
  builder.beam('stone',PALE,{x:outer,y:y+height*.39,z},{x,y:y+height*.75,z},.75,1.4);
  builder.add('roof',PATINA,CONE,outer,y+height*.68,z,.9,2.7,.9);
}
function cloister(builder:Masonry,x:number,y:number,z:number,length:number,yaw=0){
  const count=Math.max(2,Math.round(length/5.4)),span=length/count,arch=archWall(span,6.8,span*.33,2.4,2.8,1.25);
  for(let i=0;i<count;i++){const u=-length/2+(i+.5)*span,xx=x+Math.cos(yaw)*u,zz=z-Math.sin(yaw)*u;builder.add('stone',i%3?PALE:LIGHT,arch,xx,y,zz,1,1,1,0,yaw);archRing(builder,xx,y,zz,span*.33,2.4,2.8,1.42,yaw);}
  arch.dispose();builder.box('stone',LIGHT,x,y+6.9,z,length+.5,.5,2.1,yaw);parapet(builder,x,y+7.3,z,length,yaw);
}
function citadelStair(builder:Masonry,flight:Extract<RoyalCitadelLocalSurface,{kind:'stairs'}>,metres=false){
  const {startX,endX,z,fromY,toY,width,steps}=flight,run=(endX-startX)/steps,rise=(toY-fromY)/steps,vertices:number[]=[],uv:number[]=[];
  // A single closed step profile avoids thousands of overlapping box objects
  // and their invisible internal faces. The walk contract samples these same
  // discrete treads, whose world rise stays at 15.25 cm after enlargement.
  const quad=(a:number[],b:number[],c:number[],d:number[])=>{vertices.push(...a,...b,...d,...b,...c,...d);uv.push(0,0,1,0,0,1,1,0,1,1,0,1);};
  const near=z-width/2,far=z+width/2,base=1.3;
  for(let i=0;i<steps;i++){
    const a=startX+i*run,b=a+run,top=fromY+(i+1)*rise,previous=fromY+i*rise;
    quad([a,top,near],[a,top,far],[b,top,far],[b,top,near]);
    quad([a,previous,far],[a,top,far],[a,top,near],[a,previous,near]);
    quad([a,base,near],[a,top,near],[b,top,near],[b,base,near]);
    quad([b,base,far],[b,top,far],[a,top,far],[a,base,far]);
  }
  quad([startX,base,near],[endX,base,near],[endX,base,far],[startX,base,far]);
  quad([endX,base,near],[endX,toY,near],[endX,toY,far],[endX,base,far]);
  if(run<0)for(let triangle=0;triangle<vertices.length;triangle+=9){for(let component=0;component<3;component++){const first=vertices[triangle+3+component];vertices[triangle+3+component]=vertices[triangle+6+component];vertices[triangle+6+component]=first;}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();builder.add('stone',LIGHT,geometry);geometry.dispose();
  const inverse=1/(metres?30.5/30:ROYAL_CITADEL_TRANSFORM.scale),handrail=1.05*inverse;
  for(const sign of[-1,1]){
    const zz=z+sign*(width/2+.12*inverse);
    builder.beam('stone',PALE,{x:startX,y:fromY+.2*inverse,z:zz},{x:endX,y:toY+.2*inverse,z:zz},.24*inverse,.3*inverse);
    builder.beam('metal',GOLD,{x:startX,y:fromY+handrail,z:zz},{x:endX,y:toY+handrail,z:zz},.11*inverse,.16*inverse);
    const posts=Math.ceil(Math.abs(endX-startX)*(metres?30.5/30:ROYAL_CITADEL_TRANSFORM.scale)/(metres?.8:4));
    for(let i=0;i<=posts;i++){const t=i/posts;builder.box('stone',i%3?PALE:LIGHT,startX+(endX-startX)*t,fromY+(toY-fromY)*t+handrail/2,zz,.15*inverse,handrail,.15*inverse);}
  }
}
/** The elevated turn is carried by true arches. Its footprint touches the end
 * of the stair flights and never blankets their final ascending treads. */
function stairTurnLanding(builder:Masonry,sign:number){
  const x=sign*19.5,arch=archWall(7,9.8,2.0,4.7,3.0,2.7);
  for(const z of[20.25,27.25])builder.add('stone',PALE,arch,x,1.3,z,1,1,1,0,Math.PI/2);
  arch.dispose();builder.box('stone',LIGHT,x,11.4,23.75,3,.5,14);
  builder.box('stone',LIGHT,sign*21.15,12.35,23.75,.3,1.4,14.5);
}
function outerFortifications(builder:Masonry){
  // Low outer courts and tall gatehouses broaden the monumental silhouette;
  // the grass/plaza surfaces are authored by a separate civic district module.
  builder.box('stone',SHADE,0,.65,17,144,1.3,132);
  builder.box('stone',PALE,0,7.55,-47,140,12.5,2.8);parapet(builder,0,14,-47,140);
  for(const sign of[-1,1]){
    builder.box('stone',PALE,sign*70,7.55,-29,2.8,12.5,40);
    builder.box('stone',PALE,sign*70,7.55,46,2.8,12.5,58);
    parapet(builder,sign*70,14,-29,40,Math.PI/2);parapet(builder,sign*70,14,46,58,Math.PI/2);
    const sideGate=archWall(26,12.5,4.5,4.2,5.2,2.8,true);builder.add('stone',LIGHT,sideGate,sign*70,1.3,4,1,1,1,0,Math.PI/2);sideGate.dispose();
    builder.box('stone',PALE,sign*43,7.55,77,58,12.5,3);parapet(builder,sign*43,14,77,58);
    defensiveTower(builder,sign*63,1.3,65,6.1,24,9,false,true);
    defensiveTower(builder,sign*63,1.3,-38,5.8,30,12,sign>0);
    defensiveTower(builder,sign*14,1.3,75.5,4.4,31,13,sign<0);
    banner(builder,sign*14,14.4,80.3,2.4,5);banner(builder,sign*42,12.8,79,2.4,7.8);
    // A pair of elevated arcaded crossings joins the inner and outer ramparts.
    const bridgeArch=archWall(8.5,12.0,3.0,4.1,5.9,5.7);
    for(let i=0;i<2;i++)builder.add('stone',i?PALE:LIGHT,bridgeArch,sign*(53.5+(i+.5)*8.5),1.3,-25);
    bridgeArch.dispose();builder.box('stone',LIGHT,sign*61.25,13.55,-25,19.5,.5,6.4);
    for(const zz of[-28.1,-21.9])parapet(builder,sign*61.25,14.1,zz,19.5);
    // Stepped corbels, drainage mouths and deep vertical piers break the curtain.
    for(let i=0;i<7;i++){
      const xx=sign*(21+i*7.2);builder.box('stone',SHADE,xx,7.3,78.75,1.5,12,1.1);
      builder.box('stone',LIGHT,xx,12.9,79.1,2.4,1,1.4);
      builder.box('stone',SHADE,xx,12.5,79.9,.45,.45,1.7);
    }
  }
  const gate=archWall(28,19.8,7.3,6.2,8.0,5.2,true);builder.add('stone',LIGHT,gate,0,1.3,77);gate.dispose();archRing(builder,0,1.3,79.7,7.3,6.2,8,.95,0,true);parapet(builder,0,21.4,77,28);
  // Raised portcullis is visibly above the passage, so it cannot obstruct a
  // visitor following the avenue through the gate at the physical plaza height.
  for(let i=0;i<13;i++)builder.box('metal',0x5e6561,-6.6+i*1.1,17.6,76.3,.12,5.6,.15);
  for(const y of[15.4,17.1,19])builder.box('metal',0x7a7565,0,y,76.3,13.7,.12,.16);
  for(const sign of[-1,1]){
    builder.box('stone',LIGHT,sign*8.3,1.5,67.5,1.0,.4,10);
    builder.box('stone',LIGHT,sign*8.3,1.5,48.5,1.0,.4,12);
  }
}
function parapet(builder:Masonry,x:number,y:number,z:number,length:number,yaw=0){
  builder.box('stone',LIGHT,x,y,z,length,.55,2.2,yaw);const count=Math.max(2,Math.floor(length/3.1));for(let i=0;i<count;i++){const u=-length/2+(i+.5)*length/count;builder.box('stone',PALE,x+Math.cos(yaw)*u,y+1.15,z-Math.sin(yaw)*u,1.7,1.8,1.85,yaw);}
}

/** A complete hilltop royal precinct with two defensive rings, a ceremonial
 * plaza, open galleries and an actually connected bifurcated palace approach. */
export function createRoyalCitadel(metres=false):THREE.Group{
  const cache=pool().templates;const key=metres?'citadel-metres':'citadel';let template=cache.get(key);if(template)return template.clone(true);
  const b=new Masonry();
  // An inhabited defensive court: the facade is interrupted by towers, galleries
  // and a processional gate instead of three featureless stacked masonry boxes.
  outerFortifications(b);
  b.box('stone',PALE,0,6.6,-36,103,13.2,2.7);parapet(b,0,13.4,-36,103);
  for(const sign of[-1,1]){
    b.box('stone',sign<0?PALE:SHADE,sign*51,6.6,0,2.7,13.2,71);parapet(b,sign*51,13.4,0,71,Math.PI/2);
    b.box('stone',PALE,sign*32,6.6,36,40,13.2,2.7);parapet(b,sign*32,13.4,36,40);
    defensiveTower(b,sign*46,0,29,5.4,21,7,false,true);
    defensiveTower(b,sign*46,0,-29,5.1,25,8,false,true);
    // Wall pilasters, arrow slits, blue-gold banners and drainage gargoyles.
    for(const x of[18,27,36]){
      b.box('stone',LIGHT,sign*x,6.9,37.6,.9,13.8,1.2);
      window(b,sign*(x+3.2),6.2,37.5,.25,1.9,.65);
      b.box('stone',SHADE,sign*x,12.2,38.4,.4,.5,1.2);
    }
    banner(b,sign*23,11.5,38.2,2,6.1);
  }
  const gate=archWall(23.5,16,7.3,5.3,7.8,5,true);b.add('stone',LIGHT,gate,0,0,36);gate.dispose();archRing(b,0,0,38.55,7.3,5.3,7.8,1.1,0,true);
  parapet(b,0,16.3,36,24);for(const sign of[-1,1])banner(b,sign*9.2,14.3,38.7,2.1,7);
  for(const sign of[-1,1])for(const y of[3,7,11])b.box('metal',0x4c5351,sign*5.6,y,34.8,.14,.16,1.5);
  // Two finely subdivided flights per side form one coherent route. Their horizontal
  // landings begin exactly where a flight ends, with no hidden raised slab
  // covering the last few steps and no disconnected ornamental staircase.
  for(const surface of ROYAL_CITADEL_LOCAL_PLAN.surfaces)if(surface.kind==='stairs')citadelStair(b,metres?{...surface,steps:Math.ceil((surface.toY-surface.fromY)*(30.5/30)/.16)}:surface,metres);
  for(const sign of[-1,1])stairTurnLanding(b,sign);
  b.box('stone',LIGHT,0,21.7,19.225,6,.6,6.05);
  // Open cloisters flank a genuine central court. Side roofs do not meet into
  // one enormous triangular prism; each wing has its own height and roofline.
  cloister(b,-31,1.3,23,27);cloister(b,31,1.3,23,25);
  cloister(b,-40,1.3,9,21,Math.PI/2);cloister(b,40,1.3,9,21,Math.PI/2);
  rectangularHall(b,-32,9.5,16,19,16,16,3,1);gableRoof(b,-32,25.9,16,21,18,8.4);
  rectangularHall(b,33,9.5,12,17,23,21,3,2);gableRoof(b,33,30.9,12,20,25,10.2);
  // Processional palace facade. This retains true window apertures, recessed
  // panes and deeply carved frames rather than dark rectangles painted on stone.
  rectangularHall(b,0,22,5,57,21,27,7,2,true);gableRoof(b,0,49.5,5,60,24,12.5);
  // The public guard vestibule now opens physically into the furnished palace.
  for(const sign of[-1,1]){
    b.box('stone',PALE,sign*5.3,26.5,11.2,.9,9,8.4);
    b.box('stone',LIGHT,sign*4.65,26.6,12,.38,9.2,.9);
    b.box('stone',LIGHT,sign*4.65,26.6,8.8,.38,9.2,.9);
    b.box('stone',SHADE,sign*4.8,22.3,10.5,.5,.6,1.6);
    b.box('metal',GOLD,sign*4.7,27.4,11.8,.25,.9,.3);
    b.box('warm',0xf6dca0,sign*4.55,27.8,11.8,.27,.55,.27);
  }
  b.box('stone',LIGHT,0,31.1,11.2,11.2,.6,9);
  for(const sign of[-1,1]){
    tower(b,sign*25.8,20,14.3,3.4,33,12,sign>0,false,sign>0);
    banner(b,sign*17.5,41.2,16.5,2.5,9.5);
    for(const z of[-21,-11,-1])flyingButtress(b,sign*16.3,28,z,sign,43);
  }
  // The cathedral keep is the visual crown, recessed behind the lower royal
  // facade. A lateral bell tower and uneven subsidiary spires break symmetry.
  rectangularHall(b,2.8,28,-14,29,36,48,5,3);gableRoof(b,2.8,76.5,-14,33,39,18,true);
  rectangularHall(b,-31,20,-10,18,32,29,3,2);gableRoof(b,-31,49.5,-10,21,35,12);
  rectangularHall(b,32,25,-14,17,28,31,3,2);gableRoof(b,32,56.5,-14,20,31,13.5);
  rectangularHall(b,-12,20,-30,25,12,20,4,1);gableRoof(b,-12,40.5,-30,28,14,9);
  tower(b,-41,12,-8,4.8,84,11,false); // broad, tall western bell tower
  tower(b,40,14,-25,4.2,64,19,true);
  tower(b,-24,24,-26,4,63,18,true);
  tower(b,23,28,-24,4.3,63,19,true);
  // A whole rear royal wing carries the higher crown, rather than simply
  // stretching the old spire and leaving its enlarged base floating in space.
  rectangularHall(b,5.5,68,-27,31,16,23,5,2);gableRoof(b,5.5,91.5,-27,34,19,14,true);
  tower(b,8,82,-23,4.3,32,26,true);
  tower(b,-7,62,-15,3,31,17,false);
  tower(b,29,40,-2,2.8,31,14,false);
  // A high western belfry has four clock faces, covered upper walk and a crown
  // of miniature pinnacles; the clockwork provides a recognisable landmark.
  const dial=new THREE.CylinderGeometry(1.75,1.75,.1,24),rim=new THREE.TorusGeometry(1.9,.17,6,24);
  for(let side=0;side<4;side++){
    const yaw=side*Math.PI/2,x=-41+Math.sin(yaw)*4.55,z=-8+Math.cos(yaw)*4.55;
    b.add('warm',0xe6d6a5,dial,x,83,z,1,1,1,Math.PI/2,0,-yaw);
    b.add('stone',LIGHT,rim,x,83,z,1,1,1,0,yaw);
    const at=(u:number,v:number)=>({x:x+Math.cos(yaw)*u+Math.sin(yaw)*.12,y:83+v,z:z-Math.sin(yaw)*u+Math.cos(yaw)*.12});
    b.beam('metal',0x313a3a,at(0,0),at(.65,.7),.13,.12);b.beam('metal',0x313a3a,at(0,0),at(-.7,.1),.11,.1);
    for(let tick=0;tick<12;tick++){const a=tick*Math.PI/6;b.beam('metal',GOLD,at(Math.sin(a)*1.4,Math.cos(a)*1.4),at(Math.sin(a)*1.6,Math.cos(a)*1.6),.1,.1);}
  }dial.dispose();rim.dispose();
  // Dormer windows, ridges, chimney pots, buttress pinnacles and balconies give
  // the same complex a second readable level of detail from the harbor camera.
  for(const x of[-21,-10,1,12,23]){
    b.box('stone',LIGHT,x,54.4,14.4,3.7,4.6,3.6);window(b,x,52.5,16.3,.72,1.9,1.1,0,true);gableRoof(b,x,56.8,14.5,4.8,4.2,3.8);
  }
  for(const x of[-35,-27,30,36]){
    b.box('stone',PALE,x,57+(x>0?6:0),-15,1.6,6,1.6);b.box('stone',LIGHT,x,60.4+(x>0?6:0),-15,2.0,.5,2.0);
  }
  for(const x of[-12,18])for(const z of[-27,-4]){
    b.box('stone',LIGHT,x,82,z,1.1,10,1.1);b.add('roof',PATINA,CONE,x,89,z,1.15,4,1.15);
  }
  const rose=new THREE.CylinderGeometry(4.0,4.0,.12,32),roseRim=new THREE.TorusGeometry(4.35,.32,6,32);
  b.add('glass',0x477f9b,rose,2.8,68.5,4.2,1,1,1,Math.PI/2);rose.dispose();b.add('stone',LIGHT,roseRim,2.8,68.5,4.4);roseRim.dispose();
  for(let i=0;i<12;i++){const a=i*Math.PI/6;b.beam('stone',LIGHT,{x:2.8,y:68.5,z:4.5},{x:2.8+Math.sin(a)*3.85,y:68.5+Math.cos(a)*3.85,z:4.5},.14,.14);}
  cloister(b,-31,35,3,15);cloister(b,33,42,0,13);
  banner(b,-41,74,-2.9,2.5,12);banner(b,8,103,-18.8,2.4,10);banner(b,0,46,16,3.1,11);
  template=b.finish('royal-harbor-citadel');template.userData.royalCitadel={width:144,depth:132,height:142,front:'+Z',terraces:3,defensiveRings:2,outerSpireTowers:8,cathedralWings:6,windowStyle:'recessed-pointed',banners:'blue-gold',asymmetric:true,courtyard:'open-cloister',flyingButtresses:6,clockFaces:4,
    enlargement:ROYAL_CITADEL_MONUMENT_SCALE,defensiveTowers:ROYAL_CITADEL_DEFENSIVE_TOWERS.map(tower=>({...tower,localHeight:tower.baselineHeight*.5,worldHeight:tower.baselineHeight*3.05*5})),
    walkSurfaces:ROYAL_CITADEL_LOCAL_PLAN.surfaces,solidColliders:ROYAL_CITADEL_LOCAL_PLAN.solidColliders,plaza:ROYAL_CITADEL_LOCAL_PLAN.plaza,gardens:ROYAL_CITADEL_LOCAL_PLAN.gardens,
    entrance:{x:0,y:22,z:15.5,width:7.6,height:10},vestibule:{minX:-4,maxX:4,minZ:8.3,maxZ:15.5,y:22},publicPalace:true,towerInterior:{x:25.8,z:14.3,clearRadiusWorld:82,portalWorld:{x:691.0943073460268,y:1187,z:-3363.85,width:12,height:16},lookoutY:2010},
    routes:[-1,1].map(sign=>[{x:0,y:1.3,z:83},{x:0,y:1.3,z:31},{x:sign*3,y:1.3,z:28},{x:sign*18,y:11.65,z:28},{x:sign*19.5,y:11.65,z:28},{x:sign*19.5,y:11.65,z:19.5},{x:sign*18,y:11.65,z:19.5},{x:sign*3,y:22,z:19.5},{x:0,y:22,z:19.5},{x:0,y:22,z:9}])};cache.set(key,template);return template.clone(true);
}

/** LongitudinalX, clear deck20m above base,12m wide. Every span is physically
 * hollow from the front through the back; banner piers never cover its void. */
export function createRoyalArchBridge(length=150):THREE.Group{
  const spanLength=Number.isFinite(length)?Math.max(48,Math.min(240,length)):150,key=`bridge:${spanLength}`,cache=pool().templates;let template=cache.get(key);if(template)return template.clone(true);
  const b=new Masonry(),count=Math.max(3,Math.round(spanLength/23)),span=spanLength/count,radius=span*.37,spring=5.2,rise=11.3,arches:{x:number;radius:number;spring:number;rise:number}[]=[];
  const body=archWall(span,19,radius,spring,rise,9.8);
  for(let i=0;i<count;i++){
    const x=-spanLength/2+(i+.5)*span;arches.push({x,radius,spring,rise});b.add('stone',i%2?PALE:LIGHT,body,x,0,0);for(const side of[-1,1])archRing(b,x,0,side*5.05,radius,spring,rise,.7,side<0?Math.PI:0);
    for(const side of[-1,1])for(const u of[-span*.48,span*.48]){const px=Math.max(-spanLength/2+1,Math.min(spanLength/2-1,x+u));b.box('stone',SHADE,px,2,side*4.8,2.0,4,2.1);b.box('stone',LIGHT,px,12.5,side*5,1.5,10,1.0);}
  }
  body.dispose();b.box('stone',SHADE,0,19.15,0,spanLength,.8,12);b.box('stone',LIGHT,0,19.75,0,spanLength,.4,11.8);
  for(const side of[-1,1]){b.box('stone',LIGHT,0,20.8,side*5.65,spanLength,1.7,.5);for(let i=0;i<Math.ceil(spanLength/4);i++)b.box('stone',PALE,-spanLength/2+(i+.5)*spanLength/Math.ceil(spanLength/4),21.8,side*5.65,1.8,.65,.6);}
  for(let i=1;i<count;i++){const x=-spanLength/2+i*span;banner(b,x,17.5,5.55,1.55,4.6);}
  for(const sign of[-1,1])for(const side of[-1,1]){const x=sign*(spanLength/2-2.2),z=side*4.6;b.box('stone',PALE,x,22.5,z,3.2,5,2.4);b.box('stone',LIGHT,x,25.2,z,3.5,.4,2.6);for(const dx of[-1.0,1.0])b.box('stone',LIGHT,x+dx,26,z,1,1.2,2.5);}
  template=b.finish('royal-harbor-arch-bridge');template.userData.royalBridge={length:spanLength,width:12,deckY:20,arches};cache.set(key,template);return template.clone(true);
}

/** Clones share buffers. Call only when the owning viewer/isolated scene ends. */
export function disposeRoyalHarborCastleResources():void{if(!resources)return;resources.templates.clear();resources.geometries.forEach(geometry=>geometry.dispose());Object.values(resources.materials).forEach(material=>material.dispose());resources.textures.forEach(map=>map.dispose());resources=undefined;}
