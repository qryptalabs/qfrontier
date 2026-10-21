import {gameAudio} from '../audio/engine.ts';
import {villageSounds,tutorialSounds} from '../audio/world-sounds.ts';
import {landDevelopmentActive} from './land-development.ts';
import * as THREE from 'three';
import {habitableLandscapeShape,stationLandscapeSignature} from './scene-structure.ts';
import {createViewerFrameLoop} from './viewer-lifecycle.ts';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBuilding, createItem, createRock, createTree, createUnit } from './models.ts';
import { createSettlement,createSettlementAsync, type DetailedSettlement } from './settlement.ts';
import type {GraphicsBuildOptions} from './graphics-build.ts';
import { createHabitableBuildingLayer } from './habitable-buildings.ts';
import { createHabitableUpgradeLayer } from './habitable-construction.ts';
import { createHabitableCommerceLayer, createHabitableTradeClearance, habitableCommerceActive, habitableCommerceRouteKey } from './habitable-commerce.ts';
import { continuousGroundHeight, LANDSCAPE_BOUNDS } from './continuous-layout.ts';
import { tradeGroundHeight } from './trade-routes.ts';
import { sampleWorld } from './world-geography.ts';
import { createCinematicPipeline } from './cinematic.ts';
import { activeWeather, BUILDING_ORDER, jobProgress, projectTiles, resolutionFor, routePoint, stableSeed, TILE_SIZE } from './scene-data.ts';
import { atlasWorldBounds, globalToAtlas, settlementFootprint, settlementSceneSignature, settlementTile } from './atlas-data.ts';
import { atlasCameraLimits, clampTarget, PARCEL_CAMERA_BOUNDS, parcelCameraLimits } from './camera-bounds.ts';
import { WORLD_SECTOR_SPAN } from '../mvp/settlements.ts';
import { NPC_SETTLEMENTS } from './planet-data.ts';
import type { RenderStats, SceneInput, TileVisual } from './scene-data.ts';
import type { Job } from '../mvp/types.ts';

export type { SceneInput, RenderStats } from './scene-data.ts';
export interface FrontierController {
 setActive(active:boolean):void;update(input:SceneInput):void;zoom(delta:number):void;rotate(direction:number):void;reset():void;focusSelected():void;
 focusSettlement(id:string):void;centerCoordinate(x:number,y:number):void;
 capture(width?:number,height?:number):Promise<Blob>;dispose():void;
}
type Callbacks={onSelect?:(id:string)=>void;onSelectSettlement?:(id:string)=>void;onSelectNpc?:(id:string)=>void;onStats?:(stats:RenderStats)=>void;onError?:(message:string)=>void};
type Batch={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[];colors?:THREE.Color[];tileIds?:string[];shadow:boolean};
type Walker={object:THREE.Group;job:Job|null;phase:number;home:THREE.Vector3;routeOffset:THREE.Vector3;battleSide?:'attacker'|'npc'};
type Bird={object:THREE.Group;left:THREE.Group;right:THREE.Group;phase:number};
const LAND:Record<string,number>={forest:0x547a47,plains:0x8eaa5d,desert:0xd3ae72,mountain:0x89908b,swamp:0x536e60};
const SURFACE:Record<string,number>={forest:0x769954,plains:0xa0b872,desert:0xe3c48d,mountain:0xa7aaa0,swamp:0x668573};
const SKY=0x142b37;
const UP=new THREE.Vector3(0,1,0);
// Regional miniatures share the public settlement LOD scale. Detailed village
// residents keep their independent 1.3 scale and full-size animation offsets.
export const REGIONAL_UNIT_SCALE=.065;
const REGIONAL_OFFSET_SCALE=REGIONAL_UNIT_SCALE/.87;

