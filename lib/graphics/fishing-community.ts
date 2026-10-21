import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFishingModelLibrary,createHarbourSurfaceTexture } from './fishing-community-models.ts';
import { FISHING_COMMUNITY,FISHING_STRUCTURES,FISHING_PROPS,FISHING_LAND_PATHS,FISHING_DOCK_PATHS,fishingSnapshot,fishingSurfaceHeight,type FishingSnapshot } from './fishing-community-data.ts';
import { maritimeBoatPose,maritimeWave,createMaritimeFoamTexture } from './maritime-water.ts';
import { sampleWorld,type WorldBiome } from './world-geography.ts';
import type { RenderQuality } from './scene-data.ts';
import {physicalNpcPose,type PhysicalCapsule} from './world-collision.ts';

export interface FishingActivity {id:string;kind:'boat'|'cart'|'worker';label:string;state:string;x:number;y:number;cargo:number}
export interface FishingState {available:boolean;communityId?:string;communityName:string;activities:readonly FishingActivity[];followedId:string|null}
export type FishingRenderSnapshot=Omit<FishingSnapshot,'carts'>&{carts:readonly(Omit<FishingSnapshot['carts'][number],'animal'>&{animal:'horse'|'ox'})[]};
export interface FishingRenderSite {
  id:string;name:string;biome:WorldBiome;rotation:number;phaseOffset:number;
  boats:readonly{id:string;offset:number}[];
  toWorld(point:{x:number;y:number}):{x:number;y:number};
  toTemplate(point:{x:number;y:number}):{x:number;y:number};
  snapshot(seconds:number):FishingRenderSnapshot;
  surfaceHeight(x:number,y:number,base:number):number;
}
export interface FishingCommunityOptions {quality:RenderQuality;heightAt:(x:number,y:number)=>number;occupiedByPlayer?:(x:number,y:number,padding?:number)=>boolean;site?:FishingRenderSite;playerBodies?(now:number):readonly PhysicalCapsule[];visualTime?(worldSeconds:number):number}
export interface FishingCommunityController {
  group:THREE.Group;
  setView(origin:{x:number;y:number},focus:{x:number;y:number},level:number,quality?:RenderQuality):void;
  animate(worldSeconds:number,reducedMotion:boolean):void;
  follow(id:string|null):void;
  position(id:string):{x:number;y:number}|null;
  getState():FishingState;
  pickables():THREE.Object3D[];
  dispose():void;
}
const LABELS:Record<string,string>={moored:'En el muelle',preparing:'Preparando salida',departing:'Zarpando',outbound:'Rumbo al caladero',sailing:'Navegando',fishing:'Pescando',returning:'Regresando',inbound:'Regresando',lifting:'Recogiendo cajas',waiting:'Esperando descarga',approaching:'Llegando al muelle',parking:'Aparcando',docking:'Atracando',unloading:'Descargando pescado',loading:'Cargando',carrying:'Transportando cajas',walking:'Caminando',working:'Trabajando',market:'Entregando al mercado',resting:'En espera',idle:'En espera'};
const CART_LABELS:Record<string,string>={outbound:'Camino a la ciudad',inbound:'Regresando al muelle',unloading:'Entregando al almacén'};
export function fishingActivityState(state:string,kind?:FishingActivity['kind']):string{return(kind==='cart'?CART_LABELS[state]:undefined)??LABELS[state]??state;}
export function fishingStateForSnapshot(snapshot:FishingRenderSnapshot,community:{id:string;name:string},followedId:string|null=null):FishingState{return{available:true,communityId:community.id,communityName:community.name,followedId,activities:[...snapshot.boats.map(b=>({id:b.id,kind:'boat'as const,label:b.name,state:fishingActivityState(b.state),x:b.x,y:b.y,cargo:b.cargo})),...snapshot.carts.map(c=>({id:c.id,kind:'cart'as const,label:c.name,state:fishingActivityState(c.state,'cart'),x:c.x,y:c.y,cargo:c.cargo})),...snapshot.workers.map(w=>({id:w.id,kind:'worker'as const,label:w.name,state:fishingActivityState(w.state),x:w.x,y:w.y,cargo:Number(w.carrying)}))]};}
const ORIGINAL_SITE:FishingRenderSite={id:FISHING_COMMUNITY.id,name:FISHING_COMMUNITY.name,biome:FISHING_COMMUNITY.biome,rotation:0,phaseOffset:0,boats:FISHING_COMMUNITY.boats,toWorld:point=>point,toTemplate:point=>point,snapshot:fishingSnapshot,surfaceHeight:fishingSurfaceHeight};
/** Boarding ramps meet the real boat deck (.48 above its waterline origin). */
export function fishingBoardingHeight(x:number,y:number,seconds:number,boats=fishingSnapshot(seconds).boats):number|null{
  return boardingHeight(x,y,seconds,boats,ORIGINAL_SITE);
}
function boardingHeight(x:number,y:number,seconds:number,boats:FishingSnapshot['boats'],site:FishingRenderSite):number|null{
  for(const path of FISHING_DOCK_PATHS.filter(p=>p.width<3)){
    const end=path.points[path.points.length-1],side=end.y<FISHING_COMMUNITY.dock.y?-1:1,start=FISHING_COMMUNITY.dock.y+side*FISHING_COMMUNITY.dock.width/2,t=(y-start)/(end.y-start);
    if(t<0||t>1||Math.abs(x-end.x)>path.width/2+.05)continue;
    const berth=FISHING_COMMUNITY.boats.findIndex(b=>path.id.startsWith(b.id)),boat=boats.find(b=>b.id===site.boats[berth]?.id);if(!boat)continue;
    const world=site.toWorld({x,y}),deck=boat.waterLevel+.08+.48+maritimeWave(world.x,world.y,seconds).height;
    return FISHING_COMMUNITY.dock.deckHeight+(deck-FISHING_COMMUNITY.dock.deckHeight)*t;
  }
  return null;
}

