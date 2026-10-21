import {tradingSiteContains} from './city-shop-sites.ts';
import {ROYAL_WORLD_ORIGIN} from './royal-world-location.ts';
import * as THREE from 'three';
import {createUrbanMasonryMaterial,urbanPavingLayout} from './urban-detail.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLivingActorLibrary, type LivingActor, type LivingCart } from './living-actors.ts';
import type { BiomeSettlementLibrary } from './biome-settlement-models.ts';
import type { WorldAssetLibrary,WorldAsset } from './world-models.ts';
import { chunkOrigin, sampleWorld, getBiomeStyle, WORLD_CHUNK_SIZE } from './world-geography.ts';
import { inhabitedChunkData, inhabitedRoadAt, inhabitedRoadDeckHeight } from './inhabited-world-data.ts';
import { livingRoutePose } from './living-zone-data.ts';
import { stableSeed, type RenderQuality } from './scene-data.ts';
import {physicalNpcPose,type PhysicalCapsule} from './world-collision.ts';
import {publicTownGateAt} from '../mvp/exploration-network-data.ts';

export interface InhabitedWorldChunk {
  group:THREE.Group;picks:THREE.Object3D[];
  setDetail(level:number):void;
  animate(time:number,reducedMotion:boolean):void;
  dispose():void;
}
export interface InhabitedWorldOptions {
  quality:RenderQuality;assets:BiomeSettlementLibrary;worldAssets:WorldAssetLibrary;
  heightAt:(x:number,y:number)=>number;
  visualFocus?:()=>{x:number;y:number};
  occupiedByPlayer?:(x:number,y:number,padding?:number)=>boolean;
  playerBodies?(now:number):readonly PhysicalCapsule[];
}
type Batch={material:THREE.Material;geometries:THREE.BufferGeometry[]};
type ResidentData=ReturnType<typeof inhabitedChunkData>['residents'][number];
type CartData=ReturnType<typeof inhabitedChunkData>['carts'][number];

function clippedSegment(a:{x:number;y:number},b:{x:number;y:number},x:number,y:number,padding:number):[number,number]|null{
  let from=0,to=1;
  for(const[start,delta,min,max]of[[a.x,b.x-a.x,x-padding,x+64+padding],[a.y,b.y-a.y,y-padding,y+64+padding]]){
    if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;continue;}
    const lo=(min-start)/delta,hi=(max-start)/delta;from=Math.max(from,Math.min(lo,hi));to=Math.min(to,Math.max(lo,hi));if(from>to)return null;
  }
  return[from,to];
}

/** Every model belongs to one streamed chunk; shared model pools outlive it.
 * This module draws ambient places and never creates players or resources. */
