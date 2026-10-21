import {OLD_TOWN_RESIDENT_LOOP} from './royal-old-town-plan.ts';
import {ROYAL_SERVICE_GATE as SERVICE_GATE} from './royal-urban-plan.ts';
import {createRoyalUrbanDistrict} from './royal-urban-district.ts';
import {createRoyalGrandBridge} from './royal-grand-bridge.ts';
import {royalAvenueDeck,royalChannelWaterY,royalSeaTrafficPose} from './royal-canal-layout.ts';
import {createShopRoadSigns} from './city-shop-road-signs.ts';
import {createTripoMooredFleet} from './tripo-ship.ts';
import {createBoardableRoyalGalleon} from './royal-galleon.ts';
import {royalMaritimeObstacles} from './royal-maritime-layout.ts';
import {createRoyalWorldActivity} from './royal-world-activity.ts';
import type {RoyalHarborSnapshot} from '../mvp/royal-harbor.ts';
import {createTripoVoxelPilot,voxelFallbackInstances,VOXEL_PILOT_SPECS,type VoxelPlacement} from './tripo-voxel-pilot.ts';
import * as THREE from 'three';
import {ROYAL_ARCHITECTURE_SCALE as K,ROYAL_PORT_OFFSET as OFFSET,ROYAL_CASTLE_SCALE,HUMAN_ASCENTS,HUMAN_LANDINGS} from './royal-proportions.ts';
import {createRoyalSurface} from './royal-world-surface.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {citadelWorldPoint} from './royal-citadel-layout.ts';
import {createRoyalCitadel,createRoyalArchBridge,disposeRoyalHarborCastleResources} from './royal-harbor-castle.ts';
import {openRoyalPalaceShell} from './royal-palace-shell.ts';
import {openRoyalPalaceColliders} from './royal-palace-structure.ts';
import {createRoyalCitadelGardens} from './royal-citadel-gardens.ts';
import {ROYAL_CITADEL_TRANSFORM,ROYAL_CITADEL_COURT_Y,ROYAL_CITADEL_SIDE_CROSSING_Z} from './royal-citadel-layout.ts';
import {createRoyalCitadelFlags} from './royal-citadel-flags.ts';
import {createRoyalTownLibrary} from './royal-harbor-town.ts';
import {createRoyalShipLibrary} from './royal-harbor-ships.ts';
import {createWorldAssetLibrary} from './world-models.ts';
import {createBiomeSettlementLibrary} from './biome-settlement-models.ts';
import {createLivingActorLibrary} from './living-actors.ts';
import {createMaritimeWaterMotion} from './maritime-water.ts';
import {applyRoyalSurfaceDetail} from './royal-harbor-materials.ts';
import {createRoyalWorldContext} from './royal-world-context.ts';
import {createCityShopModel} from './city-shop-model.ts';
import {shopReservedAt} from './city-shop-layout.ts';
import {sampleWorld,getBiomeStyle} from './world-geography.ts';
import {ROYAL_WORLD_LOCATION as site,ROYAL_WORLD_BOUNDS as bounds,ROYAL_WORLD_SCALE} from './royal-world-location.ts';
import {ROYAL_CITY_PLAN as plan,royalRiver,royalCityRoad,royalVegetationAllowed,royalRoadDeck} from './royal-regional-terrain.ts';

/** A metre-scale city around the preserved monumental palace. Every landscape
 * vertex and every root/foundation use the same continuous regional surface. */
