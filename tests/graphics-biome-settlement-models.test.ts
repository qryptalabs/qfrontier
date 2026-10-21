import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createBiomeSettlementLibrary,type BiomeStructureKind} from '../lib/graphics/biome-settlement-models.ts';
import {createLivingActorLibrary} from '../lib/graphics/living-actors.ts';
import {animateWorldAsset} from '../lib/graphics/world-models.ts';
import {createBuilding} from '../lib/graphics/models.ts';
import type {WorldBiome} from '../lib/graphics/world-geography.ts';
import {INHABITED_BUILDINGS,INHABITED_PLACES,INHABITED_RESIDENTS} from '../lib/graphics/inhabited-world-data.ts';

const biomes:WorldBiome[]=['ice','desert','forest','plains','mountain','tropical','coast','ocean'];
const kinds:BiomeStructureKind[]=['home','workshop','garden','kitchen','laboratory','barracks','warehouse','logistics','market','windmill','keep','hall','tower','fence','prop','dock'];
function meshes(group:THREE.Object3D){const values:THREE.Mesh[]=[];group.traverse(object=>{if(object instanceof THREE.Mesh)values.push(object);});return values;}
function signature(group:THREE.Group){return meshes(group).map(mesh=>`${mesh.geometry.attributes.position.count}:${[...mesh.geometry.attributes.position.array].slice(0,60).join(',')}:${mesh.geometry.attributes.color?[...mesh.geometry.attributes.color.array].slice(-240).join(','):(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`).join('|');}

test('every biome has detailed finite architecture with bounded geometry and canonical kind metadata',()=>{
  const library=createBiomeSettlementLibrary();
  for(const biome of biomes)for(const kind of kinds){const model=library.get(kind,biome,3,2);let triangles=0;for(const mesh of meshes(model)){triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}
    assert.ok(triangles>=24&&triangles<30_000,`${biome}/${kind} remains inside its detailed asset budget`);assert.equal(model.userData.biome,biome);assert.equal(model.userData.structureKind,kind);assert.ok(meshes(model).length<30);
    const bounds=new THREE.Box3().setFromObject(model);assert.ok(bounds.min.y>=-.25);assert.ok(bounds.max.y<8);assert.ok(bounds.max.x-bounds.min.x<8);assert.ok(bounds.max.z-bounds.min.z<5);
  }library.dispose();
});

test('biome homes and civic silhouettes differ while variants remain deterministic',()=>{
  const library=createBiomeSettlementLibrary(),designs=new Set<string>();
  for(const biome of biomes.filter(b=>b!=='ocean'))designs.add(signature(library.get('home',biome,2,0)));
  assert.equal(designs.size,7,'seven inhabited land biomes have distinct material/shape detail');
  assert.notEqual(signature(library.get('home','ice',2,0)),signature(library.get('home','ice',2,1)),'glacial lodge and igloo are different shapes');
  assert.equal(signature(library.get('workshop','desert',3,3)),signature(library.get('workshop','desert',3,3)));
  assert.notEqual(signature(library.get('keep','desert',3)),signature(library.get('keep','ice',3)));library.dispose();
});

test('glacial gardens are sheltered, desert beds are shaded and tropical crops have paddy water',()=>{
  const library=createBiomeSettlementLibrary(),ice=library.get('garden','ice',1),desert=library.get('garden','desert',1),forest=library.get('garden','forest',1),tropical=library.get('garden','tropical',1);
  assert.ok(new THREE.Box3().setFromObject(ice).max.y>1.4,'greenhouse spans the ice crops');assert.ok(new THREE.Box3().setFromObject(desert).max.y>1.6,'shade canopy covers desert beds');assert.ok(new THREE.Box3().setFromObject(forest).max.y<.8,'temperate garden stays open');
  const water=new THREE.Color(0x70968a),colors=meshes(tropical)[0].geometry.attributes.color;let found=false;for(let i=0;i<colors.count;i++)if(Math.abs(colors.getX(i)-water.r)<1e-6&&Math.abs(colors.getY(i)-water.g)<1e-6&&Math.abs(colors.getZ(i)-water.b)<1e-6)found=true;assert.equal(found,true);library.dispose();
});

test('template clones share owned resources and disposing the biome library does not free borrowed global buildings',()=>{
  const library=createBiomeSettlementLibrary(),first=library.get('home','ice',2),second=library.get('home','ice',2),forest=library.get('home','forest',2),ownGeometry=meshes(first)[0].geometry,borrowed=meshes(createBuilding('home',2,'custodians'))[0].geometry;
  assert.ok(meshes(forest).length<30,'borrowed forest building parts are compacted by material');
  assert.equal(ownGeometry,meshes(second)[0].geometry);assert.notEqual(first,second);let ownedFreed=0,borrowedFreed=0;ownGeometry.addEventListener('dispose',()=>ownedFreed++);borrowed.addEventListener('dispose',()=>borrowedFreed++);library.dispose();library.dispose();assert.equal(ownedFreed,1);assert.equal(borrowedFreed,0);assert.throws(()=>library.get('home','ice'));
});

