import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createBiomeSettlementLibrary,type BiomeStructureKind} from '../lib/graphics/biome-settlement-models.ts';
import type {WorldBiome} from '../lib/graphics/world-geography.ts';

const biomes:WorldBiome[]=['ice','desert','mountain','forest','plains','tropical','coast','ocean'];
const dwellings:BiomeStructureKind[]=['home','kitchen','workshop','warehouse','logistics','laboratory','barracks'];
function meshes(model:THREE.Object3D){const result:THREE.Mesh[]=[];model.traverse(object=>{if(object instanceof THREE.Mesh)result.push(object);});return result;}
function signature(model:THREE.Object3D){const hash=createHash('sha256');for(const mesh of meshes(model))for(const key of['position','color']){const array=mesh.geometry.getAttribute(key).array;hash.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));}return hash.digest('hex');}

test('street-level windows have actual depth on every elevation, including the back of a house',()=>{
  const library=createBiomeSettlementLibrary(),home=library.get('home','forest',1,0);home.updateMatrixWorld(true);
  // Rays are offset from the crossing mullions and reveal frames. A flat painted
  // window would hit the exterior plane rather than the recessed glazing.
  for(let side=0;side<4;side++){
    const angle=side*Math.PI/2,n=side%2?.83:.71,w=side%2?1.42:1.66,u=side===0?.56:-w*.24+.06,y=.13+1.18*.62+.08,c=Math.cos(angle),s=Math.sin(angle);
    const shoot=(across:number)=>{const ray=new THREE.Raycaster(new THREE.Vector3(c*across+s*(n+2),y,-s*across+c*(n+2)),new THREE.Vector3(-s,0,-c));return ray.intersectObject(home,true)[0];};
    const glass=shoot(u),wall=shoot(side===0?-.7:0);assert.ok(glass&&wall,`side${side} contains both a solid wall and glazing`);
    const normal=glass.point.x*s+glass.point.z*c;assert.ok(normal<n-.08&&normal>n-.15,`side${side} glazing is behind the exterior wall, not a decal`);
    assert.ok(glass.distance-wall.distance>.08,`side${side} has a visibly deep reveal`);
  }
  library.dispose();
});

test('biome lodges, shops and civic buildings remain within the existing collision envelopes for every climate',()=>{
  const library=createBiomeSettlementLibrary();
  for(const biome of biomes)for(const kind of[...dwellings,'keep','hall','tower']as BiomeStructureKind[])for(const variant of[0,1,3]){
    const model=library.get(kind,biome,3,variant),bounds=new THREE.Box3().setFromObject(model,true),civic=kind==='keep'||kind==='hall',tower=kind==='tower',halfW=civic?2.3:tower?1.4:1.35,halfD=civic?2.2:tower?1.4:1.3;
    assert.ok(bounds.min.x>=-halfW-.001&&bounds.max.x<=halfW+.001&&bounds.min.z>=-halfD-.001&&bounds.max.z<=halfD+.001,`${biome}/${kind}/${variant} cannot intrude into an existing street`);
    assert.ok(bounds.min.y>=-.001&&bounds.max.y<6,`${biome}/${kind} keeps its established vertical budget`);
    assert.ok(meshes(model).length<=3,'details are merged into at most three shared material batches');
    const triangles=meshes(model).reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3,0);assert.ok(triangles<24_000,'street detail has a finite per-template geometry budget');
  }
  library.dispose();
});

test('occupations have different street displays while cold, coastal and desert architecture retain distinct silhouettes',()=>{
  const library=createBiomeSettlementLibrary(),shops=new Set<string>();
  for(const kind of['kitchen','workshop','logistics','warehouse']as const)shops.add(signature(library.get(kind,'forest',3,0)));assert.equal(shops.size,4,'bread, forge, produce and warehouse hoist are distinct physical models');
  const ice=library.get('home','ice',3,0),desert=library.get('home','desert',3,0),coast=library.get('home','coast',3,0);
  assert.equal(new Set([ice,desert,coast].map(signature)).size,3);
  assert.ok(new THREE.Box3().setFromObject(ice).max.y>new THREE.Box3().setFromObject(desert).max.y,'the snow lodge has a steeper roof than the parapet-and-dome house');
  const market=library.get('market','desert',2);assert.equal(market.userData.architecture.stalls,6);assert.equal(market.userData.architecture.goodsTrays,18);assert.ok(meshes(market).length<=3);
  library.dispose();
});

test('detailed clones share geometry, glazing and procedural grain, and the library frees those GPU resources exactly once',()=>{
  const library=createBiomeSettlementLibrary(),a=library.get('home','ice',3),b=library.get('home','ice',3),aa=meshes(a),bb=meshes(b),resources=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>();
  aa.forEach((mesh,i)=>{assert.equal(mesh.geometry,bb[i].geometry);assert.equal(mesh.material,bb[i].material);resources.add(mesh.geometry);const material=mesh.material as THREE.MeshStandardMaterial;resources.add(material);if(material.map)resources.add(material.map);});
  const freed=new Map<unknown,number>();resources.forEach(resource=>resource.addEventListener('dispose',()=>freed.set(resource,(freed.get(resource)??0)+1)));
  library.dispose();library.dispose();resources.forEach(resource=>assert.equal(freed.get(resource),1));assert.throws(()=>library.get('home','ice'));
});
