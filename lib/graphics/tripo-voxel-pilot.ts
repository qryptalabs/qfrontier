import * as THREE from 'three';

export type VoxelPlacement={x:number;y:number;z:number;yaw?:number;scale?:number};
export type VoxelPilotSpec={id:'pine'|'shelf';url:string;width:number;height:number;depth:number;distance:number};
export const VOXEL_PILOT_SPECS:Record<VoxelPilotSpec['id'],VoxelPilotSpec>={
 pine:{id:'pine',url:'/models/tripo-v1/pine.glb',width:4.8,height:6.2,depth:4.8,distance:100},
 shelf:{id:'shelf',url:'/models/tripo-v1/shelf.glb',width:2.2,height:2.3,depth:.8,distance:24},
};
const up=new THREE.Vector3(0,1,0);
/** Crisp pixel sampling and the existing forest palette, independent of AI lighting. */
export function finishVoxelMaterial(material:THREE.MeshStandardMaterial,pine:boolean){
 material.flatShading=true;material.roughness=Math.max(.78,material.roughness);material.metalness=Math.min(.12,material.metalness);
 const dark=new THREE.Color(0x294b32),light=new THREE.Color(0x82944f);
 material.onBeforeCompile=shader=>{
  shader.uniforms.voxelForestDark={value:dark};shader.uniforms.voxelForestLight={value:light};
  shader.fragmentShader='uniform vec3 voxelForestDark;\nuniform vec3 voxelForestLight;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, (floor(vMapUv * 256.0) + 0.5) / 256.0 )')+`
   #ifdef USE_MAP
    vec2 voxelPixel=floor(vMapUv*256.0);
    float voxelGrain=fract(sin(dot(voxelPixel,vec2(12.9898,78.233)))*43758.5453);
    diffuseColor.rgb*=.94+floor(voxelGrain*4.0)*.04;
   #endif
  `+(pine?`
   if(diffuseColor.g > diffuseColor.r * 1.5 && diffuseColor.g > diffuseColor.b * 1.5){
    float shade=floor(clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),0.0,1.0)*7.0)/7.0;
    diffuseColor.rgb=mix(voxelForestDark,voxelForestLight,shade);
   }
  `:''));
 };
 material.customProgramCacheKey=()=>`qfrontier-voxel-v1-${pine?'forest':'oak'}`;material.needsUpdate=true;
}
export function voxelPlacementMatrix(p:VoxelPlacement){
 const scale=p.scale??1;
 return new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion().setFromAxisAngle(up,p.yaw??0),new THREE.Vector3(scale,scale,scale));
}

/** Uniform scale and a foot-centred pivot retain the silhouette and floor contact. */
export function voxelFitMatrix(bounds:THREE.Box3,spec:Pick<VoxelPilotSpec,'width'|'height'|'depth'>){
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(![...size.toArray(),...center.toArray(),bounds.min.y].every(Number.isFinite)||Math.min(size.x,size.y,size.z)<=0)throw new Error('Invalid voxel asset bounds');
 const scale=Math.min(spec.width/size.x,spec.height/size.y,spec.depth/size.z);
 return new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
}

/** Fallback shares the viewer-owned template buffers; only instance buffers belong here. */
export function voxelFallbackInstances(template:THREE.Group,placements:readonly VoxelPlacement[]){
 const group=new THREE.Group();template.updateMatrixWorld(true);
 template.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const mesh=new THREE.InstancedMesh(o.geometry,o.material,placements.length);
  placements.forEach((p,i)=>mesh.setMatrixAt(i,voxelPlacementMatrix(p).multiply(o.matrixWorld)));
  mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
 });
 return group;
}

/** A bounded visual replacement. It never owns collision, inventory or save data. */
export function createTripoVoxelPilot(spec:VoxelPilotSpec,placements:readonly VoxelPlacement[],fallback:THREE.Group){
 const group=new THREE.Group(),detailed=new THREE.Group();group.name='tripo-voxel-pilot-'+spec.id;group.add(fallback,detailed);detailed.visible=false;
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 let disposed=false,near=false,started=false;
 group.userData.voxelPilot={id:spec.id,status:'idle',instances:placements.length,triangles:0,units:'metres'};
 function release(){
  detailed.children.forEach(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});detailed.clear();
  geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometry.clear();materials.clear();textures.clear();
 }
 function visibility(){const ready=group.userData.voxelPilot.status==='ready';detailed.visible=ready&&near;fallback.visible=!detailed.visible;}
 async function load(){
  if(started||disposed||!placements.length||typeof window==='undefined')return;started=true;group.userData.voxelPilot.status='loading';
  try{
   const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
   if(disposed)return;
   const gltf=await new GLTFLoader().loadAsync(spec.url),model=gltf.scene;model.updateMatrixWorld(true);
   const meshes:THREE.Mesh[]=[];let triangles=0;
   model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes.push(o);geometry.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}
   });
   if(disposed){release();return;}
   if(!meshes.length||meshes.length>4||triangles>12000||gltf.animations.length)throw new Error('Voxel pilot budget exceeded');
   const fit=voxelFitMatrix(new THREE.Box3().setFromObject(model),spec);
   textures.forEach(t=>{t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestMipmapLinearFilter;t.anisotropy=1;t.generateMipmaps=true;t.needsUpdate=true;});
   materials.forEach(m=>{if(m instanceof THREE.MeshStandardMaterial)finishVoxelMaterial(m,spec.id==='pine');});
   for(const source of meshes){const mesh=new THREE.InstancedMesh(source.geometry,source.material,placements.length);mesh.name='tripo-'+spec.id+'-instances';
    placements.forEach((p,i)=>mesh.setMatrixAt(i,voxelPlacementMatrix(p).multiply(fit).multiply(source.matrixWorld)));
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();detailed.add(mesh);
   }
   group.userData.voxelPilot.status='ready';group.userData.voxelPilot.triangles=triangles;visibility();
  }catch{release();if(!disposed){group.userData.voxelPilot.status='fallback';visibility();}}
 }
 return {group,setFocus(x:number,z:number,enabled=true){
  if(disposed)return;near=enabled&&Number.isFinite(x)&&Number.isFinite(z)&&placements.some(p=>Math.hypot(p.x-x,p.z-z)<spec.distance);
  if(near)void load();visibility();
 },dispose(){if(disposed)return;disposed=true;release();fallback.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});group.removeFromParent();group.clear();}};
}