test('all biome mills keep independently animated sails around the same hub',()=>{
  const library=createBiomeSettlementLibrary();for(const biome of biomes){const first=library.get('windmill',biome,2),second=library.get('windmill',biome,2),rotor=first.getObjectByName('windmill-rotor')!;assert.ok(rotor);const hub=rotor.position.clone();animateWorldAsset(first,5,.3);assert.ok(Math.abs(rotor.rotation.z-2.4)<1e-9);assert.deepEqual(rotor.position.toArray(),hub.toArray());assert.equal(Math.abs(second.getObjectByName('windmill-rotor')!.rotation.z),0);rotor.traverse(object=>assert.equal(object.userData.worldAnimated,true));}library.dispose();
});

test('climate clothing and regional transports preserve the actor API and frozen-time poses',()=>{
  const library=createLivingActorLibrary(),ice=library.getForBiome('farmer','ice',4),desert=library.getForBiome('farmer','desert',4);assert.ok(ice.group.getObjectByName('actor-winter-cloak'));assert.equal(desert.group.getObjectByName('actor-winter-cloak'),undefined);assert.notEqual(signature(ice.group),signature(desert.group));
  for(const actor of[ice,desert]){actor.group.position.set(13,2,-18);actor.animate(4,false,true);const pose=actor.group.getObjectByName('actor-right-shoulder')!.rotation.x;actor.animate(4,false,true);assert.equal(actor.group.getObjectByName('actor-right-shoulder')!.rotation.x,pose);actor.animate(4.5,false,true);assert.notEqual(actor.group.getObjectByName('actor-right-shoulder')!.rotation.x,pose);assert.deepEqual(actor.group.position.toArray(),[13,2,-18]);}
  for(const kind of['sled','cart','boat','camel']as const){const transport=library.transport(kind,7);transport.group.position.set(3,2,5);transport.animate(4,1);const pose=transport.group.rotation.z;transport.animate(4,1);assert.equal(transport.group.rotation.z,pose);assert.deepEqual(transport.group.position.toArray(),[3,2,5]);assert.ok(meshes(transport.group).length>0);for(const mesh of meshes(transport.group))for(const value of mesh.geometry.attributes.position.array)assert.ok(Number.isFinite(value));transport.dispose();}
  library.dispose();
});

test('actual rotated architecture and full rotor sweeps fit plans and leave resident routes clear in all 33 places',()=>{
  const library=createBiomeSettlementLibrary(),byOwner=new Map<string,{building:typeof INHABITED_BUILDINGS[number];bounds:THREE.Box3}[]>();
  assert.equal(INHABITED_PLACES.length,33);
  for(const building of INHABITED_BUILDINGS){
    if(building.construction)continue;
    const model=library.get(building.kind,building.biome,building.level,building.variant),localBounds=new THREE.Box3().setFromObject(model,true),rotor=model.getObjectByName('windmill-rotor');
    if(rotor)for(let step=0;step<32;step++){rotor.rotation.z=step*Math.PI/16;localBounds.union(new THREE.Box3().setFromObject(model,true));}
    let entries=byOwner.get(building.owner);if(!entries){entries=[];byOwner.set(building.owner,entries);}entries.push({building,bounds:localBounds});
    model.position.set(building.x,0,building.y);model.scale.setScalar(building.scale);model.rotation.y=building.rotation;
    const worldBounds=new THREE.Box3().setFromObject(model,true);if(rotor)for(let step=0;step<32;step++){rotor.rotation.z=step*Math.PI/16;worldBounds.union(new THREE.Box3().setFromObject(model,true));}
    assert.ok(worldBounds.min.x>=building.x-building.width/2-.02&&worldBounds.max.x<=building.x+building.width/2+.02&&worldBounds.min.z>=building.y-building.depth/2-.02&&worldBounds.max.z<=building.y+building.depth/2+.02,`${building.id} actual geometry remains in its planned footprint`);
  }
  for(const resident of INHABITED_RESIDENTS)for(let segment=1;segment<resident.route.length;segment++){
    const a=resident.route[segment-1],b=resident.route[segment],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    for(let step=0;step<=steps;step++){
      const x=a.x+(b.x-a.x)*step/steps,y=a.y+(b.y-a.y)*step/steps;
      for(const{building,bounds}of byOwner.get(resident.owner)??[]){const dx=x-building.x,dz=y-building.y,c=Math.cos(building.rotation),s=Math.sin(building.rotation),lx=(c*dx-s*dz)/building.scale,lz=(s*dx+c*dz)/building.scale,padding=.15/building.scale;
        assert.ok(!(lx>bounds.min.x-padding&&lx<bounds.max.x+padding&&lz>bounds.min.z-padding&&lz<bounds.max.z+padding),`${resident.id} route keeps clear of ${building.id}`);
      }
    }
  }
  library.dispose();
});
