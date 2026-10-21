import {createRock} from './models.ts';
import {worldFloraChunk} from './world-collision.ts';
import * as THREE from 'three';
import {physicalObstaclesNear,physicalNpcCapsulesNear} from './world-collision.ts';
import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {createBiomeSettlementLibrary} from './biome-settlement-models.ts';
import {createWorldAssetLibrary} from './world-models.ts';
import {createInhabitedWorldChunk,type InhabitedWorldChunk} from './inhabited-world.ts';
import {INHABITED_PLACES} from './inhabited-world-data.ts';
import {royalLocalToWorld,ROYAL_WORLD_ORIGIN} from './royal-world-location.ts';
import {ROYAL_WORLD_BASE_Y} from './royal-world-surface.ts';
export function royalTownVisitObstacles(x:number,z:number,ground:(x:number,z:number)=>number,seconds?:number):RoyalObstacle[]{
 const point=royalLocalToWorld(x,z);if(!INHABITED_PLACES.some(p=>Math.hypot(point.x-p.x,point.y-p.y)<200))return[];
 const fixed=physicalObstaclesNear(point,12).map(o=>{const c=Math.abs(Math.cos(o.rotation??0)),s=Math.abs(Math.sin(o.rotation??0)),x=o.x-ROYAL_WORLD_ORIGIN.x,z=o.y-ROYAL_WORLD_ORIGIN.y,y=ground(x,z);return{x,z,halfWidth:(o.width*c+o.depth*s)/2,halfDepth:(o.width*s+o.depth*c)/2,minY:y,maxY:y+o.height};});
 return seconds===undefined?fixed:[...fixed,...physicalNpcCapsulesNear(point,seconds*1000,8).map(o=>{const x=o.x-ROYAL_WORLD_ORIGIN.x,z=o.y-ROYAL_WORLD_ORIGIN.y,y=ground(x,z);return{x,z,halfWidth:o.radius,halfDepth:o.radius,minY:y,maxY:y+o.height,allowEgress:true};})];
}
/** Bounded street-level detail for the EXISTING towns along a royal visit.
 * Build at most one 64 m chunk per frame; shared pools outlive these chunks. */
export function createRoyalVisitStream(ground:(x:number,z:number)=>number,performance=false){
 const group=new THREE.Group(),assets=createBiomeSettlementLibrary(),worldAssets=createWorldAssetLibrary();group.name='shared-world-visit-detail';
 group.position.set(-ROYAL_WORLD_ORIGIN.x,-ROYAL_WORLD_BASE_Y,-ROYAL_WORLD_ORIGIN.y);
 const chunks=new Map<string,{chunk:InhabitedWorldChunk;terrain:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;forest:THREE.Group;flora:THREE.InstancedMesh[]}>(),material=new THREE.MeshStandardMaterial({color:0x71834d,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 let focus={x:0,y:0};const wanted=new Map<string,{x:number;y:number}>();
 return{group,setFocus(x:number,z:number,walking:boolean){focus=royalLocalToWorld(x,z);wanted.clear();if(walking&&(Math.abs(x)>400||z>400||INHABITED_PLACES.some(p=>Math.hypot(focus.x-p.x,focus.y-p.y)<200))){const cx=Math.floor(focus.x/64),cy=Math.floor(focus.y/64);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)wanted.set(`${cx+dx}:${cy+dy}`,{x:cx+dx,y:cy+dy});}
  for(const [id,p]of chunks)if(!wanted.has(id)){p.chunk.dispose();p.chunk.group.removeFromParent();p.terrain.removeFromParent();p.terrain.geometry.dispose();p.forest.removeFromParent();p.flora.forEach(m=>m.dispose());chunks.delete(id);}
  for(const [id,p]of wanted){if(chunks.has(id))continue;const heightAt=(gx:number,gy:number)=>ground(gx-ROYAL_WORLD_ORIGIN.x,gy-ROYAL_WORLD_ORIGIN.y)+ROYAL_WORLD_BASE_Y;
   const chunk=createInhabitedWorldChunk(p.x,p.y,{quality:performance?'performance':'fullhd',assets,worldAssets,heightAt,visualFocus:()=>focus});chunk.group.position.set(p.x*64,0,p.y*64);chunk.setDetail(10);group.add(chunk.group);
   const geometry=new THREE.PlaneGeometry(64,64,32,32);geometry.rotateX(-Math.PI/2);geometry.translate(p.x*64+32,0,p.y*64+32);const v=geometry.getAttribute('position');for(let i=0;i<v.count;i++)v.setY(i,heightAt(v.getX(i),v.getZ(i))+.025);geometry.computeVertexNormals();const terrain=new THREE.Mesh(geometry,material);terrain.receiveShadow=true;group.add(terrain);const forest=new THREE.Group(),flora:THREE.InstancedMesh[]=[],batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[];matrices:THREE.Matrix4[]}>();forest.name='canonical-roadside-vegetation';for(const [i,f]of worldFloraChunk(p.x,p.y).entries()){if(performance&&i%2)continue;const model=f.kind==='rock'?createRock('stone',f.seed%3):worldAssets.get(f.kind);model.updateMatrixWorld(true);const matrix=new THREE.Matrix4().compose(new THREE.Vector3(f.x,heightAt(f.x,f.y),f.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),f.rotation),new THREE.Vector3(f.scale,f.scale,f.scale));model.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const key=o.geometry.uuid+':'+(Array.isArray(o.material)?o.material.map(m=>m.uuid).join(':'):o.material.uuid);let batch=batches.get(key);if(!batch){batch={geometry:o.geometry,material:o.material,matrices:[]};batches.set(key,batch);}batch.matrices.push(matrix.clone().multiply(o.matrixWorld));});}for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.castShadow=!performance;mesh.receiveShadow=true;forest.add(mesh);flora.push(mesh);}terrain.add(forest);chunks.set(id,{chunk,terrain,forest,flora});break;
  }
  return wanted.size>0&&chunks.size===wanted.size;
 },animate(seconds:number,reduced:boolean){for(const p of chunks.values())p.chunk.animate(seconds,reduced);},dispose(){for(const p of chunks.values()){p.chunk.dispose();p.terrain.geometry.dispose();p.forest.removeFromParent();p.flora.forEach(m=>m.dispose());}chunks.clear();material.dispose();assets.dispose();worldAssets.dispose();group.removeFromParent();group.clear();}};
}
