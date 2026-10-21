import {gameAudio} from '../audio/engine.ts';
import {villageSounds,fishingSounds,tutorialSounds} from '../audio/world-sounds.ts';
import {FISHING_COMMUNITIES,getFishingCommunityData} from './fishing-network-data.ts';
import {humanInteriorLocation} from './royal-proportions.ts';
import * as THREE from 'three';
import {ROYAL_WORLD_LOCATION,royalWorldContains,royalWorldVisible,royalViewHalfHeight,royalCameraWeight} from './royal-world-location.ts';
import {ROYAL_PORT_OFFSET} from './royal-proportions.ts';
import {royalRegionalTerrain,royalVegetationAllowed,royalRiver} from './royal-regional-terrain.ts';
import {createWorldSky} from './world-sky.ts';
import {createTerrainHeightCache} from './graphics-build.ts';
import {habitableLandscapeShape} from './scene-structure.ts';
import {createViewerFrameLoop} from './viewer-lifecycle.ts';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilding, createRock, createTree } from './models.ts';
import { createWorldAssetLibrary, type WorldAsset } from './world-models.ts';
import { createSettlementAsync, type DetailedSettlement } from './settlement.ts';
import type {GraphicsBuildOptions} from './graphics-build.ts';
import { islandContains } from './settlement-layout.ts';
import { resolutionFor, stableSeed, type RenderStats, type SceneInput } from './scene-data.ts';
import { sampleWorld, getBiomeStyle, WORLD_CHUNK_SIZE, WORLD_LANDMARKS, chunkOrigin, type WorldBiome } from './world-geography.ts';
import { clampWorldPoint } from './world-navigation.ts';
import { worldCameraFrame, worldViewHalfHeight, worldStreamWindow, retainedSettlementChunks, flushCameraMomentum, cameraTilt, type CameraMode } from './world-camera.ts';
import { livingRoadAt, isLivingSettlement, LIVING_ZONE } from './living-zone-data.ts';
import { createLivingZoneChunk, type LivingZoneChunk } from './living-zone.ts';
import { createBiomeSettlementLibrary } from './biome-settlement-models.ts';
import { createInhabitedWorldChunk, type InhabitedWorldChunk } from './inhabited-world.ts';
import { INHABITED_PLACES, inhabitedRoadAt, isInhabitedSettlement } from './inhabited-world-data.ts';
import { createMaritimeWaterTexture, createMaritimeWaterMotion } from './maritime-water.ts';
import { type FishingState } from './fishing-community.ts';
import { createFishingNetworkRenderer } from './fishing-network.ts';
import { FISHING_NETWORK_PLACES as FISHING_PLACES, fishingNetworkRoadAt as fishingRoadAt } from './fishing-network-data.ts';
import type { PublicSettlement } from '../mvp/view.ts';
import {createHabitableBuildingLayer} from './habitable-buildings.ts';
import {createHabitableUpgradeLayer} from './habitable-construction.ts';
import {createHabitableCommerceLayer,habitableCommerceActive,habitableCommerceRouteKey} from './habitable-commerce.ts';
import {createExplorationTrafficLayer} from './exploration-traffic-layer.ts';
import {landCellPrepared,landNaturalWater,landPreparedCells,landDevelopmentKey} from './land-terrain.ts';
import {landDevelopmentActive} from './land-development.ts';
import {constrainDistrictCamera,districtCameraFrame,districtHeldInput,districtKeyDirection,districtLook,districtStreamWindow,isDistrictEditableTarget,normalizeDistrictInput,type DistrictCameraMode,type DistrictCameraObstacle,type DistrictNavigationInput,type DistrictPoint3} from './district-navigation.ts';
import {districtFloatingOrigin,explorationPlayerBodies,createExplorationWorldContext} from './exploration-district.ts';
import {createTerrainSurfaceGrid,type TerrainSurfaceGrid} from './terrain-surface.ts';
import {createExplorationInfrastructureChunk} from './exploration-infrastructure.ts';
import {worldFloraChunk,worldWildlifeChunk,physicalNpcPose,physicalTerrainSample} from './world-collision.ts';
import {publicInfrastructureAt} from '../mvp/exploration-network-data.ts';
import {publicStationLayout} from './public-station-layout.ts';
import {terrainRampsForChunk,clipTerrainRampFace,type TerrainVertex} from './terrain-ramps.ts';
import {landmarkPlacements} from './world-landmark-geometry.ts';

export interface WorldTerrainController {
  setActive(active:boolean):void;
  attachDistrict(district:WorldTerrainDistrict|null):void;
  update(input:SceneInput):void;
  setFocus(x:number,y:number):void;
  getFocus():{x:number;y:number};
  groundHeightAt(x:number,y:number):number;
  focusActivity(id:string|null):void;
  getFishingState():FishingState;
  setZoomLevel(level:number):void;
  rotate(side:number):void;
  setCameraMode(mode:CameraMode):void;
  getCameraMode():CameraMode;
  setDistrictCameraMode(mode:DistrictCameraMode):void;
  getDistrictCameraMode():DistrictCameraMode;
  setNavigationInput(input:DistrictNavigationInput):void;
  stopDistrictNavigation():void;
  lookDistrict(dx:number,dy:number):void;
  interactDistrict():void;
  recenterDistrict():void;
  setTilt(degrees:number):void;
  capture(width?:number,height?:number):Promise<Blob>;
  dispose():void;
}
/** Optional interactive district, sharing the atlas terrain and lighting. */
export interface WorldTerrainDistrict {
  group:THREE.Group;
  setOrigin(origin:{x:number;y:number}):void;
  animate(serverMilliseconds:number,reducedMotion:boolean):{x:number;y:number}|null;
  pickables():THREE.Object3D[];
  pointer(hit:THREE.Intersection|null,ground:{x:number;y:number}|null):void;
  hover?(point:{x:number;y:number}):void;
  key?(event:KeyboardEvent):void;
  setNavigationMode?(mode:DistrictCameraMode):void;
  navigationPose?():{foot:DistrictPoint3;heading:number;editing:boolean;blocked:boolean;transport?:'walk'|'cart'|'boat'};
  navigationGround?(x:number,z:number):number;
  cameraObstacles?():readonly DistrictCameraObstacle[];
  navigate?(input:DistrictNavigationInput,yaw:number,clock:number):void;
  stopManualNavigation?():void;
  interact?():void;
  dispose():void;
}
export interface WorldTerrainCallbacks {
  onSelectSettlement?:(id:string)=>void;
  onSelectNpc?:(id:string)=>void;
  onLocation?:(point:{x:number;y:number;biome:string})=>void;
  onFishingState?:(state:FishingState)=>void;
  onCameraState?:(state:{mode:CameraMode;tilt:number})=>void;
  onDistrictCameraState?:(state:{mode:DistrictCameraMode})=>void;
  onStats?:(stats:RenderStats)=>void;
  onError?:(message:string)=>void;
}
import {continuousTerrainHeight,waterfallPool,type OwnPatch,type TerrainPlateau} from './world-terrain-height.ts';
export {continuousTerrainHeight} from './world-terrain-height.ts';
const royalBaseY=sampleWorld(ROYAL_WORLD_LOCATION.x,ROYAL_WORLD_LOCATION.y).height+1;
function atlasTerrainHeight(x:number,y:number,own?:OwnPatch,plateaus:readonly TerrainPlateau[]=[],includeDeck=true){return royalRegionalTerrain(x,y,continuousTerrainHeight(x,y,own,plateaus,includeDeck),royalBaseY);}

