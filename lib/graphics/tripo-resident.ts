import * as THREE from 'three';
import type {LivingActor} from './living-actors.ts';
import {finishVoxelMaterial,voxelFitMatrix} from './tripo-voxel-pilot.ts';

export const TRIPO_RESIDENT_URL='/models/tripo-v1/worker.glb';
export const TRIPO_RESIDENT_HEIGHT=1.88;
const normalizedName=(name:string)=>name.toLowerCase().replace(/^mixamorig[:_]?/,'').replace(/[^a-z0-9]/g,'');
type RestBone={bone:THREE.Bone;rotation:THREE.Quaternion;position:THREE.Vector3;worldRotation:THREE.Quaternion;worldPosition:THREE.Vector3};
type Motion={walking:number;working:boolean;carrying:boolean;authoredArms?:boolean};

/** Retarget the existing resident's gestures; route position stays owned by the game. */
export function bindTripoResident(model:THREE.Group,actor:LivingActor){
 const visual=new THREE.Group(),fit=new THREE.Group();visual.name='tripo-voxel-resident';
 model.updateMatrixWorld(true);fit.applyMatrix4(voxelFitMatrix(new THREE.Box3().setFromObject(model),{width:2.5,height:TRIPO_RESIDENT_HEIGHT,depth:.8}));fit.add(model);visual.add(fit);actor.group.add(visual);
 actor.group.updateWorldMatrix(true,false);actor.group.updateMatrixWorld(true);const reference=new THREE.Matrix4().copy(actor.group.matrixWorld).invert(),rest=new Map<string,RestBone>(),matrix=new THREE.Matrix4();
 model.traverse(o=>{if(o instanceof THREE.Bone){matrix.multiplyMatrices(reference,o.matrixWorld);rest.set(normalizedName(o.name),{bone:o,rotation:o.quaternion.clone(),position:o.position.clone(),worldRotation:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix)),worldPosition:new THREE.Vector3().setFromMatrixPosition(matrix)});}if(o instanceof THREE.SkinnedMesh){o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;}});
 const at=(name:string)=>{const value=rest.get(name);if(!value)throw new Error('Missing humanoid joint '+name);return value;};
 try{for(const name of ['hips','head','leftarm','leftforearm','lefthand','rightarm','rightforearm','righthand','leftupleg','leftleg','leftfoot','rightupleg','rightleg','rightfoot'])at(name);}catch(error){visual.removeFromParent();throw error;}
 const pairs=[['leftupleg','leftleg','actor-left-hip'],['leftleg','leftfoot','actor-left-knee'],['rightupleg','rightleg','actor-right-hip'],['rightleg','rightfoot','actor-right-knee'],['leftarm','leftforearm','actor-left-shoulder'],['leftforearm','lefthand','actor-left-elbow'],['rightarm','rightforearm','actor-right-shoulder'],['rightforearm','righthand','actor-right-elbow']] as const;
 const chains=pairs.map(([from,to,source])=>({joint:at(from),direction:at(to).worldPosition.clone().sub(at(from).worldPosition).normalize(),source:actor.group.getObjectByName(source)!,arm:from.includes('arm'),forearm:from.includes('forearm'),left:from.startsWith('left')}));
 const inverse=new THREE.Matrix4(),parentRotation=new THREE.Quaternion(),sourceRotation=new THREE.Quaternion(),delta=new THREE.Quaternion(),desired=new THREE.Quaternion(),direction=new THREE.Vector3(),torsoRotation=new THREE.Quaternion();
 const inActor=(object:THREE.Object3D,result:THREE.Quaternion)=>{object.updateWorldMatrix(true,false);matrix.multiplyMatrices(inverse,object.matrixWorld);return result.setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix));};
 function rotate(joint:RestBone,target:THREE.Quaternion){const parent=joint.bone.parent!;inActor(parent,parentRotation);joint.bone.quaternion.copy(parentRotation.invert().multiply(target));joint.bone.updateWorldMatrix(false,true);}
 const originalMeshes=new Map<THREE.Mesh,boolean>();actor.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=o;p&&p!==actor.group;p=p.parent)if(p===visual||p.name==='actor-load')return;originalMeshes.set(o,o.visible);});
 let active=false,disposed=false;
 const show=(value:boolean)=>{if(disposed)return;active=value;visual.visible=value;originalMeshes.forEach((visible,mesh)=>mesh.visible=value?false:visible);};show(false);
 return {visual,show,sync(motion:Motion){
  if(disposed||!active)return;visual.position.y=0;rest.forEach(r=>{r.bone.position.copy(r.position);r.bone.quaternion.copy(r.rotation);});actor.group.updateWorldMatrix(true,true);inverse.copy(actor.group.matrixWorld).invert();
  const torso=actor.group.getObjectByName('actor-torso')!;inActor(torso,torsoRotation);rotate(at('hips'),desired.copy(torsoRotation).multiply(at('hips').worldRotation));
  for(const chain of chains){
   if(chain.arm&&!motion.carrying&&!motion.working&&!motion.authoredArms){const hip=actor.group.getObjectByName(chain.left?'actor-right-hip':'actor-left-hip')!,swing=motion.walking?hip.rotation.x*.65:0;sourceRotation.copy(torsoRotation).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(chain.forearm?-.1:swing,0,chain.forearm?0:chain.left?.04:-.04)));}
   else inActor(chain.source,sourceRotation);
   direction.set(0,-1,0).applyQuaternion(sourceRotation);delta.setFromUnitVectors(chain.direction,direction);desired.copy(delta).multiply(chain.joint.worldRotation);rotate(chain.joint,desired);
  }
  for(const name of ['leftfoot','rightfoot'])rotate(at(name),desired.copy(at(name).worldRotation));
  inActor(actor.group.getObjectByName('actor-head')!,sourceRotation);rotate(at('head'),desired.copy(sourceRotation).multiply(at('head').worldRotation));
  let lift=Infinity;for(const name of ['leftfoot','rightfoot']){const joint=at(name);joint.bone.updateWorldMatrix(true,false);matrix.multiplyMatrices(inverse,joint.bone.matrixWorld);lift=Math.min(lift,matrix.elements[13]-joint.worldPosition.y);}
  visual.position.y=-THREE.MathUtils.clamp(lift,-.18,.18);visual.updateMatrixWorld(true);
 },dispose(){if(disposed)return;show(false);disposed=true;visual.removeFromParent();model.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});visual.clear();}};
}