export function createRoyalWorldLayer(baseY:number){
 const group=new THREE.Group();group.name='planet-corona-del-alba';
 const harbor=new THREE.Group();harbor.name='royal-human-scale-harbor';harbor.position.z=OFFSET;group.add(harbor);
 const ships=createRoyalShipLibrary(),assets=createWorldAssetLibrary(),architecture=createBiomeSettlementLibrary(),people=createLivingActorLibrary();
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[];
 const surface=createRoyalSurface(baseY),worldGround=surface.core,ground=surface.ground;
 const obstacles:RoyalObstacle[]=[];

 const up=new THREE.Vector3(0,1,0);
 const transform=(x:number,y:number,z:number,sx=1,sy=sx,sz=sx,yaw=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(up,yaw),new THREE.Vector3(sx,sy,sz));
 type Batch={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];transforms:THREE.Matrix4[]};const batches=new Map<string,Batch>();
 function instance(model:THREE.Group,m:THREE.Matrix4){model.updateMatrixWorld(true);model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const key=o.geometry.uuid+':'+(Array.isArray(o.material)?o.material.map(m=>m.uuid).join(':'):o.material.uuid);let b=batches.get(key);if(!b){b={geometry:o.geometry,material:o.material,transforms:[]};batches.set(key,b);}b.transforms.push(m.clone().multiply(o.matrixWorld));});}
 const supports:{name:string;x:number;y:number;z:number;bottom:number;top:number}[]=[];
 const cube=new THREE.BoxGeometry(1,1,1);geometries.add(cube);
 const stone=new THREE.MeshStandardMaterial({color:0xbcb69b,roughness:.92}),paving=new THREE.MeshStandardMaterial({color:0xc7b58b,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x89603b,roughness:.9}),green=new THREE.MeshStandardMaterial({color:0x4f7139,roughness:1}),gold=new THREE.MeshStandardMaterial({color:0xcda650,roughness:.5,metalness:.15});
 [stone,paving,wood,green,gold].forEach(m=>materials.add(m));applyRoyalSurfaceDetail(stone,'masonry');applyRoyalSurfaceDetail(wood,'wood');
 function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material,yaw=0){const key='box:'+material.uuid;let b=batches.get(key);if(!b){b={geometry:cube,material,transforms:[]};batches.set(key,b);}b.transforms.push(transform(x,y,z,w,h,d,yaw));if(name.includes('pile')||name.includes('foundation')||name.includes('support'))supports.push({name,x,y,z,bottom:y-h/2,top:y+h/2});}
 // The ground is a single supported surface, including the mountain feet.
 const nx=(bounds.maxX-bounds.minX)/4,nz=(bounds.maxZ-bounds.minZ)/4;const terrain=new THREE.PlaneGeometry(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,nx,nz);terrain.rotateX(-Math.PI/2);terrain.translate(0,0,(bounds.minZ+bounds.maxZ)/2);
 const v=terrain.getAttribute('position'),colors=new Float32Array(v.count*3),color=new THREE.Color();
 for(let i=0;i<v.count;i++){const x=v.getX(i),z=v.getZ(i),h=worldGround(x,z);v.setY(i,h);const sample=sampleWorld(site.x+x,site.y+z),river=royalRiver(x,z-OFFSET);color.set(river.water?0x586e57:royalCityRoad(x,z-OFFSET)?0xb6a27c:h>1450?0xe2e8df:h>1000?0x939c8c:h>600?0x6f7e60:getBiomeStyle(sample.water&&h>sample.waterLevel-baseY+1?'forest':sample.biome).ground);color.multiplyScalar(.92+.08*Math.sin(x*.006)*Math.cos(z*.005));color.toArray(colors,i*3);}
 const indices:number[]=[];for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const x=bounds.minX+(ix+.5)*4,z=bounds.minZ+(iz+.5)*4;if(Math.abs(x)<192&&z>=OFFSET+40&&z<OFFSET+296)continue;const a=iz*(nx+1)+ix,b=a+nx+1;indices.push(a,b,a+1,b,b+1,a+1);}terrain.setIndex(indices);
 terrain.setAttribute('color',new THREE.BufferAttribute(colors,3));terrain.computeVertexNormals();geometries.add(terrain);const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});materials.add(terrainMaterial);applyRoyalSurfaceDetail(terrainMaterial,'landscape');const landscape=new THREE.Mesh(terrain,terrainMaterial);landscape.name='royal-continuous-valley-and-mountains';landscape.receiveShadow=true;group.add(landscape);
 const context=createRoyalWorldContext(baseY,worldGround);group.add(context.group);
 const castle=createRoyalCitadel(true);openRoyalPalaceShell(castle,[{minX:(SERVICE_GATE.minX-.24)/ROYAL_CASTLE_SCALE,maxX:(SERVICE_GATE.maxX+.24)/ROYAL_CASTLE_SCALE,minY:(SERVICE_GATE.y-.22-plan.castleBase)/ROYAL_CASTLE_SCALE,maxY:(SERVICE_GATE.y+SERVICE_GATE.ceiling+.24-plan.castleBase)/ROYAL_CASTLE_SCALE,minZ:(SERVICE_GATE.minZ+OFFSET-.24)/ROYAL_CASTLE_SCALE,maxZ:(SERVICE_GATE.maxZ+OFFSET+.24)/ROYAL_CASTLE_SCALE}]).forEach(g=>geometries.add(g));castle.name='royal-citadel-on-the-fourth-terrace';castle.scale.setScalar(ROYAL_CASTLE_SCALE*ROYAL_WORLD_SCALE);castle.position.set(0,plan.castleBase,0);group.add(castle);
 const flags=createRoyalCitadelFlags();flags.group.scale.copy(castle.scale);flags.group.position.copy(castle.position);group.add(flags.group);
 const terraces={group:new THREE.Group(),dispose(){this.group.removeFromParent();this.group.clear();}},gardens=createRoyalCitadelGardens();terraces.group.name='royal-citadel-three-processional-terraces';gardens.group.position.z=OFFSET;gardens.group.scale.setScalar(K);group.add(terraces.group,gardens.group);
 for(const o of gardens.obstacles)obstacles.push({x:o.x*K,z:o.z*K,halfWidth:o.halfWidth*K,halfDepth:o.halfDepth*K,minY:o.y*K,maxY:(o.y+o.height)*K});
 for(const o of castle.userData.royalCitadel.solidColliders??[]){const w=citadelWorldPoint(o.x,0,o.z);obstacles.push({x:w.x*K,z:w.z*K,halfWidth:o.halfWidth*ROYAL_CASTLE_SCALE,halfDepth:o.halfDepth*ROYAL_CASTLE_SCALE,minY:citadelWorldPoint(0,o.minY,0).y*K,maxY:citadelWorldPoint(0,o.maxY,0).y*K});}

 const opened=openRoyalPalaceColliders(obstacles,[SERVICE_GATE]);obstacles.splice(0,obstacles.length,...opened);
 for(const landing of HUMAN_LANDINGS){const z=(landing.startZ+landing.endZ)/2,depth=landing.startZ-landing.endZ;box('terrace-paving',0,landing.y-.06,z,landing.width,.12,depth,stone);if(landing===HUMAN_LANDINGS[2])continue;for(const sign of[-1,1]){box('terrace-side-balustrade',sign*landing.width/2,landing.y+.48,z,.2,.96,depth,stone);for(let x=3;x<landing.width/2;x+=1.5)box('terrace-front-baluster',sign*x,landing.y+.48,landing.startZ,.12,.96,.12,stone);box('terrace-front-coping',sign*(landing.width/4+1.5),landing.y+.99,landing.startZ,landing.width/2-3,.12,.3,stone);}}

 // Link the unchanged port streets to the original three processional terraces.
 // Real risers and handrails overlay the legacy blueprint at human scale.
 for(const a of HUMAN_ASCENTS){for(let i=0;i<a.steps;i++){const z=a.startZ+(i+.5)/a.steps*(a.endZ-a.startZ),top=a.startY+(i+1)/a.steps*(a.endY-a.startY);box('human-processional-tread',0,top-.08,z,a.width,.16,Math.abs(a.endZ-a.startZ)/a.steps+.01,stone);}
  for(const sign of[-1,1]){const count=Math.ceil(Math.abs(a.endZ-a.startZ)/.75);for(let i=0;i<=count;i++){const t=i/count,z=a.startZ+(a.endZ-a.startZ)*t,y=a.startY+t*(a.endY-a.startY);box('human-railing-post',sign*(a.width/2+.08),y+.48,z,.055,.96,.055,gold);if(i<count)box('human-handrail',sign*(a.width/2+.08),y+.98,z+(a.endZ-a.startZ)/count/2,.065,.065,Math.abs(a.endZ-a.startZ)/count+.1,gold);}}
 }
 const portGeometry=new THREE.PlaneGeometry(384,256,192,128);portGeometry.rotateX(-Math.PI/2);portGeometry.translate(0,0,168);const portVertices=portGeometry.getAttribute('position');for(let i=0;i<portVertices.count;i++)portVertices.setY(i,ground(portVertices.getX(i),portVertices.getZ(i)));portGeometry.computeVertexNormals();const portColors=new Float32Array(portVertices.count*3),portColor=new THREE.Color(0x738749);for(let i=0;i<portVertices.count;i++)portColor.toArray(portColors,i*3);portGeometry.setAttribute('color',new THREE.BufferAttribute(portColors,3));geometries.add(portGeometry);const portGround=new THREE.Mesh(portGeometry,terrainMaterial);portGround.name='royal-port-detailed-ground';portGround.receiveShadow=true;harbor.add(portGround);
 const urban=createRoyalUrbanDistrict(ground);harbor.add(urban.group);obstacles.push(...urban.obstacles);const buildings=urban.buildings;
 function road(ax:number,az:number,bx:number,bz:number,width:number=plan.streetWidth){const length=Math.hypot(bx-ax,bz-az),steps=Math.ceil(length/2);for(let i=0;i<steps;i++){const t=(i+.5)/steps,x=ax+(bx-ax)*t,z=az+(bz-az)*t;if(royalRiver(x,z).water&&royalRoadDeck(x,z,ground(x,z))===null)continue;box('connected-street',x,(royalRoadDeck(x,z,ground(x,z))??Math.max(ground(x,z)+.12,royalRiver(x,z).water?1.92:-Infinity))-.06,z,width,.12,length/steps+.02,paving,Math.atan2(bx-ax,bz-az));}}
 const grandBridge=createRoyalGrandBridge(ground);harbor.add(grandBridge.group);obstacles.push(...grandBridge.obstacles);
 // Original full-size bridges and fortresses, supported by the same ground.
 for(const side of[-1,1]){const bridge=createRoyalArchBridge(136);bridge.scale.setScalar(10*K);bridge.position.set(side*2770*K,(ROYAL_CITADEL_COURT_Y-199.5)*K,(ROYAL_CITADEL_SIDE_CROSSING_Z+3800)*K);bridge.name='royal-perimeter-bridge-'+(side<0?'west':'east');group.add(bridge);
  for(let i=0;i<=6;i++){const x=(side*2770+(-68+i*136/6)*10)*K,top=(ROYAL_CITADEL_COURT_Y-199.5)*K,z=(ROYAL_CITADEL_SIDE_CROSSING_Z+3800)*K,bottom=worldGround(x,z);if(bottom<top)box('fort-bridge-support',x,(top+bottom)/2,z-OFFSET,65*K,top-bottom,120*K,stone);}
  const fort=architecture.get('tower','forest',3,side<0?1:2);fort.name='royal-detached-watch-fort-'+side;fort.scale.set(26*K,100*K,26*K);fort.position.set(side*3640*K,plan.courtY,(ROYAL_CITADEL_SIDE_CROSSING_Z+3800)*K);group.add(fort);
  const bottom=worldGround(side*3640*K,(ROYAL_CITADEL_SIDE_CROSSING_Z+3800)*K);box('fort-foundation',side*3640*K,(bottom+plan.courtY)/2,ROYAL_CITADEL_SIDE_CROSSING_Z*K,520*K,Math.max(.1,plan.courtY-bottom),520*K,stone);
 }
 for(const side of[-1,1])for(const z of[155,185,215]){
  const edge=side*23;for(let i=0;i<14;i++)box('pier-plank',edge-side*i*.72,1.05,z,.68,.3,4.5,wood);
  for(const x of[edge,edge-side*5,edge-side*9])for(const dz of[-1.6,1.6]){const bottom=ground(x,z+dz);box('pier-pile',x,(1.35+bottom)/2,z+dz,.4,1.35-bottom,.4,wood);}
  road(side*32,z,edge,z,3);
  for(let i=0;i<4;i++)box('port-cargo',side*(26+i%2*2),1.5,z+4+Math.floor(i/2)*2,1.5,1.4,1.5,wood);
 }
 const fleet:THREE.Group[]=[];const berths=[[-8,151],[-8,210],[-19,255],[23,261]];
 for(const [i,[x,z]]of berths.entries()){const vessel=ships.create({scale:plan.shipScale,variant:i%3});vessel.name='royal-harbor-galleon-'+(i+1);vessel.position.set(x,plan.waterY,z);vessel.rotation.y=i%2?Math.PI:0;harbor.add(vessel);fleet.push(vessel);}
 const transit=ships.create({scale:plan.shipScale,variant:2});transit.name="royal-canal-transit-galleon";harbor.add(transit);fleet.push(transit);let transitPose=royalSeaTrafficPose(0);
 const tripoFleet=createTripoMooredFleet(fleet);harbor.add(tripoFleet.group);
 const galleonFallback=ships.create({scale:.78,variant:0});galleonFallback.position.y=-1;
 const galleon=createBoardableRoyalGalleon(galleonFallback);harbor.add(galleon.group);obstacles.push(...royalMaritimeObstacles());
 const activity=createRoyalWorldActivity(ground);harbor.add(activity.group);let commerce:RoyalHarborSnapshot|null=null,commerceAnchor=0;
 // A supported working pier and a ramp from the fishing deck to shore.
 for(let i=0;i<14;i++){const x=23+i*.7;box('fish-pier-plank',x,1.2-(x-23)/9*.28-.09,224,.68,.18,3.7,wood);}
 for(let i=0;i<20;i++){const x=12.1+i*.55,y=-.24+(1.2+.24)*(x-12.1)/10.9;box('fish-unloading-gangway',x,y-.08,224,.57,.16,2.3,wood);}
 for(const x of[14,19,23])for(const dz of[-1.5,1.5]){const bottom=ground(x,224+dz);box('fish-pier-pile',x,(1.2+bottom)/2,224+dz,.3,1.2-bottom,.3,wood);}
 road(32,224,39,228,3);
 // Shoreline follows the exact same signed river mask as the ground surface.
 const points:[number,number][]=[];for(let z=110;z<=288;z+=2){const r=royalRiver(0,z);points.push([r.center+r.halfWidth,z]);}for(let z=288;z>=110;z-=2){const r=royalRiver(0,z);points.push([r.center-r.halfWidth,z]);}
 const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const waterGeometry=new THREE.ShapeGeometry(shape);waterGeometry.rotateX(-Math.PI/2);geometries.add(waterGeometry);
 const waterMaterial=new THREE.MeshStandardMaterial({color:0x227e95,roughness:.32,metalness:.08});materials.add(waterMaterial);const motion=createMaritimeWaterMotion(waterMaterial),contextMotion=createMaritimeWaterMotion(context.waterMaterial),water=new THREE.Mesh(waterGeometry,waterMaterial);water.name='royal-world-river-and-estuary';water.position.y=plan.waterY;harbor.add(water);
 // A metre-scale forest rooted in the same hills, never on an elevated sheet.
 const roots:{x:number;y:number;z:number}[]=[],pilotPines:VoxelPlacement[]=[];let seed=91783;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<1600;i++){const x=-225+random()*450,z=-345+random()*590;if((Math.abs(x)<150&&z> -45&&z<96)||(Math.abs(x)<190&&z>=96)||!royalVegetationAllowed(x,z,6))continue;const y=ground(x,z);if(y>85)continue;const scale=.85+random()*.45,yaw=random()*Math.PI*2;
  if(i%4&&x< -190&&z>110&&z<230&&pilotPines.length<6)pilotPines.push({x,y,z,scale,yaw});else instance(assets.get(i%4?'pine':'oak'),transform(x,y,z,scale,scale,scale,yaw));roots.push({x,y,z});}
 const pinePilot=createTripoVoxelPilot(VOXEL_PILOT_SPECS.pine,pilotPines,voxelFallbackInstances(assets.get('pine'),pilotPines));harbor.add(pinePilot.group);
 const mills:THREE.Object3D[]=[];for(const side of[-1,1]){const mill=assets.get('windmill');mill.position.set(side*232,ground(side*232,348),348);mill.scale.setScalar(1.1);harbor.add(mill);const rotor=mill.getObjectByName('windmill-rotor');if(rotor)mills.push(rotor);for(let i=0;i<120;i++){const x=side*(184+i%12*1.1),z=341+Math.floor(i/12)*1.2;box('grain',x,ground(x,z)+.45,z,.24,.9,.24,i%3?gold:green);}}


 const actors:ReturnType<typeof people.get>[]=[];for(let i=0;i<16;i++){const guard=i<4,actor=people.get(guard?'guard':i%3?'worker':'merchant',i+2);actor.group.name=guard?'royal-guard-'+i:'royal-city-resident-'+i;actor.group.scale.setScalar(plan.personScale);harbor.add(actor.group);actors.push(actor);}
 for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.transforms.length);b.transforms.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();harbor.add(mesh);instances.push(mesh);}
 let disposed=false,palace:ReturnType<typeof import('./royal-world-palace.ts').createRoyalWorldPalace>|null=null,palaceLoading:Promise<ReturnType<typeof import('./royal-world-palace.ts').createRoyalWorldPalace>|null>|null=null;
 function loadPalace(){return palaceLoading??=import('./royal-world-palace.ts').then(m=>{if(disposed)return null;palace=m.createRoyalWorldPalace();group.add(palace.group);return palace;});}

 const routeSigns=createShopRoadSigns(surface.walk);harbor.add(routeSigns.group);const shop=createCityShopModel(),northShop=createCityShopModel('paso-del-norte');harbor.add(shop.group,northShop.group);obstacles.push(...shop.obstacles,...northShop.obstacles);
 group.userData.royalCity={buildings,roots,berths,supports,oldTownVenues:urban.oldTown.venues,urbanPlan:urban.group.userData.urbanPlan,grandBridge:grandBridge.group.userData.royalBridge,baseY,units:'metres',castleScale:castle.scale.x,houseScale:plan.houseScale,personScale:plan.personScale,mountainSurface:'continuous-heightfield',harborOffsetZ:OFFSET,originalTransform:ROYAL_CITADEL_TRANSFORM,architectureScale:K,integration:context.group.userData.integration};
 return {group,obstacles,surface,shop,northShop,loadPalace,activity,oldTown:urban.oldTown,townPeople:()=>actors.slice(4).map(a=>({x:a.group.position.x,z:a.group.position.z,halfWidth:.32,halfDepth:.32,minY:.92,maxY:2.8,allowEgress:true})),seaTrafficPose:()=>transitPose,galleonBodies:galleon.colliders,clipShipCamera:galleon.clipCamera,setCommerce(snapshot:RoyalHarborSnapshot){if(snapshot.townSupply)urban.oldTown.setSupply(snapshot.townSupply,snapshot.now);commerce=snapshot;commerceAnchor=performance.now();},metrics:{buildings:buildings.length+urban.oldTown.venues.length,ships:fleet.length+2},setPlayers:context.setPlayers,setView(focus:{x:number;y:number},performance=false,level=6.2,streamed=true){context.setView(focus,performance,level,streamed);tripoFleet.setNear(Math.hypot(focus.x-site.x,focus.y-site.y-OFFSET-215)<480);galleon.setNear(Math.hypot(focus.x-site.x-9,focus.y-site.y-OFFSET-185)<480);activity.setFocus(focus.x-site.x,0,focus.y-site.y-OFFSET);pinePilot.setFocus(focus.x-site.x,focus.y-site.y-OFFSET,level>=8);if(level>=9&&Math.hypot(focus.x-site.x,focus.y-site.y)<180)void loadPalace().catch(()=>{});if(palace)palace.setFocus(focus.x-site.x,surface.ground(focus.x-site.x,focus.y-site.y-OFFSET),focus.y-site.y-OFFSET);},setOrigin(origin:{x:number;y:number}){group.position.set(site.x-origin.x,baseY,site.y-origin.y);},animate(seconds:number,reduced:boolean,utcSeconds=seconds){if(disposed)return;const t=reduced?0:seconds;urban.update(t,reduced);galleon.update(t);if(!reduced)transitPose=royalSeaTrafficPose(utcSeconds);transit.position.set(transitPose.x,-1,transitPose.z);transit.rotation.y=transitPose.yaw;tripoFleet.update(t);activity.update(commerce?(commerce.now+performance.now()-commerceAnchor)/1000:0,commerce);shop.update(t,reduced);northShop.update(t,reduced);palace?.update(t);flags.update(t);gardens.update(t);motion.update(t,{x:0,y:0});contextMotion.update(t,{x:site.x,y:site.y});fleet.forEach((boat,i)=>{boat.position.y=plan.waterY+Math.sin(t*.7+i)*.035;boat.rotation.z=Math.sin(t*.4+i)*.004;});mills.forEach((rotor,i)=>rotor.rotation.z=t*.4+i);actors.forEach((actor,i)=>{if(i<4){actor.group.position.set((i%2?1:-1)*(i<2?122:854)*K,plan.courtY,((i<2?1555:793)-3800)*K);actor.group.rotation.y=Math.PI;}else{const side=i%2?1:-1,route=(side<0?[{x:-32,z:130},{x:-32,z:180},{x:-64,z:180},{x:-64,z:130},{x:-32,z:130}]:OLD_TOWN_RESIDENT_LOOP).map(p=>[p.x,p.z]),length=route.slice(1).reduce((n,b,j)=>n+Math.hypot(b[0]-route[j][0],b[1]-route[j][1]),0);let d=(t*.9+Math.floor((i-4)/2)*length/6)%length;for(let j=0;j<route.length-1;j++){const [ax,az]=route[j],[bx,bz]=route[j+1],n=Math.hypot(bx-ax,bz-az);if(d<=n){const x=ax+(bx-ax)*d/n,z=az+(bz-az)*d/n;actor.group.position.set(x,Math.max(ground(x,z)+.12,royalRiver(x,z).water?1.92:-Infinity),z);actor.group.rotation.y=Math.atan2(bx-ax,bz-az);break;}d-=n;}}actor.animate(t,i>=4&&!reduced,false);if(i>=4){const load=actor.group.getObjectByName('actor-load');if(load)load.visible=false;for(const side of['left','right']){const arm=actor.group.getObjectByName('actor-'+side+'-shoulder'),elbow=actor.group.getObjectByName('actor-'+side+'-elbow');if(arm)arm.rotation.x=reduced?0:Math.sin(t*6.4+i)*(side==='left'?1:-1)*.35;if(elbow)elbow.rotation.x=-.12;}}});},dispose(){if(disposed)return;disposed=true;urban.dispose();grandBridge.dispose();tripoFleet.dispose();galleon.dispose();activity.dispose();pinePilot.dispose();group.removeFromParent();shop.dispose();northShop.dispose();routeSigns.dispose();palace?.dispose();context.dispose();flags.dispose();terraces.dispose();gardens.dispose();actors.forEach(a=>a.dispose());people.dispose();instances.forEach(m=>m.dispose());ships.dispose();assets.dispose();architecture.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());disposeRoyalHarborCastleResources();group.clear();}};
}
