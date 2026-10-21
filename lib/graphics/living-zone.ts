import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilding, createTree } from './models.ts';
import {createBiomeSettlementLibrary,type BiomeSettlementLibrary} from './biome-settlement-models.ts';
import {architectureFootprintScale,createUrbanMasonryMaterial,urbanPavingLayout} from './urban-detail.ts';
import { createLivingActorLibrary, type LivingActor, type LivingCart } from './living-actors.ts';
import { animateWorldAsset, type WorldAssetLibrary } from './world-models.ts';
import { chunkOrigin, sampleWorld, WORLD_CHUNK_SIZE } from './world-geography.ts';
import { LIVING_ZONE, LIVING_ZONE_BOUNDS, LIVING_BUILDINGS, LIVING_PATHS, LIVING_RESIDENTS,LIVING_PROPS, livingChunkFor, livingRoadAt, livingRoutePose, type LivingResident } from './living-zone-data.ts';
import type { RenderQuality } from './scene-data.ts';
import {physicalNpcPose,type PhysicalCapsule} from './world-collision.ts';
import {publicTownGateAt} from '../mvp/exploration-network-data.ts';

export interface LivingZoneChunk {
  group:THREE.Group;picks:THREE.Object3D[];
  animate(time:number,reducedMotion:boolean):void;
  setDetail(level:number):void;
  dispose():void;
}
export interface LivingZoneOptions {quality:RenderQuality;architecture?:BiomeSettlementLibrary;visualFocus?:()=>{x:number;y:number};heightAt:(x:number,y:number)=>number;assets:WorldAssetLibrary;occupiedByPlayer?:(x:number,y:number,padding?:number)=>boolean;playerBodies?(now:number):readonly PhysicalCapsule[]}
type ModelBatch={material:THREE.Material;geometry:THREE.BufferGeometry[]};
type Brick={matrix:THREE.Matrix4;color:THREE.Color};

/** A chunk owns only its newly merged geometry and materials. Models supplied
 * by the shared building/world libraries retain their viewer/library ownership. */
