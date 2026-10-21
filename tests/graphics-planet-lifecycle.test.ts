import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import type {createPlanetRenderer,PlanetCallbacks} from '../lib/graphics/planet-renderer.ts';

const require=createRequire(import.meta.url);
class Element extends EventTarget {width=1;height=1;getContext(){return{createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};}toBlob(callback:(blob:Blob)=>void){callback(new Blob(['image'],{type:'image/png'}));}style:{cssText?:string;opacity?:string;pointerEvents?:string}={};tabIndex=0;children:Element[]=[];setAttribute(){}appendChild(child:Element){this.children.push(child);}remove(){}getBoundingClientRect(){return{width:800,height:600,left:0,top:0};}}
class HeadlessControls extends OrbitControls {constructor(camera:THREE.Camera){super(camera);}override dispose(){/* No DOM was connected. */}}
const renderers:HeadlessRenderer[]=[],surfaceBuilds:{quality:string;resolve:()=>void}[]=[];
class HeadlessRenderer {constructor(){renderers.push(this);}sizes:number[][]=[];shadowMap={enabled:false,type:0};domElement=new Element();outputColorSpace='';toneMapping=0;toneMappingExposure=1;info={render:{calls:1,triangles:1}};lastRenderedQuality:unknown;setPixelRatio(){}setSize(width:number,height:number){this.sizes.push([width,height]);}getRenderTarget(){return null;}setRenderTarget(){}readRenderTargetPixels(){}render(scene:THREE.Scene){this.lastRenderedQuality=scene.children.find(child=>child.name==='qfrontier-living-planet')?.userData.quality;}getDrawingBufferSize(target:THREE.Vector2){return target.set(800,600);}dispose(){}forceContextLoss(){}}
function setup(){
  renderers.length=0;surfaceBuilds.length=0;let clock=0;const loops:{draw:(now:number)=>void;active:boolean;disposed:boolean}[]=[],locations:{x:number;y:number}[]=[],terrainFocus:{x:number;y:number}[]=[];
  const file=new URL('../lib/graphics/planet-renderer.ts',import.meta.url),exports:{createPlanetRenderer?:typeof createPlanetRenderer}={};
  const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const load=(id:string):unknown=>{
    if(id==='three')return{...THREE,WebGLRenderer:HeadlessRenderer};
    if(id==='three/addons/controls/OrbitControls.js')return{OrbitControls:HeadlessControls};
    if(id==='./viewer-lifecycle.ts')return{createViewerFrameLoop:(draw:(now:number)=>void)=>{const loop={draw,active:true,disposed:false};loops.push(loop);return{setActive:(active:boolean)=>{loop.active=active;},dispose:()=>{loop.disposed=true;}};}};
    if(id==='./planet-surface.ts'){const surface=(quality:string)=>{const group=new THREE.Group();group.name='qfrontier-living-planet';group.userData.quality=quality;return{group,planet:new THREE.Mesh(new THREE.SphereGeometry(100)),animate(){},dispose(){}};};return{createPlanetSurface:surface,createPlanetSurfaceAsync:(quality:string,options:{signal:AbortSignal})=>new Promise((resolve,reject)=>{surfaceBuilds.push({quality,resolve:()=>resolve(surface(quality))});options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});})};}
    if(id==='./world-terrain-renderer.ts'){
      let source=readFileSync(new URL('../lib/graphics/world-terrain-renderer.ts',import.meta.url),'utf8');
      const start=source.indexOf('  function stream(force=false)'),body=source.indexOf('{',start);let end=body+1,depth=1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
      if(start<0)throw new Error('Missing streaming seam');source=source.slice(0,start)+'  function stream(force=false){ }'+source.slice(end);
      const result:{createWorldTerrainRenderer?:unknown}={},code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      const factory=()=>({group:new THREE.Group(),dispose(){},setClipRegion(){},update(){},follow(){},setView(){},animate(){},getState(){return{activities:[]};}});
      const terrainLoad=(dependency:string):unknown=>{
        if(dependency==='./world-models.ts')return{createWorldAssetLibrary:()=>({get:()=>new THREE.Group(),dispose(){}})};
        if(dependency==='./biome-settlement-models.ts')return{createBiomeSettlementLibrary:()=>({get:()=>new THREE.Group(),dispose(){}})};
        if(dependency==='./fishing-network.ts')return{createFishingNetworkRenderer:factory};
        if(dependency==='./habitable-commerce.ts')return{createHabitableCommerceLayer:factory,createHabitableTradeClearance:()=>({}),habitableCommerceRouteKey:()=>'',habitableCommerceActive:()=>false};
        return load(dependency);
      };
      new Function('require','exports',code)(terrainLoad,result);return result;
    }
    return id.startsWith('.')?require(fileURLToPath(new URL(id,new URL('../lib/graphics/planet-renderer.ts',import.meta.url)))):require(id);
  };
  new Function('require','exports',output)(load,exports);
  const priorWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),priorResize=Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver');
  const headlessWindow=Object.assign(new EventTarget(),{devicePixelRatio:1}),headlessDocument=Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Element()});
  Object.defineProperty(globalThis,'window',{configurable:true,value:headlessWindow});Object.defineProperty(globalThis,'document',{configurable:true,value:headlessDocument});Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}disconnect(){}}});
  const now=mock.method(performance,'now',()=>clock);
  const world=createMvpWorld('owner',1_780_000_000_000),player=createPlayer(world,{ownerId:'owner',requestId:'focus',now:1_780_000_000_000,actor:null},{type:'player.create',name:'Ana',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',1_780_000_000_000,player.id);
  const input:SceneInput={view,player:view.player,mode:'world',selected:player.position,quality:'auto',reducedMotion:false};
  const callbacks:PlanetCallbacks={onLocation:point=>locations.push({x:point.x,y:point.y})};
  const container=new Element(),controller=exports.createPlanetRenderer!(container as unknown as HTMLElement,input,callbacks);
  return{controller,input,locations,terrainFocus,renderers,surfaceBuilds,interrupt(){const event=new Event('pointerdown');Object.assign(event,{pointerId:1,clientX:20,clientY:20});container.dispatchEvent(event);},step(time:number){clock=time;for(const loop of [...loops])if(loop.active&&!loop.disposed)loop.draw(time);},dispose(){controller.dispose();now.mock.restore();for(const[key,value]of[['window',priorWindow],['document',priorDocument],['ResizeObserver',priorResize]]as const){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}}};
}

test('opaque local terrain parks only the hidden orbital drawing buffer and restores it before leaving the ground',()=>{
 const viewer=setup();try{
  viewer.controller.focusSettlement('world-reino-del-hielo');for(let time=40;time<=5000;time+=40)viewer.step(time);
  assert.equal(viewer.renderers.length,2);assert.deepEqual(viewer.renderers[0].sizes.at(-1),[1,1]);assert.deepEqual(viewer.renderers[1].sizes.at(-1),[800,600]);
  const before=viewer.locations.at(-1)!;assert.ok(Math.hypot(before.x-10176,before.y+13248)<.01);
  viewer.controller.setZoomLevel(2);assert.deepEqual(viewer.renderers[0].sizes.at(-1),[800,600]);viewer.step(5100);
  const after=viewer.locations.at(-1)!;assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<.01,'resizing a hidden buffer must never reset the observed planet coordinates');
 }finally{viewer.dispose();}
});

test('an immediate orbital capture waits for the latest requested 4K surface instead of exporting the old performance maps',async()=>{
 const viewer=setup();try{
  viewer.controller.update({...viewer.input,quality:'performance'});viewer.controller.update({...viewer.input,quality:'4k'});assert.equal(viewer.surfaceBuilds.length,2);
  let completed=false;const capture=viewer.controller.capture(320,180).then(blob=>{completed=true;return blob;});await Promise.resolve();assert.equal(completed,false);viewer.surfaceBuilds[1].resolve();const blob=await capture;assert.equal(blob.type,'image/png');assert.equal(viewer.renderers[0].lastRenderedQuality,'4k');
 }finally{viewer.dispose();}
});
test('disposing during a pending quality capture rejects it and never renders a released surface',async()=>{
 const viewer=setup();try{viewer.controller.update({...viewer.input,quality:'4k'});const capture=viewer.controller.capture(320,180);viewer.controller.dispose();await assert.rejects(capture,/no está disponible/);}finally{viewer.dispose();}
});
