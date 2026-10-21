import * as THREE from 'three';
import {ROYAL_WORLD_LOCATION,royalWorldContains,royalContextZoom} from './royal-world-location.ts';
import {createViewerFrameLoop} from './viewer-lifecycle.ts';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { FrontierController } from './renderer.ts';
import type { RenderStats, SceneInput } from './scene-data.ts';
import { createPlanetSurface,createPlanetSurfaceAsync,type PlanetSurface } from './planet-surface.ts';
import type {GraphicsBuildOptions} from './graphics-build.ts';
import { PLANET_RADIUS, PLANET_ZOOM_LEVELS, worldToPlanet } from './planet-data.ts';
import { clampWorldPoint, planetVectorToWorld } from './world-navigation.ts';
import { getBiomeStyle, sampleWorld, WORLD_LANDMARKS } from './world-geography.ts';
import { LIVING_ZONE } from './living-zone-data.ts';
import { INHABITED_PLACES } from './inhabited-world-data.ts';
import { FISHING_COMMUNITY } from './fishing-community-data.ts';
import { FISHING_COMMUNITIES, FISHING_NETWORK_PLACES, fishingCommunityForPlace, fishingCommunityForActivity, fishingCommunitySnapshot } from './fishing-network-data.ts';
import type { FishingState } from './fishing-community.ts';
import { cameraTilt, type CameraMode } from './world-camera.ts';
export type { CameraMode } from './world-camera.ts';
import { createWorldTerrainRenderer, type WorldTerrainController } from './world-terrain-renderer.ts';

export interface PlanetController extends FrontierController {
  setZoomLevel(level: number): void;
  flyToSettlement(id: string): void;
  getZoomLevel(): number;
  pan(dx: number, dy: number): void;
  setCameraMode(mode:CameraMode):void;
  getCameraMode():CameraMode;
  setTilt(degrees:number):void;
  followActivity(id:string|null):void;
  getFishingState():FishingState|null;
}
export interface PlanetState { level: number; flying: boolean; label: string }
export interface ObservedLocation { x: number; y: number; biome: string; settlementId?: string; placeId?: string }
export interface PlanetCallbacks {
  onSelect?: (id: string) => void;
  onSelectSettlement?: (id: string) => void;
  onSelectNpc?: (id: string) => void;
  onLocation?: (point: ObservedLocation) => void;
  onStats?: (stats: RenderStats) => void;
  onError?: (message: string) => void;
  onPlanetState?: (state: PlanetState) => void;
  onCameraState?: (state:{mode:CameraMode;tilt:number})=>void;
  onFishingState?:(state:FishingState)=>void;
}
type Destination = { x: number; y: number; id?: string };
type Flight = { start: number; fromLevel: number; toLevel: number; from: THREE.Vector3; to: THREE.Vector3; target: Destination };
type Pin = { object: THREE.Mesh; normal: THREE.Vector3; id: string; ambient: boolean };
const ease = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t*t*(3-2*t); };
const WORLD_START = 5.65;
const ATLAS_PLACES=[...WORLD_LANDMARKS,...FISHING_NETWORK_PLACES,ROYAL_WORLD_LOCATION];
const SETTLEMENT_BOUNDS=[{...LIVING_ZONE.city,kind:'city'},{...LIVING_ZONE.village,kind:'village'},...INHABITED_PLACES,...FISHING_NETWORK_PLACES];

/** One observed geographic position drives orbit, local terrain and coordinates.
 * Looking at another place never changes the explorer, inventory or server jobs. */