export function createInhabitedWorldChunk(cx:number,cy:number,options:InhabitedWorldOptions):InhabitedWorldChunk{
  const group=new THREE.Group(),picks:THREE.Object3D[]=[],origin=chunkOrigin(cx,cy),data=inhabitedChunkData(cx,cy);
  group.name=`inhabited-district:${cx}:${cy}`;
  if(!data.places.length&&!data.buildings.length&&!data.pathSegments.length&&!data.residents.length&&!data.props.length&&!data.carts.length)return{group,picks,setDetail(){},animate(){},dispose(){group.clear();}};
  const masonry=createUrbanMasonryMaterial(),geometry=new THREE.BoxGeometry(1,1,1),brickMaterial=masonry.material,pickMaterial=new THREE.MeshBasicMaterial({visible:false,depthWrite:false});
  const ownedGeometries=new Set<THREE.BufferGeometry>(),batches=new Map<string,Batch>(),bricks:{matrix:THREE.Matrix4;color:THREE.Color}[]=[],dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const rotors:{object:THREE.Object3D;phase:number}[]=[],actors:{actor:LivingActor;data:ResidentData;rank:number;allowed:boolean}[]=[],carts:{cart:LivingCart;data:CartData;allowed:boolean}[]=[];
  const library=data.residents.length||data.carts.length?createLivingActorLibrary():null;
  let disposed=false,detail=7;
  const belongs=(x:number,y:number)=>Math.floor(x/WORLD_CHUNK_SIZE)===cx&&Math.floor(y/WORLD_CHUNK_SIZE)===cy;
  const clear=(x:number,y:number,padding=0)=>!options.occupiedByPlayer?.(x,y,padding);
  const height=(x:number,y:number)=>options.heightAt(x,y);
  const pathSurfaceHeight=(x:number,y:number)=>{const ground=height(x,y),sample=sampleWorld(x,y);return inhabitedRoadDeckHeight(ground,sample.water&&inhabitedRoadAt(x,y)?sample.waterLevel:null);};
  function brick(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rotation=0){
    if(!belongs(x,z)||!clear(x,z,Math.max(w,d)/2))return;
    dummy.position.set(x-origin.x,y,z-origin.y);dummy.scale.set(w,h,d);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();bricks.push({matrix:dummy.matrix.clone(),color:new THREE.Color(color)});
  }
  function addModel(model:THREE.Group,x:number,y:number,z:number,scale:number,rotation:number){
    dummy.position.set(x-origin.x,y,z-origin.y);dummy.scale.setScalar(scale);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();const parent=dummy.matrix.clone();model.updateMatrixWorld(true);
    model.traverse(object=>{if(!(object instanceof THREE.Mesh)||object.userData.worldAnimated||Array.isArray(object.material))return;const key=object.material.uuid;let batch=batches.get(key);if(!batch){batch={material:object.material,geometries:[]};batches.set(key,batch);}matrix.multiplyMatrices(parent,object.matrixWorld);batch.geometries.push(object.geometry.clone().applyMatrix4(matrix));});
  }
  for(const building of data.buildings){
    if(!clear(building.x,building.y,Math.max(building.width,building.depth)/2))continue;
    const y=height(building.x,building.y)+.05,style=getBiomeStyle(building.biome),foundation=building.biome==='ice'?0xb6ccd0:building.biome==='desert'?0xb4946d:style.rock;
    brick(building.x,y+.05,building.y,building.width+.3,.2,building.depth+.3,foundation);
    if(building.construction){
      for(const dx of[-1,1])for(const dz of[-1,1])brick(building.x+dx*building.width*.36,y+1.3,building.y+dz*building.depth*.36,.23,2.6,.23,0x94734e);
      for(const dz of[-1,1])brick(building.x,y+2.5,building.y+dz*building.depth*.36,building.width*.85,.24,.24,0xba9260);
      brick(building.x,y+.4,building.y,building.width*.8,.7,building.depth*.8,foundation);continue;
    }
    const model=options.assets.get(building.kind,building.biome,building.level,building.variant);
    if(building.kind==='windmill'){
      model.position.set(building.x-origin.x,y,building.y-origin.y);model.rotation.y=building.rotation;model.scale.setScalar(building.scale);group.add(model);
      const rotor=model.getObjectByName('windmill-rotor');if(rotor)rotors.push({object:rotor,phase:(stableSeed(building.id)%100)/100});
    }else addModel(model,building.x,y,building.y,building.scale,building.rotation);
  }
  for(const path of data.pathSegments){
    const clip=clippedSegment(path.a,path.b,origin.x,origin.y,path.width+2);if(!clip)continue;
    const dx=path.b.x-path.a.x,dy=path.b.y-path.a.y,length=Math.hypot(dx,dy),count=Math.max(1,Math.ceil(length/1.7)),angle=Math.atan2(dx,dy);
    const from=Math.max(0,Math.floor(clip[0]*count)-1),to=Math.min(count-1,Math.ceil(clip[1]*count)+1);
    const color=path.surface==='snow'?0xc3d8dc:path.surface==='sand'?0xc7ac78:path.surface==='stone'?0xbcb28d:0xa78c62;
    for(let index=from;index<=to;index++){
      const t=(index+.5)/count,x=path.a.x+dx*t,z=path.a.y+dy*t;if(!belongs(x,z)||!clear(x,z,path.width/2))continue;
      const sample=sampleWorld(x,z),wet=sample.water,y=inhabitedRoadDeckHeight(height(x,z),wet?sample.waterLevel:null);
      brick(x,y+.06,z,path.width,.13,length/count+.09,wet?0x8c6a43:color,angle);
      if(wet)for(const side of[-1,1]){const px=x+Math.cos(angle)*side*(path.width/2+.1),pz=z-Math.sin(angle)*side*(path.width/2+.1);brick(px,y+.7,pz,.15,1.4,.15,0x8c6a43);brick(px,y+1.12,pz,.13,.16,length/count+.1,0xa88b60,angle);}
      else if(!path.external&&path.surface==='stone'&&options.quality!=='performance')for(const sett of urbanPavingLayout(path.width,length/count,index)){
        brick(x+Math.cos(angle)*sett.x+Math.sin(angle)*sett.z,y+.145,z-Math.sin(angle)*sett.x+Math.cos(angle)*sett.z,sett.width,.04,sett.depth,[0xb9b29a,0xb1aa91,0xc6bfa9,0xa6a28d,0xc0b59a,0x8e958a][sett.tone],angle);
      }
    }
  }
  for(const place of data.places){
    if(place.boundary==='open')continue;
    const halfW=place.localWidth/2,halfD=place.localDepth/2,ellipse=place.boundaryShape==='ellipse',perimeter=ellipse?Math.PI*Math.sqrt(2*(halfW*halfW+halfD*halfD)):4*(halfW+halfD),count=Math.ceil(perimeter/(place.boundary==='wall'?3.6:2.6));
    const world=(x:number,z:number)=>({x:place.x+x*Math.cos(place.rotation)-z*Math.sin(place.rotation),y:place.y+x*Math.sin(place.rotation)+z*Math.cos(place.rotation)});
    for(let i=0;i<count;i++){
      const t=(i+.5)/count;let x:number,z:number,angle:number;
      if(ellipse){const a=t*Math.PI*2;x=Math.cos(a)*halfW;z=Math.sin(a)*halfD;angle=Math.atan2(-Math.sin(a)*halfW,Math.cos(a)*halfD)+place.rotation;}
      else{const distance=t*perimeter;if(distance<2*halfW){x=-halfW+distance;z=-halfD;angle=Math.PI/2+place.rotation;}else if(distance<2*halfW+2*halfD){x=halfW;z=-halfD+distance-2*halfW;angle=place.rotation;}else if(distance<4*halfW+2*halfD){x=halfW-(distance-2*halfW-2*halfD);z=halfD;angle=Math.PI/2+place.rotation;}else{x=-halfW;z=halfD-(distance-4*halfW-2*halfD);angle=place.rotation;}}
      const p=world(x,z);if(!belongs(p.x,p.y)||inhabitedRoadAt(p.x,p.y)||inhabitedRoadAt(p.x+Math.sin(angle)*1.6,p.y+Math.cos(angle)*1.6)||publicTownGateAt(p,1))continue;
      const y=height(p.x,p.y),style=getBiomeStyle(place.biome),stone=place.biome==='ice'?0xbfd5d7:place.biome==='desert'?0xbc9d72:style.rock,wood=place.biome==='tropical'?0x826446:0x8a6946,step=perimeter/count;
      if(place.boundary==='fence'){brick(p.x,y+.85,p.y,.23,1.7,.23,wood);for(const h of[.5,1.2])brick(p.x,y+h,p.y,.14,.18,step+.12,wood,angle);}
      else{brick(p.x,y+1.7,p.y,1.15,3.4,step+.13,stone,angle);brick(p.x,y+3.48,p.y,1.4,.25,step+.16,stone,angle);for(const end of[-.3,.3])brick(p.x+Math.sin(angle)*step*end,y+3.85,p.y+Math.cos(angle)*step*end,1.4,.55,step*.24,stone,angle);}
    }
  }
  for(const prop of data.props){
    if(prop.kind==='tree'&&tradingSiteContains(prop.x-ROYAL_WORLD_ORIGIN.x,prop.y-ROYAL_WORLD_ORIGIN.y,4))continue;
    if(!clear(prop.x,prop.y,Math.max(prop.width,prop.depth)/2))continue;
    const y=height(prop.x,prop.y),style=getBiomeStyle(prop.biome),wood=prop.biome==='desert'?0x9c774d:0x805e3c;
    if(prop.kind==='tree'){
      const kind:WorldAsset=prop.biome==='ice'?'snowpine':prop.biome==='desert'?'palm':prop.biome==='mountain'?'pine':prop.biome==='coast'||prop.biome==='tropical'?'palm':'oak';
      addModel(options.worldAssets.get(kind),prop.x,y,prop.y,prop.scale,prop.rotation);
    }else if(prop.kind==='lamp'){brick(prop.x,y+1.4,prop.y,.14,2.8,.14,wood);brick(prop.x,y+2.85,prop.y,.5,.58,.5,0xe4c378);brick(prop.x,y+3.18,prop.y,.68,.12,.68,wood);}
    else if(prop.kind==='workbench'){
      // Planner widths are world AABBs. Recover the local dimensions before
      // applying the quarter-turn yaw, including the legs and tools.
      const turned=Math.abs(Math.sin(prop.rotation))>.5,w=turned?prop.depth:prop.width,d=turned?prop.width:prop.depth;
      brick(prop.x,y+.8,prop.y,w,.2,d,wood,prop.rotation);
      for(const dx of[-w*.35,w*.35])brick(prop.x+dx*Math.cos(prop.rotation),y+.36,prop.y-dx*Math.sin(prop.rotation),.2,.72,d*.8,wood,prop.rotation);
      brick(prop.x,y+1,prop.y,Math.min(.65,w*.5),.18,Math.min(.4,d*.65),style.rock,prop.rotation);
    }
    else if(prop.kind==='fountain'){brick(prop.x,y+.18,prop.y,prop.width,.36,prop.depth,style.rock);brick(prop.x,y+.42,prop.y,prop.width*.74,.13,prop.depth*.74,prop.biome==='ice'?0xb8dbe1:style.water);brick(prop.x,y+1.15,prop.y,.75,2,.75,style.rock);brick(prop.x,y+2.15,prop.y,1.6,.25,1.6,style.rock);}
    else for(let row=0;row<2;row++)brick(prop.x+(row%2)*.15,y+.25+row*.5,prop.y,prop.width*.85,.46,prop.depth*.85,wood,prop.rotation);
  }
  for(const resident of data.residents){
    const rank=stableSeed(resident.id),initial=livingRoutePose(resident,0);if(!clear(initial.x,initial.y,1))continue;
    const actor=library!.getForBiome(resident.role,resident.biome,rank);actor.group.scale.setScalar(.72);actor.group.name=resident.id;group.add(actor.group);actors.push({actor,data:resident,rank,allowed:true});
  }
  for(const route of data.carts){
    const initial=livingRoutePose(route,0);if(!clear(initial.x,initial.y,2))continue;
    const cart=library!.transport(route.kind,stableSeed(route.id));cart.group.name=route.id;group.add(cart.group);carts.push({cart,data:route,allowed:true});
  }
  function addDistrictPicks(){
    // Terrain is naturally sloped. Use this chunk's actual roofs, mills and
    // ground heights rather than a single height stored on the catalog entry.
    const renderedBounds=new THREE.Box3(),dynamic=new Set<THREE.Object3D>([...actors.map(item=>item.actor.group),...carts.map(item=>item.cart.group)]);
    group.updateMatrixWorld(true);for(const child of group.children)if(!dynamic.has(child))renderedBounds.union(new THREE.Box3().setFromObject(child));
    for(const place of data.places){
      const minX=Math.max(origin.x,place.x-place.width/2),maxX=Math.min(origin.x+64,place.x+place.width/2),minY=Math.max(origin.y,place.y-place.depth/2),maxY=Math.min(origin.y+64,place.y+place.depth/2);
      if(minX>=maxX||minY>=maxY||!clear((minX+maxX)/2,(minY+maxY)/2,Math.max(maxX-minX,maxY-minY)/2))continue;
      let low=Infinity,high=-Infinity;
      for(const x of[minX,(minX+maxX)/2,maxX])for(const y of[minY,(minY+maxY)/2,maxY]){const h=height(x,y);low=Math.min(low,h);high=Math.max(high,h+2);}
      if(!renderedBounds.isEmpty()){low=Math.min(low,renderedBounds.min.y);high=Math.max(high,renderedBounds.max.y);}
      const hit=new THREE.Mesh(geometry,pickMaterial);hit.position.set((minX+maxX)/2-origin.x,(low+high)/2,(minY+maxY)/2-origin.y);hit.scale.set(maxX-minX,Math.max(4,high-low+2),maxY-minY);hit.userData={npcId:place.id};group.add(hit);picks.push(hit);
    }
  }
  for(const batch of batches.values()){
    const merged=mergeGeometries(batch.geometries,false);batch.geometries.forEach(g=>g.dispose());batch.geometries.length=0;if(!merged)continue;ownedGeometries.add(merged);merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,batch.material);mesh.name='inhabited-static-batch';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  if(bricks.length){const mesh=new THREE.InstancedMesh(geometry,brickMaterial,bricks.length);mesh.name='inhabited-roads-boundaries-props';bricks.forEach((brick,i)=>{mesh.setMatrixAt(i,brick.matrix);mesh.setColorAt(i,brick.color);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}
  addDistrictPicks();
  const result:InhabitedWorldChunk={group,picks,
    setDetail(level){detail=level;for(const item of actors)item.actor.group.visible=item.allowed&&(detail>=8||detail>=7.05&&item.rank%2===0||detail>=6&&item.rank%5===0);for(const item of carts)item.cart.group.visible=item.allowed&&detail>=6;},
    animate(time,reducedMotion){if(disposed)return;const at=Number.isFinite(time)?Math.max(0,time):0,players=options.playerBodies?.(at*1000)??[];if(!reducedMotion)for(const rotor of rotors)rotor.object.rotation.z=at*.42+rotor.phase;
      for(const item of actors){const pose=physicalNpcPose(item.data.id,at*1000,players);if(!pose){item.allowed=false;continue;}item.actor.group.position.set(pose.x-origin.x,pathSurfaceHeight(pose.x,pose.y)+.18,pose.y-origin.y);item.actor.group.rotation.y=pose.yaw;const focus=options.visualFocus?.();item.actor.setVisualDetail?.(!focus||Math.hypot(pose.x-focus.x,pose.y-focus.y)<=24);if(!reducedMotion)item.actor.animate(at,pose.walking?item.data.speed:0,pose.working);item.allowed=clear(pose.x,pose.y,.8);}
      for(const item of carts){const pose=physicalNpcPose(item.data.id,at*1000,players);if(!pose){item.allowed=false;continue;}item.cart.group.position.set(pose.x-origin.x,pathSurfaceHeight(pose.x,pose.y)+.18,pose.y-origin.y);item.cart.group.rotation.y=pose.yaw;if(!reducedMotion)item.cart.animate(at,pose.walking?item.data.speed:0);item.allowed=clear(pose.x,pose.y,2);}
      result.setDetail(detail);
    },
    dispose(){if(disposed)return;disposed=true;actors.forEach(item=>item.actor.dispose());carts.forEach(item=>item.cart.dispose());library?.dispose();group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});group.clear();ownedGeometries.forEach(g=>g.dispose());ownedGeometries.clear();geometry.dispose();masonry.dispose();pickMaterial.dispose();picks.length=0;batches.clear();bricks.length=0;},
  };
  result.animate(0,false);return result;
}