type Chunk={cx:number;cy:number;group:THREE.Group;surface:TerrainSurfaceGrid;publicRoads?:ReturnType<typeof createExplorationInfrastructureChunk>;geometry:THREE.BufferGeometry[];textures:THREE.Texture[];materials:THREE.Material[];animals:{id:string;group:THREE.Group}[];pick:THREE.Object3D[];living?:LivingZoneChunk;inhabited?:InhabitedWorldChunk;rotors:{object:THREE.Object3D;phase:number}[];dispose():void};
type Batch={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[]};
const STEP=2, SIZE=WORLD_CHUNK_SIZE;
function sampleTerrain(x:number,y:number){const p=clampWorldPoint(x,y);return sampleWorld(p.x,p.y);}
/** One connected top/step mesh, with real vertical cliffs and no floating slab. */
export function buildWorldTerrainGeometry(cx:number,cy:number,step=STEP,own?:OwnPatch,plateaus:readonly TerrainPlateau[]=[]):{terrain:THREE.BufferGeometry;water:THREE.BufferGeometry;cells:number;surface:TerrainSurfaceGrid} {
  if(!Number.isInteger(cx)||!Number.isInteger(cy)||![2,4,8].includes(step))throw new RangeError('Invalid terrain chunk');
  const start=chunkOrigin(cx,cy),surface=createTerrainSurfaceGrid(cx,cy,step),ramps=terrainRampsForChunk(cx,cy),positions:number[]=[],colors:number[]=[],uvs:number[]=[],water:number[]=[],waterUV:number[]=[],waterWaves:number[]=[],waterDepths:number[]=[];
  const heightAt=createTerrainHeightCache(SIZE,step,(x,z)=>atlasTerrainHeight(start.x+x+step/2,start.y+z+step/2,own,plateaus,false));
  const supportOwners=[...(own?[own]:[]),...plateaus],support=supportOwners.flatMap(owner=>landPreparedCells(owner).map(cell=>({owner,minX:owner.x+cell.minX,maxX:owner.x+cell.maxX,minY:owner.y+cell.minY,maxY:owner.y+cell.maxY})));
  const color=new THREE.Color();let cells=0;
  const quad=(target:number[],a:number[],b:number[],c:number[],d:number[],rgb?:THREE.Color,sea=0,depth=0)=>{const faces=rgb&&ramps.length?clipTerrainRampFace([a,b,c,d].map(v=>[start.x+v[0],v[1],start.y+v[2]]as TerrainVertex),ramps).map(face=>face.map(v=>[v[0]-start.x,v[1],v[2]-start.y])):[[a,b,c,d]];for(const face of faces)for(let i=1;i<face.length-1;i++)for(const v of[face[0],face[i],face[i+1]]){target.push(v[0],v[1],v[2]);if(rgb){colors.push(rgb.r,rgb.g,rgb.b);uvs.push((start.x+v[0])/16,(start.y+v[2])/16);}else{waterUV.push((start.x+v[0])/12,(start.y+v[2])/12);waterWaves.push(sea);waterDepths.push(depth);}}};
  for(let baseX=0;baseX<SIZE;baseX+=step)for(let baseZ=0;baseZ<SIZE;baseZ+=step){
    const nearby=support.filter(p=>p.minX<start.x+baseX+step&&p.maxX>start.x+baseX&&p.minY<start.y+baseZ+step&&p.maxY>start.y+baseZ),xs=[baseX,baseX+step],zs=[baseZ,baseZ+step];
    for(const p of nearby){for(const x of[p.minX-start.x,p.maxX-start.x])if(x>baseX+1e-7&&x<baseX+step-1e-7)xs.push(x);for(const z of[p.minY-start.y,p.maxY-start.y])if(z>baseZ+1e-7&&z<baseZ+step-1e-7)zs.push(z);}
    const xCuts=nearby.length?[...new Set(xs)].sort((a,b)=>a-b):xs,zCuts=nearby.length?[...new Set(zs)].sort((a,b)=>a-b):zs;
    for(let ix=0;ix<xCuts.length-1;ix++)for(let iz=0;iz<zCuts.length-1;iz++){
    const x=xCuts[ix],z=zCuts[iz],cellWidth=xCuts[ix+1]-x,cellDepth=zCuts[iz+1]-z,gx=start.x+x+cellWidth/2,gy=start.y+z+cellDepth/2,sample=sampleTerrain(gx,gy),style=getBiomeStyle(sample.biome),h=nearby.length?atlasTerrainHeight(gx,gy,own,plateaus,false):heightAt(x,z);
    if(royalWorldContains(gx,gy)){surface.record(x,z,cellWidth,cellDepth,h);continue;}
    const authored=own&&Math.abs(gx-own.x)<16&&Math.abs(gy-own.y)<13&&islandContains(gx-own.x,gy-own.y)||nearby.some(p=>!islandContains(gx-p.owner.x,gy-p.owner.y)&&landCellPrepared(p.owner,gx-p.owner.x,gy-p.owner.y)&&!landNaturalWater(gx-p.owner.x,gy-p.owner.y));
    if(!authored){
      color.set((sample.road||livingRoadAt(gx,gy)||inhabitedRoadAt(gx,gy)||fishingRoadAt(gx,gy))?(sample.biome==='ice'?0xc6d6d8:sample.biome==='desert'?0xc3aa7b:0xbba472):sample.river?0x546d58:style.ground);const shade=.97+Math.sin(gx*.039+Math.cos(gy*.033)*1.6)*.018+Math.sin(gy*.11+gx*.071)*.01;color.multiplyScalar(shade);
      quad(positions,[x,h,z],[x,h,z+cellDepth],[x+cellWidth,h,z+cellDepth],[x+cellWidth,h,z],color);surface.record(x,z,cellWidth,cellDepth,h);cells++;
      const sides=[[-cellWidth,0],[cellWidth,0],[0,-cellDepth],[0,cellDepth]];
      for(let side=0;side<4;side++){const[nx,nz]=sides[side],neighbor=nearby.length?atlasTerrainHeight(gx+nx,gy+nz,own,plateaus,false):heightAt(x+nx,z+nz);if(neighbor>=h-.01)continue;const bottom=Math.max(h-32,neighbor);color.set(style.rock).multiplyScalar(.82+(side%2)*.12);
        if(side===0)quad(positions,[x,bottom,z],[x,bottom,z+cellDepth],[x,h,z+cellDepth],[x,h,z],color);
        if(side===1)quad(positions,[x+cellWidth,bottom,z+cellDepth],[x+cellWidth,bottom,z],[x+cellWidth,h,z],[x+cellWidth,h,z+cellDepth],color);
        if(side===2)quad(positions,[x+cellWidth,bottom,z],[x,bottom,z],[x,h,z],[x+cellWidth,h,z],color);
        if(side===3)quad(positions,[x,bottom,z+cellDepth],[x+cellWidth,bottom,z+cellDepth],[x+cellWidth,h,z+cellDepth],[x,h,z+cellDepth],color);
      }
    }
    const pool=waterfallPool(gx,gy,own);if(!royalWorldContains(gx,gy)&&!royalRiver(gx-ROYAL_WORLD_LOCATION.x,gy-ROYAL_WORLD_LOCATION.y-ROYAL_PORT_OFFSET).water&&(sample.water||pool)&&!authored&&(pool||h<sample.waterLevel+.12)){const wy=pool?sampleTerrain(own!.x,own!.y).height-3.38:sample.waterLevel+.08;quad(water,[x,wy,z],[x,wy,z+cellDepth],[x+cellWidth,wy,z+cellDepth],[x+cellWidth,wy,z],undefined,pool||sample.river?0:1,Math.max(0,wy-h));}
  }
  }
  const terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));terrain.computeVertexNormals();terrain.computeBoundingSphere();
  const waterGeometry=new THREE.BufferGeometry();waterGeometry.setAttribute('position',new THREE.Float32BufferAttribute(water,3));waterGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(waterUV,2));waterGeometry.setAttribute('seaWave',new THREE.Float32BufferAttribute(waterWaves,1));waterGeometry.setAttribute('waterDepth',new THREE.Float32BufferAttribute(waterDepths,1));waterGeometry.computeVertexNormals();waterGeometry.computeBoundingSphere();
  return{terrain,water:waterGeometry,cells,surface};
}

