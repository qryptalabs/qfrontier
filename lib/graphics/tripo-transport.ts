import * as THREE from 'three';
import {finishVoxelMaterial,voxelFitMatrix} from './tripo-voxel-pilot.ts';

export const TRIPO_TRANSPORT_URLS={horse:'/models/tripo-v1/horse.glb',cart:'/models/tripo-v1/cart.glb'} as const;
const up=new THREE.Vector3(0,1,0);

/** Four-beat walk, blending into diagonal trot. Phase is distance, not elapsed time. */
export function horseHoofOffset(distance:number,speed:number,leg:number){
 if(!Number.isFinite(distance)||!Number.isFinite(speed)||Math.abs(speed)<.02)return{z:0,y:0};
 const trot=THREE.MathUtils.clamp((Math.abs(speed)-3)/2,0,1),offset=[0,.5,.75,.25][leg]+([0,.5,.5,0][leg]-[0,.5,.75,.25][leg])*trot,phase=THREE.MathUtils.euclideanModulo(distance/1.25+offset,1),stance=.58-trot*.08,amplitude=1.25*stance/2;
 if(phase<stance)return{z:amplitude*(1-2*phase/stance),y:0};
 const p=(phase-stance)/(1-stance);return{z:amplitude*(-1+2*p),y:Math.sin(Math.PI*p)*(.12+.06*trot)};
}

/** Retain the actual quadruped bind pose and solve each hoof toward the ground. */
export function bindTripoHorse(model:THREE.Group){
 const group=new THREE.Group(),fit=new THREE.Group(),orientation=new THREE.Group();group.name='tripo-draft-horse';orientation.rotation.y=-Math.PI/2;orientation.add(model);orientation.updateMatrixWorld(true);
 fit.applyMatrix4(voxelFitMatrix(new THREE.Box3().setFromObject(orientation),{width:.9,height:2.5,depth:2.6}));fit.add(orientation);group.add(fit);group.updateMatrixWorld(true);
 const bones:THREE.Bone[]=[];model.traverse(o=>{if(o instanceof THREE.Bone)bones.push(o);if(o instanceof THREE.SkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;}});
 const rest=bones.map(bone=>({bone,position:bone.position.clone(),rotation:bone.quaternion.clone()})),find=(name:string)=>{const bone=bones.find(b=>b.name.replaceAll(':','')===name);if(!bone)throw Error('Missing horse joint '+name);return bone;};
 const chains=[['tripo0_Left_Limb_0','tripo0_Left_Limb_1','tripo0_Left_Limb_2','tripo0_Left_Limb_3'],['bone_8','tripo0_Right_Limb_0','tripo0_Right_Limb_1','tripo0_Right_Limb_2'],['tripo1_Left_Limb_0','tripo1_Left_Limb_1','tripo1_Left_Limb_2','tripo1_Left_Limb_3'],['tripo1_Right_Limb_0','tripo1_Right_Limb_1','tripo1_Right_Limb_2','tripo1_Right_Limb_3']].map(names=>{const joints=names.map(find),tip=joints.at(-1)!;return{joints,tip,foot:group.worldToLocal(tip.getWorldPosition(new THREE.Vector3()))};}),head=find('tripoHead_0');
 const target=new THREE.Vector3(),tipPoint=new THREE.Vector3(),jointPoint=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),rotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),delta=new THREE.Quaternion();
 return{group,update(time:number,distance:number,speed:number){
  rest.forEach(r=>{r.bone.position.copy(r.position);r.bone.quaternion.copy(r.rotation);});head.rotateZ(Math.sin(time*.9)*.012);group.updateWorldMatrix(true,true);
  if(Math.abs(speed)>.02)for(const [i,chain]of chains.entries()){
   const offset=horseHoofOffset(distance,speed,i);target.copy(chain.foot);target.z+=offset.z;target.y+=offset.y;group.localToWorld(target);
   for(let iteration=0;iteration<4;iteration++)for(let j=chain.joints.length-2;j>=0;j--){const joint=chain.joints[j];joint.getWorldPosition(jointPoint);chain.tip.getWorldPosition(tipPoint);a.copy(tipPoint).sub(jointPoint).normalize();b.copy(target).sub(jointPoint).normalize();delta.setFromUnitVectors(a,b);joint.getWorldQuaternion(rotation);joint.parent!.getWorldQuaternion(parentRotation);joint.quaternion.copy(parentRotation.invert().multiply(delta.multiply(rotation)));joint.updateWorldMatrix(false,true);}
  }
  group.updateMatrixWorld(true);
 },dispose(){group.removeFromParent();model.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});group.clear();}};
}