export async function createPlanetRendererAsync(container:HTMLElement,initial:SceneInput,callbacks:PlanetCallbacks={},options:GraphicsBuildOptions={}):Promise<PlanetController>{
  const surface=await createPlanetSurfaceAsync(initial.quality,options);
  if(options.signal?.aborted){surface.dispose();throw new DOMException('Vista cancelada.','AbortError');}
  try{return createPlanetRenderer(container,initial,callbacks,surface);}catch(error){surface.dispose();throw error;}
}
export function createPlanetRenderer(container: HTMLElement, initial: SceneInput, callbacks: PlanetCallbacks = {},preparedSurface?:PlanetSurface): PlanetController {
  let animation:ReturnType<typeof createViewerFrameLoop>|null=null,active=true;
  let input = initial, disposed = false, level = 2, flight: Flight | null = null,orbitalParked=false;
  let lastFrame = 0, lastStats = 0, frames = 0, animationTime = 0, needsRender = true;
  let stateKey = '', locationKey = '', lastLocation = 0, markersKey = '';
  let observed: Destination = { x: 0, y: 0 },cameraMode:CameraMode='3d',terrainTilt=53;
  let terrain: WorldTerrainController | null = null, terrainFocusDirty = true, terrainZoom = -1, terrainSuspended = false, syncingTerrain = false;
  const host = document.createElement('div');
  host.style.cssText='position:absolute;inset:0;z-index:2;opacity:0;pointer-events:none;transition:opacity 240ms ease';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030b13);
  const camera = new THREE.PerspectiveCamera(42,1,.15,14000);
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','Planeta Frontera. Arrastra para orbitar y selecciona cualquier lugar de la superficie.');
  container.appendChild(renderer.domElement);container.appendChild(host);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enablePan=false;controls.enableZoom=false;controls.enableDamping=!input.reducedMotion;controls.dampingFactor=.08;
  controls.minDistance=PLANET_RADIUS+.1;controls.maxDistance=4000;
  const sun=new THREE.DirectionalLight(0xffe3ba,3.4);sun.position.set(700,550,900);scene.add(sun,new THREE.HemisphereLight(0xa5c9e6,0x172e29,.7));
  let surface=preparedSurface??createPlanetSurface(input.quality),surfaceBuild:AbortController|null=null,surfacePromise:Promise<void>|null=null,surfaceQuality=input.quality;scene.add(surface.group);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const pinGeometry=new THREE.SphereGeometry(.25,10,8);geometries.add(pinGeometry);
  const markerGroup=new THREE.Group();scene.add(markerGroup);const pins:Pin[]=[];const markerMaterials=new Set<THREE.Material>();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),direction=new THREE.Vector3(1,0,0);
  const pointers=new Map<number,{x:number;y:number}>();let pointerStart:{x:number;y:number}|null=null,pinchDistance=0;
  function vector(x:number,y:number){const p=worldToPlanet(x,y,1);return new THREE.Vector3(p.x,p.y,p.z);}
  function ownDestination():Destination {const own=input.view.settlements.find(value=>value.playerId===input.player?.id);return own?{id:own.id,x:own.plot.x,y:own.plot.y}:{x:0,y:0};}
  function targetFor(id:string):Destination|null {const real=input.view.settlements.find(value=>value.id===id);if(real)return{id,x:real.plot.x,y:real.plot.y};const place=ATLAS_PLACES.find(value=>value.id===id);return place?{id,x:place.x,y:place.y}:null;}
  function nearby(){
    const real=input.view.settlements.filter(value=>Math.abs(value.plot.x-observed.x)<=value.plot.width/2&&Math.abs(value.plot.y-observed.y)<=value.plot.depth/2).sort((a,b)=>Math.hypot(a.plot.x-observed.x,a.plot.y-observed.y)-Math.hypot(b.plot.x-observed.x,b.plot.y-observed.y))[0];
    const place=ATLAS_PLACES.filter(value=>{if(value.id===ROYAL_WORLD_LOCATION.id)return royalWorldContains(observed.x,observed.y);const site=fishingCommunityForPlace(value.id);if(site?.id===value.id){const point=site.toTemplate(observed);if(Math.abs(point.x-FISHING_COMMUNITY.dock.x)<45&&Math.abs(point.y-FISHING_COMMUNITY.dock.y)<35)return true;}const bounds=SETTLEMENT_BOUNDS.find(p=>p.id===value.id);return bounds?Math.abs(value.x-observed.x)<=bounds.width/2+5&&Math.abs(value.y-observed.y)<=bounds.depth/2+5:Math.hypot(value.x-observed.x,value.y-observed.y)<30;}).sort((a,b)=>Math.hypot(a.x-observed.x,a.y-observed.y)-Math.hypot(b.x-observed.x,b.y-observed.y))[0];
    return {real,place};
  }
  function notify(force=false){
    const info=sampleWorld(observed.x,observed.y),near=nearby(),local=level>=WORLD_START;
    const label=local?(near.real?`${near.real.name}${near.real.playerId===input.player?.id?' · Mi aldea':''}`:near.place?near.place.name:getBiomeStyle(info.biome).label):PLANET_ZOOM_LEVELS[Math.max(0,Math.min(9,Math.round(level)-1))].label;
    const state={level:Math.round(level),flying:!!flight,label},key=JSON.stringify(state);if(key!==stateKey){stateKey=key;callbacks.onPlanetState?.(state);}
    const point={x:observed.x,y:observed.y,biome:info.biome,settlementId:near.real?.id,placeId:near.place?.id},pointKey=`${Math.round(point.x)}:${Math.round(point.y)}:${point.biome}:${point.settlementId??''}:${point.placeId??''}`;
    if(force||(pointKey!==locationKey&&performance.now()-lastLocation>100)){locationKey=pointKey;lastLocation=performance.now();callbacks.onLocation?.(point);}
  }
  function setObserved(x:number,y:number,external=true){observed=clampWorldPoint(x,y);direction.copy(vector(observed.x,observed.y));if(external)terrainFocusDirty=true;notify();}
  function observedFromCamera(){const p=planetVectorToWorld(camera.position);setObserved(p.x,p.y,true);}
  function releaseTerrain(){const hadTerrain=terrain!==null;terrain?.dispose();terrain=null;terrainZoom=-1;host.style.opacity='0';host.style.pointerEvents='none';terrainFocusDirty=true;terrainSuspended=false;if(hadTerrain)callbacks.onFishingState?.({available:false,communityName:FISHING_COMMUNITY.name,activities:[],followedId:null});}
  function refreshActivity(){const parked=!!terrain&&level>=6.2&&!flight;if(parked!==orbitalParked){orbitalParked=parked;resize();}animation?.setActive(active&&(level<6.2||!!flight));terrain?.setActive(active&&level>=WORLD_START);}
  function compose(forceUpdate=false){
    if(level<WORLD_START){host.style.opacity='0';host.style.pointerEvents='none';if(level<5.25)releaseTerrain();else if(terrain&&!terrainSuspended){terrain.update({...input,reducedMotion:true});terrainSuspended=true;}controls.enabled=!flight;}
    else{
      controls.enabled=false;
      if(!terrain){
        const desiredMode=cameraMode,desiredTilt=terrainTilt;syncingTerrain=true;
        try { terrain=createWorldTerrainRenderer(host,{...input,reducedMotion:input.reducedMotion||!!flight},{
          onSelectSettlement:id=>callbacks.onSelectSettlement?.(id),onSelectNpc:id=>callbacks.onSelectNpc?.(id),
          onLocation:p=>{if(syncingTerrain)return;setObserved(p.x,p.y,false);needsRender=true;},
          onCameraState:state=>{cameraMode=state.mode;terrainTilt=state.tilt;callbacks.onCameraState?.(state);},
          onStats:stats=>{if(level>=WORLD_START)callbacks.onStats?.(stats);},onError:callbacks.onError,
          onFishingState:state=>callbacks.onFishingState?.(state),
        },observed); } finally { syncingTerrain=false; }
        terrain.setTilt(desiredTilt);terrain.setCameraMode(desiredMode);terrainFocusDirty=true;terrainZoom=-1;
      }else if(forceUpdate||terrainSuspended){terrain.update({...input,reducedMotion:input.reducedMotion||!!flight});terrainSuspended=false;}
      if(terrainFocusDirty){terrainFocusDirty=false;syncingTerrain=true;try{terrain.setFocus(observed.x,observed.y);}finally{syncingTerrain=false;}}
      if(terrainZoom!==level){terrainZoom=level;terrain.setZoomLevel(level);}
      host.style.opacity=String(ease((level-WORLD_START)/.55));host.style.pointerEvents=flight?'none':'auto';
    }
    needsRender=true;notify();refreshActivity();
  }
  function updateCamera(){const display=Math.min(level,5.9),a=Math.max(0,Math.floor(display)-1),b=Math.min(9,a+1),t=display-a-1,altitude=Math.exp(THREE.MathUtils.lerp(Math.log(PLANET_ZOOM_LEVELS[a].altitude),Math.log(PLANET_ZOOM_LEVELS[b].altitude),t));camera.position.copy(direction).multiplyScalar(PLANET_RADIUS+altitude);camera.lookAt(0,0,0);controls.target.set(0,0,0);camera.updateMatrixWorld();}
  function cancelFlight(){if(!flight)return;flight=null;compose(true);notify(true);}
  function setLevel(value:number){if(!Number.isFinite(value))return;if(level<WORLD_START&&!flight)observedFromCamera();level=THREE.MathUtils.clamp(value,1,10);updateCamera();compose();}
  function baseFramingLevel(target:Destination,fallback:number){if(target.id===ROYAL_WORLD_LOCATION.id)return 6.2;if(target.id&&input.view.settlements.some(p=>p.id===target.id))return fallback;if(FISHING_COMMUNITIES.some(site=>Math.hypot(target.x-site.dock.x,target.y-site.dock.y)<.001))return 7.8;const place=SETTLEMENT_BOUNDS.find(value=>value.id===target.id||Math.hypot(value.x-target.x,value.y-target.y)<.001);if(!place)return fallback;if(fishingCommunityForPlace(place.id)?.id===place.id)return 6.2;if(place.kind==='city')return 6.2;const size=Math.max(place.width,place.depth);return size<=64?8:size<=82?7.6:7.4;}
  function framingLevel(target:Destination,fallback:number){const base=baseFramingLevel(target,fallback);return target.id===ROYAL_WORLD_LOCATION.id?base:royalContextZoom(target.x,target.y,base);}
  function fly(target:Destination,toLevel=10){
    terrain?.focusActivity(null);
    toLevel=framingLevel(target,toLevel);
    if(flight&&flight.target.id===target.id&&Math.hypot(flight.target.x-target.x,flight.target.y-target.y)<.001)return;
    if(level<WORLD_START)observedFromCamera();
    if(input.reducedMotion){flight=null;setObserved(target.x,target.y);level=toLevel;updateCamera();compose(true);notify(true);return;}
    flight={start:performance.now(),fromLevel:level,toLevel,from:direction.clone(),to:vector(target.x,target.y),target};compose(true);notify(true);
  }
  function updatePins(){
    const key=JSON.stringify(input.view.settlements.map(value=>[value.id,value.plot,value.faction]));
    if(key!==markersKey){markersKey=key;markerGroup.clear();pins.length=0;markerMaterials.forEach(mat=>mat.dispose());markerMaterials.clear();
      const add=(id:string,x:number,y:number,color:number,ambient:boolean)=>{const normal=vector(x,y),mat=new THREE.MeshBasicMaterial({color});markerMaterials.add(mat);const object=new THREE.Mesh(pinGeometry,mat);object.position.copy(normal).multiplyScalar(PLANET_RADIUS+1.2);markerGroup.add(object);pins.push({object,normal,id,ambient});};
      input.view.settlements.forEach(value=>add(value.id,value.plot.x,value.plot.y,value.own?0xffdc81:0x8ed5c2,false));
      ATLAS_PLACES.forEach(value=>add(value.id,value.x,value.y,value.kind==='city'?0xffd28a:value.kind==='cave'?0xabb5bf:0xb7c7ad,true));
    }
    const normal=camera.position.clone().normalize();pins.forEach(pin=>{pin.object.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(pin.object.position)/230,.12,2.4));pin.object.visible=level<5.8&&pin.normal.dot(normal)>.12;});
  }
  function resize(){if(disposed)return;const rect=container.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),limit=input.quality==='4k'?3840:input.quality==='performance'?1280:1920;renderer.setPixelRatio(orbitalParked?1:Math.min(window.devicePixelRatio||1,limit/Math.max(w,h),input.quality==='performance'?1:2));renderer.setSize(orbitalParked?1:w,orbitalParked?1:h,false);camera.aspect=w/h;camera.updateProjectionMatrix();needsRender=true;}
  function space(){
    let seed=47193;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),stars=new Float32Array(4200*3),colors=new Float32Array(4200*3);
    for(let i=0;i<4200;i++){const z=random()*2-1,a=random()*Math.PI*2,r=Math.sqrt(1-z*z),d=4800+random()*800;stars.set([Math.cos(a)*r*d,z*d,Math.sin(a)*r*d],i*3);const c=new THREE.Color(i%5===0?0xa8c6e8:i%7===0?0xe8d6ac:0xdbe4ea);colors.set([c.r,c.g,c.b],i*3);}
    const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(stars,3));sg.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.add(sg);const sm=new THREE.PointsMaterial({size:3.5,vertexColors:true,sizeAttenuation:true,depthWrite:false});materials.add(sm);scene.add(new THREE.Points(sg,sm));
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
    for(let i=0;i<3;i++){const g=new THREE.SphereGeometry([95,145,65][i],28,20),m=new THREE.MeshStandardMaterial({color:[0xa65f42,0xb4a17a,0x5f8d96][i],roughness:1});geometries.add(g);materials.add(m);const body=new THREE.Mesh(g,m);body.position.copy(direction).multiplyScalar(-700-i*150).addScaledVector(right,[1050,-1200,1450][i]).addScaledVector(up,[-400,-220,550][i]);scene.add(body);if(i===1){const rg=new THREE.RingGeometry(175,245,64),rm=new THREE.MeshBasicMaterial({color:0xc4b28c,transparent:true,opacity:.45,side:THREE.DoubleSide});geometries.add(rg);materials.add(rm);const ring=new THREE.Mesh(rg,rm);ring.rotation.x=1.1;body.add(ring);}}
    const sunGeometry=new THREE.SphereGeometry(115,32,24),sunMaterial=new THREE.MeshBasicMaterial({color:0xffd887});geometries.add(sunGeometry);materials.add(sunMaterial);const star=new THREE.Mesh(sunGeometry,sunMaterial);star.position.copy(direction).multiplyScalar(300).addScaledVector(right,-1080).addScaledVector(up,640);scene.add(star);
    const size=64,pixels=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const o=(y*size+x)*4,r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);pixels.set([255,173,61,Math.round(Math.pow(Math.max(0,1-r),2)*210)],o);}const tex=new THREE.DataTexture(pixels,size,size);tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;textures.add(tex);const hm=new THREE.SpriteMaterial({map:tex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true});materials.add(hm);const halo=new THREE.Sprite(hm);halo.position.copy(star.position);halo.scale.setScalar(620);scene.add(halo);
  }
  function draw(now:number){
    if(disposed)return;const interval=input.quality==='performance'?1000/30:1000/60;if(now-lastFrame<interval)return;const delta=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;if(!input.reducedMotion)animationTime+=delta;
    if(flight){const f=flight,t=Math.min(1,(now-f.start)/4300),q=new THREE.Quaternion().setFromUnitVectors(f.from,f.to);direction.copy(f.from).applyQuaternion(new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(),q,ease(t)));const p=planetVectorToWorld(direction);observed=clampWorldPoint(p.x,p.y);const departure=Math.min(f.fromLevel,3.2);level=f.fromLevel>5.6&&t<.25?THREE.MathUtils.lerp(f.fromLevel,departure,ease(t/.25)):THREE.MathUtils.lerp(departure,f.toLevel,ease(f.fromLevel>5.6?(t-.25)/.75:t));terrainFocusDirty=true;updateCamera();compose();if(t===1){observed={x:f.target.x,y:f.target.y};direction.copy(f.to);flight=null;terrainFocusDirty=true;compose(true);notify(true);}}
    else if(level<WORLD_START){controls.update();observedFromCamera();}
    if(level<6.2&&(!input.reducedMotion||needsRender||flight)){surface.animate(animationTime,false);updatePins();renderer.render(scene,camera);needsRender=false;frames++;if(now-lastStats>1000){const size=renderer.getDrawingBufferSize(new THREE.Vector2());callbacks.onStats?.({width:size.x,height:size.y,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps:Math.round(frames*1000/Math.max(1,now-lastStats))});lastStats=now;frames=0;}}
  }
  function down(e:PointerEvent){if((e.target as HTMLElement).closest?.('button'))return;terrain?.focusActivity(null);cancelFlight();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)pointerStart={x:e.clientX,y:e.clientY};if(pointers.size===2){pointerStart=null;const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}}
  function move(e:PointerEvent){if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinchDistance>0)setLevel(level+Math.log(Math.max(1,d)/pinchDistance)*2);pinchDistance=d;e.stopPropagation();}}
  function up(e:PointerEvent){if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(pointers.size)return;const start=pointerStart;pointerStart=null;if(!start||Math.hypot(start.x-e.clientX,start.y-e.clientY)>6||level>=WORLD_START)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hitPin=raycaster.intersectObjects(pins.filter(p=>p.object.visible).map(p=>p.object),false)[0];if(hitPin){const pin=pins.find(p=>p.object===hitPin.object)!;if(pin.ambient)callbacks.onSelectNpc?.(pin.id);else callbacks.onSelectSettlement?.(pin.id);const target=targetFor(pin.id);if(target)fly(target);return;}const hit=raycaster.intersectObject(surface.planet,false)[0];if(hit){const p=planetVectorToWorld(hit.point);fly(clampWorldPoint(p.x,p.y),9);}}
  function wheel(e:WheelEvent){if((e.target as HTMLElement).closest?.('button'))return;e.preventDefault();e.stopPropagation();cancelFlight();setLevel(level+(e.deltaY<0?.35:-.35));}
  function key(e:KeyboardEvent){if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();e.stopPropagation();cancelFlight();setLevel(level+(e.key==='-'?-1:1));}}
  function lost(e:Event){e.preventDefault();callbacks.onError?.('El navegador interrumpió la vista. Reiniciá el mundo 3D para continuar.');controller.dispose();}
  const changed=()=>{needsRender=true;if(!flight&&level<WORLD_START)observedFromCamera();};controls.addEventListener('change',changed);
  container.addEventListener('pointerdown',down,true);container.addEventListener('pointermove',move,true);container.addEventListener('pointerup',up,true);container.addEventListener('pointercancel',up,true);container.addEventListener('wheel',wheel,{capture:true,passive:false});container.addEventListener('keydown',key,true);renderer.domElement.addEventListener('webglcontextlost',lost);
  const observer=new ResizeObserver(resize);observer.observe(container);
  const controller:PlanetController={
    setActive(value){if(disposed||active===value)return;active=value;if(value){needsRender=true;lastFrame=0;lastStats=performance.now();frames=0;}refreshActivity();},
    update(next){if(disposed)return;const playerChanged=input.player?.id!==next.player?.id,qualityChanged=input.quality!==next.quality;input=next;controls.enableDamping=!input.reducedMotion;if(qualityChanged){surfaceBuild?.abort();const build=new AbortController();surfaceBuild=build;surfacePromise=createPlanetSurfaceAsync(next.quality,{signal:build.signal}).then(value=>{if(disposed||build.signal.aborted){value.dispose();return;}scene.remove(surface.group);surface.dispose();surface=value;surfaceQuality=next.quality;scene.add(surface.group);needsRender=true;}).catch(()=>{/* A newer quality or disposed viewer cancels the old CPU task. */});}if(playerChanged){flight=null;const own=ownDestination();setObserved(own.x,own.y);level=2;updateCamera();}if(flight&&input.reducedMotion){const target=flight.target,zoom=flight.toLevel;flight=null;setObserved(target.x,target.y);level=zoom;updateCamera();}compose(true);updatePins();resize();},
    zoom(delta){cancelFlight();setLevel(level+Math.sign(delta));},setZoomLevel(value){cancelFlight();setLevel(value);},getZoomLevel(){return Math.round(level);},
    reset(){terrain?.focusActivity(null);cancelFlight();level=2;direction.copy(vector(observed.x,observed.y));updateCamera();compose();notify(true);},
    rotate(side){if(terrain&&level>=WORLD_START)terrain.rotate(side);else{cancelFlight();direction.applyAxisAngle(new THREE.Vector3(0,1,0),Math.sign(side)*Math.PI/4);const p=planetVectorToWorld(direction);setObserved(p.x,p.y);updateCamera();}needsRender=true;},
    setCameraMode(mode){if(disposed||(mode!=='2d'&&mode!=='3d'))return;cancelFlight();if(level<WORLD_START)observedFromCamera();cameraMode=mode;if(mode==='2d'&&level<WORLD_START){level=7;updateCamera();}compose();terrain?.setCameraMode(mode);callbacks.onCameraState?.({mode,tilt:terrainTilt});notify(true);},
    getCameraMode(){return cameraMode;},
    setTilt(degrees){if(disposed||!Number.isFinite(degrees))return;terrainTilt=cameraTilt(degrees);terrain?.setTilt(terrainTilt);callbacks.onCameraState?.({mode:cameraMode,tilt:terrainTilt});},
    getFishingState(){return terrain?.getFishingState()??null;},
    followActivity(id){
      cancelFlight();
      if(id===null){terrain?.focusActivity(null);return;}
      const site=fishingCommunityForActivity(id);
      let activity:{x:number;y:number}|undefined=terrain?.getFishingState().activities.find(value=>value.id===id);
      if(!activity&&site){const snapshot=fishingCommunitySnapshot(site.id,input.view.now/1000);activity=[...snapshot.boats,...snapshot.carts,...snapshot.workers].find(value=>value.id===id);}
      if(!activity)return;
      terrain?.focusActivity(null);setObserved(activity.x,activity.y);level=Math.max(8.7,level);updateCamera();compose(true);terrain?.focusActivity(id);notify(true);
    },
    focusSelected(){fly(observed,9);},
    pan(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;terrain?.focusActivity(null);cancelFlight();setObserved(observed.x+dx,observed.y+dy);level=Math.max(7,level);updateCamera();compose();notify(true);},
    focusSettlement(id){const target=targetFor(id);if(target)fly(target);},
    flyToSettlement(id){const target=targetFor(id);if(target)fly(target);},
    centerCoordinate(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return;fly(clampWorldPoint(x,y),9);},
    async capture(requestWidth=3840,requestHeight=2160){if(disposed)throw new Error('La vista no está disponible.');if(terrain&&level>=6)return terrain.capture(requestWidth,requestHeight);while(surfacePromise){const pending=surfacePromise;await pending;if(disposed)throw new Error('La vista no está disponible.');if(surfacePromise===pending)break;}if(surfaceQuality!==input.quality)throw new Error('La calidad seleccionada todavía no está disponible.');const w=Math.max(320,Math.min(3840,Math.round(requestWidth))),h=Math.max(180,Math.min(3840,Math.round(requestHeight))),target=new THREE.WebGLRenderTarget(w,h);target.texture.colorSpace=THREE.SRGBColorSpace;const previous=renderer.getRenderTarget(),aspect=camera.aspect;try{camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setRenderTarget(target);renderer.render(scene,camera);const data=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(target,0,0,w,h,data);const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo crear la captura.');const image=ctx.createImageData(w,h);for(let y=0;y<h;y++)image.data.set(data.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);ctx.putImageData(image,0,0);return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se pudo exportar la captura.')),'image/png'));}finally{renderer.setRenderTarget(previous);target.dispose();camera.aspect=aspect;camera.updateProjectionMatrix();needsRender=true;}},
    dispose(){if(disposed)return;disposed=true;surfaceBuild?.abort();animation?.dispose();observer.disconnect();releaseTerrain();controls.removeEventListener('change',changed);controls.dispose();surface.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());markerMaterials.forEach(m=>m.dispose());renderer.domElement.removeEventListener('webglcontextlost',lost);container.removeEventListener('pointerdown',down,true);container.removeEventListener('pointermove',move,true);container.removeEventListener('pointerup',up,true);container.removeEventListener('pointercancel',up,true);container.removeEventListener('wheel',wheel,true);container.removeEventListener('keydown',key,true);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();host.remove();},
  };
  try{observed=ownDestination();direction.copy(vector(observed.x,observed.y));space();updateCamera();updatePins();resize();animation=createViewerFrameLoop(draw);refreshActivity();notify(true);callbacks.onCameraState?.({mode:cameraMode,tilt:terrainTilt});return controller;}catch(error){controller.dispose();throw error;}
}
