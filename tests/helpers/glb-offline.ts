import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Test the actual geometry and skin offline; only browser image decoding is omitted. */
export async function readOfflineGlb(path:URL|string){
 const bytes=readFileSync(path),source=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),data=structuredClone(source);
 data.images=[];data.textures=[];data.materials=(data.materials??[{}]).map(()=>({pbrMetallicRoughness:{baseColorFactor:[.5,.4,.3,1]}}));
 const json=Buffer.from(JSON.stringify(data)),length=Math.ceil(json.length/4)*4,text=Buffer.alloc(length,32);json.copy(text);
 const bin=bytes.subarray(20+bytes.readUInt32LE(12)),result=Buffer.alloc(20+length+bin.length);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(length,12);result.writeUInt32LE(0x4e4f534a,16);text.copy(result,20);bin.copy(result,20+length);
 return{source,bytes,gltf:await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.length),'')};
}
