import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {readOfflineGlb} from '../tests/helpers/glb-offline.ts';

const evidence=[];
for(const kind of ['galleon','fishing']){
 const input=`work/tripo-ships-20261019/${kind}-export.glb`,output=`public/models/tripo-v1/${kind}.glb`;
 const{source,bytes,gltf}=await readOfflineGlb(input),bin=bytes.subarray(28+bytes.readUInt32LE(12));
 const fit=new T.Matrix4().makeTranslation(0,kind==='galleon'?-2.8:-1.6,0).multiply(new T.Matrix4().makeRotationY(kind==='galleon'?Math.PI:Math.PI/2)).multiply(new T.Matrix4().makeScale(...Array(3).fill(kind==='galleon'?30:9)));
 gltf.scene.updateMatrixWorld(true);const batches=[{position:[],normal:[],uv:[]},{position:[],normal:[],uv:[]}];let original=0;
 gltf.scene.traverse(mesh=>{
  if(!(mesh instanceof T.Mesh))return;const g=mesh.geometry,index=g.index,p=g.attributes.position,uv=g.attributes.uv,matrix=fit.clone().multiply(mesh.matrixWorld);
  for(let i=0;i<(index?.count??p.count);i+=3){original++;const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k),v=ids.map(id=>new T.Vector3().fromBufferAttribute(p,id).applyMatrix4(matrix));
   // Make a real doorway through the generated stern facade. The authored
   // cabin retains its side windows, furniture, floor and accessible roof.
   if(kind==='galleon'){
    const c=v.reduce((a,b)=>a.add(b),new T.Vector3()).multiplyScalar(1/3);
    if(Math.abs(c.x)<1.05&&c.z>7.7&&c.z<10.1&&c.y>1.6&&c.y<4.7)continue;
    for(const a of v)if(a.z>7.7&&a.y>1.6&&a.y<7.8)a.y=1.6+(a.y-1.6)*1.8;
    // AI reconstruction closes the aft galleries with overlapping interior
    // layers. Open the authored cabin AND upper walking volume, then retain
    // the imported exterior around it. The fitted floors/stairs are separate.
    const aft=new T.Box3().setFromPoints(v);
    if(aft.min.x<3.3&&aft.max.x>-3.3&&aft.min.z<13.4&&aft.max.z>8.65&&aft.min.y<20&&aft.max.y>1.6)continue;
    // The gangway needs a gap in the generated starboard railing.
    if(c.x>3&&c.x<4.9&&Math.abs(c.z)<1.1&&c.y>1.55&&c.y<4)continue;
   }
   const rig=v.every(a=>a.y>(kind==='galleon'?6.5:1.5)),data=batches[rig?1:0];
   for(let k=0;k<3;k++){data.position.push(...v[k].toArray());data.uv.push(uv.getX(ids[k]),uv.getY(ids[k]));}
  }
 });
 const result={asset:{version:'2.0',generator:'QFrontier / Tripo maritime adaptation'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[{name:'pixel-oak-linen',doubleSided:true,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.85}}],textures:[{sampler:0,source:0}],samplers:[{magFilter:9728,minFilter:9986,wrapS:10497,wrapT:10497}],images:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]},chunks=[];let offset=0,triangles=0;
 const append=(buffer,target)=>{const aligned=Buffer.alloc(Math.ceil(buffer.length/4)*4);buffer.copy(aligned);const view=result.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length,...(target?{target}:{})})-1;chunks.push(aligned);offset+=aligned.length;return view;};
 function attribute(array,width,type,indices=false){const values=indices?new Uint32Array(array):new Float32Array(array),view=append(Buffer.from(values.buffer),indices?34963:34962),min=Array(width).fill(Infinity),max=Array(width).fill(-Infinity);array.forEach((v,i)=>{min[i%width]=Math.min(min[i%width],v);max[i%width]=Math.max(max[i%width],v);});return result.accessors.push({bufferView:view,componentType:indices?5125:5126,count:array.length/width,type,min,max})-1;}
 for(const [i,data]of batches.entries()){
  const raw=new T.BufferGeometry();raw.setAttribute('position',new T.Float32BufferAttribute(data.position,3));raw.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));const g=mergeVertices(raw,1e-6);g.computeVertexNormals();triangles+=g.index.count/3;
  const attributes={POSITION:attribute([...g.attributes.position.array],3,'VEC3'),NORMAL:attribute([...g.attributes.normal.array],3,'VEC3'),TEXCOORD_0:attribute([...g.attributes.uv.array],2,'VEC2')},indices=attribute([...g.index.array],1,'SCALAR',true),name=kind+(i?'-rig':'-hull');result.scenes[0].nodes.push(i);result.nodes.push({name,mesh:i});result.meshes.push({name,primitives:[{attributes,indices,material:0,mode:4}]});g.dispose();raw.dispose();
 }
 const texture=source.textures[source.materials[0].pbrMetallicRoughness.baseColorTexture.index],image=source.images[texture.source],view=source.bufferViews[image.bufferView];
 result.images.push({mimeType:image.mimeType,bufferView:append(bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength))});result.buffers[0].byteLength=offset;
 const json=Buffer.from(JSON.stringify(result)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+offset,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(offset);binHeader.writeUInt32LE(0x004e4942,4);const out=Buffer.concat([header,padded,binHeader,...chunks]);fs.writeFileSync(output,out);
 evidence.push({kind,provider:'Tripo Studio',taskId:kind==='galleon'?'6a9a56e0-fd46-4784-b539-ddc0a6f2080d':'69073075-45d1-4766-830b-4f96d8735ab3',input,output,originalTriangles:original,triangles,bytes:out.length,sha256:createHash('sha256').update(out).digest('hex'),meshes:2,textures:1,units:'metres',generationCredits:45,textureCredits:10});
}
fs.writeFileSync('work/tripo-ships-20261019/assets.json',JSON.stringify({ships:evidence,generationCostCredits:110,newPurchases:0},null,2));console.log(JSON.stringify(evidence));
fs.writeFileSync('lib/graphics/tripo-ship-assets.ts','// Generated by scripts/prepare-tripo-ships.mjs. Content versions prevent stale models.\nexport const TRIPO_SHIP_ASSETS='+JSON.stringify(Object.fromEntries(evidence.map(s=>[s.kind,{url:`/models/tripo-v1/${s.kind}.glb?v=${s.sha256.slice(0,12)}`,sha256:s.sha256,triangles:s.triangles,bytes:s.bytes}])),null,2)+' as const;\n');