type AssetId=keyof typeof TRIPO_TRANSPORT_URLS;
type Asset={refs:number;template:THREE.Group|null;promise:Promise<THREE.Group|null>;geometry:Set<THREE.BufferGeometry>;materials:Set<THREE.Material>;textures:Set<THREE.Texture>};
const assets=new Map<AssetId,Asset>();
let skeletonClone:((source:THREE.Object3D)=>THREE.Object3D)|null=null;
function releaseBuffers(asset:Asset){asset.template?.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});asset.template=null;asset.geometry.forEach(g=>g.dispose());asset.materials.forEach(m=>m.dispose());asset.textures.forEach(t=>t.dispose());asset.geometry.clear();asset.materials.clear();asset.textures.clear();}
function retain(id:AssetId){
 let asset=assets.get(id);if(!asset){const created:Asset={refs:0,template:null,promise:Promise.resolve(null),geometry:new Set(),materials:new Set(),textures:new Set()};asset=created;assets.set(id,created);
  created.promise=(async()=>{try{const[{GLTFLoader},utils]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/utils/SkeletonUtils.js')]);skeletonClone=utils.clone;const gltf=await new GLTFLoader().loadAsync(TRIPO_TRANSPORT_URLS[id]);created.template=gltf.scene;let triangles=0,meshes=0;
   gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes++;created.geometry.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){created.materials.add(m);for(const t of Object.values(m))if(t instanceof THREE.Texture)created.textures.add(t);}});
   if(meshes>(id==='horse'?1:5)||triangles>8000||created.textures.size>2||created.refs===0)throw Error('Transport asset unavailable or over budget');
   created.textures.forEach(t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=1;t.needsUpdate=true;});created.materials.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial){finishVoxelMaterial(m,false);if(id==='horse')m.color.setHex(0xc4b39a);}});return gltf.scene;
  }catch{releaseBuffers(created);return null;}})();
 }
 const retained=asset;retained.refs++;let disposed=false;return{ready:retained.promise,dispose(){if(disposed)return;disposed=true;if(--retained.refs===0){if(assets.get(id)===retained)assets.delete(id);releaseBuffers(retained);}}};
}

type Part={parent:THREE.Group;fallback:THREE.Group;wheels?:readonly THREE.Object3D[]};
/** Per-viewer instances share textures/buffers. Appearance owns no economy or navigation. */
export function createTripoTransportAppearance(parts:{horse?:Part;cart?:Part}){
 let near=false,disposed=false,horse:ReturnType<typeof bindTripoHorse>|null=null,cart:THREE.Group|null=null;const handles:ReturnType<typeof retain>[]=[];let started=false;
 function visibility(){if(parts.horse){parts.horse.fallback.visible=!(horse&&near);if(horse)horse.group.visible=near;}if(parts.cart){parts.cart.fallback.visible=!(cart&&near);parts.cart.wheels?.forEach(w=>w.visible=!(cart&&near));if(cart)cart.visible=near;}}
 function load(){if(started||disposed||typeof window==='undefined')return;started=true;for(const id of ['horse','cart']as const){const part=parts[id];if(!part)continue;const handle=retain(id);handles.push(handle);void handle.ready.then(template=>{if(disposed||!template)return;try{if(id==='horse'){horse=bindTripoHorse(skeletonClone!(template) as THREE.Group);part.parent.add(horse.group);}else{cart=template.clone(true);cart.name='tripo-work-cart';cart.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});part.parent.add(cart);}visibility();}catch{visibility();}});}}
 return{setNear(value:boolean){if(disposed)return;near=value;if(near)load();visibility();},update(time:number,distance:number,speed:number){if(disposed||!near)return;horse?.update(time,distance,speed);if(cart)for(const child of cart.children)if(child.name.startsWith('cart-wheel-'))child.rotation.x=distance/.285;},dispose(){if(disposed)return;disposed=true;horse?.dispose();cart?.removeFromParent();handles.forEach(h=>h.dispose());if(parts.horse)parts.horse.fallback.visible=true;if(parts.cart){parts.cart.fallback.visible=true;parts.cart.wheels?.forEach(w=>w.visible=true);}}};
}
