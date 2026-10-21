import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {readOfflineGlb} from '../tests/helpers/glb-offline.ts';

// Offline adaptation: the AI attic/roof becomes one independent module.
// The lower building, open bays and their exact collision walls are authored.
const input='work/tripo-stable-20261019/stable-export.glb',output='public/models/tripo-v1/stable.glb';
const{source,bytes,gltf}=await readOfflineGlb(input),bin=bytes.subarray(28+bytes.readUInt32LE(12));
gltf.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),mid=bounds.getCenter(new THREE.Vector3());
const data={position:[],normal:[],uv:[]},cut=.48;let sourceTriangles=0;
gltf.scene.traverse(mesh=>{
 if(!(mesh instanceof THREE.Mesh))return;const g=mesh.geometry,index=g.index,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<(index?.count??p.count);i+=3){sourceTriangles++;const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),points=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id).applyMatrix4(mesh.matrixWorld));
  if(points.some(v=>(v.y-bounds.min.y)/size.y<cut))continue;
  for(let k=0;k<3;k++){const v=points[k];data.position.push((v.x-mid.x)/size.x*24,4.4+((v.y-bounds.min.y)/size.y-cut)/(1-cut)*2.6,(v.z-mid.z)/size.z*8);data.normal.push(...new THREE.Vector3().fromBufferAttribute(n,ids[k]).toArray());data.uv.push(uv.getX(ids[k]),uv.getY(ids[k]));}
 }
});
const raw=new THREE.BufferGeometry();for(const[name,width]of[['position',3],['normal',3],['uv',2]])raw.setAttribute(name,new THREE.Float32BufferAttribute(data[name],width));
const g=mergeVertices(raw,1e-6);g.computeVertexNormals();
const result={asset:{version:'2.0',generator:'QFrontier modular stable preparation'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'stable-roof',mesh:0}],meshes:[],materials:[{name:'pixel-terracotta-oak',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.88}}],textures:[{sampler:0,source:0}],samplers:[{magFilter:9728,minFilter:9986,wrapS:10497,wrapT:10497}],images:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]},chunks=[];let offset=0;
function append(buffer,target){const aligned=Buffer.alloc(Math.ceil(buffer.length/4)*4);buffer.copy(aligned);const view=result.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})})-1;chunks.push(aligned);offset+=aligned.length;return view;}
function attribute(array,width,type,indices=false){const values=indices?new Uint32Array(array):new Float32Array(array),view=append(Buffer.from(values.buffer),indices?34963:34962),min=Array(width).fill(Infinity),max=Array(width).fill(-Infinity);array.forEach((v,i)=>{min[i%width]=Math.min(min[i%width],v);max[i%width]=Math.max(max[i%width],v);});return result.accessors.push({bufferView:view,componentType:indices?5125:5126,count:array.length/width,type,min,max})-1;}
const attributes={POSITION:attribute([...g.attributes.position.array],3,'VEC3'),NORMAL:attribute([...g.attributes.normal.array],3,'VEC3'),TEXCOORD_0:attribute([...g.attributes.uv.array],2,'VEC2')},indices=attribute([...g.index.array],1,'SCALAR',true);
result.meshes.push({name:'stable-roof',primitives:[{attributes,indices,material:0,mode:4}]});
const texture=source.textures[source.materials[0].pbrMetallicRoughness.baseColorTexture.index],image=source.images[texture.source],view=source.bufferViews[image.bufferView];
result.images.push({mimeType:image.mimeType,bufferView:append(bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))});result.buffers[0].byteLength=offset;
const json=Buffer.from(JSON.stringify(result)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+offset,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(offset,0);binHeader.writeUInt32LE(0x004e4942,4);const out=Buffer.concat([header,padded,binHeader,...chunks]);fs.writeFileSync(output,out);
const evidence={provider:'Tripo Studio',taskId:'83cdcb93-b172-4957-a487-75e72fdbe503',input,output,sourceTriangles,triangles:g.index.count/3,bytes:out.length,sha256:createHash('sha256').update(out).digest('hex'),meshes:1,textures:1,units:'metres',sourceBounds:bounds,module:'Independent decorative roof/attic. Authored walls, open doors and furniture define the traversable lower stable.',generationCostCredits:90,newPurchases:0};
fs.writeFileSync('work/tripo-stable-20261019/asset.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
g.dispose();raw.dispose();