/** A real, local WebGL scene. Economy and action authority remain in the MVP server. */
export async function createFrontierRendererAsync(container:HTMLElement,initial:SceneInput,callbacks:Callbacks={},options:GraphicsBuildOptions={}):Promise<FrontierController>{
 const detailed=initial.mode==='settlement'||initial.mode==='station'||initial.mode==='showcase',plot=initial.player?.settlement,clearRoad=createHabitableTradeClearance((initial.view.habitable?.commerce?.caravans??[]).filter(c=>c.playerId===initial.player?.id));
 const prepared=detailed?await createSettlementAsync({player:initial.player,quality:initial.quality,showcase:initial.mode==='showcase',proceduralClearance:plot?(x,y,padding)=>clearRoad(plot.x+x,plot.y+y,padding):undefined},options):undefined;
 if(options.signal?.aborted){prepared?.dispose();throw new DOMException('Vista cancelada.','AbortError');}
 try{return createFrontierRenderer(container,initial,callbacks,prepared);}catch(error){prepared?.dispose();throw error;}
}
export function createFrontierRenderer(container:HTMLElement,initial:SceneInput,callbacks:Callbacks={},preparedSettlement?:DetailedSettlement):FrontierController {
 const sound=gameAudio.scene(1);let audioAt=0;
 let animation:ReturnType<typeof createViewerFrameLoop>|null=null,active=true;
 let input=initial,disposed=false,contextLost=false,lastFrame=0,lastStats=0,statsFrames=0,lastAuthoritativeRender=0,hadAuthoritativeActivity=false;
 let anchoredAt=performance.now(),serverTime=initial.view.now,structuralKey='',tiles:TileVisual[]=[],stage=new THREE.Group();
 let selectedMarker=new THREE.Group(),playerBeacon=new THREE.Group(),walkers:Walker[]=[],clouds:THREE.Group[]=[],smoke:THREE.Mesh[]=[],rain:THREE.Points|null=null;
 let rainData:Float32Array|null=null,waterMeshes:THREE.Mesh[]=[],pointerOrigin:{x:number;y:number}|null=null;
 let settlement:DetailedSettlement|null=null,birds:Bird[]=[],fitWidth=0;
 let habitableBuildings:ReturnType<typeof createHabitableBuildingLayer>|null=null;
 let stationUpgrades:ReturnType<typeof createHabitableUpgradeLayer>|null=null;
 let commerce:ReturnType<typeof createHabitableCommerceLayer>|null=null;
 let forgeLight:THREE.PointLight|null=null,forgeGlow:THREE.Sprite|null=null;
 let forgeGlowMaterial:THREE.SpriteMaterial|null=null;
 let extent=17,width=1,height=1,currentMode=initial.mode,needsRender=true;
 const detailed=()=>input.mode==='settlement'||input.mode==='station'||input.mode==='showcase';
 const scene=new THREE.Scene();scene.background=new THREE.Color(SKY);scene.fog=new THREE.FogExp2(SKY,.012);
 const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,.1,180);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
 renderer.info.autoReset=false;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.14;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
 renderer.domElement.setAttribute('aria-label','Mundo tridimensional de QFrontier. Arrastra para girar; usa la rueda para acercar.');
 renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none;outline:none';
 renderer.domElement.tabIndex=0;container.appendChild(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=!input.reducedMotion;controls.dampingFactor=.09;controls.enablePan=true;controls.screenSpacePanning=true;
 controls.minPolarAngle=.35;controls.maxPolarAngle=1.18;controls.minZoom=.4;controls.maxZoom=3.3;
 controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
 controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
 const ambient=new THREE.HemisphereLight(0xc1d6dc,0x38412d,.85);scene.add(ambient);
 const sun=new THREE.DirectionalLight(0xffdfad,4.35);sun.position.set(-24,32,21);sun.castShadow=true;
 Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:95});sun.shadow.bias=-.00016;sun.shadow.normalBias=.024;sun.shadow.radius=2;scene.add(sun);
 const rim=new THREE.DirectionalLight(0xa3c4bc,.48);rim.position.set(18,10,-20);scene.add(rim);
 let cinematic:ReturnType<typeof createCinematicPipeline>|null=null;
 function renderScene(target:THREE.WebGLRenderTarget|null=null){
  renderer.info.reset();
  if(target||detailed()&&input.quality!=='performance'){
   cinematic??=createCinematicPipeline(renderer,scene,camera);
   const size=target?new THREE.Vector2(target.width,target.height):renderer.getDrawingBufferSize(new THREE.Vector2());
   cinematic.render(size.x,size.y,target,detailed()&&input.quality!=='performance');
  }else{renderer.setRenderTarget(target);renderer.render(scene,camera);}
 }
 const geometries=new Map<string,THREE.BufferGeometry>(),materials=new Map<string,THREE.Material>();
 const ownGeometries=new Set<THREE.BufferGeometry>(),ownMaterials=new Set<THREE.Material>(),ownTextures=new Set<THREE.Texture>();
 const stageTextures=new Set<THREE.Texture>(),stageMaterials=new Set<THREE.Material>();
 const settlementHighlights=new Map<string,{line:THREE.Line<THREE.BufferGeometry,THREE.LineBasicMaterial>;sprite:THREE.Sprite|null;own:boolean;color:number}>();
 const cube=new THREE.BoxGeometry(1,1,1);ownGeometries.add(cube);
 const stock=new Map<string,THREE.MeshStandardMaterial>();
 function material(color:number,roughness=1,transparent=false,opacity=1):THREE.MeshStandardMaterial {
  const key=`${color}:${roughness}:${opacity}`;let value=stock.get(key);if(!value){value=new THREE.MeshStandardMaterial({color,roughness,transparent,opacity,flatShading:true});stock.set(key,value);ownMaterials.add(value);}return value;
 }
 const rockMat=material(0x6a746e),topMat=material(0xffffff),earthMat=material(0xffffff),fogMat=material(0x293d48);
 function pixelTexture(side:boolean):THREE.DataTexture {
  const size=16,data=new Uint8Array(size*size*4);
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){
   const seed=stableSeed(`${side?'earth':'ground'}:${row}:${col}`),index=(row*size+col)*4;
   const shade=side?Math.min(255,190+(Math.floor(row/3)%3)*17+(seed%5)*6):220+(seed%6)*7;
   data[index]=shade;data[index+1]=side?Math.round(shade*.97):shade;data[index+2]=side?Math.round(shade*.91):shade;data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.NearestFilter;texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;ownTextures.add(texture);return texture;
 }
 topMat.map=pixelTexture(false);earthMat.map=pixelTexture(true);
 const temp=new THREE.Object3D(),matrix=new THREE.Matrix4(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 const disposables:THREE.BufferGeometry[]=[];
 function ownGeometry(source:THREE.BufferGeometry):THREE.BufferGeometry {
  let owned=geometries.get(source.uuid);if(!owned){owned=source.clone();geometries.set(source.uuid,owned);ownGeometries.add(owned);}return owned;
 }
 function ownMaterial(source:THREE.Material):THREE.Material {
  let owned=materials.get(source.uuid);if(!owned){owned=source.clone();materials.set(source.uuid,owned);ownMaterials.add(owned);}return owned;
 }
 function ownedModel(model:THREE.Group):THREE.Group {
  model.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry=ownGeometry(object.geometry);object.material=Array.isArray(object.material)?object.material.map(ownMaterial):ownMaterial(object.material);object.castShadow=true;object.receiveShadow=true;}});return model;
 }
 const batches=new Map<string,Batch>();
 function instance(geometry:THREE.BufferGeometry,mat:THREE.Material|THREE.Material[],transform:THREE.Matrix4,color?:number,tileId?:string,shadow=true):void {
  const key=`${geometry.uuid}:${Array.isArray(mat)?mat.map(m=>m.uuid).join():mat.uuid}:${color===undefined?'m':'c'}:${tileId?'tiles':''}:${shadow}`;
  let batch=batches.get(key);if(!batch){batch={geometry,material:mat,matrices:[],shadow,...(color!==undefined?{colors:[]}:{}),...(tileId?{tileIds:[]}:{} )};batches.set(key,batch);}
  batch.matrices.push(transform.clone());if(color!==undefined)batch.colors!.push(new THREE.Color(color));if(tileId)batch.tileIds!.push(tileId);
 }
 function box(x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material,color?:number,tileId?:string,shadow=true):void {
  temp.position.set(x,y,z);temp.rotation.set(0,0,0);temp.scale.set(sx,sy,sz);temp.updateMatrix();instance(cube,mat,temp.matrix,color,tileId,shadow);
 }
 function addModel(model:THREE.Group,x:number,y:number,z:number,scale=1,rotation=0):void {
  temp.position.set(x,y,z);temp.rotation.set(0,rotation,0);temp.scale.setScalar(scale);temp.updateMatrix();const parentMatrix=temp.matrix.clone();
  model.updateMatrixWorld(true);model.traverse(object=>{if(object instanceof THREE.Mesh){matrix.multiplyMatrices(parentMatrix,object.matrixWorld);instance(ownGeometry(object.geometry),Array.isArray(object.material)?object.material.map(ownMaterial):ownMaterial(object.material),matrix);}});
 }
 function flush():void {
  for(const batch of batches.values()){
   const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((transform,index)=>mesh.setMatrixAt(index,transform));mesh.instanceMatrix.needsUpdate=true;
   batch.colors?.forEach((color,index)=>mesh.setColorAt(index,color));if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=batch.shadow;mesh.receiveShadow=true;
   if(batch.tileIds){mesh.userData.tileIds=batch.tileIds;mesh.name='selectable-terrain';}
   mesh.computeBoundingSphere();stage.add(mesh);
  }batches.clear();
 }
 function tileDecor(tile:TileVisual):void {
  if(!tile.visible)return;
  const {x,z,y,seed}=tile;
  if(tile.terrain==='water'){
   const water=new THREE.Mesh(cube,material(0x479ba4,.24,true,.86));water.position.set(x,y+.04,z);water.scale.set(3.02,.12,3.02);water.receiveShadow=true;stage.add(water);waterMeshes.push(water);
   for(let wave=0;wave<3;wave++)box(x-.75+wave*.56,y+.11,z-.8+(seed%4)*.36, .54,.025,.06,material(0x8dd2cf,.4,true,.62),undefined,undefined,false);
  }
  if(tile.terrain!=='water'){
   const patchColors:Record<string,number[]>={forest:[0x4e7347,0x8ca75f,0xabc17b],plains:[0x8ca861,0xb2c27e,0x719550],desert:[0xc8a878,0xf2d6a0,0xdabb80],mountain:[0x818d84,0xb2b9a6,0x6d7e73],swamp:[0x446d57,0x7d956b,0x91aa7a]};
   for(let patch=0;patch<7;patch++){
    const n=stableSeed(`${tile.id}:patch:${patch}`),px=x-1.26+(n%250)/100,pz=z-1.26+((n>>>9)%250)/100;
    box(px,y+.089,pz,.16+((n>>>17)%5)*.07,.015,.13+((n>>>21)%5)*.08,material(patchColors[tile.biome??'plains'][patch%3]),undefined,undefined,false);
   }
  }
  if(tile.id==='t_4_4')return;
  if(tile.bridge)addModel(createBuilding('bridge'),x,y+.22,z,1.28,Math.PI/2);
  const treeKind=tile.biome==='desert'?'palm':tile.biome==='swamp'?'dead':tile.biome==='forest'?'pine':'oak';
  if(tile.biome==='forest'||tile.biome==='swamp'){
   const count=tile.biome==='forest'?4:2;
   for(let index=0;index<count;index++){
    const dx=[-.92,.84,-.77,.86][index],dz=[-.82,-.77,.92,.87][index];
    if(tile.terrain!=='water'||tile.biome==='swamp')addModel(createTree(treeKind,index%3),x+dx,y+.1,z+dz,.75+(seed%3)*.07,(seed%4)*Math.PI/2);
   }
  }else if(tile.biome==='plains'&&tile.terrain!=='water'){
   if(seed%2)addModel(createTree('oak',seed%3),x-1,y+.1,z-.82,.68);
   for(let tuft=0;tuft<5;tuft++){
    const tx=x-1+(tuft*.53)%2,tz=z+.68+(tuft%2)*.18;
    box(tx,y+.17,tz,.09,.24,.09,material(tuft%3?0xc6c68a:0xcedfe1),undefined,undefined,false);
   }
  }else if(tile.biome==='desert'&&tile.terrain!=='water'){
   if(seed%3===0)addModel(createTree('palm',seed%3),x-.8,y+.1,z-.8,.78);
   box(x-.4,y+.13,z-.42,1.38,.13,.82,material(0xd2b47d));box(x-.48,y+.22,z-.52,1.02,.1,.58,material(0xe7c98f));
   box(x+.82,y+.41,z+.65,.17,.8,.17,material(0x63805a));box(x+.64,y+.48,z+.65,.31,.15,.15,material(0x63805a));box(x+.52,y+.56,z+.65,.13,.25,.14,material(0x708d60));box(x+1.03,y+.62,z+.65,.31,.14,.14,material(0x708d60));
   for(let pebble=0;pebble<3;pebble++)box(x-.9+pebble*.22,y+.13,z+.84,.17,.13,.14,material(pebble%2?0xc3a77b:0xb79568));
  }
  if(tile.biome==='mountain'||tile.terrain==='rocky'||tile.terrain==='slope'){
   const height=tile.biome==='mountain'?1.3:.68;
   const facets=[[-.58,.12,-.51,1.87,.24,1.76,0x687970],[-.7,.31,-.58,1.48,.28,1.36,0x7d8a7e],[-.51,.51,-.65,1.15,.22,1.05,0x97a092],[-.67,.69,-.67,.88,.2,.8,0xaeb3a2],[-.57,.85,-.62,.6,.15,.59,0xb7bca9],[-1.08,.32,-.1,.43,.39,.48,0x859081],[.08,.19,-.64,.58,.3,.6,0x889486],[-.36,.18,.18,.56,.26,.39,0x697d70]];
   for(const [dx,dy,dz,sx,sy,sz,color]of facets)box(x+dx,y+dy*height+.1,z+dz,sx,sy*height,sz,material(color));
   if(tile.biome==='mountain'){
    box(x-.57,y+height*.94+.1,z-.62,.6,.1,.59,material(0xe0e5d6));box(x-.7,y+height*.96+.12,z-.65,.24,.12,.29,material(0xf0edda));
    box(x-.97,y+height*.53+.12,z-.4,.15,.04,.2,material(0xc2c7b4));
   }
  }
  if(tile.surveyed){
   const ores=tile.deposits.filter(item=>['iron_ore','copper_ore','crystal_shard','stone','silica','data_fragment'].includes(item));
   ores.slice(0,2).forEach((item,index)=>{
    const kind=item==='iron_ore'?'iron':item==='copper_ore'?'copper':item==='crystal_shard'||item==='data_fragment'?'crystal':'stone';
    addModel(createRock(kind,seed%3),x+.7-index*.85,y+.13,z+.5,.6);
   });
   if(tile.deposits.includes('grain'))for(let crop=0;crop<6;crop++){
    const cx=x+.2+(crop%3)*.31,cz=z+.55+Math.floor(crop/3)*.35;
    box(cx,y+.2,cz,.08,.34,.08,material(0xcaa953));box(cx,y+.4,cz,.16,.12,.12,material(0xf0cf73));
   }
  }
  if(tile.protected&&tile.id!=='t_4_4')box(x+1.24,y+.17,z-1.24,.14,.25,.14,material(0x91d0be));
 }
 function addWalker(job:Job|null,home:THREE.Vector3,type:'scout'|'guard'|'ranged'|'engineer'='scout',index=0,battleSide?:'attacker'|'npc'):Walker {
  const object=ownedModel(createUnit(type,battleSide==='npc'?'forgers':input.player?.faction??'cartographers'));object.scale.setScalar(detailed()?1.3:REGIONAL_UNIT_SCALE);object.position.copy(home);stage.add(object);
  const start=job?tiles.find(tile=>tile.id===job.route[0]):undefined,routeOffset=start?new THREE.Vector3(home.x-start.x,0,home.z-start.z):new THREE.Vector3();
  const walker:Walker={object,job,phase:index*.8,home,routeOffset,battleSide};walkers.push(walker);return walker;
 }
 function label(text:string,x:number,y:number,z:number,size=1,color='#f3e5bf',settlementId?:string):THREE.Sprite|null {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const context=canvas.getContext('2d');if(!context)return null;
  context.fillStyle='rgba(20,37,32,.9)';context.fillRect(0,8,768,112);
  context.strokeStyle=color;context.lineWidth=5;context.strokeRect(3,11,762,106);
  context.font='600 39px system-ui, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;
  context.fillText(text,384,65,735);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;stageTextures.add(texture);
  const mat=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false});stageMaterials.add(mat);
  const sprite=new THREE.Sprite(mat);sprite.position.set(x,y,z);sprite.scale.set(size,size/6,1);sprite.renderOrder=8;
  if(settlementId)sprite.userData.settlementId=settlementId;stage.add(sprite);return sprite;
 }
 function outline(x:number,y:number,z:number,w:number,d:number,color:number) {
  const points=[new THREE.Vector3(x-w/2,y,z-d/2),new THREE.Vector3(x+w/2,y,z-d/2),new THREE.Vector3(x+w/2,y,z+d/2),new THREE.Vector3(x-w/2,y,z+d/2),new THREE.Vector3(x-w/2,y,z-d/2)];
  const geometry=new THREE.BufferGeometry().setFromPoints(points);disposables.push(geometry);
  const mat=new THREE.LineBasicMaterial({color,transparent:true,opacity:.9});stageMaterials.add(mat);const line=new THREE.Line(geometry,mat);stage.add(line);return line;
 }
 function atlasSettlements():void {
  const hitMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide});stageMaterials.add(hitMat);
  for(const colony of input.view.settlements??[]){
   const foot=settlementFootprint(colony),tile=tiles.find(tile=>tile.id===settlementTile(colony)),base=(tile?.visible?tile.y:.24)+.14;
   const own=colony.own,selected=colony.id===input.selectedSettlementId;
   const color=own?0xf1cc70:colony.faction==='forgers'?0xda8e69:colony.faction==='custodians'?0xa8c36b:0x82c9c4;
   const line=outline(foot.x,base+.025,foot.z,foot.width,foot.depth,color);
   box(foot.x,base-.025,foot.z,foot.width,.035,foot.depth,material(own?0x9e9e61:0x7c8a64),undefined,undefined,false);
   addModel(createBuilding('home',1,colony.faction),foot.x-foot.width*.24,base,foot.z-foot.depth*.2,.064);
   BUILDING_ORDER.forEach((kind,index)=>{
    const level=colony.buildings[kind];if(level<1)return;
    const dx=(index%3-1)*foot.width*.25,dz=(Math.floor(index/3)-.3)*foot.depth*.26;
    addModel(createBuilding(kind,level,colony.faction),foot.x+dx,base,foot.z+dz,.047);
   });
   box(foot.x+foot.width*.32,base+.21,foot.z-foot.depth*.3,.012,.4,.012,material(0x8c7048),undefined,undefined,false);
   box(foot.x+foot.width*.37,base+.35,foot.z-foot.depth*.3,.105,.075,.012,material(color),undefined,undefined,false);
   const geometry=new THREE.PlaneGeometry(foot.width+.1,foot.depth+.1);disposables.push(geometry);
   const hit=new THREE.Mesh(geometry,hitMat);hit.rotation.x=-Math.PI/2;hit.position.set(foot.x,base+.055,foot.z);hit.userData.settlementId=colony.id;stage.add(hit);
   const caption=`${own?'◆ ':''}${colony.name} · ${colony.ownerName}${colony.clanName?` [${colony.clanName}]`:''}`;
   const sprite=label(caption,foot.x,base+.59+(colony.plot.index%3)*.22,foot.z,selected?1.95:1.45,own?'#f5d991':'#e5e8cf',colony.id);
   settlementHighlights.set(colony.id,{line,sprite,own,color});
  }
  updateSettlementHighlights();
 }
 function updateSettlementHighlights():void {
  for(const [id,marker]of settlementHighlights){
   const selected=id===input.selectedSettlementId,size=selected?1.95:1.45;
   marker.line.material.color.setHex(selected?0xffeead:marker.color);marker.line.material.opacity=selected?1:marker.own?.95:.65;
   if(marker.sprite){
    marker.sprite.scale.set(size,size/6,1);
    // Nearby plots are only .8 atlas units apart. Keep every actual flag and
    // building visible; show a full name only for the focused colony.
    marker.sprite.visible=selected||(!input.selectedSettlementId&&marker.own&&camera.zoom>=2.4);
   }
  }
 }
 function atlasGrid():void {
  const edge=TILE_SIZE*4.5,points:THREE.Vector3[]=[];
  for(let index=0;index<=9;index++){
   const coordinate=-edge+index*TILE_SIZE;
   points.push(new THREE.Vector3(coordinate,.09,-edge),new THREE.Vector3(coordinate,.09,edge),new THREE.Vector3(-edge,.09,coordinate),new THREE.Vector3(edge,.09,coordinate));
  }
  const geometry=new THREE.BufferGeometry().setFromPoints(points);disposables.push(geometry);
  const mat=new THREE.LineBasicMaterial({color:0xccd6bb,transparent:true,opacity:.22});stageMaterials.add(mat);stage.add(new THREE.LineSegments(geometry,mat));
  for(let index=0;index<9;index++){
   const coordinate=(index-4)*WORLD_SECTOR_SPAN,point=(index-4)*TILE_SIZE;
   label(`X ${coordinate}`,point,.34,edge+.58,1.35);
   label(`Y ${coordinate}`,-edge-.7,.34,point,1.35);
  }
 }
 function ambientSettlements():void {
  if(input.mode!=='world')return;
  const hitMat=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide});stageMaterials.add(hitMat);
  for(const town of NPC_SETTLEMENTS){
   const point=globalToAtlas(town.x,town.y),tile=tiles.find(tile=>tile.id===`t_${Math.max(0,Math.min(8,Math.floor(town.y/WORLD_SECTOR_SPAN+.5)+4))}_${Math.max(0,Math.min(8,Math.floor(town.x/WORLD_SECTOR_SPAN+.5)+4))}`);
   const city=town.stage==='city',construction=town.stage==='construction',width=city?1.25:.84,depth=city?1.02:.68,base=(tile?.visible?tile.y:.24)+.14;
   // Environmental towns yield to real player plots; they never allocate land,
   // publish a fake player, or conceal a real village as the population grows.
   if((input.view.settlements??[]).some(colony=>Math.abs(town.x-colony.plot.x)<colony.plot.width/2+width*30&&Math.abs(town.y-colony.plot.y)<colony.plot.depth/2+depth*30))continue;
   box(point.x,base-.035,point.z,width,.04,depth,material(0x8c9870),undefined,undefined,false);
   box(point.x,base-.008,point.z,width*.9,.018,.065,material(0xc2ae7f),undefined,undefined,false);
   box(point.x,base-.006,point.z,.07,.018,depth*.9,material(0xc2ae7f),undefined,undefined,false);
   const count=city?9:construction?3:4,scale=city?.082:.065;
   for(let index=0;index<count;index++){
    const cols=city?3:2,dx=(index%cols-(cols-1)/2)*width*.29,dz=(Math.floor(index/cols)-(city?1:.5))*depth*.32;
    const kind=index===0?'logistics':index%4===1?'workshop':index%4===2?'warehouse':'home';
    addModel(createBuilding(kind,city?(index%3===0?3:2):1,'forgers'),point.x+dx,base,point.z+dz,scale,index%2?Math.PI:0);
   }
   if(construction){
    const cx=point.x+width*.25,cz=point.z+depth*.17;
    box(cx,base+.018,cz,.28,.035,.25,material(0x8f9685),undefined,undefined,false);
    for(const dx of [-.13,.13])for(const dz of [-.11,.11])box(cx+dx,base+.17,cz+dz,.017,.32,.017,material(0x9c7748),undefined,undefined,false);
    for(const h of [.15,.3]){box(cx,base+h,cz-.11,.29,.016,.018,material(0xb19059),undefined,undefined,false);box(cx+.13,base+h,cz,.018,.016,.25,material(0xb19059),undefined,undefined,false);}
    box(point.x-width*.3,base+.06,point.z+depth*.3,.16,.12,.13,material(0xae8654),undefined,undefined,false);
   }
   const labelText=`${town.name} · ${town.alias}${construction?' · En construcción':''}`,sprite=label(labelText,point.x,base+.58,point.z,city?2:1.7,'#c5c9ad');if(sprite)sprite.userData.npcId=town.id;
   const geometry=new THREE.PlaneGeometry(width,depth);disposables.push(geometry);const hit=new THREE.Mesh(geometry,hitMat);hit.rotation.x=-Math.PI/2;hit.position.set(point.x,base+.03,point.z);hit.userData.npcId=town.id;stage.add(hit);
  }
 }
 function world():void {
  const globalBounds=atlasWorldBounds(input.view.settlements??[]),corner=globalToAtlas(Math.max(Math.abs(globalBounds.minX),globalBounds.maxX),Math.max(Math.abs(globalBounds.minY),globalBounds.maxY));
  // Regional terrain continues beyond the grid; no sector floats over the sky.
  box(0,-.47,0,Math.max(600,corner.x*2+100),.4,Math.max(600,corner.z*2+100),material(0x526e45),undefined,undefined,false);
  for(const tile of tiles){
   const depth=Math.max(.1,tile.y+.34);
   box(tile.x,tile.y-depth/2,tile.z,TILE_SIZE+.012,depth,TILE_SIZE+.012,earthMat,tile.visible?LAND[tile.biome??'plains']:0x354b42,tile.id);
   box(tile.x,tile.y+.025,tile.z,TILE_SIZE+.014,.11,TILE_SIZE+.014,tile.visible?topMat:fogMat,tile.visible?SURFACE[tile.biome??'plains']:undefined,tile.id,false);
   if(!tile.visible){
    box(tile.x,tile.y+.12,tile.z,2.96,.15,2.96,fogMat,undefined,tile.id,false);
    const mist=material(tile.seed%2?0x4a6570:0x47616b,1,true,.24);
    for(let puff=0;puff<3;puff++){
     const n=stableSeed(`${tile.id}:fog:${puff}`),px=tile.x-1.1+(n%200)/100,pz=tile.z-1.1+((n>>>10)%200)/100;
     box(px,.34+puff*.14,pz,1.35+(n%5)*.15,.16,1.02+(n%4)*.16,mist,undefined,undefined,false);
    }
   }else tileDecor(tile);
  }
  atlasGrid();atlasSettlements();ambientSettlements();
  const actorTile=tiles.find(tile=>tile.id===(input.player?.position??'t_4_4'));
  const motion=input.view.jobs.filter(job=>job.playerId===input.player?.id&&job.status==='running'&&['travel','convoy','expedition','battle','extract','survey'].includes(job.kind));
  if(actorTile){
   const moving=motion.find(job=>job.kind==='travel'||job.kind==='convoy')??motion.find(job=>job.kind!=='battle')??null;
   const explorer=addWalker(moving,new THREE.Vector3(actorTile.x,actorTile.y+.1,actorTile.z+.76*REGIONAL_OFFSET_SCALE));
   if(moving?.kind==='convoy'&&input.view.convoys.some(convoy=>convoy.jobId===moving.id&&convoy.cargo.some(lot=>lot.qty>0))){
    const equipment=Array.isArray(moving.payload.equipment)?moving.payload.equipment:[],cartHeld=equipment.some(lot=>lot&&typeof lot==='object'&&'itemId'in lot&&lot.itemId==='cart');
    if(cartHeld){const cart=ownedModel(createItem('cart'));cart.scale.setScalar(.85);cart.position.set(.65,0,-.28);explorer.object.add(cart);}
    else{const cargo=new THREE.Group(),crate=new THREE.Mesh(cube,material(0xab8052));crate.scale.set(.38,.35,.38);crate.position.set(0,.22,0);cargo.add(crate);for(const z of [-.19,.19]){const strap=new THREE.Mesh(cube,material(0x604e3d));strap.scale.set(.39,.06,.025);strap.position.set(0,.3,z);cargo.add(strap);}cargo.position.set(.5,0,-.16);explorer.object.add(cargo);}
   }
   const battleJob=motion.find(job=>job.kind==='battle'),battle=battleJob?input.view.battles.find(battle=>battle.jobId===battleJob.id&&battle.status==='scheduled'):undefined;
   const selectedIds=new Set(battleJob&&Array.isArray(battleJob.payload.unitIds)?battleJob.payload.unitIds.filter((id):id is string=>typeof id==='string'):[]);
   const encounterTile=battleJob?tiles.find(tile=>tile.id===battleJob.payload.tileId&&tile.visible):undefined;
   if(battleJob&&battle&&encounterTile){
    const selectedUnits=(input.player?.units??[]).filter(unit=>selectedIds.has(unit.id));
    selectedUnits.forEach((unit,index)=>{const walker=addWalker(battleJob,new THREE.Vector3(encounterTile.x-.63*REGIONAL_OFFSET_SCALE,encounterTile.y+.1,encounterTile.z+(-.9+index*.35)*REGIONAL_OFFSET_SCALE),unit.type,index,'attacker');walker.object.rotation.y=Math.PI/2;});
    // One red encounter silhouette denotes the server's abstract NPC opponent, not a troop count.
    if(battle.npc){const npc=addWalker(battleJob,new THREE.Vector3(encounterTile.x+.74*REGIONAL_OFFSET_SCALE,encounterTile.y+.1,encounterTile.z), 'guard',0,'npc');npc.object.rotation.y=-Math.PI/2;}
   }
   (input.player?.units??[]).filter(unit=>!encounterTile||!battle||!selectedIds.has(unit.id)).slice(0,5).forEach((unit,index)=>addWalker(unit.busy?moving:null,new THREE.Vector3(actorTile.x+(-.85+index*.39)*REGIONAL_OFFSET_SCALE,actorTile.y+.1,actorTile.z+1.02*REGIONAL_OFFSET_SCALE),unit.type,index+1));
  }
  for(const post of input.view.social?.outposts??[]){
   if(post.status==='expired')continue;const tile=tiles.find(tile=>tile.id===post.tileId&&tile.visible);if(tile)addModel(createBuilding('outpost',1,input.player?.faction??'custodians'),tile.x,tile.y+.1,tile.z,.065);
  }
  const paths=input.view.jobs.filter(job=>job.playerId===input.player?.id&&(job.status==='running'||job.status==='reserved')&&job.route.length>1);
  for(const job of paths){
   const coords=job.route.map(id=>tiles.find(tile=>tile.id===id&&tile.visible)).filter((tile):tile is TileVisual=>!!tile).map(tile=>new THREE.Vector3(tile.x,tile.y+.22,tile.z));
   if(coords.length>1){const geometry=new THREE.BufferGeometry().setFromPoints(coords);disposables.push(geometry);const path=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xf4d49b,transparent:true,opacity:.8}));ownMaterials.add(path.material);stage.add(path);}
  }
 }
 function makeMarker():void {
  selectedMarker=new THREE.Group();const mat=material(0xf6db9c,.55);mat.emissive.setHex(0x88662a);mat.emissiveIntensity=.55;
  for(const [x,z,sx,sz]of [[0,-1.53,3.08,.055],[0,1.53,3.08,.055],[-1.53,0,.055,3.08],[1.53,0,.055,3.08]]){
   const edge=new THREE.Mesh(cube,mat);edge.position.set(x,0,z);edge.scale.set(sx,.055,sz);selectedMarker.add(edge);
  }stage.add(selectedMarker);
  playerBeacon=new THREE.Group();const beaconMat=material(0x91dbcf,.55);beaconMat.emissive.setHex(0x2b766d);beaconMat.emissiveIntensity=.6;
  const diamond=new THREE.Mesh(cube,beaconMat);diamond.scale.set(.16,.16,.16);diamond.rotation.set(Math.PI/4,0,Math.PI/4);diamond.position.y=2.6;playerBeacon.add(diamond);stage.add(playerBeacon);positionMarkers();
 }
 function positionMarkers():void {
  const onMap=input.mode==='world'||input.mode==='expedition';
  const selected=tiles.find(tile=>tile.id===input.selected);selectedMarker.visible=onMap&&!!selected;if(selected)selectedMarker.position.set(selected.x,selected.y+(selected.visible?.16:.52),selected.z);
  const playerTile=tiles.find(tile=>tile.id===(input.player?.position??'t_4_4'));playerBeacon.visible=onMap&&!!playerTile;if(playerTile)playerBeacon.position.set(playerTile.x,playerTile.y,playerTile.z);
 }
 function village():void {
  const plot=input.player?.settlement,clearRoad=createHabitableTradeClearance(ownCaravans());
  settlement=preparedSettlement??createSettlement({player:input.player,quality:input.quality,showcase:input.mode==='showcase',proceduralClearance:plot?(x,y,padding)=>clearRoad(plot.x+x,plot.y+y,padding):undefined});preparedSettlement=undefined;
  settlement.group.traverse(object=>{object.userData.settlementManaged=true;});stage.add(settlement.group);
  settlement.setParcelBoundaryVisible(!!input.player);
  if(input.player?.habitable){habitableBuildings=createHabitableBuildingLayer({faction:input.player.faction,state:input.player.habitable});habitableBuildings.update(input.player.habitable,clockNow(),input.reducedMotion);settlement.group.add(habitableBuildings.group);}
  if(input.player){stationUpgrades=createHabitableUpgradeLayer({faction:input.player.faction});stationUpgrades.update(input.view.settlements.find(p=>p.playerId===input.player!.id)?.construction??[],clockNow(),input.reducedMotion);settlement.group.add(stationUpgrades.group);}
  if(plot){const plotHeight=sampleWorld(plot.x,plot.y).height;commerce=createHabitableCommerceLayer({surfaceHeight:(point,caravan)=>point.height+continuousGroundHeight(point.x-plot.x,point.y-plot.y)+plotHeight-2-tradeGroundHeight(point.x,point.y,caravan.plot)});commerce.group.position.set(-plot.x,2-plotHeight,-plot.y);commerce.setClipRegion({key:`station:${plot.x}:${plot.y}`,contains:(x,y,padding=0)=>x-padding>=plot.x+LANDSCAPE_BOUNDS.minX&&x+padding<=plot.x+LANDSCAPE_BOUNDS.maxX&&y-padding>=plot.y+LANDSCAPE_BOUNDS.minZ&&y+padding<=plot.y+LANDSCAPE_BOUNDS.maxZ});stage.add(commerce.group);updateCommerce(clockNow());}
  // Legacy saves keep their scenery residents. Functional workers replace only
  // these three unreserved walking loops, so logistics never meets phantom traffic.
  if(!input.player?.habitable?.workers?.length)for(const [index,x] of [-7,-1.3,4.2].entries()){
   const walker=addWalker(null,new THREE.Vector3(x,2.13,.4),'scout',index);
   walker.object.userData.resident=true;walker.object.rotation.y=index*Math.PI/2;
  }
  const barracks=settlement.anchors.barracks;
  (input.player?.units??[]).slice(0,8).forEach((unit,index)=>addWalker(null,new THREE.Vector3(barracks.x-1.4+(index%4)*.8,barracks.y+.12,barracks.z+2.2+Math.floor(index/4)*.8),unit.type,index+3));
  settlement.smokeOrigins.forEach((origin,index)=>{
   for(let puff=0;puff<4;puff++){
    const mesh=new THREE.Mesh(cube,material(0xe4dfbd,1,true,.38-puff*.045));mesh.position.copy(origin).add(new THREE.Vector3(0,puff*.35,0));mesh.scale.setScalar(.2+puff*.12);mesh.userData.base=mesh.position.clone();mesh.userData.phase=puff+index*.8;stage.add(mesh);smoke.push(mesh);
   }
  });
  const fireOrigin=settlement.anchors.workshop.clone().add(new THREE.Vector3(-.54*1.62,.4*1.62,1.18*1.62));
  forgeLight=new THREE.PointLight(0xff982f,9,5,2);forgeLight.position.copy(fireOrigin);stage.add(forgeLight);
  if(!forgeGlowMaterial){
   const glowSize=32,glowData=new Uint8Array(glowSize*glowSize*4);
   for(let y=0;y<glowSize;y++)for(let x=0;x<glowSize;x++){const offset=(y*glowSize+x)*4,r=Math.hypot((x+.5)/glowSize*2-1,(y+.5)/glowSize*2-1);glowData[offset]=255;glowData[offset+1]=151;glowData[offset+2]=36;glowData[offset+3]=Math.round(Math.pow(Math.max(0,1-r),2.3)*170);}
   const glowTexture=new THREE.DataTexture(glowData,glowSize,glowSize);glowTexture.colorSpace=THREE.SRGBColorSpace;glowTexture.needsUpdate=true;ownTextures.add(glowTexture);
   forgeGlowMaterial=new THREE.SpriteMaterial({map:glowTexture,transparent:true,opacity:.52,depthWrite:false,blending:THREE.AdditiveBlending});ownMaterials.add(forgeGlowMaterial);
  }
  forgeGlow=new THREE.Sprite(forgeGlowMaterial);forgeGlow.position.copy(fireOrigin);forgeGlow.scale.set(1.55,1.55,1);stage.add(forgeGlow);
 }
 function makeBirds():void {
  for(let index=0;index<(input.quality==='performance'?3:6);index++){
   const object=new THREE.Group(),left=new THREE.Group(),right=new THREE.Group();
   const feather=material(index%2?0xe9e3ca:0x39473e),tip=material(0x566257);
   const part=(parent:THREE.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material)=>{const mesh=new THREE.Mesh(cube,mat);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);};
   part(object,0,0,0,.15,.13,.37,feather);part(object,0,.08,.18,.13,.14,.16,feather);part(object,0,.05,.29,.065,.055,.12,material(0xc89e59));part(object,0,.02,-.27,.19,.05,.14,tip);
   left.position.x=-.065;right.position.x=.065;
   part(left,-.2,0,-.02,.42,.055,.19,feather);part(left,-.48,0,-.09,.22,.045,.13,tip);
   part(right,.2,0,-.02,.42,.055,.19,feather);part(right,.48,0,-.09,.22,.045,.13,tip);
   object.add(left,right);object.position.set(-8+index*3,8+index%3,-5+index);stage.add(object);birds.push({object,left,right,phase:index*.93});
  }
 }
 function skyEffects():void {
  const weather=activeWeather(input),wet=weather==='rain'||weather==='storm';
  const background=wet?0x233b34:detailed()?0x1c352b:SKY;
  scene.background=new THREE.Color(background);scene.fog=new THREE.FogExp2(background,detailed()?.003:wet?.018:.012);
  sun.intensity=wet?2.4:detailed()?4.35:3.3;ambient.intensity=wet?1.05:detailed()?.85:1.5;rim.intensity=detailed()?.48:.8;
  for(let index=0;index<(input.quality==='performance'?2:detailed()?4:7);index++){
   const cloud=new THREE.Group();cloud.position.set(-16+(index*9.3)%32,detailed()?11+(index%2):5+(index%3)*.65,detailed()?-16-index*1.3:-13+index*3.6);cloud.userData.origin=cloud.position.clone();
   for(let puff=0;puff<7;puff++){const block=new THREE.Mesh(cube,material(wet?0x82938c:0xdbe3d1,1,true,wet?.6:.62));block.scale.set(.85+(puff%3)*.36,.35+(puff%3)*.18,.7+(puff%2)*.34);block.position.set((puff%4)*.64,Math.sin(puff*1.7)*.17,Math.floor(puff/4)*.48);cloud.add(block);}cloud.scale.setScalar(.8);stage.add(cloud);clouds.push(cloud);
  }
  if(detailed())makeBirds();
  if(wet&&input.quality!=='performance'){
   const count=280;rainData=new Float32Array(count*3);for(let index=0;index<count;index++){const seed=stableSeed(`rain${index}`);rainData[index*3]=(seed%3400)/100-17;rainData[index*3+1]=((seed>>>8)%1200)/100+1;rainData[index*3+2]=((seed>>>16)%3400)/100-17;}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(rainData,3));disposables.push(geometry);
   const mat=new THREE.PointsMaterial({color:0xa8d3d8,size:.055,transparent:true,opacity:.55,sizeAttenuation:true});ownMaterials.add(mat);rain=new THREE.Points(geometry,mat);stage.add(rain);
  }
 }
 function clearStage():void {
  habitableBuildings?.dispose();habitableBuildings=null;
  stationUpgrades?.dispose();stationUpgrades=null;
  commerce?.dispose();commerce=null;
  scene.remove(stage);stage.traverse(object=>{if(object instanceof THREE.InstancedMesh&&!object.userData.settlementManaged)object.dispose();});settlement?.dispose();settlement=null;
  stageTextures.forEach(texture=>texture.dispose());stageTextures.clear();stageMaterials.forEach(mat=>mat.dispose());stageMaterials.clear();settlementHighlights.clear();
  for(const geometry of disposables.splice(0))geometry.dispose();stage=new THREE.Group();walkers=[];birds=[];clouds=[];smoke=[];waterMeshes=[];forgeLight=null;forgeGlow=null;rain=null;rainData=null;batches.clear();
 }
 function rebuild():void {
  clearStage();tiles=projectTiles(input);detailed()?village():world();flush();makeMarker();skyEffects();scene.add(stage);needsRender=true;
 }
 function signature(next:SceneInput):string {
  if(next.mode==='settlement'||next.mode==='station'||next.mode==='showcase')return stationLandscapeSignature(next);
  return JSON.stringify([next.mode,next.quality,settlementSceneSignature(next.view.settlements??[]),next.player?.id,next.player?.position,next.player?.faction,next.player?.settlement,next.player?.discovered,next.player?.surveyed,next.player?.buildings,habitableLandscapeShape(next.player?.habitable),next.player?.habitable?.commerce?.gateway??next.player?.habitable?.commerceGateway,habitableCommerceRouteKey((next.view.habitable?.commerce?.caravans??[]).filter(c=>c.playerId===next.player?.id)),!!next.player?.habitable?.workers?.length,next.player?.units,next.view.tiles.map(tile=>[tile.id,tile.terrain,tile.biome,tile.bridge,tile.deposits.map(deposit=>[deposit.itemId,deposit.layers.some(layer=>layer.remaining>0)])]),next.view.jobs.filter(job=>job.playerId===next.player?.id&&(job.status==='running'||job.status==='reserved')).map(job=>[job.id,job.status,job.startsAt,job.endsAt,job.route,job.kind,job.payload.unitIds,job.payload.equipment]),next.view.battles.map(battle=>[battle.id,battle.status,battle.npc]),next.view.convoys.map(convoy=>[convoy.id,convoy.status,convoy.cargo.length]),next.view.weather,next.view.social?.outposts.map(post=>[post.id,post.tileId,post.status,post.clanId])]);
 }
 function constrainCamera():void {
  const limits=detailed()?parcelCameraLimits():atlasCameraLimits();
  controls.minZoom=limits.minZoom;controls.maxZoom=limits.maxZoom;controls.minPolarAngle=limits.minPolarAngle;controls.maxPolarAngle=limits.maxPolarAngle;
  const globalBounds=atlasWorldBounds(input.view.settlements??[]),min=globalToAtlas(globalBounds.minX,globalBounds.minY),max=globalToAtlas(globalBounds.maxX,globalBounds.maxY);
  const bounds=detailed()?PARCEL_CAMERA_BOUNDS:{xMin:min.x,xMax:max.x,zMin:min.z,zMax:max.z};
  const point=clampTarget(controls.target.x,controls.target.z,bounds,limits.targetMargin),y=detailed()?2:Math.max(-.2,Math.min(.7,controls.target.y));
  const delta=new THREE.Vector3(point.x-controls.target.x,y-controls.target.y,point.z-controls.target.z);
  controls.target.add(delta);camera.position.add(delta);
  const zoom=THREE.MathUtils.clamp(camera.zoom,limits.minZoom,limits.maxZoom);
  if(zoom!==camera.zoom){camera.zoom=zoom;camera.updateProjectionMatrix();}
  updateSettlementHighlights();
 }
 function resize():void {
  if(disposed)return;const bounds=container.getBoundingClientRect();width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);
  const resolution=resolutionFor(width,height,window.devicePixelRatio||1,input.quality);renderer.setPixelRatio(resolution.ratio);renderer.setSize(width,height,false);
  const aspect=width/height,vertical=detailed()?Math.min(24,Math.max(extent,fitWidth/aspect)):extent*Math.max(1,.95/aspect);
  camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix();
  const shadow=input.quality==='performance'?1024:detailed()?4096:2048;
  if(sun.shadow.mapSize.width!==shadow){sun.shadow.mapSize.set(shadow,shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}
  renderer.shadowMap.enabled=input.quality!=='performance';constrainCamera();needsRender=true;
 }
 function reset():void {
  extent=detailed()?13.4:16.5;fitWidth=detailed()?18.5:0;
  const actorTile=!detailed()?tiles.find(tile=>tile.id===input.player?.position):undefined;
  controls.target.set(actorTile?.x??0,detailed()?2:actorTile?.y??0,actorTile?.z??0);camera.position.copy(controls.target).add(detailed()?new THREE.Vector3(31,38,38):new THREE.Vector3(25,35,31));camera.zoom=1;constrainCamera();camera.lookAt(controls.target);controls.update();resize();
 }
 function clockNow():number {return serverTime+performance.now()-anchoredAt;}
 function ownCaravans(){return(input.view.habitable?.commerce?.caravans??[]).filter(caravan=>caravan.playerId===input.player?.id);}
 function updateCommerce(now:number){commerce?.update(ownCaravans(),now,input.reducedMotion);}
 function animate(now:number):void {
  if(disposed||contextLost)return;
  const minFrame=input.quality==='performance'?1000/30:1000/60;if(now-lastFrame<minFrame)return;
  const delta=Math.min(.08,Math.max(0,(now-lastFrame)/1000));lastFrame=now;controls.update();constrainCamera();
  const moving=!input.reducedMotion,time=now/1000;
  if(now-audioAt>100&&gameAudio.getSnapshot().ready){audioAt=now;const h=input.player?.habitable,listener={x:controls.target.x,y:controls.target.y+6,z:controls.target.z};sound.update({listener,yaw:Math.atan2(controls.target.x-camera.position.x,controls.target.z-camera.position.z),aerial:true,inside:false,biome:'forest',water:detailed()?.3:0,label:detailed()?'Tu aldea':'Mapa regional',emitters:detailed()&&h?[...villageSounds(h,clockNow()),...tutorialSounds(input.view.habitable?.job.step)]:[]});}
  settlement?.animate(time,input.reducedMotion);
  if(input.player?.habitable)habitableBuildings?.update(input.player.habitable,clockNow(),input.reducedMotion);
  stationUpgrades?.update(input.view.settlements.find(p=>p.playerId===input.player?.id)?.construction??[],clockNow(),input.reducedMotion);
  updateCommerce(clockNow());
  if(input.reducedMotion&&now-lastAuthoritativeRender>=250){const at=clockNow(),h=input.player?.habitable,active=habitableCommerceActive(ownCaravans(),at)||landDevelopmentActive(h,at)||h?.buildings.some(b=>b.endsAt>at||(b.upgrade?.endsAt??0)>at)||h?.workers?.some(w=>w.workEndsAt>at||(w.shipment?.endsAt??0)>at||(w.supply?.unloadsAt??0)>at||(w.relocation?.endsAt??0)>at||(w.daily?.endsAt??0)>at||(w.crew?.endsAt??0)>at)||input.view.settlements.some(p=>p.playerId===input.player?.id&&p.construction?.some(c=>c.endsAt>at));if(active||hadAuthoritativeActivity)needsRender=true;hadAuthoritativeActivity=!!active;lastAuthoritativeRender=now;}
  if(moving){
   if(forgeLight)forgeLight.intensity=9+Math.sin(time*7.2)*.55+Math.sin(time*12.7)*.25;
   if(forgeGlow)forgeGlow.material.opacity=.52+Math.sin(time*5.4)*.035;
   birds.forEach(({object,left,right,phase})=>{const angle=time*.075+phase;object.position.set(Math.cos(angle)*(11+phase*.4),8.5+Math.sin(time*.27+phase)*.5+phase*.18,Math.sin(angle)*6-2);object.rotation.y=Math.atan2(-Math.sin(angle)*(11+phase*.4),Math.cos(angle)*6);left.rotation.z=Math.sin(time*4.2+phase)*.48;right.rotation.z=-left.rotation.z;});
   clouds.forEach((cloud,index)=>{const origin=cloud.userData.origin as THREE.Vector3;cloud.position.x=origin.x+Math.sin(time*.035+index)*1.5;});
   smoke.forEach(puff=>{const base=puff.userData.base as THREE.Vector3;puff.position.y=base.y+((time*.24+puff.userData.phase*.3)%1)*.75;puff.position.x=base.x+Math.sin(time+puff.userData.phase)*.08;});
   waterMeshes.forEach((water,index)=>{water.position.y=tiles.find(tile=>tile.x===water.position.x&&tile.z===water.position.z)!.y+.04+Math.sin(time*.8+index)*.018;});
   if(rain&&rainData){for(let index=1;index<rainData.length;index+=3){rainData[index]-=delta*7;if(rainData[index]<0)rainData[index]=12;}rain.geometry.attributes.position.needsUpdate=true;}
   if(playerBeacon.visible)playerBeacon.children[0].rotation.y=time*.8;
  }
  for(const walker of walkers){
   if(moving&&walker.object.userData.resident){const phase=time*.11+walker.phase;walker.object.position.x=walker.home.x+Math.sin(phase)*1.35;walker.object.rotation.y=Math.cos(phase)>0?Math.PI/2:-Math.PI/2;}
   const job=walker.job;if(job&&(job.kind==='travel'||job.kind==='convoy')){
    const progress=jobProgress(job,clockNow()),point=routePoint(job.route,tiles,progress),ahead=routePoint(job.route,tiles,Math.min(1,progress+.02));
    if(point){walker.object.position.set(point.x+walker.routeOffset.x,point.y+.1,point.z+walker.routeOffset.z);if(ahead&&Math.hypot(ahead.x-point.x,ahead.z-point.z)>.001)walker.object.rotation.y=Math.atan2(ahead.x-point.x,ahead.z-point.z);}
   }
   const busy=!!job&&jobProgress(job,clockNow())<1;
   if(moving){const swing=busy||walker.object.userData.resident?Math.sin(time*7+walker.phase)*.3:Math.sin(time*1.6+walker.phase)*.04;
    const left=walker.object.getObjectByName('leftLeg'),right=walker.object.getObjectByName('rightLeg'),arm=walker.object.getObjectByName('rightArm');if(left)left.rotation.x=swing;if(right)right.rotation.x=-swing;if(arm)arm.rotation.x=job?.kind==='extract'?-Math.abs(Math.sin(time*4))*.9:-swing;
    if(walker.battleSide&&job&&busy){
     const progress=jobProgress(job,clockNow()),round=Math.min(2,Math.floor(progress*3)),roundPhase=progress*3-round;
     const thrust=Math.max(0,Math.sin(roundPhase*Math.PI*4+(walker.battleSide==='npc'?Math.PI:0))),direction=walker.battleSide==='npc'?-1:1;
     walker.object.position.x=walker.home.x+direction*thrust*.13*(detailed()?1:REGIONAL_OFFSET_SCALE);
     if(arm)arm.rotation.x=-.65-thrust*(.35+round*.08);
     const otherArm=walker.object.getObjectByName('leftArm');if(otherArm)otherArm.rotation.x=-.35+thrust*.12;
     // Three visual exchanges follow elapsed server time; outcomes, health and loot are never inferred here.
    }
   }
  }
  if(!input.reducedMotion||needsRender){renderScene();needsRender=false;statsFrames++;}
  if(now-lastStats>=1000){const size=renderer.getDrawingBufferSize(new THREE.Vector2());callbacks.onStats?.({width:size.x,height:size.y,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:Math.round(statsFrames*1000/Math.max(1,now-lastStats))});statsFrames=0;lastStats=now;}
 }
 function change():void {constrainCamera();needsRender=true;}
 function pointerDown(event:PointerEvent):void {if(event.button===0)pointerOrigin={x:event.clientX,y:event.clientY};}
 function pointerUp(event:PointerEvent):void {
  if(!pointerOrigin||Math.hypot(event.clientX-pointerOrigin.x,event.clientY-pointerOrigin.y)>6){pointerOrigin=null;return;}pointerOrigin=null;
  if(detailed())return;
  const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);
  for(const hit of raycaster.intersectObjects(stage.children,false)){
   if(typeof hit.object.userData.npcId==='string'){callbacks.onSelectNpc?.(hit.object.userData.npcId);return;}
   if(typeof hit.object.userData.settlementId==='string'){callbacks.onSelectSettlement?.(hit.object.userData.settlementId);return;}
   const tileIds=hit.object.userData.tileIds as string[]|undefined;if(tileIds&&hit.instanceId!==undefined){callbacks.onSelect?.(tileIds[hit.instanceId]);return;}
  }
 }
 function onContextLost(event:Event):void {event.preventDefault();contextLost=true;animation?.dispose();callbacks.onError?.('La tarjeta gráfica interrumpió la escena 3D. Recarga la vista o elige calidad Rendimiento.');controller.dispose();}
 function onVisibility():void {lastFrame=performance.now();needsRender=true;}
 function onKey(event:KeyboardEvent):void {
  if(event.key==='+'||event.key==='='){controller.zoom(.2);event.preventDefault();}else if(event.key==='-'){controller.zoom(-.2);event.preventDefault();}else if(event.key.toLowerCase()==='q'){controller.rotate(-1);event.preventDefault();}else if(event.key.toLowerCase()==='e'){controller.rotate(1);event.preventDefault();}
 }
 controls.addEventListener('change',change);renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('keydown',onKey);renderer.domElement.addEventListener('webglcontextlost',onContextLost);document.addEventListener('visibilitychange',onVisibility);
 const observer=new ResizeObserver(resize);observer.observe(container);
 const controller:FrontierController={
  setActive(value){sound.setActive(value);if(disposed||active===value)return;active=value;if(value){needsRender=true;lastFrame=0;lastStats=performance.now();statsFrames=0;}animation?.setActive(value);},
  update(next){if(disposed)return;const selectedChanged=input.selectedSettlementId!==next.selectedSettlementId,modeChanged=currentMode!==next.mode;input=next;anchoredAt=performance.now();serverTime=next.view.now;controls.enableDamping=!next.reducedMotion;const key=signature(next);if(key!==structuralKey){structuralKey=key;rebuild();}else{positionMarkers();updateSettlementHighlights();}if(modeChanged){currentMode=next.mode;reset();}if(!detailed()&&next.selectedSettlementId&&(selectedChanged||modeChanged))controller.focusSettlement(next.selectedSettlementId);resize();needsRender=true;},
  zoom(delta){camera.zoom=THREE.MathUtils.clamp(camera.zoom*Math.exp(delta*.22),controls.minZoom,controls.maxZoom);camera.updateProjectionMatrix();constrainCamera();needsRender=true;},
  rotate(direction){const offset=camera.position.clone().sub(controls.target).applyAxisAngle(UP,Math.sign(direction)*Math.PI/2);camera.position.copy(controls.target).add(offset);camera.lookAt(controls.target);controls.update();constrainCamera();needsRender=true;},
  reset,
  focusSelected(){if(detailed()){reset();return;}const tile=tiles.find(tile=>tile.id===input.selected);if(tile){const offset=camera.position.clone().sub(controls.target);controls.target.set(tile.x,tile.y,tile.z);camera.position.copy(controls.target).add(offset);controls.update();constrainCamera();needsRender=true;}},
  focusSettlement(id){if(detailed())return;const colony=input.view.settlements?.find(value=>value.id===id);if(!colony)return;controller.centerCoordinate(colony.plot.x,colony.plot.y);camera.zoom=8;camera.updateProjectionMatrix();constrainCamera();needsRender=true;},
  centerCoordinate(x,y){if(detailed()||!Number.isFinite(x)||!Number.isFinite(y))return;const bounds=atlasWorldBounds(input.view.settlements??[]),point=globalToAtlas(Math.max(bounds.minX,Math.min(bounds.maxX,x)),Math.max(bounds.minY,Math.min(bounds.maxY,y))),offset=camera.position.clone().sub(controls.target);controls.target.set(point.x,.15,point.z);camera.position.copy(controls.target).add(offset);constrainCamera();controls.update();needsRender=true;},
  async capture(requestWidth=3840,requestHeight=2160){
   if(disposed||contextLost)throw new Error('La escena 3D no está disponible.');
   const captureWidth=THREE.MathUtils.clamp(Math.round(requestWidth),320,3840),captureHeight=THREE.MathUtils.clamp(Math.round(requestHeight),180,3840);
   // OutputPass writes display-encoded values; an sRGB framebuffer here would
   // encode those a second time and wash out the exported lighting.
   const target=new THREE.WebGLRenderTarget(captureWidth,captureHeight,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:false});
   const previousTarget=renderer.getRenderTarget(),left=camera.left,right=camera.right,top=camera.top,bottom=camera.bottom,aspect=captureWidth/captureHeight,vertical=detailed()?Math.min(24,Math.max(extent,fitWidth/aspect)):(top-bottom)/2;
   try{
    camera.left=-vertical*aspect;camera.right=vertical*aspect;camera.top=vertical;camera.bottom=-vertical;camera.updateProjectionMatrix();updateCommerce(clockNow());renderScene(target);
    const pixels=new Uint8Array(captureWidth*captureHeight*4);renderer.readRenderTargetPixels(target,0,0,captureWidth,captureHeight,pixels);
    const canvas=document.createElement('canvas');canvas.width=captureWidth;canvas.height=captureHeight;const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo crear la captura.');
    const image=context.createImageData(captureWidth,captureHeight),row=captureWidth*4;for(let y=0;y<captureHeight;y++)image.data.set(pixels.subarray((captureHeight-y-1)*row,(captureHeight-y)*row),y*row);context.putImageData(image,0,0);
    // Return the encoding promise so finally restores the live viewport immediately.
    return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo exportar la captura.')),'image/png'));
   }finally{renderer.setRenderTarget(previousTarget);camera.left=left;camera.right=right;camera.top=top;camera.bottom=bottom;camera.updateProjectionMatrix();target.dispose();needsRender=true;}
  },
  dispose(){
   if(disposed)return;disposed=true;sound.dispose();animation?.dispose();observer.disconnect();controls.removeEventListener('change',change);controls.dispose();document.removeEventListener('visibilitychange',onVisibility);
   renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',onKey);renderer.domElement.removeEventListener('webglcontextlost',onContextLost);
   clearStage();cinematic?.dispose();for(const geometry of ownGeometries)geometry.dispose();for(const mat of ownMaterials)mat.dispose();for(const texture of ownTextures)texture.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
  },
 };
 try{structuralKey=signature(input);rebuild();reset();animation=createViewerFrameLoop(animate);animation.setActive(active);return controller;}catch(error){controller.dispose();throw error;}
}