export function createLivingZoneChunk(cx:number,cy:number,options:LivingZoneOptions):LivingZoneChunk {
  const origin=chunkOrigin(cx,cy),size=WORLD_CHUNK_SIZE,group=new THREE.Group(),picks:THREE.Object3D[]=[];
  group.name=`living-district-${cx}:${cy}`;
  if(origin.x+size<LIVING_ZONE_BOUNDS.minX||origin.x>LIVING_ZONE_BOUNDS.maxX||origin.y+size<LIVING_ZONE_BOUNDS.minY||origin.y>LIVING_ZONE_BOUNDS.maxY)return{group,picks,animate(){},setDetail(){},dispose(){group.clear();}};
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),batches=new Map<string,ModelBatch>(),bricks:Brick[]=[];
  const cube=new THREE.BoxGeometry(1,1,1);geometries.add(cube);
  const dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const actors:{actor:LivingActor;resident:LivingResident;rank:number}[]=[],carts:{cart:LivingCart;route:LivingResident}[]=[],mills:THREE.Group[]=[];
  const actorLibrary=createLivingActorLibrary(),architecture=options.architecture??createBiomeSettlementLibrary(),ownArchitecture=!options.architecture;let disposed=false,detail=7;
  const belongs=(x:number,y:number)=>{const chunk=livingChunkFor({x,y});return chunk.cx===cx&&chunk.cy===cy;};
  const clear=(x:number,y:number,padding=0)=>!options.occupiedByPlayer?.(x,y,padding);
  const height=(x:number,y:number)=>options.heightAt(x,y);
  function brick(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rotation=0) {
    if(!belongs(x,z)||!clear(x,z,Math.min(w,d)/2))return;
    dummy.position.set(x-origin.x,y,z-origin.y);dummy.scale.set(w,h,d);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();
    bricks.push({matrix:dummy.matrix.clone(),color:new THREE.Color(color)});
  }
  function addModel(model:THREE.Group,x:number,y:number,z:number,scale=1,rotation=0) {
    if(!belongs(x,z)||!clear(x,z,scale))return;
    dummy.position.set(x-origin.x,y,z-origin.y);dummy.scale.setScalar(scale);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();
    const parent=dummy.matrix.clone();model.updateMatrixWorld(true);
    model.traverse(object=>{if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;let batch=batches.get(object.material.uuid);if(!batch){batch={material:object.material,geometry:[]};batches.set(object.material.uuid,batch);}matrix.multiplyMatrices(parent,object.matrixWorld);batch.geometry.push(object.geometry.clone().applyMatrix4(matrix));});
  }
  const stone=0x9b9b89,lightStone=0xc5c0a4,darkStone=0x777d70,wood=0x8d623b;
  for(const building of LIVING_BUILDINGS) {
    if(!belongs(building.x,building.y)||!clear(building.x,building.y,Math.max(building.width,building.depth)/2))continue;
    const y=height(building.x,building.y)+.06;
    // Individual stone foundations conceal fine terrain quantization at LODs.
    brick(building.x,y+.02,building.y,building.width+.3,.16,building.depth+.3,darkStone);
    // Garden rails/barrels have exact sub-colliders; retain their authored model.
    const model=building.kind==='garden'?createBuilding('garden',building.level,'cartographers'):architecture.get(building.kind,'forest',building.level,Number(building.id.split('-').at(-1))||0);
    // Living-zone widths/depths describe its LOCAL OBB, already rotated by the
    // placement below and by the authoritative collision layer.
    const fit=building.kind==='garden'?1:architectureFootprintScale(model,building.width/building.scale,building.depth/building.scale);
    model.scale.multiplyScalar(fit);
    if(building.kind==='windmill'){
      model.position.set(building.x-origin.x,y,building.y-origin.y);model.rotation.y=building.rotation;model.scale.multiplyScalar(building.scale);group.add(model);mills.push(model);
    }else addModel(model,building.x,y,building.y,building.scale,building.rotation);
  }

  // Street paving and the inter-settlement route use the same global segments
  // as walkers. They are tiled across chunk boundaries, never one giant slab.
  for(const path of LIVING_PATHS)for(let segment=1;segment<path.points.length;segment++) {
    const a=path.points[segment-1],b=path.points[segment],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),count=Math.ceil(length/1.6),angle=Math.atan2(dx,dy);
    if(Math.max(a.x,b.x)+path.width<origin.x||Math.min(a.x,b.x)-path.width>origin.x+size||Math.max(a.y,b.y)+path.width<origin.y||Math.min(a.y,b.y)-path.width>origin.y+size)continue;
    for(let i=0;i<count;i++) {
      const t=(i+.5)/count,x=a.x+dx*t,z=a.y+dy*t,y=height(x,z),wet=sampleWorld(x,z).water;
      brick(x,y+.07,z,path.width,.13,length/count+.08,wet?wood:path.surface==='stone'?0xbeb086:0xa98d60,angle);
      if(wet){for(const side of[-1,1]){const px=x+Math.cos(angle)*side*(path.width/2+.12),pz=z-Math.sin(angle)*side*(path.width/2+.12);brick(px,y+.7,pz,.16,1.4,.16,wood);brick(px,y+1.13,pz,.12,.17,length/count+.1,wood,angle);}}
      else if(path.surface==='stone'&&options.quality!=='performance') {
        for(const sett of urbanPavingLayout(path.width,length/count,i)){
          const gx=x+Math.cos(angle)*sett.x+Math.sin(angle)*sett.z,gz=z-Math.sin(angle)*sett.x+Math.cos(angle)*sett.z;
          brick(gx,y+.145,gz,sett.width,.04,sett.depth,[0xb9b29a,0xb1aa91,0xc6bfa9,0xa6a28d,0xc0b59a,0x8e958a][sett.tone],angle);
        }
      }
    }
  }
  function wall(place:typeof LIVING_ZONE.city|typeof LIVING_ZONE.village,halfW:number,halfD:number,fence:boolean) {
    if(origin.x+size<place.x-halfW-3||origin.x>place.x+halfW+3||origin.y+size<place.y-halfD-3||origin.y>place.y+halfD+3)return;
    const sides:[number,number,number,number][]=[[-halfW,-halfD,halfW,-halfD],[-halfW,halfD,halfW,halfD],[-halfW,-halfD,-halfW,halfD],[halfW,-halfD,halfW,halfD]];
    for(const[x1,z1,x2,z2]of sides){const length=Math.hypot(x2-x1,z2-z1),count=Math.ceil(length/(fence?2.8:4)),angle=Math.atan2(x2-x1,z2-z1),step=length/count;
      for(let i=0;i<count;i++){const t=(i+.5)/count,x=place.x+x1+(x2-x1)*t,z=place.y+z1+(z2-z1)*t;if(livingRoadAt(x,z)||livingRoadAt(x+Math.sin(angle)*2,z+Math.cos(angle)*2)||publicTownGateAt({x,y:z},1))continue;const y=height(x,z);
        if(fence){brick(x,y+.9,z,.25,1.8,.25,wood);for(const h of[.5,1.3])brick(x,y+h,z,.14,.2,step+.13,0xac8250,angle);}
        else {brick(x,y+2.2,z,1.25,4.4,step+.05,darkStone,angle);for(let row=0;row<5;row++)brick(x,y+.4+row*.78,z,1.32,.65,step-.07,row%3?stone:lightStone,angle);brick(x,y+4.54,z,1.55,.28,step+.1,lightStone,angle);for(const end of[-.32,.32])brick(x+Math.sin(angle)*step*end,y+4.95,z+Math.cos(angle)*step*end,1.55,.6,step*.22,stone,angle);}
      }
    }
  }
  wall(LIVING_ZONE.city,80,72,false);wall(LIVING_ZONE.village,27,29,true);
  // Gates have timber leaves folded beside the road; lanes remain unobstructed.
  for(const place of[LIVING_ZONE.city,LIVING_ZONE.village])for(const side of[-1,1]) {
    const z=place.y+side*(place===LIVING_ZONE.city?72:29),span=place===LIVING_ZONE.city?4.3:2.3,y=height(place.x,z);
    for(const x of[-span,span])brick(place.x+x,y+2,z,.4,4,.45,wood);
    brick(place.x,y+4,z,span*2+.6,.45,.6,wood);
    for(const x of[-span-.7,span+.7])brick(place.x+x,y+.9,z,1.1,1.8,.17,0xaa8050,.5*Math.sign(x));
  }
  // Trees frame broad avenues, gardens and a small central fountain. Their
  // positions are authored so dense procedural vegetation cannot block paths.
  for(const x of[-69,-55,-28,28,55,69])for(const z of[-7,7]) {
    const p={x:LIVING_ZONE.city.x+x,y:LIVING_ZONE.city.y+z};if(!belongs(p.x,p.y))continue;
    addModel(createTree('oak',Math.abs(x*13+z)),p.x,height(p.x,p.y),p.y,1.35);
    brick(p.x,height(p.x,p.y)+.14,p.y,2.4,.28,2.4,0x8e9569);
  }
  for(const x of[-24,24])for(const z of[-23,0,23]){const p={x:LIVING_ZONE.village.x+x,y:LIVING_ZONE.village.y+z};if(x>0&&z>0)continue;addModel(createTree('oak',Math.abs(x*31+z)),p.x,height(p.x,p.y),p.y,.83);}
  const fountain=LIVING_PROPS[0];
  brick(fountain.x,height(fountain.x,fountain.y)+.14,fountain.y,9,.28,9,lightStone);
  brick(fountain.x,height(fountain.x,fountain.y)+.33,fountain.y,6.5,.12,6.5,0x4c9c9b);
  for(const side of[-1,1]){brick(fountain.x+side*3.5,height(fountain.x,fountain.y)+.5,fountain.y,.5,.8,7.4,stone);brick(fountain.x,height(fountain.x,fountain.y)+.5,fountain.y+side*3.5,7.4,.8,.5,stone);}
  brick(fountain.x,height(fountain.x,fountain.y)+1.25,fountain.y,1,2.5,1,lightStone);brick(fountain.x,height(fountain.x,fountain.y)+2.45,fountain.y,2.3,.3,2.3,lightStone);
  for(const prop of LIVING_PROPS.slice(1)) {
    const y=height(prop.x,prop.y);
    if(prop.kind==='workbench') {brick(prop.x,y+.85,prop.y,prop.width,.18,prop.depth,wood);for(const dx of[-prop.width*.4,prop.width*.4])brick(prop.x+dx,y+.4,prop.y,.2,.8,prop.depth*.8,darkStone);brick(prop.x-.45,y+1.05,prop.y,.65,.22,.45,0xb6a27b);brick(prop.x+.5,y+1,prop.y,.15,.1,.7,0x6a7771);}
    else for(let row=0;row<3;row++)for(const dx of[-.25,.25])brick(prop.x+dx,y+.2+row*.35,prop.y,.4,.32,prop.depth,wood);
  }
  // Warm lamps and bench/work props add close-range readable scale.
  for(const x of[-70,-56,-28,28,56,70])for(const z of[-4.5,4.5]) {
    const gx=LIVING_ZONE.city.x+x,gz=LIVING_ZONE.city.y+z,y=height(gx,gz);brick(gx,y+1.5,gz,.16,3,.16,0x5c5542);brick(gx,y+3.05,gz,.55,.65,.55,0xe3bb68);brick(gx,y+3.42,gz,.72,.12,.72,wood);
    brick(gx+2,y+.45,gz,1.8,.18,.65,wood);for(const dx of[-.65,.65])brick(gx+2+dx,y+.2,gz,.15,.4,.55,wood);
  }

  // Each pedestrian has one stable owner chunk (its seeded starting pose), so
  // adjacent chunks never duplicate the same inhabitant during streaming.
  for(let index=0;index<LIVING_RESIDENTS.length;index++) {
    const resident=LIVING_RESIDENTS[index],initial=livingRoutePose(resident,0);
    if(!belongs(initial.x,initial.y)||!clear(initial.x,initial.y,1))continue;
    const actor=actorLibrary.get(resident.role,index);actor.group.scale.setScalar(.72);actor.group.name=resident.id;group.add(actor.group);actors.push({actor,resident,rank:index});
  }
  const cartRoutes:LivingResident[]=[
    {id:'amber-market-cart',owner:LIVING_ZONE.city.id,role:'merchant',route:[{x:LIVING_ZONE.city.x-69,y:LIVING_ZONE.city.y+1},{x:LIVING_ZONE.city.x+69,y:LIVING_ZONE.city.y+1}],speed:1.2,phase:.17,working:true},
    {id:'brumas-harvest-cart',owner:LIVING_ZONE.village.id,role:'farmer',route:[{x:LIVING_ZONE.village.x+.25,y:LIVING_ZONE.village.y-24},{x:LIVING_ZONE.village.x+.25,y:LIVING_ZONE.village.y+24}],speed:.9,phase:.41,working:true},
  ];
  for(let i=0;i<cartRoutes.length;i++){const route=cartRoutes[i],p=livingRoutePose(route,0);if(!belongs(p.x,p.y)||!clear(p.x,p.y,2))continue;const cart=actorLibrary.cart(i);cart.group.name=route.id;group.add(cart.group);carts.push({cart,route});}

  for(const place of[LIVING_ZONE.city,LIVING_ZONE.village]) {
    const minX=Math.max(origin.x,place.x-place.width/2),maxX=Math.min(origin.x+size,place.x+place.width/2),minY=Math.max(origin.y,place.y-place.depth/2),maxY=Math.min(origin.y+size,place.y+place.depth/2);
    if(minX>=maxX||minY>=maxY||!clear((minX+maxX)/2,(minY+maxY)/2))continue;
    const material=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});materials.add(material);const pick=new THREE.Mesh(cube,material);pick.position.set((minX+maxX)/2-origin.x,place.height+6,(minY+maxY)/2-origin.y);pick.scale.set(maxX-minX,12,maxY-minY);pick.userData={npcId:place.id};picks.push(pick);group.add(pick);
  }
  for(const batch of batches.values()) {
    const geometry=mergeGeometries(batch.geometry,false);batch.geometry.forEach(g=>g.dispose());if(!geometry)continue;geometries.add(geometry);geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='living-static-material-batch';group.add(mesh);
  }
  const masonry=bricks.length?createUrbanMasonryMaterial():null;
  if(bricks.length){const material=masonry!.material;const mesh=new THREE.InstancedMesh(cube,material,bricks.length);mesh.name='living-streets-fortifications-props';mesh.castShadow=true;mesh.receiveShadow=true;bricks.forEach((part,i)=>{mesh.setMatrixAt(i,part.matrix);mesh.setColorAt(i,part.color);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);}
  const result:LivingZoneChunk={group,picks,
    setDetail(level){detail=level;for(const{actor,rank}of actors)actor.group.visible=detail>=8||(detail>=7.05&&rank%2===0)||(detail>=6&&rank%5===0);for(const{cart}of carts)cart.group.visible=detail>=6;},
    animate(time,reducedMotion){if(disposed)return;const at=time,players=options.playerBodies?.(at*1000)??[];if(!reducedMotion)for(const mill of mills)animateWorldAsset(mill,at,.35);for(const{actor,resident,rank}of actors){const p=physicalNpcPose(resident.id,at*1000,players);if(!p){actor.group.visible=false;continue;}actor.group.visible=detail>=8||(detail>=7.05&&rank%2===0)||(detail>=6&&rank%5===0)||players.some(body=>Math.hypot(body.x-p.x,body.y-p.y)<=12);actor.group.position.set(p.x-origin.x,height(p.x,p.y)+.18,p.y-origin.y);actor.group.rotation.y=p.yaw;const focus=options.visualFocus?.();actor.setVisualDetail?.(!focus||Math.hypot(p.x-focus.x,p.y-focus.y)<=24);if(!reducedMotion)actor.animate(at,p.walking?resident.speed:0,p.working);if(!clear(p.x,p.y,.8))actor.group.visible=false;}for(const{cart,route}of carts){const p=physicalNpcPose(route.id,at*1000,players);if(!p){cart.group.visible=false;continue;}cart.group.visible=detail>=6||players.some(body=>Math.hypot(body.x-p.x,body.y-p.y)<=12);cart.group.position.set(p.x-origin.x,height(p.x,p.y)+.18,p.y-origin.y);cart.group.rotation.y=p.yaw;if(!reducedMotion)cart.animate(at,p.walking?route.speed:0);}},
    dispose(){if(disposed)return;disposed=true;actors.forEach(({actor})=>actor.dispose());carts.forEach(({cart})=>cart.dispose());actorLibrary.dispose();if(ownArchitecture)architecture.dispose();masonry?.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});group.clear();picks.length=0;},
  };
  result.setDetail(detail);result.animate(0,false);return result;
}
