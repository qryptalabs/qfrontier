import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createLivingActorLibrary} from '../lib/graphics/living-actors.ts';
import {bindTripoResident,createTripoResidentLibrary,TRIPO_RESIDENT_HEIGHT} from '../lib/graphics/tripo-resident.ts';
import {createShopMerchantMotion} from '../lib/graphics/shop-merchant-motion.ts';

const bytes=readFileSync(new URL('../public/models/tripo-v1/worker.glb',import.meta.url));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
/** Parse the real geometry/skin offline. Only image decoding is omitted in Node. */
async function model(){
 const data=structuredClone(json);data.images=[];data.textures=[];data.materials=[{pbrMetallicRoughness:{baseColorFactor:[.4,.5,.3,1]}}];
 const text=Buffer.from(JSON.stringify(data)),length=Math.ceil(text.length/4)*4,padded=Buffer.alloc(length,32);text.copy(padded);
 const binStart=20+bytes.readUInt32LE(12),bin=bytes.subarray(binStart),result=Buffer.alloc(20+length+bin.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(length,12);result.writeUInt32LE(0x4e4f534a,16);padded.copy(result,20);bin.copy(result,20+length);
 return (await new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.length),'')).scene;
}
function skin(group:THREE.Group){let found:THREE.SkinnedMesh|null=null;group.traverse(o=>{if(o instanceof THREE.SkinnedMesh)found=o;});assert(found);return found as THREE.SkinnedMesh;}
const geometryBounds=(group:THREE.Group)=>{group.updateWorldMatrix(true,true);const result=new THREE.Box3();group.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.skeleton.update();o.computeBoundingBox();result.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});return result;};
test('the real worker is a bounded embedded textured Mixamo humanoid, without external files or baked movement',()=>{
 assert(bytes.length<1_000_000);assert.equal(json.skins.length,1);assert.equal(json.skins[0].joints.length,65);assert.equal(json.meshes.length,1);assert.equal(json.images.length,1);assert(!json.images[0].uri);assert(!json.buffers[0].uri);assert(!json.animations?.length);assert(!json.extensionsRequired?.length);
 const p=json.meshes[0].primitives[0];assert(Number.isInteger(p.attributes.JOINTS_0));assert(Number.isInteger(p.attributes.WEIGHTS_0));assert(json.accessors[p.indices].count/3<12000);
});
test('the actual rig animates idle, carrying, walking and work without moving the authoritative actor',async()=>{
 const people=createLivingActorLibrary(),actor=people.get('worker',19),visual=bindTripoResident(await model(),actor);visual.show(true);
 const poses:number[][]=[];try{for(const [time,walking,working,carrying] of [[0,0,false,false],[.4,1,false,false],[.9,1,false,true],[1.5,0,true,true],[2.2,0,true,false]] as const){
  actor.animate(time,walking,working);visual.sync({walking,working,carrying});const bounds=geometryBounds(actor.group),size=bounds.getSize(new THREE.Vector3());assert([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));assert(size.y<TRIPO_RESIDENT_HEIGHT+.2&&size.y>1.4,JSON.stringify({time,size:size.toArray(),bounds:[bounds.min.toArray(),bounds.max.toArray()]}));assert(bounds.min.y>-.22&&bounds.min.y<.22,'boots stay near the floor');assert(size.x<1.7&&size.z<1.6,'the worker has no stretched or detached limbs');assert.deepEqual(actor.group.position.toArray(),[0,0,0]);
  poses.push(skin(visual.visual).skeleton.bones.flatMap(b=>b.quaternion.toArray()));
 }
 assert.notDeepEqual(poses[0],poses[1]);assert.notDeepEqual(poses[2],poses[3]);
 actor.group.position.set(120,5,-80);actor.group.rotation.y=.7;actor.animate(3,true);visual.sync({walking:1,working:false,carrying:true});assert.deepEqual(actor.group.position.toArray(),[120,5,-80]);assert.equal(actor.group.rotation.y,.7);
 }finally{visual.dispose();visual.dispose();people.dispose();}
});
test('two clones keep independent skeleton poses and restore original bodies without hiding cargo',async()=>{
 const template=await model(),people=createLivingActorLibrary(),a=people.get('worker',19),b=people.get('merchant',8),sa=bindTripoResident(clone(template) as THREE.Group,a),sb=bindTripoResident(clone(template) as THREE.Group,b);
 try{sa.show(true);sb.show(true);a.animate(1,true);sa.sync({walking:1,working:false,carrying:true});b.animate(2,false);sb.sync({walking:0,working:false,carrying:false});assert.notEqual(skin(sa.visual).skeleton,skin(sb.visual).skeleton);assert.notDeepEqual(skin(sa.visual).skeleton.bones.map(b=>b.quaternion.toArray()),skin(sb.visual).skeleton.bones.map(b=>b.quaternion.toArray()));
 assert.equal(a.group.getObjectByName('actor-tunic')!.visible,false);assert.equal(a.group.getObjectByName('actor-cargo')!.visible,true);sa.show(false);assert.equal(a.group.getObjectByName('actor-tunic')!.visible,true);assert.equal(sb.visual.visible,true);
 }finally{sa.dispose();sb.dispose();people.dispose();}
});
test('server-side creation does not load assets and leaves existing actors available',()=>{
 const people=createLivingActorLibrary(),actor=people.get('worker'),library=createTripoResidentLibrary(),resident=library.attach(actor);resident.setNear(true);resident.sync(false,false,false);assert.equal(actor.group.userData.tripoResident,'idle');assert.equal(actor.group.getObjectByName('actor-tunic')!.visible,true);library.dispose();library.dispose();people.dispose();
});
test('the real merchant lowers empty hands, gives one brief asymmetric greeting and rests while the customer stays',async()=>{
 const people=createLivingActorLibrary(),actor=people.get('merchant',8),visual=bindTripoResident(await model(),actor),motion=createShopMerchantMotion(actor);visual.show(true);
 const point=(suffix:string)=>skin(visual.visual).skeleton.bones.find(b=>b.name.replace(':','')==='mixamorig'+suffix)!.getWorldPosition(new THREE.Vector3());
 const update=(time:number,distance:number,reduced=false)=>{const greeting=motion.update(time,distance,reduced);visual.sync({walking:0,working:false,carrying:false,authoredArms:true});return greeting;};
 try{
  update(0,3);assert(update(1.2,3)>.99);const raised=point('RightHand').y,left=point('LeftHand').y;
  assert(raised-left>.18,'only one hand makes the greeting');
  for(const time of[3,10,45]){assert.equal(update(time,3),0);for(const side of['Left','Right']){const hand=point(side+'Hand'),arm=point(side+'Arm');assert(arm.clone().sub(hand).normalize().y>.94,'empty hands hang almost vertically');assert(Math.abs(hand.z-arm.z)<.22,'no invisible crate pose');}}
  update(46,8);update(47,3);assert(update(48.2,3)>.99,'greeting re-arms only after leaving');
  update(49,8);assert.equal(update(50,3,true),0);assert.equal(update(51.2,3,true),0,'reduced motion has no wave');
  const bounds=geometryBounds(actor.group);assert(bounds.min.y>-.22&&bounds.max.y<2.1);assert.deepEqual(actor.group.position.toArray(),[0,0,0]);
 }finally{visual.dispose();people.dispose();}
});