/** Dynamic entities use world coordinates and world time, not chunk lifetimes. */
export function createFishingCommunityRenderer(options:FishingCommunityOptions):FishingCommunityController{
  const group=new THREE.Group();group.name='fishing-community';
  const site=options.site??ORIGINAL_SITE,anchor={x:FISHING_COMMUNITY.dock.x,y:FISHING_COMMUNITY.dock.y},worldAnchor=site.toWorld(anchor),library=createFishingModelLibrary(site.biome);group.rotation.y=-site.rotation;group.userData.communityId=site.id;
  let quality=options.quality,level=7,focus:{x:number;y:number}={...worldAnchor},origin={x:0,y:0},followedId:string|null=null,disposed=false,built=false,lastTime=-Infinity,viewDirty=true;
  let snapshot=site.snapshot(0);
  const boats=new Map<string,ReturnType<typeof library.boat>>(),carts=new Map<string,ReturnType<typeof library.haulage>>(),workers=new Map<string,ReturnType<typeof library.worker>>(),rotors:THREE.Object3D[]=[],gangways:{group:THREE.Group;path:typeof FISHING_DOCK_PATHS[number];length:number;boatId:string;yaw:number}[]=[];
  const ownedGeometry=new Set<THREE.BufferGeometry>(),ownedMaterial=new Set<THREE.Material>(),ownedTexture=new Set<THREE.Texture>(),staticGroup=new THREE.Group(),fleetGroup=new THREE.Group();group.add(staticGroup,fleetGroup);
  const cargoStacks:{mesh:THREE.InstancedMesh;location:'staging'|'city';berth:number;x:number;y:number;capacity:number}[]=[];
  const foamTexture=createMaritimeFoamTexture(),foamGeometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),foamMaterial=new THREE.MeshBasicMaterial({map:foamTexture,transparent:true,opacity:.62,depthWrite:false,alphaTest:.025}),foam=new THREE.InstancedMesh(foamGeometry,foamMaterial,32);foam.name='vessel-wakes';foam.frustumCulled=false;fleetGroup.add(foam);foam.count=0;ownedGeometry.add(foamGeometry);ownedMaterial.add(foamMaterial);ownedTexture.add(foamTexture);
  const birds:{group:THREE.Group;left:THREE.Mesh;right:THREE.Mesh;phase:number}[]=[],birdGeometry=new THREE.BoxGeometry(1,1,1),birdMaterial=new THREE.MeshStandardMaterial({color:0xe6e4d9,roughness:1});ownedGeometry.add(birdGeometry);ownedMaterial.add(birdMaterial);
  const dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const clear=(x:number,y:number,padding=0)=>{const point=site.toWorld({x,y});return!options.occupiedByPlayer?.(point.x,point.y,padding);};
  function surface(x:number,y:number){const point=site.toWorld({x,y});return site.surfaceHeight(point.x,point.y,options.heightAt(point.x,point.y));}
  function build(){
    if(built)return;built=true;
    const batches=new Map<string,{material:THREE.Material;parts:THREE.BufferGeometry[]}>();
    const add=(model:THREE.Group,x:number,y:number,z:number,yaw:number,scale=1)=>{
      dummy.position.set(x-anchor.x,y,z-anchor.y);dummy.rotation.set(0,yaw,0);dummy.scale.setScalar(scale);dummy.updateMatrix();const parent=dummy.matrix.clone();model.updateMatrixWorld(true);
      model.traverse(object=>{if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;const key=object.material.uuid;let batch=batches.get(key);if(!batch){batch={material:object.material,parts:[]};batches.set(key,batch);}matrix.multiplyMatrices(parent,object.matrixWorld);batch.parts.push(object.geometry.clone().applyMatrix4(matrix));});
    };
    for(const item of[...FISHING_STRUCTURES,...FISHING_PROPS]){
      if(item.kind==='dock')continue;
      if(!clear(item.x,item.y,Math.max(item.width,item.depth)/2))continue;
      const model=library.get(item.kind,item.id),y=item.height??surface(item.x,item.y);if(item.kind==='windmill'){model.position.set(item.x-anchor.x,y,item.y-anchor.y);model.rotation.y=item.yaw;model.scale.setScalar(item.scale);staticGroup.add(model);const rotor=model.getObjectByName('windmill-rotor');if(rotor)rotors.push(rotor);}else add(model,item.x,y,item.y,item.yaw,item.scale??1);
    }
    const deckParts:{matrix:THREE.Matrix4;color:THREE.Color}[]=[],fittingParts:typeof deckParts=[],deckCube=new THREE.BoxGeometry(1,1,1),timberTexture=createHarbourSurfaceTexture(),deckMaterial=new THREE.MeshStandardMaterial({roughness:.78,map:timberTexture}),fittingMaterial=new THREE.MeshStandardMaterial({roughness:.43,metalness:.65});ownedTexture.add(timberTexture);ownedGeometry.add(deckCube);ownedMaterial.add(deckMaterial);ownedMaterial.add(fittingMaterial);
    const deckBox=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,yaw=0,pitch=0,iron=false)=>{if(!clear(x,z,Math.max(w,d)/2))return;dummy.position.set(x-anchor.x,y,z-anchor.y);dummy.rotation.set(0,yaw,pitch);dummy.scale.set(w,h,d);dummy.updateMatrix();(iron?fittingParts:deckParts).push({matrix:dummy.matrix.clone(),color:new THREE.Color(color)});};
    for(const item of FISHING_PROPS.filter(p=>p.kind==='dock')){
      const top=item.height??FISHING_COMMUNITY.dock.deckHeight,rows=Math.ceil(item.depth/3.8),columns=Math.ceil(item.width/.3),w=item.width/columns,d=item.depth/rows;
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const x=item.x-item.width/2+(col+.5)*w,z=item.y-item.depth/2+(row+.5)*d;deckBox(x,top-.075,z,w-.02,.15,d-.025,(row+col)%5?0x95734d:0xb3996d);}
      for(let x=item.x-item.width/2+2;x<=item.x+item.width/2;x+=6)for(const side of[-1,1]){const z=item.y+side*(item.depth/2-.4),point=site.toWorld({x,y:z}),bed=sampleWorld(point.x,point.y).height,bottom=Math.min(bed-.15,top-1.4);deckBox(x,(top+bottom)/2,z,.32,top-bottom,.32,0x5c4e38);deckBox(x,top-.24,item.y,.22,.3,item.depth,0x624e35);const passage=FISHING_DOCK_PATHS.some(path=>path.width<3&&path.points.some(p=>Math.hypot(p.x-x,p.y-z)<3));if(!passage){deckBox(x,top+.45,z,.26,.9,.26,0x92724d);deckBox(x,top+.78,z,5.8,.11,.11,0xb49a6e);}}
      // Structural braces, tide stains, collars and bolt heads add close detail
      // below the unchanged deck/rail envelope. Berth openings remain clear.
      for(let x=item.x-item.width/2+2;x<item.x+item.width/2-.3;x+=6)for(const side of[-1,1]){const z=item.y+side*(item.depth/2-.4),passage=FISHING_DOCK_PATHS.some(path=>path.width<3&&path.points.some(p=>Math.hypot(p.x-x,p.y-z)<3));for(const y of[top-.35,top-1.05])deckBox(x,y,z,.35,.075,.35,0x5b6863,0,0,true);deckBox(x,top-1.15,z,.335,.34,.335,0x53624d);if(!passage){deckBox(x,top+.9,z,.3,.055,.3,0x596b68,0,0,true);deckBox(x,top+.81,z+side*.066,.07,.045,.07,0xc1b88f,0,0,true);if(x+2.7<item.x+item.width/2-.3){deckBox(x+1.25,top-.68,z,2.75,.12,.12,0x756045,0,.42);for(const dx of[.96,1.13,1.3])deckBox(x+dx,top-.56,z+side*.14,.13,.92,.16,dx===1.13?0x5c5140:0x968066);}}}
      for(let row=0;row<rows;row+=2)for(let col=3;col<columns;col+=16){const x=item.x-item.width/2+(col+.5)*w;for(const side of[-1,1])deckBox(x,top+.006,item.y-item.depth/2+(row+.5)*d+side*(d/2-.12),.035,.012,.035,0x5b6258,0,0,true);}
    }
    const accessStart=FISHING_COMMUNITY.dock.shore.x,accessEnd=FISHING_COMMUNITY.dock.x-FISHING_COMMUNITY.dock.length/2,accessCount=Math.ceil((accessEnd-accessStart)/.3),accessStep=(accessEnd-accessStart)/accessCount;
    for(let i=0;i<accessCount;i++){const x=accessStart+(i+.5)*accessStep,z=FISHING_COMMUNITY.dock.y,a=surface(x-accessStep/2,z),b=surface(x+accessStep/2,z);deckBox(x,(a+b)/2-.075,z,accessStep-.012,.15,10,i%4?0x95734d:0xb3996d,0,Math.atan2(b-a,accessStep));}
    const rampMaterial=new THREE.MeshStandardMaterial({color:0x9d8058,roughness:.8,map:timberTexture});ownedMaterial.add(rampMaterial);
    for(const path of FISHING_DOCK_PATHS.filter(p=>p.width<3)){
      const end=path.points[path.points.length-1],side=end.y<FISHING_COMMUNITY.dock.y?-1:1,start=FISHING_COMMUNITY.dock.y+side*FISHING_COMMUNITY.dock.width/2,length=Math.abs(end.y-start),yaw=side>0?0:Math.PI;
      if(!clear(end.x,(start+end.y)/2,length/2))continue;
      const ramp=new THREE.Group(),parts:THREE.BufferGeometry[]=[],count=Math.ceil(length/.3);
      for(let i=0;i<count;i++){dummy.position.set(0,-.07,(i+.5)*length/count);dummy.rotation.set(0,0,0);dummy.scale.set(path.width,.14,length/count-.015);dummy.updateMatrix();parts.push(deckCube.clone().applyMatrix4(dummy.matrix));}
      for(const x of[-path.width*.43,path.width*.43]){dummy.position.set(x,.65,length/2);dummy.scale.set(.08,.08,length);dummy.updateMatrix();parts.push(deckCube.clone().applyMatrix4(dummy.matrix));for(const z of[.3,length-.3]){dummy.position.set(x,.3,z);dummy.scale.set(.08,.6,.08);dummy.updateMatrix();parts.push(deckCube.clone().applyMatrix4(dummy.matrix));}}
      const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());ownedGeometry.add(geometry);const mesh=new THREE.Mesh(geometry,rampMaterial);mesh.castShadow=true;mesh.receiveShadow=true;ramp.add(mesh);ramp.position.set(end.x-anchor.x,FISHING_COMMUNITY.dock.deckHeight,start-anchor.y);ramp.name=path.id;ramp.rotation.y=yaw;staticGroup.add(ramp);
      const berth=FISHING_COMMUNITY.boats.findIndex(b=>path.id.startsWith(b.id)),boatId=site.boats[berth].id;ramp.name=path.id.replace(FISHING_COMMUNITY.boats[berth].id,boatId);gangways.push({group:ramp,path,length,boatId,yaw});
    }
    for(const[parts,material,name]of[[deckParts,deckMaterial,'continuous-fishing-wharf'],[fittingParts,fittingMaterial,'fishing-wharf-forged-fittings']]as const)if(parts.length){const mesh=new THREE.InstancedMesh(deckCube,material,parts.length);mesh.name=name;parts.forEach((p,i)=>{mesh.setMatrixAt(i,p.matrix);mesh.setColorAt(i,p.color);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();staticGroup.add(mesh);}
    const pathGeometry=new THREE.BoxGeometry(1,1,1),pathMaterial=new THREE.MeshStandardMaterial({color:0xb4a27a,roughness:1});ownedGeometry.add(pathGeometry);ownedMaterial.add(pathMaterial);
    for(const path of FISHING_LAND_PATHS.filter(path=>path.surface==='land'))for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],length=Math.hypot(b.x-a.x,b.y-a.y),count=Math.max(1,Math.ceil(length/1.7)),yaw=Math.atan2(b.x-a.x,b.y-a.y);
      for(let j=0;j<count;j++){const t=(j+.5)/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(!clear(x,y,path.width/2))continue;const part=new THREE.Mesh(pathGeometry,pathMaterial);part.position.set(x-anchor.x,surface(x,y)+.04,y-anchor.y);part.rotation.y=yaw;part.scale.set(path.width,.12,length/count+.08);part.updateMatrix();let batch=batches.get(pathMaterial.uuid);if(!batch){batch={material:pathMaterial,parts:[]};batches.set(pathMaterial.uuid,batch);}batch.parts.push(pathGeometry.clone().applyMatrix4(part.matrix));}
    }
    for(const batch of batches.values()){const merged=mergeGeometries(batch.parts,false);batch.parts.forEach(p=>p.dispose());if(!merged)continue;ownedGeometry.add(merged);const mesh=new THREE.Mesh(merged,batch.material);mesh.name='fishing-port-static-detail';mesh.castShadow=true;mesh.receiveShadow=true;staticGroup.add(mesh);}
    const crate=library.get('crate',0).children[0]as THREE.Mesh;
    for(const stack of[{location:'staging'as const,berth:0,x:1170,y:6708,capacity:6},{location:'staging'as const,berth:1,x:1170,y:6738,capacity:6},{location:'city'as const,berth:-1,x:896.5,y:6802,capacity:24}]){
      const mesh=new THREE.InstancedMesh(crate.geometry,crate.material,stack.capacity);mesh.name=`fishing-cargo-${stack.location}-${stack.berth}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.count=0;staticGroup.add(mesh);cargoStacks.push({...stack,mesh});
    }
    for(let i=0;i<6;i++){const bird=new THREE.Group(),body=new THREE.Mesh(birdGeometry,birdMaterial),left=new THREE.Mesh(birdGeometry,birdMaterial),right=new THREE.Mesh(birdGeometry,birdMaterial);body.scale.set(.13,.13,.4);left.scale.set(.7,.045,.18);right.scale.copy(left.scale);left.position.x=-.35;right.position.x=.35;bird.add(body,left,right);fleetGroup.add(bird);birds.push({group:bird,left,right,phase:i*.91});}
  }
  const controller:FishingCommunityController={group,
    setView(nextOrigin,nextFocus,nextLevel,nextQuality=quality){viewDirty ||= nextOrigin.x!==origin.x||nextOrigin.y!==origin.y||nextFocus.x!==focus.x||nextFocus.y!==focus.y||nextLevel!==level||nextQuality!==quality;origin={...nextOrigin};focus={...nextFocus};level=nextLevel;quality=nextQuality;group.position.set(worldAnchor.x-origin.x,0,worldAnchor.y-origin.y);},
    animate(worldSeconds){
      if(disposed)return;if(!viewDirty&&(worldSeconds===lastTime||!group.visible&&!followedId&&worldSeconds-lastTime>=0&&worldSeconds-lastTime<.5))return;viewDirty=false;lastTime=worldSeconds;snapshot=site.snapshot(worldSeconds);
      const distance=Math.hypot(focus.x-worldAnchor.x,focus.y-worldAnchor.y),near=distance<900||snapshot.boats.some(b=>Math.hypot(b.x-focus.x,b.y-focus.y)<350)||snapshot.carts.some(c=>Math.hypot(c.x-focus.x,c.y-focus.y)<200);
      group.visible=near;if(!near)return;const players=options.playerBodies?.(worldSeconds*1000)??[],visualSeconds=options.visualTime?.(worldSeconds)??worldSeconds;
      const resolvedWorkers=snapshot.workers.flatMap(worker=>{const pose=physicalNpcPose(worker.id,worldSeconds*1000,players);return pose?[{...worker,x:pose.x,y:pose.y,yaw:pose.yaw,speed:pose.walking?worker.speed:0}]:[];}),resolvedCarts=snapshot.carts.flatMap(cart=>{const pose=physicalNpcPose(cart.id,worldSeconds*1000,players);return pose?[{...cart,x:pose.x,y:pose.y,yaw:pose.yaw,speed:pose.walking?cart.speed:0}]:[];});snapshot={...snapshot,workers:resolvedWorkers,carts:resolvedCarts};for(const model of workers.values())model.group.visible=false;for(const model of carts.values())model.group.visible=false;build();for(const rotor of rotors)rotor.rotation.z=visualSeconds*.42;
      for(const ramp of gangways){const boat=snapshot.boats.find(b=>b.id===ramp.boatId)!,config=site.boats.find(b=>b.id===ramp.boatId)!,phase=((worldSeconds+config.offset+site.phaseOffset)%540+540)%540,end=site.toWorld(ramp.path.points[ramp.path.points.length-1]),deck=boat.waterLevel+.08+.48+maritimeWave(end.x,end.y,worldSeconds).height,lowered=Math.atan2(FISHING_COMMUNITY.dock.deckHeight-deck,ramp.length);let lift=phase<15||phase>=295?0:phase<25?(phase-15)/10:phase>=287?(295-phase)/8:1;lift=lift*lift*(3-2*lift);ramp.group.rotation.set(lowered*(1-lift)-1.05*lift,ramp.yaw,0,'YXZ');}

      for(const boat of snapshot.boats){let model=boats.get(boat.id);if(!model){model=library.boat(boat.id);boats.set(boat.id,model);model.group.name=boat.id;model.group.traverse(object=>object.userData.fishingActivityId=boat.id);fleetGroup.add(model.group);}const local=site.toTemplate(boat),sea=sampleWorld(boat.x,boat.y),pose=maritimeBoatPose(boat.x,boat.y,visualSeconds,boat.yaw);model.group.position.set(local.x-anchor.x,sea.waterLevel+.08+pose.height,local.y-anchor.y);model.group.rotation.set(pose.pitch,boat.yaw+site.rotation,pose.roll,'YXZ');model.animate(visualSeconds,boat.speed,boat.state,boat.cargo);model.group.visible=clear(local.x,local.y,3);}
      for(const cart of snapshot.carts){let model=carts.get(cart.id);if(!model){model=library.haulage(cart.animal);carts.set(cart.id,model);model.group.name=cart.id;model.group.traverse(object=>object.userData.fishingActivityId=cart.id);fleetGroup.add(model.group);}const local=site.toTemplate(cart);model.group.position.set(local.x-anchor.x,surface(local.x,local.y),local.y-anchor.y);model.group.rotation.y=cart.yaw+site.rotation;model.animate(visualSeconds,cart.speed,cart.cargo);model.group.visible=clear(local.x,local.y,3);}
      for(const worker of snapshot.workers){let model=workers.get(worker.id);if(!model){model=library.worker(worker.role,worker.id);model.group.scale.setScalar(.72);workers.set(worker.id,model);model.group.name=worker.id;fleetGroup.add(model.group);}const local=site.toTemplate(worker);model.group.position.set(local.x-anchor.x,(boardingHeight(local.x,local.y,worldSeconds,snapshot.boats,site)??worker.height??surface(local.x,local.y))+.08,local.y-anchor.y);model.group.rotation.y=worker.yaw+site.rotation;const load=model.group.getObjectByName('actor-load');if(load)load.visible=worker.carrying;model.animate(visualSeconds,worker.speed,worker.state==='working'||worker.state==='lifting'||worker.state==='unloading');model.group.visible=level>=7&&clear(local.x,local.y,1);}
      for(const stack of cargoStacks){const ids=snapshot.loads.filter(load=>load.location===stack.location&&(stack.berth<0||load.batchId.startsWith(site.boats[stack.berth].id))).flatMap(load=>load.cargoIds).slice(-stack.capacity),visibleIds:string[]=[];
        for(const id of ids){const slot=stack.location==='staging'?Number(id.match(/-crate-(\d+)$/)?.[1]??visibleIds.length):visibleIds.length,x=stack.x+(slot%3-1)*.74,z=stack.y+(Math.floor(slot/3)%2-.5)*.74;if(!clear(x,z,.5))continue;dummy.position.set(x-anchor.x,surface(x,z)+Math.floor(slot/6)*.56,z-anchor.y);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();stack.mesh.setMatrixAt(visibleIds.length,dummy.matrix);visibleIds.push(id);}
        stack.mesh.count=visibleIds.length;stack.mesh.userData.cargoIds=visibleIds;stack.mesh.instanceMatrix.needsUpdate=true;
      }
      let foamCount=0;
      for(const boat of snapshot.boats){const boatLocal=site.toTemplate(boat);if(boat.speed<.05||!clear(boatLocal.x,boatLocal.y,3))continue;for(let i=0;i<(quality==='performance'?4:8);i++){const distance=1.7+i*.9,x=boat.x-Math.sin(boat.yaw)*distance,y=boat.y-Math.cos(boat.yaw)*distance,sea=sampleWorld(x,y);if(!sea.water)continue;const local=site.toTemplate({x,y});dummy.position.set(local.x-anchor.x,sea.waterLevel+.1+maritimeWave(x,y,visualSeconds).height,local.y-anchor.y);dummy.rotation.set(0,boat.yaw+site.rotation,0);dummy.scale.set(.8+i*.22,1,.58+i*.025);dummy.updateMatrix();foam.setMatrixAt(foamCount++,dummy.matrix);}}foam.count=foamCount;foam.instanceMatrix.needsUpdate=true;
      birds.forEach((bird,i)=>{bird.group.visible=i<(quality==='performance'?2:6)&&level>=7;const a=worldSeconds*.06+bird.phase;bird.group.position.set(Math.cos(a)*(18+i*2),FISHING_COMMUNITY.dock.deckHeight+9+i*.35+Math.sin(a*2)*.5,Math.sin(a)*15);bird.group.rotation.y=-a;bird.left.rotation.z=Math.sin(worldSeconds*4+bird.phase)*.42;bird.right.rotation.z=-bird.left.rotation.z;});
    },
    follow(id){followedId=id;},
    position(id){const actor=[...snapshot.boats,...snapshot.carts,...snapshot.workers].find(p=>p.id===id);return actor?{x:actor.x,y:actor.y}:null;},
    pickables(){return group.visible?[...boats.values(),...carts.values()].filter(model=>model.group.visible).map(model=>model.group):[];},
    getState(){return fishingStateForSnapshot(snapshot,site,followedId);},
    dispose(){if(disposed)return;disposed=true;boats.forEach(b=>b.dispose());carts.forEach(c=>c.dispose());workers.forEach(w=>w.dispose());foam.dispose();staticGroup.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});library.dispose();ownedGeometry.forEach(g=>g.dispose());ownedMaterial.forEach(m=>m.dispose());ownedTexture.forEach(texture=>texture.dispose());ownedTexture.clear();group.clear();group.removeFromParent();},
  };
  return controller;
}
