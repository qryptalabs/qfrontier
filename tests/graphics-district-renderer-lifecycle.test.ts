import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test,mock} from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import {EXPLORATION_NETWORK} from '../lib/mvp/exploration-network-data.ts';
import type {HabitableState} from '../lib/mvp/habitable-data.ts';
import type {ExplorationTransport} from '../lib/mvp/exploration-data.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import type {DistrictCameraMode} from '../lib/graphics/district-navigation.ts';
import {createHabitableDistrict} from '../lib/graphics/habitable-district.ts';
import type {createWorldTerrainRenderer} from '../lib/graphics/world-terrain-renderer.ts';

const require=createRequire(import.meta.url);
class Element extends EventTarget {
  width=1;height=1;style={};tabIndex=0;
  setAttribute(){}appendChild(){}remove(){}
  getBoundingClientRect(){return{width:320,height:440,left:0,top:0};}
  getContext(){return new Proxy({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(object,key)=>key in object?Reflect.get(object,key):()=>{}});}
}
class HeadlessControls extends OrbitControls {constructor(camera:THREE.Camera){super(camera);}override dispose(){/* No DOM connection. */}}

test('far transport, camera changes and quality cycles retain the same visible grounded city avatar',()=>{
  let scene:THREE.Scene|undefined,camera:THREE.Camera|undefined,draw:((time:number)=>void)|undefined,clock=0;
  class HeadlessRenderer {
    shadowMap={enabled:false,type:0};domElement=new Element();info={render:{calls:1,triangles:1}};
    setPixelRatio(){}setSize(){}getDrawingBufferSize(target:THREE.Vector2){return target.set(320,440);}
    render(next:THREE.Scene,view:THREE.Camera){scene=next;camera=view;next.updateMatrixWorld(true);}
    dispose(){}forceContextLoss(){}
  }
  const prior=['window','document','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]as const);
  Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{devicePixelRatio:1})});
  Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Element()})});
  Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{observe(){}disconnect(){}}});
  const timer=mock.method(performance,'now',()=>clock),file=new URL('../lib/graphics/world-terrain-renderer.ts',import.meta.url),exports:{createWorldTerrainRenderer?:typeof createWorldTerrainRenderer}={};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const load=(id:string):unknown=>id==='three'?{...THREE,WebGLRenderer:HeadlessRenderer}:id==='three/addons/controls/OrbitControls.js'?{OrbitControls:HeadlessControls}:id==='./viewer-lifecycle.ts'?{createViewerFrameLoop:(callback:(time:number)=>void)=>{draw=callback;return{setActive(){},dispose(){}};}}:id.startsWith('.')?require(fileURLToPath(new URL(id,file))):require(id);
  new Function('require','exports',code)(load,exports);
  const now=Date.parse('2026-10-18T00:00:00Z'),world=createMvpWorld('visual-lab',now),player=createPlayer(world,{ownerId:'visual-lab',requestId:'visual-lab',now,actor:null},{type:'player.create',name:'Ensayo',stationName:'Ensayo sin guardar',faction:'cartographers'});
  const base:HabitableState={version:1,appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[]};player.habitable=base;
  const view=buildMvpView(world,0,'visual-lab',now,player.id),state:HabitableState={...base,exploration:{version:1,position:{x:-408,y:-312},homePosition:base.position,departedAt:now}},publicPlayer={...view.player!,habitable:state};
  const input:SceneInput={view:{...view,player:publicPlayer},player:publicPlayer,selected:publicPlayer.position,mode:'settlement',quality:'fullhd',reducedMotion:false};
  const controller=exports.createWorldTerrainRenderer!(new Element()as unknown as HTMLElement,input,{}, {x:0,y:0});
  const district=createHabitableDistrict({input,state,groundHeight:(x,y)=>controller.groundHeightAt(x,y),onMove(){assert.fail('rendering cannot walk');},onPlace(){assert.fail('rendering cannot build');},onInteract(){}});
  const original=JSON.stringify(view),vehiclePoint=(mode:ExplorationTransport)=>{const edge=EXPLORATION_NETWORK.edges.find(edge=>edge.mode===mode)!;return edge.points[Math.floor(edge.points.length/2)];};
  try{
    controller.attachDistrict(district);
    const visits:{point:{x:number;y:number};quality:SceneInput['quality'];mode:DistrictCameraMode;transport?:ExplorationTransport;city?:boolean}[]=[
      {point:{x:-216,y:168},quality:'fullhd',mode:'third-person'},
      {point:vehiclePoint('carriage'),quality:'fullhd',mode:'third-person',transport:'carriage'},
      {point:vehiclePoint('boat'),quality:'fullhd',mode:'first-person',transport:'boat'},
      {point:vehiclePoint('boat'),quality:'fullhd',mode:'third-person',transport:'boat'},
      ...(['fullhd','performance','fullhd','performance']as const).map(quality=>({point:{x:-408,y:-312},quality,mode:'third-person'as const,city:true})),
    ];
    let persistent:THREE.Object3D|undefined;
    for(const visit of visits){
      const start=now+clock,exploration={...state.exploration!,position:visit.point,...(visit.transport?{movement:{points:[visit.point,{x:visit.point.x+1,y:visit.point.y}],startsAt:start,endsAt:start+100_000,legs:[{mode:visit.transport,fromIndex:0,toIndex:1,startsAt:start,endsAt:start+100_000}]}}:{})};
      const nextState={...base,exploration},nextPlayer={...publicPlayer,habitable:nextState},next:SceneInput={...input,quality:visit.quality,player:nextPlayer,view:{...input.view,now:start,player:nextPlayer}};
      controller.update(next);district.update(next,nextState);controller.setDistrictCameraMode(visit.mode);controller.recenterDistrict();
      const end=clock+1600;for(;clock<end;clock+=40)draw!(clock);
      const avatar=district.group.getObjectByName('your-persistent-avatar')!;persistent??=avatar;assert.equal(avatar,persistent,'travel and quality changes must reuse the personalized character');
      if(!visit.city)continue;
      assert.equal(avatar.visible,true);assert.equal(district.group.getObjectByName('your-avatar-ring')!.visible,true);
      const foot=avatar.getWorldPosition(new THREE.Vector3()),support=controller.groundHeightAt(visit.point.x,visit.point.y),projected=foot.clone().add(new THREE.Vector3(0,.8,0)).project(camera!);
      assert.ok(Math.abs(foot.y-support-.07)<1e-6);assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z<1,'city body remains inside the portrait third-person frustum');assert.ok(camera!.position.distanceTo(foot)>3,'camera does not collapse inside the body');
      scene!.traverse(object=>{if(object instanceof THREE.Sprite)object.raycast=()=>{};});
      const target=foot.clone().add(new THREE.Vector3(0,.8,0)),ray=new THREE.Raycaster(camera!.position,target.clone().sub(camera!.position).normalize(),0,camera!.position.distanceTo(target)),hits=ray.intersectObject(scene!,true).filter(hit=>hit.object instanceof THREE.Mesh&&!Array.isArray(hit.object.material)&&hit.object.material.opacity>0);
      assert.ok(hits.length>0);let visibleCharacter=false;for(let node:THREE.Object3D|null=hits[0].object;node;node=node.parent)if(node===avatar)visibleCharacter=true;
      assert.equal(visibleCharacter,true,'the first opaque surface on the sightline must be the character, not covering terrain');
    }
    assert.equal(JSON.stringify(view),original,'visual lifecycle cannot modify the source world');
  }finally{controller.dispose();timer.mock.restore();for(const[key,descriptor]of prior){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