/** One lazy download and shared buffers for the two pilot residents, per viewer. */
export function createTripoResidentLibrary(){
 let disposed=false,started=false,template:THREE.Group|null=null,clone:((source:THREE.Object3D)=>THREE.Object3D)|null=null;
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 const residents=new Set<{actor:LivingActor;near:boolean;skin:ReturnType<typeof bindTripoResident>|null;failed:boolean}>();
 function release(){geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometry.clear();materials.clear();textures.clear();template?.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});template=null;}
 function mount(resident:{actor:LivingActor;near:boolean;skin:ReturnType<typeof bindTripoResident>|null;failed:boolean}){if(!template||!clone||resident.skin||resident.failed||disposed)return;try{resident.skin=bindTripoResident(clone(template) as THREE.Group,resident.actor);resident.skin.show(resident.near);resident.actor.group.userData.tripoResident='ready';}catch{resident.failed=true;resident.actor.group.userData.tripoResident='fallback';}}
 async function load(){
  if(started||disposed||typeof window==='undefined')return;started=true;
  try{const [{GLTFLoader},utils]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/utils/SkeletonUtils.js')]);if(disposed)return;
   const gltf=await new GLTFLoader().loadAsync(TRIPO_RESIDENT_URL);template=gltf.scene;let triangles=0,skins=0;
   template.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometry.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;if(o instanceof THREE.SkinnedMesh)skins++;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}});
   if(disposed){release();return;}if(skins<1||skins>2||triangles>12000)throw new Error('Resident asset budget exceeded');
   textures.forEach(t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=1;t.needsUpdate=true;});materials.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial)finishVoxelMaterial(m,false);});clone=utils.clone;residents.forEach(mount);
  }catch{release();residents.forEach(r=>{r.failed=true;r.actor.group.userData.tripoResident='fallback';});}
 }
 return{attach(actor:LivingActor){const resident={actor,near:false,skin:null as ReturnType<typeof bindTripoResident>|null,failed:false};residents.add(resident);actor.group.userData.tripoResident='idle';return{setNear(near:boolean){if(disposed)return;resident.near=near;if(near){void load();mount(resident);}resident.skin?.show(near);},sync(walking:boolean,working:boolean,carrying:boolean,authoredArms=false){resident.skin?.sync({walking:walking?1:0,working,carrying,authoredArms});}};},dispose(){if(disposed)return;disposed=true;residents.forEach(r=>r.skin?.dispose());residents.clear();release();}};
}
