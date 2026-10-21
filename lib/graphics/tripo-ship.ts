import * as THREE from 'three';
import {finishVoxelMaterial} from './tripo-voxel-pilot.ts';
import {TRIPO_SHIP_ASSETS} from './tripo-ship-assets.ts';

/** Two merged batches, one 1K color atlas. Loaded once per visible district.
 * The server's floors/colliders do not depend on asynchronous model loading. */
export function createTripoShip(kind:'galleon'|'fishing',fallback?:THREE.Group){
 const group=new THREE.Group();group.name=`tripo-${kind}`;if(fallback)group.add(fallback);
 const meshes:THREE.Mesh[]=[],geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),time={value:0};
 let started=false,disposed=false,ready=false;
 group.userData.tripoShip={kind,status:'idle',triangles:0};
 async function load(){if(started||disposed||typeof window==='undefined')return;started=true;group.userData.tripoShip.status='loading';
  try{const{GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');if(disposed)return;const gltf=await new GLTFLoader().loadAsync(TRIPO_SHIP_ASSETS[kind].url);let triangles=0;
   gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;meshes.push(o);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}});
   if(disposed){release();return;}if(meshes.length!==2||triangles>15000)throw Error('Ship budget exceeded');
   textures.forEach(t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.anisotropy=1;t.needsUpdate=true;});
   materials.forEach(m=>{if(!(m instanceof THREE.MeshStandardMaterial))return;finishVoxelMaterial(m,false);const finish=m.onBeforeCompile;m.onBeforeCompile=(shader,renderer)=>{finish.call(m,shader,renderer);shader.uniforms.shipWindTime=time;shader.vertexShader='uniform float shipWindTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float sailWeight=smoothstep(${kind==='galleon'?'6.5,18.0':'1.5,6.2'},position.y);
    transformed.x+=sin(shipWindTime*1.4+position.z*.7)*sailWeight*.055;
   `);};m.customProgramCacheKey=()=>`qfrontier-tripo-${kind}-wind-v1`;});
   meshes.forEach(m=>{m.castShadow=true;m.receiveShadow=true;});group.add(gltf.scene);if(fallback)fallback.visible=false;ready=true;group.userData.tripoShip={kind,status:'ready',triangles};
  }catch{if(!disposed)group.userData.tripoShip.status='fallback';release();}
 }
 function release(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometries.clear();materials.clear();textures.clear();meshes.length=0;}
 return{group,setNear(near:boolean){if(near)void load();},update(seconds:number){time.value=seconds;},get ready(){return ready;},dispose(){if(disposed)return;disposed=true;release();group.removeFromParent();group.clear();}};
}

/** The harbor fleet reuses the same Tripo class with shared GPU buffers.
 * Individual vessels keep their berths; there is no copy of the whole city. */
export function createTripoMooredFleet(fallback:readonly THREE.Group[]){
 const prototype=createTripoShip('galleon'),group=new THREE.Group(),vessels:THREE.Group[]=[];group.name='tripo-royal-moored-fleet';let cloned=false;
 return{group,setNear:prototype.setNear,update(t:number){prototype.update(t);if(prototype.ready&&!cloned){cloned=true;for(const source of fallback){const vessel=prototype.group.clone(true);vessel.scale.setScalar(.54);vessel.position.copy(source.position);vessel.position.y=-.46;vessel.rotation.y=source.rotation.y;source.visible=false;group.add(vessel);vessels.push(vessel);}}vessels.forEach((v,i)=>{v.position.x=fallback[i].position.x;v.position.z=fallback[i].position.z;v.rotation.y=fallback[i].rotation.y;v.position.y=-.46+Math.sin(t*.7+i)*.018;v.rotation.z=Math.sin(t*.4+i)*.002;});},dispose(){group.removeFromParent();group.clear();vessels.length=0;prototype.dispose();}};
}