/** A streaming, camera-only world. It never creates accounts, deposits, orders or rewards. */
export async function createWorldTerrainRendererAsync(container:HTMLElement,initial:SceneInput,callbacks:WorldTerrainCallbacks={},initialFocus?:{x:number;y:number},options:GraphicsBuildOptions={}):Promise<WorldTerrainController>{
  const own=initial.view.settlements.find(p=>p.playerId===initial.player?.id),point=initialFocus??own?.plot;
  const prepared=own&&point&&Math.hypot(point.x-own.plot.x,point.y-own.plot.y)<64?await createSettlementAsync({player:initial.player,quality:initial.quality,showcase:false,includeLandscape:false},options):undefined;
  if(options.signal?.aborted){prepared?.dispose();throw new DOMException('Vista cancelada.','AbortError');}
  try{return createWorldTerrainRenderer(container,initial,callbacks,initialFocus,prepared);}catch(error){prepared?.dispose();throw error;}
}
export function createWorldTerrainRenderer(container:HTMLElement,initial:SceneInput,callbacks:WorldTerrainCallbacks={},initialFocus?:{x:number;y:number},preparedSettlement?:DetailedSettlement):WorldTerrainController {
  let animation:ReturnType<typeof createViewerFrameLoop>|null=null,active=true;
  let input=initial,disposed=false,lastFrame=0,lastStats=performance.now(),statsFrames=0,time=0,level=7,dirty=true;
  let serverNow=input.view.now,clockAnchor=performance.now(),frozenVisualSeconds:number|null=null;
  function fishingSeconds(now=performance.now()){return(serverNow+now-clockAnchor)/1000;}
  function visualSeconds(){const seconds=fishingSeconds();if(input.reducedMotion)return frozenVisualSeconds??=seconds;frozenVisualSeconds=null;return seconds;}
  let origin={x:0,y:0},focus={x:0,y:0},lastLocation='',signature='',owned:DetailedSettlement|null=null,ownedKey='',ownedGlobal:OwnPatch|null=null;
  let ownedBuild:AbortController|null=null,ownedPromise:Promise<void>|null=null;
  let royalLayer:ReturnType<typeof import('./royal-world-layer.ts').createRoyalWorldLayer>|null=null,royalLoading=false,royalFailed=false;
  let harborRead:AbortController|null=null,harborNextRead=0;
  function syncRoyalHarbor(now:number){
    if(!royalLayer?.group.visible||!input.player?.id||harborRead||now<harborNextRead||document.hidden)return;
    const request=new AbortController(),playerId=input.player.id;harborRead=request;harborNextRead=now+15000;
    void fetch('/api/royal-harbor?playerId='+encodeURIComponent(playerId),{signal:request.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw Error('Harbor unavailable');const data=await response.json() as {harbor?:import('../mvp/royal-harbor.ts').RoyalHarborSnapshot};if(disposed||input.player?.id!==playerId||!data.harbor)return;
      royalLayer?.setCommerce(data.harbor);harborNextRead=performance.now()+Math.max(2000,Math.min(15000,data.harbor.cycle.nextTransitionAt-data.harbor.now+100));dirty=true;
    }).catch(()=>{}).finally(()=>{if(harborRead===request)harborRead=null;});
  }
  const scene=new THREE.Scene(),renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  scene.background=new THREE.Color(0xd8e6e8);scene.fog=new THREE.Fog(0xa7bfbb,110,235);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=input.quality!=='performance';renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.domElement.style.cssText='position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none;outline:none';renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Terreno continuo de QFrontier. Arrastra para recorrer el mundo y pulsa una aldea para visitarla.');container.appendChild(renderer.domElement);
  const orthoCamera=new THREE.OrthographicCamera(-90,90,60,-60,.3,20000),perspectiveCamera=new THREE.PerspectiveCamera(42,1,.3,20000);
  let camera:THREE.OrthographicCamera|THREE.PerspectiveCamera=perspectiveCamera,cameraMode:CameraMode='3d',tilt=53,heading=Math.atan2(65,88);
  let transition:{start:number;from:number;to:number}|null=null,projectionMix=1;
  let districtCameraMode:DistrictCameraMode='aerial',districtYaw=0,districtPitch=.08,analogInput:DistrictNavigationInput={forward:0,strafe:0};
  const heldNavigationKeys=new Set<string>();
  let lookPointer:{id:number;x:number;y:number;looking:boolean}|null=null,followInitialized=false;
  camera.position.set(65,85,88);
  const controls=new OrbitControls<THREE.OrthographicCamera|THREE.PerspectiveCamera>(camera,renderer.domElement);controls.enableZoom=false;controls.enableDamping=!input.reducedMotion;controls.dampingFactor=.09;controls.screenSpacePanning=false;controls.minPolarAngle=Math.PI/12;controls.maxPolarAngle=Math.PI/3;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};
  const hemi=new THREE.HemisphereLight(0xc7e2e8,0x46534b,.9);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffdeb0,2.7);sun.castShadow=true;sun.shadow.bias=-.00035;sun.shadow.normalBias=.15;sun.shadow.mapSize.set(input.quality==='4k'?4096:2048,input.quality==='4k'?4096:2048);sun.shadow.camera.near=1;sun.shadow.camera.far=420;sun.shadow.camera.left=-95;sun.shadow.camera.right=95;sun.shadow.camera.top=95;sun.shadow.camera.bottom=-95;scene.add(sun,sun.target);
  const sky=createWorldSky(),skySun=new THREE.Vector3();scene.add(sky.mesh);
  const fill=new THREE.DirectionalLight(0xa6c9e2,.28);fill.position.set(40,50,-80);scene.add(fill);
  const assets=createWorldAssetLibrary(),biomeAssets=createBiomeSettlementLibrary(),chunks=new Map<string,Chunk>(),queue:{cx:number;cy:number;distance:number}[]=[],pending=new Set<string>(),refinements:Chunk[]=[];
  let refinementCenter='';
  const cube=new THREE.BoxGeometry(1,1,1),terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}),waterMaterial=new THREE.MeshStandardMaterial({color:0x438e9c,roughness:.4,metalness:.13,transparent:true,opacity:.88});
  const waterPixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,v=243+stableSeed(`${x}:${y}`)%13;waterPixels.set([v,v,Math.min(255,v+1),255],i);}const pixelTexture=new THREE.DataTexture(waterPixels,64,64);pixelTexture.colorSpace=THREE.SRGBColorSpace;pixelTexture.magFilter=THREE.LinearFilter;pixelTexture.minFilter=THREE.LinearMipmapLinearFilter;pixelTexture.generateMipmaps=true;pixelTexture.wrapS=pixelTexture.wrapT=THREE.RepeatWrapping;pixelTexture.needsUpdate=true;terrainMaterial.map=pixelTexture;const waterTexture=createMaritimeWaterTexture(pixelTexture);waterMaterial.map=waterTexture;const waterMotion=createMaritimeWaterMotion(waterMaterial,{depthAttribute:true});
  const horizonMaterial=new THREE.MeshStandardMaterial({color:0x7d965b,roughness:1}),horizonGeometry=new THREE.PlaneGeometry(100000,100000),horizon=new THREE.Mesh(horizonGeometry,horizonMaterial);horizon.rotation.x=-Math.PI/2;horizon.position.y=-20;horizon.receiveShadow=true;scene.add(horizon);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  let width=1,height=1,captureAspect:number|null=null,startPointer:{x:number;y:number}|null=null,changing=false,streamCenter='';
  const cloudParts=[[-2.8,-.2,0,3.6,1.5,2.8],[0,0,0,5,2,3.7],[2.8,-.15,.2,3.4,1.6,2.8],[-.7,1.15,-.2,3.1,1.6,2.8],[.8,.15,1.8,3,1.3,2.4],[-1,.1,-1.8,2.8,1.5,2.3]].map(([x,y,z,w,h,d])=>new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  const cloudGeometry=mergeGeometries(cloudParts,false)!;cloudParts.forEach(part=>part.dispose());
  const cloudMaterial=new THREE.MeshStandardMaterial({color:0xe4e9e1,transparent:true,opacity:.5,depthWrite:false,roughness:1}),clouds=new THREE.InstancedMesh(cloudGeometry,cloudMaterial,12);scene.add(clouds);clouds.frustumCulled=false;
  const cloudRight=new THREE.Vector3(),cloudUp=new THREE.Vector3(),cloudForward=new THREE.Vector3();
  function makeFishing(){const value=createFishingNetworkRenderer({quality:input.quality,heightAt:renderedGroundHeightAt,visualTime:visualSeconds,playerBodies,occupiedByPlayer:(x,y,padding=0)=>input.view.settlements.some(p=>Math.abs(x-p.plot.x)<p.plot.width/2+padding&&Math.abs(y-p.plot.y)<p.plot.depth/2+padding)});scene.add(value.group);return value;}
  let fishing=makeFishing(),followingActivity:string|null=null,trackingMove=false,lastFishingNotify=-Infinity;
  let district:WorldTerrainDistrict|null=null;
  const habitableWorldBuildings=new Map<string,ReturnType<typeof createHabitableBuildingLayer>>();
  const commerce=createHabitableCommerceLayer();scene.add(commerce.group);
  const traffic=createExplorationTrafficLayer(renderedGroundHeightAt);scene.add(traffic.group);
  const tradeCaravans=()=>input.view.habitable?.commerce?.caravans??[];
  let physicalWorldContext=createExplorationWorldContext(input);
  function updateCommerce(now:number){commerce.group.position.set(-origin.x,0,-origin.y);commerce.setClipRegion({key:`${streamCenter}:${chunks.size}`,contains:(x,y,padding=0)=>[[-padding,-padding],[-padding,padding],[padding,-padding],[padding,padding],[0,0]].every(([dx,dy])=>chunks.has(`${Math.floor((x+dx)/SIZE)}:${Math.floor((y+dy)/SIZE)}`))});commerce.update(tradeCaravans(),now,input.reducedMotion);}
  let lastAuthoritativeRender=0,hadAuthoritativeActivity=false;
  const stationUpgradeLayers=new Map<string,ReturnType<typeof createHabitableUpgradeLayer>>();
  function updateStationUpgrades(now:number){
    const visible=new Set<string>();
    for(const place of input.view.settlements){
      if(place.playerId!==input.player?.id||!place.construction?.length||!chunks.has(`${Math.floor(place.plot.x/SIZE)}:${Math.floor(place.plot.y/SIZE)}`))continue;
      visible.add(place.playerId);let layer=stationUpgradeLayers.get(place.playerId);
      if(!layer){layer=createHabitableUpgradeLayer({faction:place.faction,groundHeight:(x,y)=>atlasTerrainHeight(place.plot.x+x,place.plot.y+y,patch(),platforms())});stationUpgradeLayers.set(place.playerId,layer);scene.add(layer.group);}
      layer.group.position.set(place.plot.x-origin.x,0,place.plot.y-origin.y);layer.update(place.construction,now,input.reducedMotion);
    }
    for(const[id,layer]of stationUpgradeLayers)if(!visible.has(id)){layer.dispose();stationUpgradeLayers.delete(id);}
  }
  function updateHabitableBuildings(now:number){const visible=new Set<string>();for(const actor of input.view.habitable?.actors??[]){if(district&&actor.playerId===input.player?.id)continue;if(!chunks.has(`${Math.floor(actor.plot.x/SIZE)}:${Math.floor(actor.plot.y/SIZE)}`))continue;visible.add(actor.playerId);let layer=habitableWorldBuildings.get(actor.playerId);const state={...actor.state,exploration:undefined,version:1 as const};if(!layer){layer=createHabitableBuildingLayer({faction:input.view.settlements.find(p=>p.playerId===actor.playerId)?.faction,state,groundHeight:(x,y)=>atlasTerrainHeight(actor.plot.x+x,actor.plot.y+y,patch(),platforms())});habitableWorldBuildings.set(actor.playerId,layer);scene.add(layer.group);}layer.group.position.set(actor.plot.x-origin.x,0,actor.plot.y-origin.y);layer.update(state,now,input.reducedMotion);}for(const[id,layer]of habitableWorldBuildings)if(!visible.has(id)){layer.dispose();habitableWorldBuildings.delete(id);}}
  function fishingState(force=false){if(force||performance.now()-lastFishingNotify>1000){lastFishingNotify=performance.now();callbacks.onFishingState?.(fishing.getState());}}
  function stopFollowing(){if(!followingActivity)return;followingActivity=null;fishing.follow(null);fishingState(true);}
  function royalWide(){return !district&&royalCameraWeight(focus.x,focus.y)>0;}
  function viewHalfHeight(){return THREE.MathUtils.lerp(worldViewHalfHeight(level),royalViewHalfHeight(level),district?0:royalCameraWeight(focus.x,focus.y));}
  function royalLookHeight(){return royalWide()?45*Math.max(0,Math.min(1,(8-level)/2))*royalCameraWeight(focus.x,focus.y):0;}
  function streamView(){
    if(district&&districtCameraMode!=='aerial'){
      // A fixed local budget covers the eye-level horizon; distant detail remains behind fog.
      return districtStreamWindow(focus,input.quality==='performance');
    }
    return worldStreamWindow(focus,level,captureAspect??width/height,transition?'3d':cameraMode,tilt,heading,input.quality==='performance');
  }
  function atmosphere(){
    const view=streamView(),fog=scene.fog as THREE.Fog;
    const depthOffset=transition?camera.position.distanceTo(controls.target)-worldCameraFrame(level,captureAspect??width/height,'3d',tilt,heading).distance:0;
    if(royalWide()){const distance=camera.position.distanceTo(controls.target),weight=royalCameraWeight(focus.x,focus.y);fog.near=THREE.MathUtils.lerp(view.fogNear,distance+5000,weight);fog.far=THREE.MathUtils.lerp(view.fogFar,distance+16000,weight);}else if(district&&royalWorldVisible(focus.x,focus.y)){fog.near=1500;fog.far=24000;}else{fog.near=view.fogNear+depthOffset;fog.far=view.fogFar+depthOffset;}
    clouds.visible=districtCameraMode==='aerial'&&level<8&&cameraMode==='3d';cloudMaterial.opacity=.5*(1-THREE.MathUtils.smoothstep(level,7.1,8));
  }
  function animateClouds(){
    if(!clouds.visible)return;
    camera.updateMatrixWorld();cloudRight.setFromMatrixColumn(camera.matrixWorld,0);cloudUp.setFromMatrixColumn(camera.matrixWorld,1);cloudForward.copy(camera.position).sub(controls.target).normalize();
    const vertical=viewHalfHeight(),horizontal=vertical*width/height;
    for(let i=0;i<clouds.count;i++){
      const top=i<4,drift=Math.sin(time*.018+i)*.055;
      const sx=top?(-.75+i*.5+drift)*horizontal:(i%2?-1:1)*(.92+drift)*horizontal;
      const sy=top?vertical*(.94+Math.sin(time*.014+i)*.035):vertical*(-.2+Math.floor((i-4)/2)*.27);
      dummy.position.copy(controls.target).addScaledVector(cloudRight,sx).addScaledVector(cloudUp,sy).addScaledVector(cloudForward,45);
      dummy.rotation.set(0,i*.7,0);dummy.scale.set(1.6+(i%3)*.22,1.3+(i%2)*.2,1.5);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate=true;
  }
  function ownSummary(){return input.view.settlements.find(value=>value.playerId===input.player?.id);}
  function patch():OwnPatch|undefined{const own=ownSummary();return own?{x:own.plot.x,y:own.plot.y,land:input.player?.habitable?.land,landVisual:input.player?.habitable?.landVisual}:undefined;}
  function platforms():TerrainPlateau[]{return input.view.settlements.filter(p=>p.playerId!==input.player?.id).map(p=>({x:p.plot.x,y:p.plot.y,height:sampleTerrain(p.plot.x,p.plot.y).height,radius:18,landVisual:input.view.habitable?.actors.find(a=>a.playerId===p.playerId)?.state.landVisual}));}
  let bodyTime=-Infinity,bodyInput:SceneInput|null=null,bodyCache:ReturnType<typeof explorationPlayerBodies>=[];
  function playerBodies(now:number){if(now!==bodyTime||input!==bodyInput){bodyTime=now;bodyInput=input;bodyCache=explorationPlayerBodies(input,now);}return bodyCache;}
  function renderedGroundHeightAt(x:number,y:number){const infrastructure=publicInfrastructureAt({x,y});if(infrastructure?.kind==='ramp')return infrastructure.height;return chunks.get(`${Math.floor(x/SIZE)}:${Math.floor(y/SIZE)}`)?.surface.heightAt(x,y)??atlasTerrainHeight(x,y,patch(),platforms());}
  function clearedForCommerce(x:number,y:number,padding=0){return !!physicalWorldContext.clearAt?.(x,y,padding);}
  function addModel(batch:Map<string,Batch>,model:THREE.Group,x:number,y:number,z:number,scale=1,rotation=0){dummy.position.set(x,y,z);dummy.scale.setScalar(scale);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();const parent=dummy.matrix.clone();model.updateMatrixWorld(true);model.traverse(object=>{if(!(object instanceof THREE.Mesh)||object.userData.worldAnimated)return;matrix.multiplyMatrices(parent,object.matrixWorld);const key=`${object.geometry.uuid}:${Array.isArray(object.material)?object.material.map(m=>m.uuid).join():object.material.uuid}`;let entry=batch.get(key);if(!entry){entry={geometry:object.geometry,material:object.material,matrices:[]};batch.set(key,entry);}entry.matrices.push(matrix.clone());});}
  function label(chunk:Chunk,text:string,x:number,y:number,z:number,emphasis=false){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const context=canvas.getContext('2d');if(!context)return;context.fillStyle='rgba(22,43,34,.88)';context.beginPath();context.roundRect(2,4,508,86,12);context.fill();context.strokeStyle=emphasis?'#ead08a':'#a5bca0';context.lineWidth=3;context.stroke();context.font='600 23px system-ui';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#f0e1be';context.fillText(text,256,47,480);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;chunk.textures.push(texture);const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});chunk.materials.push(material);const sprite=new THREE.Sprite(material);sprite.position.set(x,y,z);sprite.scale.set(18,3.4,1);sprite.renderOrder=3;sprite.userData.worldMapLabel=true;sprite.visible=!district;chunk.group.add(sprite);}
  function town(chunk:Chunk,batch:Map<string,Batch>,data:{id:string;name:string;alias:string;x:number;y:number;biome:WorldBiome;tier:number;kind:string;stage:string},real?:PublicSettlement){
    const o=chunkOrigin(chunk.cx,chunk.cy),x=data.x-o.x,z=data.y-o.y,ground=sampleTerrain(data.x,data.y).height,city=data.kind==='city',seed=stableSeed(data.id),tier=Math.max(1,Math.min(3,data.tier));
    const finish=()=>{const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});chunk.materials.push(hitMaterial);const hit=new THREE.Mesh(cube,hitMaterial);hit.position.set(x,ground+2,z);hit.scale.set(city?55:37,6,city?52:35);hit.userData=real?{settlementId:real.id}:{npcId:data.id};chunk.group.add(hit);chunk.pick.push(hit);
    label(chunk,`${data.name} · ${data.alias}`,x,ground+(city?12:9),z,!!real?.own);};
    if(real){for(const part of publicStationLayout(real,data.biome)){const model=part.source==='building'?createBuilding(part.kind as Parameters<typeof createBuilding>[0],part.level,real.faction):assets.get(part.kind as WorldAsset);if(part.kind==='windmill'){model.position.set(part.x-o.x,ground,part.y-o.y);model.scale.setScalar(part.scale);chunk.group.add(model);const rotor=model.getObjectByName('windmill-rotor');if(rotor)chunk.rotors.push({object:rotor,phase:(seed%100)/100});}else addModel(batch,model,part.x-o.x,part.water?sampleTerrain(part.x,part.y).waterLevel+.25:ground,part.y-o.y,part.scale,part.rotation);}finish();return;}
    const family:WorldAsset=data.biome==='ice'?'igloo':data.biome==='desert'?'adobe':'hut',custom=data.biome==='ice'||data.biome==='desert';
    const place=(kind:string,dx:number,dz:number,n=1,scale=1.8)=>addModel(batch,custom&&kind==='home'?assets.get(family):createBuilding(kind as Parameters<typeof createBuilding>[0],n,'custodians'),x+dx,ground,z+dz,scale,(seed%4)*Math.PI/2);
    place('home',-5,-3,1,custom?.9:1.9);
    const order=['workshop','garden','kitchen','laboratory','barracks','warehouse','logistics'] as const;
    order.forEach((kind,i)=>{const upgrade=(data.stage==='construction'&&i>2||tier===1&&i>3||tier===2&&i>5?0:tier);if(!upgrade)return;const variant=seed%4,angle=i*Math.PI*2/7;const dx=variant===0?-11+(i%4)*7:variant===1?Math.cos(angle)*12:variant===2?(i%2?9:-9):[-11,-3,6,12,-11,0,11][i],dz=variant===0?(i<4?-10:8):variant===1?Math.sin(angle)*12:variant===2?-12+i*4:[-11,-12,-11,-4,8,11,8][i];if(custom)addModel(batch,assets.get(family),x+dx,ground,z+dz,.7+(upgrade-1)*.13,(seed%4)*Math.PI/2);else place(kind,dx,dz,upgrade,1.6);});
    addModel(batch,assets.get('market'),x+5,ground,z,city?1.1:.65);
    if(tier>=2){const mill=assets.get('windmill');mill.position.set(x-12,ground,z+11);mill.scale.setScalar(city?1.1:.8);chunk.group.add(mill);const rotor=mill.getObjectByName('windmill-rotor');if(rotor)chunk.rotors.push({object:rotor,phase:(seed%100)/100});}
    if(city){for(let i=0;i<8;i++){const a=i*Math.PI/4;addModel(batch,assets.get(custom?family:'hut'),x+Math.cos(a)*21,ground,z+Math.sin(a)*21,.8+(i%3)*.15,i*Math.PI/2);}for(const dx of[-26,26])for(const dz of[-23,23])place('outpost',dx,dz,3,2);for(let i=-3;i<=3;i++){addModel(batch,assets.get('wall'),x+i*6.2,ground,z-25,1);if(Math.abs(i)>0)addModel(batch,assets.get('wall'),x+i*6.2,ground,z+25,1);addModel(batch,assets.get('wall'),x-26,ground,z+i*6.2,1,Math.PI/2);addModel(batch,assets.get('wall'),x+26,ground,z+i*6.2,1,Math.PI/2);}for(const dx of[-8,8])addModel(batch,assets.get('market'),x+dx,ground,z+2,1.1);}
    if(data.stage==='construction'){const mat=new THREE.MeshStandardMaterial({color:0x986e43,roughness:1});chunk.materials.push(mat);for(let i=0;i<3;i++)for(const dx of[-1,1])for(const dz of[-1,1]){const post=new THREE.Mesh(cube,mat);post.position.set(x+5+i*4+dx,ground+1.8,z+10+dz);post.scale.set(.2,3.6,.2);post.castShadow=true;chunk.group.add(post);}}
    if(data.biome==='coast'||data.biome==='ocean')for(let i=0;i<(city?3:1);i++)addModel(batch,assets.get('boat'),x+16+i*4,sampleTerrain(data.x+16+i*4,data.y+14).waterLevel+.25,z+14,1,i*.3);
    finish();
  }
  function makeChunk(cx:number,cy:number):Chunk {
    const group=new THREE.Group(),o=chunkOrigin(cx,cy),batch=new Map<string,Batch>(),distance=Math.max(Math.abs(cx-Math.floor(focus.x/SIZE)),Math.abs(cy-Math.floor(focus.y/SIZE))),step=distance<=1?2:4;
    group.name=`world-chunk:${cx}:${cy}`;group.position.set(o.x-origin.x,0,o.y-origin.y);scene.add(group);
    const ownPatch=patch(),realPlatforms=platforms(),terrain=buildWorldTerrainGeometry(cx,cy,step,ownPatch,realPlatforms);
    const chunk:Chunk={cx,cy,group,surface:terrain.surface,geometry:[],textures:[],materials:[],animals:[],pick:[],rotors:[],dispose(){chunk.inhabited?.dispose();chunk.living?.dispose();chunk.publicRoads?.dispose();scene.remove(group);group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});chunk.geometry.forEach(g=>g.dispose());chunk.textures.forEach(t=>t.dispose());chunk.materials.forEach(m=>m.dispose());group.clear();}};
    chunk.geometry.push(terrain.terrain,terrain.water);const land=new THREE.Mesh(terrain.terrain,terrainMaterial);land.name='world-voxel-terrain';land.receiveShadow=true;land.castShadow=distance<=1;group.add(land);chunk.pick.push(land);if(terrain.water.attributes.position.count){const water=new THREE.Mesh(terrain.water,waterMaterial);water.receiveShadow=true;water.name='world-flowing-water';group.add(water);chunk.pick.push(water);}
    if(!royalWorldContains(o.x+SIZE/2,o.y+SIZE/2,48))updatePublicInfrastructure(chunk);
    const low=input.quality==='performance',close=distance===0&&!low;
    for(const flora of worldFloraChunk(cx,cy,{plots:input.view.settlements.map(place=>place.plot),clearAt:clearedForCommerce})){
      if(royalWorldContains(flora.x,flora.y)||!royalVegetationAllowed(flora.x-ROYAL_WORLD_LOCATION.x,flora.y-ROYAL_WORLD_LOCATION.y-ROYAL_PORT_OFFSET,9))continue;
      const x=flora.x-o.x,z=flora.y-o.y,y=physicalTerrainSample(flora).height;let model:THREE.Group;
      if(flora.kind==='rock')model=createRock('stone',flora.seed%3);
      else if(close&&['pine','oak','palm'].includes(flora.kind)){model=createTree(flora.kind as 'pine'|'oak'|'palm',flora.seed%3);model.scale.set(2.47,2.7,2.47);}
      else{model=assets.get(flora.kind);if(flora.kind!=='cactus')model.scale.set(.7,1,.7);}
      addModel(batch,model,x,y,z,flora.scale,flora.rotation);
    }
    for(const real of input.view.settlements){if(Math.floor(real.plot.x/SIZE)!==cx||Math.floor(real.plot.y/SIZE)!==cy)continue;if(real.playerId===input.player?.id){const mat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});chunk.materials.push(mat);const hit=new THREE.Mesh(cube,mat);hit.position.set(real.plot.x-o.x,sampleTerrain(real.plot.x,real.plot.y).height+2,real.plot.y-o.y);hit.scale.set(36,7,30);hit.userData={settlementId:real.id};chunk.group.add(hit);chunk.pick.push(hit);label(chunk,`${real.name} · ${real.ownerName}`,real.plot.x-o.x,sampleTerrain(real.plot.x,real.plot.y).height+11,real.plot.y-o.y,true);continue;}const biome=sampleTerrain(real.plot.x,real.plot.y).biome;town(chunk,batch,{id:real.id,name:real.name,alias:real.ownerName,x:real.plot.x,y:real.plot.y,biome,tier:Math.max(...Object.values(real.buildings)),kind:'village',stage:'village'},real);}
    if(Math.floor(ROYAL_WORLD_LOCATION.x/SIZE)===cx&&Math.floor(ROYAL_WORLD_LOCATION.y/SIZE)===cy){
      label(chunk,ROYAL_WORLD_LOCATION.name,ROYAL_WORLD_LOCATION.x-o.x,royalBaseY+48,ROYAL_WORLD_LOCATION.y-o.y);
      const material=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});chunk.materials.push(material);const marker=new THREE.Mesh(cube,material);marker.position.set(ROYAL_WORLD_LOCATION.x-o.x,royalBaseY+25,ROYAL_WORLD_LOCATION.y-o.y);marker.scale.set(90,50,100);marker.userData.npcId=ROYAL_WORLD_LOCATION.id;group.add(marker);chunk.pick.push(marker);
    }
    for(const landmark of WORLD_LANDMARKS){
      if(Math.floor(landmark.x/SIZE)!==cx||Math.floor(landmark.y/SIZE)!==cy)continue;
      if(landmark.kind==='village'||landmark.kind==='city'){
        if(isLivingSettlement(landmark.id)||isInhabitedSettlement(landmark.id)){label(chunk,`${landmark.name} · ${landmark.alias??''}`,landmark.x-o.x,atlasTerrainHeight(landmark.x,landmark.y,ownPatch,realPlatforms)+(landmark.kind==='city'?17:10),landmark.y-o.y);continue;}
        if(input.view.settlements.some(real=>Math.hypot(real.plot.x-landmark.x,real.plot.y-landmark.y)<55))continue;
        town(chunk,batch,{...landmark,alias:landmark.alias??'',stage:landmark.stage??'village'});
      }else{
        const sample=sampleTerrain(landmark.x,landmark.y);
        for(const part of landmarkPlacements(landmark)){
          const model=part.kind==='cave'?assets.get('cave'):createRock('stone',part.seed);
          model.scale.set(part.scaleX,part.scaleY,part.scaleZ);
          addModel(batch,model,part.x-o.x,part.kind==='cave'?sample.height:atlasTerrainHeight(part.x,part.y),part.y-o.y,1,part.rotation);
        }
        label(chunk,landmark.name,landmark.x-o.x,Math.max(sample.height,sample.water?sample.waterLevel:sample.height)+8,landmark.y-o.y);
      }
    }
    for(const place of FISHING_PLACES){if(Math.floor(place.x/SIZE)!==cx||Math.floor(place.y/SIZE)!==cy||input.view.settlements.some(real=>Math.abs(real.plot.x-place.x)<place.width/2+real.plot.width/2&&Math.abs(real.plot.y-place.y)<place.depth/2+real.plot.depth/2))continue;const h=atlasTerrainHeight(place.x,place.y,ownPatch,realPlatforms),mat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false});chunk.materials.push(mat);const hit=new THREE.Mesh(cube,mat);hit.position.set(place.x-o.x,h+7,place.y-o.y);hit.scale.set(place.width,16,place.depth);hit.userData={npcId:place.id};chunk.group.add(hit);chunk.pick.push(hit);label(chunk,`${place.name} · ${place.alias}`,place.x-o.x,h+(place.kind==='city'?18:12),place.y-o.y);}
    chunk.living=createLivingZoneChunk(cx,cy,{quality:input.quality,heightAt:renderedGroundHeightAt,playerBodies,assets,architecture:biomeAssets,visualFocus:()=>focus,occupiedByPlayer:(x:number,y:number,padding=0)=>input.view.settlements.some(real=>Math.abs(x-real.plot.x)<real.plot.width/2+padding&&Math.abs(y-real.plot.y)<real.plot.depth/2+padding)});
    chunk.living.setDetail(level);chunk.group.add(chunk.living.group);chunk.pick.push(...chunk.living.picks);
    chunk.inhabited=createInhabitedWorldChunk(cx,cy,{quality:input.quality,heightAt:renderedGroundHeightAt,playerBodies,assets:biomeAssets,worldAssets:assets,visualFocus:()=>focus,occupiedByPlayer:(x:number,y:number,padding=0)=>input.view.settlements.some(real=>Math.abs(x-real.plot.x)<real.plot.width/2+padding&&Math.abs(y-real.plot.y)<real.plot.depth/2+padding)});
    chunk.inhabited.setDetail(level);chunk.group.add(chunk.inhabited.group);chunk.pick.push(...chunk.inhabited.picks);
    const wildlifeContext={plots:input.view.settlements.map(place=>place.plot),clearAt:clearedForCommerce},worldNow=fishingSeconds()*1000,players=explorationPlayerBodies(input,worldNow);
    for(const animal of worldWildlifeChunk(cx,cy,wildlifeContext)){if(royalWorldContains(animal.x,animal.y))continue;const model=assets.get(animal.species),pose=physicalNpcPose(animal.id,worldNow,players,wildlifeContext);model.name=animal.id;if(pose){model.position.set(pose.x-o.x,chunk.surface.heightAt(pose.x,pose.y)??renderedGroundHeightAt(pose.x,pose.y),pose.y-o.y);model.rotation.y=pose.yaw;}group.add(model);chunk.animals.push({id:animal.id,group:model});}
    for(const entry of batch.values()){const mesh=new THREE.InstancedMesh(entry.geometry,entry.material,entry.matrices.length);entry.matrices.forEach((transform,i)=>mesh.setMatrixAt(i,transform));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=distance<=1;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);}return chunk;
  }
  function updateOwned(){
    const own=ownSummary(),key=own&&chunks.has(`${Math.floor(own.plot.x/SIZE)}:${Math.floor(own.plot.y/SIZE)}`)?JSON.stringify([own.id,own.buildings,habitableLandscapeShape(input.player?.habitable),input.player?.habitable?.commerce?.gateway??input.player?.habitable?.commerceGateway,input.quality,input.player?.faction]):'';
    if(key!==ownedKey){
      ownedBuild?.abort();ownedBuild=null;ownedKey=key;
      if(!key||!own){owned?.dispose();if(owned)scene.remove(owned.group);owned=null;ownedGlobal=null;preparedSettlement?.dispose();preparedSettlement=undefined;}
      else{
        const install=(next:DetailedSettlement)=>{owned?.dispose();if(owned)scene.remove(owned.group);owned=next;ownedGlobal={x:own.plot.x,y:own.plot.y};next.group.position.set(own.plot.x-origin.x,sampleTerrain(own.plot.x,own.plot.y).height-2,own.plot.y-origin.y);next.setParcelBoundaryVisible(true);scene.add(next.group);dirty=true;};
        if(preparedSettlement){const prepared=preparedSettlement;preparedSettlement=undefined;install(prepared);}
        else{const build=new AbortController();ownedBuild=build;ownedPromise=createSettlementAsync({player:input.player,quality:input.quality,showcase:false,includeLandscape:false},{signal:build.signal}).then(next=>{if(disposed||build.signal.aborted||ownedKey!==key){next.dispose();return;}install(next);}).catch(error=>{if(!disposed&&!build.signal.aborted)callbacks.onError?.(error instanceof Error?error.message:'No se pudo preparar la aldea.');}).finally(()=>{if(ownedBuild===build)ownedBuild=null;});}
      }
    }
    if(owned&&ownedGlobal)owned.group.position.set(ownedGlobal.x-origin.x,sampleTerrain(ownedGlobal.x,ownedGlobal.y).height-2,ownedGlobal.y-origin.y);
  }

  function updatePublicInfrastructure(chunk:Chunk){chunk.publicRoads?.group.removeFromParent();chunk.publicRoads?.dispose();chunk.publicRoads=createExplorationInfrastructureChunk(chunk.cx,chunk.cy,(x,y)=>chunk.surface.heightAt(x,y)??renderedGroundHeightAt(x,y),input.quality!=='performance');chunk.group.add(chunk.publicRoads.group);}
  function refineTerrain(chunk:Chunk){
    if(chunk.surface.step===2||chunks.get(`${chunk.cx}:${chunk.cy}`)!==chunk)return;
    const next=buildWorldTerrainGeometry(chunk.cx,chunk.cy,2,patch(),platforms()),land=chunk.group.getObjectByName('world-voxel-terrain')as THREE.Mesh<THREE.BufferGeometry>|undefined,water=chunk.group.getObjectByName('world-flowing-water')as THREE.Mesh<THREE.BufferGeometry>|undefined;
    if(!land){next.terrain.dispose();next.water.dispose();return;}
    const previous=land.geometry,previousWater=water?.geometry;land.geometry=next.terrain;land.castShadow=true;
    if(water)water.geometry=next.water;else if(next.water.attributes.position.count){const mesh=new THREE.Mesh(next.water,waterMaterial);mesh.name='world-flowing-water';mesh.receiveShadow=true;chunk.group.add(mesh);chunk.pick.push(mesh);}
    chunk.geometry=chunk.geometry.filter(g=>g!==previous&&g!==previousWater);chunk.geometry.push(next.terrain,next.water);chunk.surface=next.surface;previous.dispose();previousWater?.dispose();if(!royalWorldContains((chunk.cx+.5)*SIZE,(chunk.cy+.5)*SIZE,48))updatePublicInfrastructure(chunk);dirty=true;
  }
  function scheduleTerrainRefinement(){
    if(!district)return;const cx=Math.floor(focus.x/SIZE),cy=Math.floor(focus.y/SIZE),key=`${cx}:${cy}`;if(key===refinementCenter)return;refinementCenter=key;
    const near=[...chunks.values()].filter(chunk=>chunk.surface.step>2&&Math.max(Math.abs(chunk.cx-cx),Math.abs(chunk.cy-cy))<=1).sort((a,b)=>Math.hypot(a.cx-cx,a.cy-cy)-Math.hypot(b.cx-cx,b.cy-cy));
    refinements.length=0;for(const chunk of near)refinements.push(chunk);
  }
  function updateRoyalWorld(){
    const near=royalWorldVisible(focus.x,focus.y);
    if(royalLayer){royalLayer.group.visible=near;royalLayer.setOrigin(origin);royalLayer.setPlayers(input.view.settlements);royalLayer.northShop.setGranary(input.view.publicWorks?.granaryDelivered??0);royalLayer.setView(focus,input.quality==='performance',level);return;}
    if(!near||royalLoading||royalFailed)return;
    royalLoading=true;
    import('./royal-world-layer.ts').then(module=>{if(disposed)return;royalLayer=module.createRoyalWorldLayer(royalBaseY);royalLayer.setOrigin(origin);royalLayer.setPlayers(input.view.settlements);royalLayer.northShop.setGranary(input.view.publicWorks?.granaryDelivered??0);royalLayer.setView(focus,input.quality==='performance',level);royalLayer.group.visible=royalWorldVisible(focus.x,focus.y);scene.add(royalLayer.group);dirty=true;}).catch(()=>{royalFailed=true;callbacks.onError?.('No se pudo preparar Corona del Alba. Reinicia la vista para volver a intentarlo.');}).finally(()=>{royalLoading=false;});
  }
  function stream(force=false){
    updateRoyalWorld();
    scheduleTerrainRefinement();
    const view=streamView(),retained=retainedSettlementChunks(view,[LIVING_ZONE.city,LIVING_ZONE.village,...INHABITED_PLACES,...FISHING_PLACES]),retainedKeys=new Set(retained.map(p=>`${p.cx}:${p.cy}`));const key=`${view.minCx}:${view.maxCx}:${view.minCy}:${view.maxCy}:${[...retainedKeys].join(',')}`;
    if(!force&&key===streamCenter){updateOwned();return;}
    streamCenter=key;queue.length=0;pending.clear();
    for(const[id,chunk]of chunks)if(!retainedKeys.has(id)&&(chunk.cx<view.minCx||chunk.cx>view.maxCx||chunk.cy<view.minCy||chunk.cy>view.maxCy)){chunk.dispose();chunks.delete(id);}
    for(let cx=view.minCx;cx<=view.maxCx;cx++)for(let cy=view.minCy;cy<=view.maxCy;cy++){const id=`${cx}:${cy}`;if(chunks.has(id))continue;queue.push({cx,cy,distance:Math.hypot(cx-focus.x/SIZE,cy-focus.y/SIZE)});pending.add(id);}
    for(const p of retained){const id=`${p.cx}:${p.cy}`;if(chunks.has(id)||pending.has(id))continue;queue.push({...p,distance:Math.hypot(p.cx-focus.x/SIZE,p.cy-focus.y/SIZE)});pending.add(id);}
    queue.sort((a,b)=>a.distance-b.distance);
    const ownFocus=`${Math.floor(focus.x/SIZE)}:${Math.floor(focus.y/SIZE)}`;
    if(!chunks.has(ownFocus)){const index=queue.findIndex(p=>`${p.cx}:${p.cy}`===ownFocus),next=queue.splice(Math.max(0,index),1)[0];if(next){const id=`${next.cx}:${next.cy}`;pending.delete(id);chunks.set(id,makeChunk(next.cx,next.cy));}}
    updateOwned();atmosphere();
  }
  function location(){const sample=sampleTerrain(focus.x,focus.y),key=`${focus.x.toFixed(1)}:${focus.y.toFixed(1)}:${sample.biome}`;if(key!==lastLocation){lastLocation=key;callbacks.onLocation?.({x:focus.x,y:focus.y,biome:sample.biome});}const style=getBiomeStyle(sample.biome);sky.setBiome(sample.biome);waterMotion.setSkyColor(sample.biome==='ice'?0xc2dce8:sample.biome==='desert'?0xdad9c4:0xaacddd);(scene.background as THREE.Color).set(0xd8e6e8);(scene.fog as THREE.Fog).color.set(sample.biome==='ice'?0xd1e0e4:sample.biome==='desert'?0xd7cbb7:0xc1d4d5);horizonMaterial.color.set(sample.water?style.water:style.ground);horizon.position.y=royalWide()?-200:sample.water?sample.waterLevel-.3:sample.height-15;const ice=sample.biome==='ice';renderer.toneMappingExposure=ice?1.0:1.04;sun.intensity=ice?2.4:2.7;hemi.intensity=ice?.82:.9;hemi.groundColor.set(ice?0x647582:0x4a5131);atmosphere();}
  function cameraState(){callbacks.onCameraState?.({mode:cameraMode,tilt:Math.round(tilt)});}
  function clearCameraMomentum(){const wasChanging=changing;changing=true;try{flushCameraMomentum(controls);}finally{changing=wasChanging;}}
  function resetNavigation(){heldNavigationKeys.clear();analogInput={forward:0,strafe:0};lookPointer=null;district?.stopManualNavigation?.();}
  function districtReady(){return active&&!disposed&&!document.hidden&&!!district?.navigationPose&&!district.navigationPose().editing;}
  function rebaseDistrict(point:{x:number;y:number}){
    const next=districtFloatingOrigin(point,origin);if(next===origin)return;
    const dx=next.x-origin.x,dz=next.y-origin.y;camera.position.x-=dx;camera.position.z-=dz;controls.target.x-=dx;controls.target.z-=dz;origin=next;
    for(const chunk of chunks.values()){const o=chunkOrigin(chunk.cx,chunk.cy);chunk.group.position.set(o.x-origin.x,0,o.y-origin.y);}
    district?.setOrigin(origin);
  }
  function updateDistrictCamera(delta=1/60){
    const pose=district?.navigationPose?.();if(!pose||districtCameraMode==='aerial')return;
    rebaseDistrict({x:pose.foot.x,y:pose.foot.z});
    camera=perspectiveCamera;controls.object=camera;controls.enabled=false;perspectiveCamera.near=.06;perspectiveCamera.far=royalWorldVisible(pose.foot.x,pose.foot.z)?30000:180;perspectiveCamera.fov=districtCameraMode==='first-person'?68:58;perspectiveCamera.aspect=width/height;perspectiveCamera.up.set(0,1,0);perspectiveCamera.updateProjectionMatrix();
    const frame=districtCameraFrame(pose.foot,districtYaw,districtPitch,districtCameraMode),ground=district!.navigationGround??renderedGroundHeightAt,obstacles=district!.cameraObstacles?.()??[];
    const ideal=districtCameraMode==='third-person'?constrainDistrictCamera(frame.anchor,frame.eye,ground,obstacles):frame.eye;
    const destination=new THREE.Vector3(ideal.x-origin.x,ideal.y,ideal.z-origin.y),blend=input.reducedMotion||!followInitialized?1:1-Math.exp(-Math.max(.001,delta)*12);
    camera.position.lerp(destination,blend);
    const cleared=constrainDistrictCamera(frame.anchor,{x:camera.position.x+origin.x,y:camera.position.y,z:camera.position.z+origin.y},ground,obstacles);
    camera.position.set(cleared.x-origin.x,cleared.y,cleared.z-origin.y);camera.lookAt(frame.target.x-origin.x,frame.target.y,frame.target.z-origin.y);camera.updateMatrixWorld();followInitialized=true;
    focus={x:pose.foot.x,y:pose.foot.z};controls.target.set(frame.target.x-origin.x,frame.target.y,frame.target.z-origin.y);
    sun.position.set(pose.foot.x-origin.x-75,pose.foot.y+130,pose.foot.z-origin.y+80);sun.target.position.set(pose.foot.x-origin.x,pose.foot.y,pose.foot.z-origin.y);sun.target.updateMatrixWorld();location();stream();dirty=true;
  }
  function applyProjection(mix=projectionMix){
    if(district&&districtCameraMode!=='aerial'){updateDistrictCamera();return;}
    projectionMix=mix;if(royalWide())controls.target.y=atlasTerrainHeight(focus.x,focus.y,patch(),platforms())+1+royalLookHeight();const vertical=viewHalfHeight(),aspect=width/height,topDown=mix<=0;
    camera=topDown?orthoCamera:perspectiveCamera;controls.object=camera;
    const elevation=THREE.MathUtils.lerp(89.999,tilt,mix)*Math.PI/180;
    if(topDown){orthoCamera.left=-vertical*aspect;orthoCamera.right=vertical*aspect;orthoCamera.top=vertical;orthoCamera.bottom=-vertical;orthoCamera.up.set(-Math.sin(heading),0,-Math.cos(heading));}
    else{perspectiveCamera.aspect=aspect;perspectiveCamera.near=royalWide()?Math.max(.3,vertical/100):.3;perspectiveCamera.far=60000;perspectiveCamera.fov=THREE.MathUtils.lerp(2,42,mix);perspectiveCamera.up.set(0,1,0);}
    const distance=topDown?Math.max(500,vertical*3):vertical/Math.tan(perspectiveCamera.fov*Math.PI/360);
    camera.position.set(controls.target.x+Math.sin(heading)*Math.cos(elevation)*distance,controls.target.y+Math.sin(elevation)*distance,controls.target.z+Math.cos(heading)*Math.cos(elevation)*distance);
    if(topDown){orthoCamera.far=60000;orthoCamera.near=.3;}
    camera.lookAt(controls.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    controls.enabled=!transition;controls.enableRotate=cameraMode==='3d';controls.screenSpacePanning=topDown;
    controls.minPolarAngle=topDown?0:Math.PI/12;controls.maxPolarAngle=topDown?Math.PI/2:Math.PI/3;
    atmosphere();dirty=true;
  }
  function finishTransition(){if(!transition)return;transition=null;changing=true;applyProjection(cameraMode==='2d'?0:1);controls.update();changing=false;stream(true);}
  function syncCamera(){
    if(disposed||changing||transition||district&&districtCameraMode!=='aerial')return;changing=true;
    const clamped=clampWorldPoint(origin.x+controls.target.x,origin.y+controls.target.z),ground=sampleTerrain(clamped.x,clamped.y),terrainHeight=atlasTerrainHeight(clamped.x,clamped.y,patch(),platforms()),desired=ground.water?Math.max(ground.waterLevel,terrainHeight):terrainHeight;
    const delta=new THREE.Vector3(clamped.x-origin.x-controls.target.x,desired+1+royalLookHeight()-controls.target.y,clamped.y-origin.y-controls.target.z);controls.target.add(delta);camera.position.add(delta);focus=clamped;
    if(cameraMode==='3d'){const offset=camera.position.clone().sub(controls.target),nextHeading=Math.atan2(offset.x,offset.z),nextTilt=cameraTilt(Math.asin(Math.max(-1,Math.min(1,offset.y/offset.length())))*180/Math.PI);heading=nextHeading;if(Math.abs(nextTilt-tilt)>.5){tilt=nextTilt;cameraState();}}
    rebaseDistrict(focus);
    const lightScale=royalWide()?Math.max(1,viewHalfHeight()/95):1;sun.shadow.camera.far=420*lightScale;sun.shadow.camera.left=-95*lightScale;sun.shadow.camera.right=95*lightScale;sun.shadow.camera.top=95*lightScale;sun.shadow.camera.bottom=-95*lightScale;sun.shadow.camera.updateProjectionMatrix();sun.position.set(controls.target.x-75*lightScale,controls.target.y+130*lightScale,controls.target.z+80*lightScale);sun.target.position.copy(controls.target);sun.target.updateMatrixWorld();location();stream();dirty=true;changing=false;
  }
  function resize(){if(disposed)return;const rect=container.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);const resolution=resolutionFor(width,height,window.devicePixelRatio||1,input.quality);renderer.setPixelRatio(resolution.ratio);renderer.setSize(width,height,false);changing=true;applyProjection();if(!transition&&districtCameraMode==='aerial')controls.update();changing=false;stream();for(const chunk of chunks.values()){chunk.living?.setDetail(level);chunk.inhabited?.setDetail(level);}dirty=true;}
  const sound=gameAudio.scene(2);let audioAt=0;const audioPorts=new Map(FISHING_COMMUNITIES.map(c=>[c.id,getFishingCommunityData(c.id)]));
  function updateSound(now:number){
    if(now-audioAt<100||!gameAudio.getSnapshot().ready)return;audioAt=now;
    const pose=district?.navigationPose?.(),walking=!!pose&&districtCameraMode!=='aerial',listener=walking?{x:pose.foot.x,y:pose.foot.y+1.4,z:pose.foot.z}:{x:camera.position.x+origin.x,y:camera.position.y,z:camera.position.z+origin.y},sample=sampleTerrain(listener.x,listener.z),at=serverNow+now-clockAnchor,emitters=[];
    for(const actor of input.view.habitable?.actors??[]){if(Math.hypot(actor.plot.x-listener.x,actor.plot.y-listener.z)<65)emitters.push(...villageSounds(actor.state,at,actor.plot,(x,z)=>renderedGroundHeightAt(actor.plot.x+x,actor.plot.y+z)));}
    for(const port of FISHING_COMMUNITIES)if(Math.hypot(port.dock.x-listener.x,port.dock.y-listener.z)<180)emitters.push(...fishingSounds(audioPorts.get(port.id)!.snapshot(fishingSeconds(now)),renderedGroundHeightAt));
    const home=input.player?.settlement;if(home&&Math.hypot(home.x-listener.x,home.y-listener.z)<60)emitters.push(...tutorialSounds(input.view.habitable?.job.step,home,(x,z)=>renderedGroundHeightAt(home.x+x,home.y+z)));
    const rx=listener.x-ROYAL_WORLD_LOCATION.x,rz=listener.z-ROYAL_WORLD_LOCATION.y-ROYAL_PORT_OFFSET,inside=walking&&!!humanInteriorLocation(rx,listener.y-royalBaseY-1.4,rz);
    sound.update({listener,yaw:walking?districtYaw:heading+Math.PI,aerial:!walking,inside,biome:sample.biome,water:sample.water||sample.river?.8:sample.biome==='coast'?.25:0,label:inside?'Interior del castillo':walking?'Recorriendo la frontera':'Territorios de la frontera',foot:pose?{...pose.foot,mode:pose.transport,surface:inside?'carpet':sample.biome==='ice'?'snow':sample.road?'stone':'grass'}:undefined,emitters});
  }
  function animate(now:number){if(disposed)return;const interval=input.quality==='performance'?1000/30:1000/60;if(now-lastFrame<interval)return;const delta=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(royalLayer?.group.visible){syncRoyalHarbor(now);royalLayer.setOrigin(origin);royalLayer.animate(visualSeconds(),input.reducedMotion);}const physicsNow=serverNow+now-clockAnchor,physicsPlayers=playerBodies(physicsNow),physicsContext={plots:input.view.settlements.map(place=>place.plot),clearAt:clearedForCommerce};if(!input.reducedMotion)time+=delta;if(transition){const progress=Math.min(1,(now-transition.start)/650),smooth=progress*progress*(3-2*progress);changing=true;applyProjection(THREE.MathUtils.lerp(transition.from,transition.to,smooth));changing=false;if(progress===1)finishTransition();}else if(districtCameraMode==='aerial')controls.update();if(district){const pose=district.navigationPose?.();if(pose?.editing){resetNavigation();if(districtCameraMode!=='aerial')controller.setDistrictCameraMode('aerial');}if(districtReady())district.navigate?.(districtHeldInput(heldNavigationKeys,analogInput),districtCameraMode==='aerial'?-heading:districtYaw,now);district.setOrigin(origin);const target=district.animate(serverNow+now-clockAnchor,input.reducedMotion);if(districtCameraMode==='aerial'&&target&&Math.hypot(target.x-focus.x,target.y-focus.y)>.0001){const dx=target.x-focus.x,dz=target.y-focus.y;controls.target.x+=dx;controls.target.z+=dz;camera.position.x+=dx;camera.position.z+=dz;syncCamera();district.setOrigin(origin);dirty=true;}if(districtCameraMode!=='aerial')updateDistrictCamera(delta);}updateSound(now);const fishingTime=fishingSeconds(now);fishing.setView(origin,focus,level,input.quality);fishing.animate(fishingTime,input.reducedMotion);if(followingActivity){const target=fishing.position(followingActivity);if(target){trackingMove=true;try{controller.setFocus(target.x,target.y);}finally{trackingMove=false;}}}fishing.setView(origin,focus,level,input.quality);fishingState();if(refinements.length){refineTerrain(refinements.shift()!);}else if(queue.length){const next=queue.shift()!,id=`${next.cx}:${next.cy}`;pending.delete(id);chunks.set(id,makeChunk(next.cx,next.cy));updateOwned();dirty=true;}updateHabitableBuildings(serverNow+now-clockAnchor);updateStationUpgrades(serverNow+now-clockAnchor);updateCommerce(serverNow+now-clockAnchor);traffic.update(input,physicsNow,focus,origin,`${streamCenter}:${chunks.size}:${refinements.length}`);if(input.reducedMotion&&now-lastAuthoritativeRender>=250){const at=serverNow+now-clockAnchor,active=!!district||level>=6||habitableCommerceActive(tradeCaravans(),at)||input.view.habitable?.actors.some(a=>landDevelopmentActive(a.state,at)||a.state.buildings.some(b=>b.endsAt>at||(b.upgrade?.endsAt??0)>at)||a.state.workers?.some(w=>w.workEndsAt>at||(w.shipment?.endsAt??0)>at||(w.supply?.unloadsAt??0)>at||(w.relocation?.endsAt??0)>at||(w.daily?.endsAt??0)>at||(w.crew?.endsAt??0)>at))||input.view.settlements.some(p=>p.playerId===input.player?.id&&p.construction?.some(c=>c.endsAt>at));if(active||hadAuthoritativeActivity)dirty=true;hadAuthoritativeActivity=!!active;lastAuthoritativeRender=now;}if(!input.reducedMotion||dirty){waterTexture.offset.set(time*.004,-time*.007);waterMotion.update(visualSeconds(),origin);owned?.animate(time,false);for(const chunk of chunks.values()){chunk.living?.animate(physicsNow/1000,input.reducedMotion);chunk.inhabited?.animate(physicsNow/1000,input.reducedMotion);for(const rotor of chunk.rotors)rotor.object.rotation.z=time*.42+rotor.phase;const o=chunkOrigin(chunk.cx,chunk.cy);for(const animal of chunk.animals){const pose=physicalNpcPose(animal.id,physicsNow,physicsPlayers,physicsContext);animal.group.visible=!!pose;if(!pose)continue;animal.group.position.set(pose.x-o.x,renderedGroundHeightAt(pose.x,pose.y)+(input.reducedMotion||!pose.walking?0:Math.abs(Math.sin(physicsNow/1000*3))*.035),pose.y-o.y);animal.group.rotation.y=pose.yaw;}}animateClouds();sky.update(camera,skySun.subVectors(sun.position,sun.target.position),visualSeconds());waterMotion.setSunDirection(skySun);renderer.render(scene,camera);dirty=false;statsFrames++;}if(now-lastStats>=1000){const size=renderer.getDrawingBufferSize(new THREE.Vector2());callbacks.onStats?.({width:size.x,height:size.y,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:Math.round(statsFrames*1000/(now-lastStats))});lastStats=now;statsFrames=0;}}
  function down(event:PointerEvent){if(district)renderer.domElement.focus({preventScroll:true});stopFollowing();finishTransition();if(district&&districtCameraMode!=='aerial'){startPointer=null;if(!districtReady())return;if(event.button===0||event.button===2){lookPointer={id:event.pointerId,x:event.clientX,y:event.clientY,looking:false};renderer.domElement.setPointerCapture?.(event.pointerId);event.preventDefault();}return;}startPointer=event.button===0?{x:event.clientX,y:event.clientY}:null;}
  function up(event:PointerEvent){if(district&&districtCameraMode!=='aerial'){const tap=lookPointer?.id===event.pointerId&&!lookPointer.looking&&event.button===0;lookPointer=null;if(renderer.domElement.hasPointerCapture?.(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);if(tap)controller.interactDistrict();return;}if(!startPointer||Math.hypot(startPointer.x-event.clientX,startPointer.y-event.clientY)>6){startPointer=null;return;}startPointer=null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);if(district){const interactive=raycaster.intersectObjects(district.pickables(),true)[0]??null,grounds=[...chunks.values()].flatMap(chunk=>chunk.pick.filter(object=>!object.userData.npcId&&!object.userData.settlementId));if(owned)grounds.push(owned.group);const surface=raycaster.intersectObjects(grounds,true)[0];district.pointer(interactive,surface?{x:surface.point.x+origin.x,y:surface.point.z+origin.y}:null);dirty=true;return;}const objects=[...chunks.values()].flatMap(chunk=>chunk.pick),hits=[...raycaster.intersectObjects(objects,false),...raycaster.intersectObjects(fishing.pickables(),true)].sort((a,b)=>a.distance-b.distance),hit=hits[0];if(hit?.object.userData.fishingActivityId){controller.focusActivity(hit.object.userData.fishingActivityId);return;}if(hit?.object.userData.settlementId){callbacks.onSelectSettlement?.(hit.object.userData.settlementId);return;}if(hit?.object.userData.npcId){callbacks.onSelectNpc?.(hit.object.userData.npcId);return;}if(hit)controller.setFocus(hit.point.x+origin.x,hit.point.z+origin.y);}
  function lost(event:Event){event.preventDefault();callbacks.onError?.('La tarjeta gráfica interrumpió el paisaje. Recarga la vista para continuar.');controller.dispose();}
  function changed(){syncCamera();}
  function key(event:KeyboardEvent){if(!districtReady()||isDistrictEditableTarget(event.target)||event.ctrlKey||event.metaKey||event.altKey)return;const value=event.key.toLowerCase();if(districtKeyDirection(value)){event.preventDefault();heldNavigationKeys.add(value);dirty=true;}else if(value==='e'&&!event.repeat){event.preventDefault();controller.interactDistrict();}else if(value==='escape')resetNavigation();}
  function keyUp(event:KeyboardEvent){heldNavigationKeys.delete(event.key.toLowerCase());}
  function cancelPointer(){lookPointer=null;startPointer=null;analogInput={forward:0,strafe:0};}
  function visibilityChanged(){if(document.hidden)resetNavigation();}
  function contextMenu(event:MouseEvent){if(district&&districtCameraMode!=='aerial')event.preventDefault();}
  const hoverPlane=new THREE.Plane(new THREE.Vector3(0,1,0)),hoverPoint=new THREE.Vector3();
  function move(event:PointerEvent){if(district&&districtCameraMode!=='aerial'){if(lookPointer?.id===event.pointerId&&districtReady()){const dx=event.clientX-lookPointer.x,dy=event.clientY-lookPointer.y;lookPointer.looking ||=Math.hypot(dx,dy)>1;lookPointer.x=event.clientX;lookPointer.y=event.clientY;controller.lookDistrict(dx*.003,dy*.003);}return;}if(!district?.hover)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);hoverPlane.constant=1-controls.target.y;if(raycaster.ray.intersectPlane(hoverPlane,hoverPoint)){district.hover({x:hoverPoint.x+origin.x,y:hoverPoint.z+origin.y});dirty=true;}}
  const observer=new ResizeObserver(resize);observer.observe(container);controls.addEventListener('change',changed);renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('keydown',key);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointercancel',cancelPointer);renderer.domElement.addEventListener('lostpointercapture',cancelPointer);renderer.domElement.addEventListener('blur',resetNavigation);renderer.domElement.addEventListener('contextmenu',contextMenu);window.addEventListener('keyup',keyUp);window.addEventListener('blur',resetNavigation);document.addEventListener('visibilitychange',visibilityChanged);
  function keyFor(next:SceneInput){return JSON.stringify([next.quality,next.player?.id,next.player?.faction,habitableLandscapeShape(next.player?.habitable),next.player?.habitable?.commerce?.gateway??next.player?.habitable?.commerceGateway,next.view.habitable?.actors.map(a=>[a.playerId,a.state.commerceGateway,landDevelopmentKey(a.state)]),habitableCommerceRouteKey(next.view.habitable?.commerce?.caravans??[]),next.view.settlements.map(value=>[value.id,value.name,value.ownerName,value.plot,value.faction,value.buildings])]);}
  const controller:WorldTerrainController={
    setActive(value){sound.setActive(value);if(disposed||active===value)return;active=value;if(!value)resetNavigation();if(!value&&ownedBuild){ownedBuild.abort();ownedBuild=null;ownedKey='';}if(value){dirty=true;lastFrame=0;lastStats=performance.now();statsFrames=0;updateOwned();}animation?.setActive(value);},
    attachDistrict(next){if(district===next)return;resetNavigation();districtCameraMode='aerial';followInitialized=false;district?.dispose();district=next;district?.setNavigationMode?.('aerial');callbacks.onDistrictCameraState?.({mode:'aerial'});renderer.domElement.setAttribute('aria-label',next?'Distrito habitable de QFrontier. Pulsa el suelo para caminar o usa WASD y las flechas.':'Terreno continuo de QFrontier. Arrastra para recorrer el mundo y pulsa una aldea para visitarla.');for(const chunk of chunks.values())chunk.group.traverse(object=>{if(object.userData.worldMapLabel)object.visible=!next;});controls.enablePan=!next;if(next){stopFollowing();scene.add(next.group);next.setOrigin(origin);level=10;tilt=58;resize();const target=next.animate(serverNow+performance.now()-clockAnchor,input.reducedMotion);if(target)controller.setFocus(target.x,target.y);next.setOrigin(origin);}dirty=true;},
    update(next){if(disposed)return;const key=keyFor(next),changed=key!==signature,quality=next.quality!==input.quality;if(next.view.now!==serverNow){serverNow=next.view.now;clockAnchor=performance.now();}input=next;physicalWorldContext=createExplorationWorldContext(input);controls.enableDamping=!next.reducedMotion;if(next.reducedMotion)finishTransition();if(changed){signature=key;fishing.dispose();fishing=makeFishing();fishing.follow(followingActivity);fishing.setView(origin,focus,level,input.quality);fishing.animate(fishingSeconds(),input.reducedMotion);for(const chunk of chunks.values())chunk.dispose();chunks.clear();refinements.length=0;refinementCenter='';streamCenter='';if(quality){renderer.shadowMap.enabled=next.quality!=='performance';const size=next.quality==='4k'?4096:2048;sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}stream(true);}resize();dirty=true;},
    setFocus(x,y){if(disposed||!Number.isFinite(x)||!Number.isFinite(y))return;if(!trackingMove)stopFollowing();clearCameraMomentum();const point=clampWorldPoint(x,y);if(Math.hypot(point.x-focus.x,point.y-focus.y)<.001){location();return;}const offset=camera.position.clone().sub(controls.target);focus=point;const next={x:Math.floor(point.x/SIZE)*SIZE,y:Math.floor(point.y/SIZE)*SIZE};origin=next;controls.target.set(point.x-origin.x,Math.max(atlasTerrainHeight(point.x,point.y,patch()),sampleTerrain(point.x,point.y).water?sampleTerrain(point.x,point.y).waterLevel:-Infinity)+1,point.y-origin.y);camera.position.copy(controls.target).add(offset);for(const chunk of chunks.values()){const o=chunkOrigin(chunk.cx,chunk.cy);chunk.group.position.set(o.x-origin.x,0,o.y-origin.y);}changing=true;applyProjection();controls.update();changing=false;syncCamera();stream(true);dirty=true;},
    getFocus(){return{...focus};},
    groundHeightAt(x,y){return renderedGroundHeightAt(x,y);},
    focusActivity(id){if(disposed)return;clearCameraMomentum();followingActivity=id;fishing.animate(fishingSeconds(),input.reducedMotion);fishing.follow(id);const target=id?fishing.position(id):null;if(target){trackingMove=true;try{controller.setFocus(target.x,target.y);}finally{trackingMove=false;}}fishingState(true);dirty=true;},
    getFishingState(){fishing.animate(fishingSeconds(),input.reducedMotion);return fishing.getState();},
    setZoomLevel(value){if(disposed||!Number.isFinite(value))return;const next=Math.max(5.6,Math.min(10,value));if(Math.abs(next-level)<.0001)return;level=next;resize();dirty=true;},
    rotate(side){finishTransition();heading+=Math.sign(side)*Math.PI/4;changing=true;applyProjection();controls.update();changing=false;stream(true);dirty=true;},
    setCameraMode(mode){if(districtCameraMode!=='aerial')controller.setDistrictCameraMode('aerial');if(disposed||(mode!=='2d'&&mode!=='3d')||mode===cameraMode)return;clearCameraMomentum();cameraMode=mode;transition=input.reducedMotion?null:{start:performance.now(),from:projectionMix,to:mode==='2d'?0:1};if(!transition){changing=true;applyProjection(mode==='2d'?0:1);controls.update();changing=false;}cameraState();stream(true);dirty=true;},
    getCameraMode(){return cameraMode;},
    setDistrictCameraMode(mode){
      if(disposed||!district||!['aerial','first-person','third-person'].includes(mode))return;
      if(district.navigationPose?.().editing)mode='aerial';
      if(mode===districtCameraMode)return;resetNavigation();clearCameraMomentum();transition=null;
      const previous=districtCameraMode;districtCameraMode=mode;district.setNavigationMode?.(mode);followInitialized=previous!=='aerial';
      if(mode==='aerial'){const pose=district.navigationPose?.();if(pose){focus={x:pose.foot.x,y:pose.foot.z};controls.target.set(focus.x-origin.x,pose.foot.y+1,focus.y-origin.y);}controls.enabled=true;controls.enablePan=false;applyProjection(cameraMode==='2d'?0:1);controls.update();}
      else{if(previous==='aerial'){const pose=district.navigationPose?.();districtYaw=pose?-pose.heading+Math.PI:0;districtPitch=mode==='first-person'?.04:.13;}updateDistrictCamera();}
      callbacks.onDistrictCameraState?.({mode});stream(true);dirty=true;
    },
    getDistrictCameraMode(){return districtCameraMode;},
    stopDistrictNavigation(){resetNavigation();dirty=true;},
    setNavigationInput(value){analogInput=districtReady()?normalizeDistrictInput(value):{forward:0,strafe:0};dirty=true;},
    lookDistrict(dx,dy){if(!districtReady()||districtCameraMode==='aerial')return;const next=districtLook(districtYaw,districtPitch,dx,dy);districtYaw=next.yaw;districtPitch=next.pitch;updateDistrictCamera();dirty=true;},
    interactDistrict(){if(districtReady())district?.interact?.();},
    recenterDistrict(){if(!district)return;resetNavigation();const pose=district.navigationPose?.();if(districtCameraMode==='aerial'){level=10;tilt=58;if(pose)controller.setFocus(pose.foot.x,pose.foot.z);resize();}else{districtYaw=pose?-pose.heading+Math.PI:0;districtPitch=districtCameraMode==='first-person'?.04:.13;followInitialized=false;updateDistrictCamera();}dirty=true;},
    setTilt(degrees){if(disposed||!Number.isFinite(degrees))return;clearCameraMomentum();tilt=cameraTilt(degrees);if(cameraMode==='3d'){finishTransition();changing=true;applyProjection(1);controls.update();changing=false;stream(true);}cameraState();dirty=true;},
    async capture(w=3840,h=2160){
      if(disposed)throw new Error('El paisaje no está disponible.');finishTransition();
      const cw=Math.max(320,Math.min(3840,Math.round(w))),ch=Math.max(180,Math.min(3840,Math.round(h))),target=new THREE.WebGLRenderTarget(cw,ch);target.texture.colorSpace=THREE.SRGBColorSpace;
      const previous=renderer.getRenderTarget(),captureCamera=camera.clone(),vertical=viewHalfHeight();
      try{
        captureAspect=cw/ch;stream(true);
        while(queue.length){const next=queue.shift()!,id=`${next.cx}:${next.cy}`;pending.delete(id);chunks.set(id,makeChunk(next.cx,next.cy));}
        updateOwned();while(ownedPromise){const pending=ownedPromise;await pending;if(disposed)throw new Error('El paisaje no está disponible.');if(ownedPromise===pending)break;}if(disposed)throw new Error('El paisaje no está disponible.');updateHabitableBuildings(serverNow+performance.now()-clockAnchor);updateStationUpgrades(serverNow+performance.now()-clockAnchor);updateCommerce(serverNow+performance.now()-clockAnchor);traffic.update(input,serverNow+performance.now()-clockAnchor,focus,origin,`${streamCenter}:${chunks.size}:${refinements.length}`);fishing.setView(origin,focus,level,input.quality);fishing.animate(fishingSeconds(),input.reducedMotion);waterMotion.update(visualSeconds(),origin);
        for(const chunk of chunks.values()){chunk.living?.animate(fishingSeconds(),input.reducedMotion);chunk.inhabited?.animate(fishingSeconds(),input.reducedMotion);for(const rotor of chunk.rotors)rotor.object.rotation.z=time*.42+rotor.phase;}
        if(captureCamera instanceof THREE.OrthographicCamera){captureCamera.left=-vertical*cw/ch;captureCamera.right=vertical*cw/ch;}else captureCamera.aspect=cw/ch;
        captureCamera.updateProjectionMatrix();captureCamera.updateMatrixWorld();renderer.setRenderTarget(target);sky.update(captureCamera,skySun.subVectors(sun.position,sun.target.position),visualSeconds());waterMotion.setSunDirection(skySun);renderer.render(scene,captureCamera);
        const pixels=new Uint8Array(cw*ch*4);renderer.readRenderTargetPixels(target,0,0,cw,ch,pixels);const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo preparar la captura.');const image=context.createImageData(cw,ch);for(let y=0;y<ch;y++)image.data.set(pixels.subarray((ch-y-1)*cw*4,(ch-y)*cw*4),y*cw*4);context.putImageData(image,0,0);
        return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo guardar la captura.')),'image/png'));
      }finally{renderer.setRenderTarget(previous);target.dispose();captureAspect=null;if(!disposed)stream(true);dirty=true;}
    },
    dispose(){if(disposed)return;disposed=true;harborRead?.abort();sound.dispose();royalLayer?.dispose();royalLayer=null;ownedBuild?.abort();preparedSettlement?.dispose();animation?.dispose();observer.disconnect();controls.removeEventListener('change',changed);controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('keydown',key);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointercancel',cancelPointer);renderer.domElement.removeEventListener('lostpointercapture',cancelPointer);renderer.domElement.removeEventListener('blur',resetNavigation);renderer.domElement.removeEventListener('contextmenu',contextMenu);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',resetNavigation);document.removeEventListener('visibilitychange',visibilityChanged);resetNavigation();district?.dispose();district=null;habitableWorldBuildings.forEach(layer=>layer.dispose());habitableWorldBuildings.clear();stationUpgradeLayers.forEach(layer=>layer.dispose());stationUpgradeLayers.clear();for(const chunk of chunks.values())chunk.dispose();chunks.clear();queue.length=0;refinements.length=0;owned?.dispose();commerce.dispose();traffic.dispose();fishing.dispose();biomeAssets.dispose();assets.dispose();sky.dispose();cube.dispose();terrainMaterial.dispose();waterMaterial.dispose();waterTexture.dispose();pixelTexture.dispose();horizonGeometry.dispose();horizonMaterial.dispose();clouds.dispose();cloudGeometry.dispose();cloudMaterial.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
  try{signature=keyFor(input);const own=ownSummary(),preferred=initialFocus??(own?{x:own.plot.x,y:own.plot.y}:{x:0,y:0}),point=clampWorldPoint(preferred.x,preferred.y);origin={x:Math.floor(point.x/SIZE)*SIZE,y:Math.floor(point.y/SIZE)*SIZE};focus=point;controls.target.set(point.x-origin.x,Math.max(atlasTerrainHeight(point.x,point.y,patch()),sampleTerrain(point.x,point.y).water?sampleTerrain(point.x,point.y).waterLevel:-Infinity)+1,point.y-origin.y);changing=true;applyProjection(1);controls.update();changing=false;resize();syncCamera();cameraState();fishing.setView(origin,focus,level,input.quality);fishing.animate(fishingSeconds(),input.reducedMotion);fishingState(true);animation=createViewerFrameLoop(animate);animation.setActive(active);return controller;}catch(error){controller.dispose();throw error;}
}
