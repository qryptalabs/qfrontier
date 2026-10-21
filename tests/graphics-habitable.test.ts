import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createHabitableDistrict,habitablePreviewAllowed} from '../lib/graphics/habitable-district.ts';
import {createHabitableBuildingLayer,createHabitableBuildingLibrary,habitableBuildingVisualAt} from '../lib/graphics/habitable-buildings.ts';
import {createBuilding} from '../lib/graphics/models.ts';
import {HABITABLE_BUILDING_TEMPLATES,habitableCanPlace,habitableGroundHeight,habitableBuildingDimensions,type HabitableState,type HabitableBuilding} from '../lib/mvp/habitable-data.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';

function fixture(){const now=1000,world=createMvpWorld('owner',now),player=createPlayer(world,{ownerId:'owner',requestId:'district-graphics',now,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',now,player.id),input:SceneInput={view,player:view.player,selected:player.position,mode:'settlement',quality:'fullhd',reducedMotion:false},state:HabitableState={version:1,appearance:'pine',skin:'warm',hair:'brown',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};return{input,state};}

test('the walking avatar interpolates only the confirmed server route and stays grounded across floating origins',()=>{
  const{input,state}=fixture();state.movement={points:[{x:0,y:1.5},{x:2,y:1.5}],startsAt:1000,endsAt:2000};const before=JSON.stringify(state),district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove(){},onPlace(){},onInteract(){}});district.setOrigin({x:0,y:0});assert.deepEqual(district.animate(1500,false),{x:1,y:1.5});const model=district.group.getObjectByName('your-persistent-avatar')!;assert.equal(model.position.x,1);assert.ok(Math.abs(model.position.y-2.07)<1e-6);const route=district.group.getObjectByName('server-confirmed-walking-route')as THREE.Line,attribute=route.geometry.attributes.position;district.animate(1510,false);assert.equal(route.geometry.attributes.position,attribute,'the same route keeps its GPU buffer');
  district.setOrigin({x:64,y:-64});district.animate(1500,true);district.group.updateMatrixWorld(true);const point=model.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(point.x+64-1)<1e-8);assert.ok(Math.abs(point.z-64-1.5)<1e-8);district.animate(2500,false);assert.equal(model.position.x,2);assert.equal(route.visible,false);assert.equal(JSON.stringify(state),before);district.dispose();
});

test('avatar customization changes private appearance geometry without corrupting pooled world assets',()=>{
  const{input,state}=fixture(),district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove(){},onPlace(){},onInteract(){}});district.animate(1000,false);const avatar=district.group.getObjectByName('your-persistent-avatar')!,face=avatar.getObjectByName('actor-face')as THREE.Mesh,colors=Array.from(face.geometry.attributes.color.array);let freed=0;face.geometry.addEventListener('dispose',()=>freed++);district.update(input,{...state,appearance:'frost',skin:'deep',hair:'silver'});district.animate(1000,false);const changed=district.group.getObjectByName('your-persistent-avatar')!;assert.notEqual(changed,avatar);assert.equal(freed,1);assert.notDeepEqual(Array.from((changed.getObjectByName('actor-face')as THREE.Mesh).geometry.attributes.color.array),colors);let triangles=0;district.group.traverse(o=>{if(o instanceof THREE.Mesh){for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});assert.ok(triangles<100000);district.dispose();district.dispose();assert.equal(freed,1);
});

test('clicking requests walking, placement or interaction without changing local resources or authoritative position',()=>{
  const{input,state}=fixture(),moves:unknown[]=[],placements:unknown[]=[],interactions:string[]=[],district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove:p=>moves.push(p),onPlace:p=>placements.push(p),onInteract:id=>interactions.push(id)}),before=JSON.stringify({state,player:input.player});district.animate(1000,false);district.pointer(null,{x:2.14,y:1.35});assert.deepEqual(moves,[{x:2,y:1.5}]);const hit=district.pickables()[0];district.pointer({object:hit}as THREE.Intersection,null);assert.deepEqual(interactions,['contractor']);district.update(input,state,{templateId:'workbench',rotation:1});district.pointer(null,{x:1.1,y:14.6});assert.deepEqual(placements,[{x:1,y:14.5}]);assert.equal(JSON.stringify({state,player:input.player}),before);district.dispose();
});

test('placement ghosts use exactly the authoritative geometry and access validation',()=>{
  const{state}=fixture();for(const point of[{x:0,y:0},{x:0,y:15},{x:-18,y:16},{x:3.3,y:.5},{x:9,y:3.9}])for(const template of HABITABLE_BUILDING_TEMPLATES)for(const rotation of[0,1,2,3]as const)assert.equal(habitablePreviewAllowed(state,template.id,point,rotation,1000),habitableCanPlace(state,{templateId:template.id,...point,rotation},1000));
});

test('persistent construction models respect rotated collision footprints and server completion times',()=>{
  const{state}=fixture();for(const template of HABITABLE_BUILDING_TEMPLATES)for(const rotation of[0,1,2,3]as const){const building={id:'structure',templateId:template.id,x:0,y:15,rotation,startsAt:1000,endsAt:2000,bound:false},current={...state,buildings:[building]},layer=createHabitableBuildingLayer({state:current});layer.update(current,1500);const model=layer.group.getObjectByName('player-built-structure')!;assert.equal(model.scale.y,1);assert.equal(model.userData.constructionPhase,'frame');assert.equal(model.getObjectByName('habitable-construction-scaffold')!.visible,true);assert.equal(model.position.y,habitableGroundHeight(0,15));layer.update(current,2500);assert.equal(layer.group.getObjectByName('player-built-structure'),model);assert.equal(model.scale.y,1);assert.equal(model.getObjectByName('habitable-construction')!.visible,false);const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),planned=habitableBuildingDimensions(building);assert.ok(size.x<=planned.width+.001,`${template.id} rotation${rotation} fits X`);assert.ok(size.z<=planned.depth+.001,`${template.id} rotation${rotation} fits Z`);layer.dispose();}
});

test('building previews reuse template geometry and never dispose borrowed original village assets',()=>{
  const borrowed=createBuilding('warehouse',1,'cartographers'),borrowedGeometry=new Set<THREE.BufferGeometry>();borrowed.traverse(o=>{if(o instanceof THREE.Mesh)borrowedGeometry.add(o.geometry);});let incorrectlyFreed=0;borrowedGeometry.forEach(g=>g.addEventListener('dispose',()=>incorrectlyFreed++));const library=createHabitableBuildingLibrary(),a=library.get('workbench'),b=library.get('workbench');assert.equal((a.children[0]as THREE.Mesh).geometry,(b.children[0]as THREE.Mesh).geometry);library.get('shed');let freed=0;(a.children[0]as THREE.Mesh).geometry.addEventListener('dispose',()=>freed++);library.dispose();library.dispose();assert.equal(freed,1);assert.equal(incorrectlyFreed,0);
});

test('small masonry foundations physically support a permitted building across the authored beach step',()=>{
  const{state}=fixture(),building={id:'beach-step',templateId:'shed'as const,x:-2,y:-8,rotation:0 as const,startsAt:0,endsAt:1,bound:false},current={...state,buildings:[building]},layer=createHabitableBuildingLayer({state:current});assert.ok(habitableCanPlace(state,building,2000));layer.update(current,2000);layer.group.updateMatrixWorld(true);const foundation=layer.group.getObjectByName('habitable-masonry-foundation')!,bounds=new THREE.Box3().setFromObject(foundation);assert.ok(bounds.min.y<=1.65);assert.ok(Math.abs(bounds.max.y-habitableGroundHeight(-2,-8))<.001);assert.ok(bounds.max.y-bounds.min.y>=.49);layer.dispose();
});

test('nearby public participants are rendered read only using their own confirmed local routes',()=>{
  const{input,state}=fixture();input.view.habitable.actors.push({playerId:'other',name:'Mara',plot:{x:48,y:0},state:{appearance:'frost',profession:'farmer',position:{x:0,y:1},movement:{points:[{x:0,y:1},{x:2,y:1}],startsAt:1000,endsAt:2000},buildings:[]}});let requests=0;const before=JSON.stringify(input.view.habitable.actors),district=createHabitableDistrict({input,state,groundHeight:()=>2,onMove(){requests++;},onPlace(){requests++;},onInteract(){requests++;}});district.animate(1500,false);const model=district.group.getObjectByName('nearby-player-other')!;assert.ok(model);assert.equal(model.position.x,49);assert.equal(model.position.z,1);assert.ok(!district.pickables().includes(model));assert.equal(requests,0);assert.equal(JSON.stringify(input.view.habitable.actors),before);district.dispose();
});

function facility(templateId:HabitableBuilding['templateId'],visual?:HabitableBuilding['visual']):HabitableBuilding{return{id:`facility-${templateId}`,templateId,x:-2,y:-8,rotation:0,startsAt:0,endsAt:1000,bound:false,...(visual?{visual}:{})};}

test('old saves render empty functional facilities without inventing stored cargo, crops or production',()=>{
  const{state}=fixture(),current={...state,buildings:[facility('shed'),facility('workbench'),facility('planter')]},before=JSON.stringify(current),layer=createHabitableBuildingLayer({state:current});layer.update(current,1500);
  assert.equal(layer.group.getObjectByName('habitable-stored-cargo')!.children.filter(o=>o.visible).length,0);assert.equal(layer.group.getObjectByName('habitable-workpiece')!.visible,false);assert.equal(layer.group.getObjectByName('habitable-work-lamp')!.visible,false);
  for(let i=0;i<3;i++)assert.equal(layer.group.getObjectByName(`habitable-crop-${i}`)!.visible,false);
  const tool=layer.group.getObjectByName('habitable-working-tool')!,pose=tool.matrix.clone();layer.update(current,1900);tool.updateMatrix();assert.ok(tool.matrix.equals(pose));assert.equal(JSON.stringify(current),before);layer.dispose();
});

test('storage occupancy uses the public aggregate and reuses the same bounded cargo geometry',()=>{
  const{state}=fixture(),shed=facility('shed',{state:'idle',storedUnits:0,capacity:80}),current={...state,buildings:[shed]},layer=createHabitableBuildingLayer({state:current});layer.update(current,2000);const cargo=layer.group.getObjectByName('habitable-stored-cargo')!,geometry=(cargo.children[0]as THREE.Mesh).geometry;
  for(const[stored,expected]of[[0,0],[1,1],[40,3],[80,6],[8000,6]]){shed.visual!.storedUnits=stored;layer.update(current,2000);assert.equal(cargo.children.filter(o=>o.visible).length,expected);assert.equal((cargo.children[0]as THREE.Mesh).geometry,geometry);assert.equal((cargo.children[5]as THREE.Mesh).geometry,geometry);}
  shed.visual!.storedUnits=0;layer.update(current,2000);assert.equal(cargo.children.filter(o=>o.visible).length,0);layer.dispose();
});

test('crafting follows confirmed job times and recipe while tools remain physically supported and idle stays still',()=>{
  const{state}=fixture(),workbench=facility('workbench',{state:'working',operation:'craft',recipeId:'plank',startsAt:10000,endsAt:20000}),current={...state,buildings:[workbench]},layer=createHabitableBuildingLayer({state:current});layer.update(current,9000);const work=layer.group.getObjectByName('habitable-workpiece')!,tool=layer.group.getObjectByName('habitable-working-tool')!,lamp=layer.group.getObjectByName('habitable-work-lamp')!,pose=tool.matrix.clone();assert.equal(work.visible,false);layer.update(current,15000);assert.equal(work.visible,true);assert.equal(work.getObjectByName('habitable-work-plank')!.visible,true);assert.equal(work.getObjectByName('habitable-work-cloth')!.visible,false);assert.equal(lamp.visible,true);tool.updateMatrix();assert.ok(tool.matrix.equals(pose),'a hammer never moves by itself');
  workbench.visual!.recipeId='cloth';layer.update(current,16000,true);assert.equal(work.getObjectByName('habitable-work-cloth')!.visible,true);assert.equal(work.getObjectByName('habitable-work-plank')!.visible,false);assert.equal(lamp.scale.y,1);
  layer.update(current,20000);assert.equal(work.visible,false);assert.equal(lamp.visible,false);assert.equal(habitableBuildingVisualAt(workbench,20000).status,'Comprobando');workbench.visual={state:'idle'};layer.update(current,21000);assert.equal(habitableBuildingVisualAt(workbench,21000).status,'Disponible');assert.equal(work.visible,false);layer.dispose();
});

test('planter growth has three real timed stages and returns to bare soil when harvesting settles',()=>{
  const{state}=fixture(),planter=facility('planter',{state:'working',operation:'grow',startsAt:10000,endsAt:20000}),current={...state,buildings:[planter]},layer=createHabitableBuildingLayer({state:current});
  for(const[now,stage]of[[11000,0],[15000,1],[19000,2]]){const before=JSON.stringify(current);layer.update(current,now,true);for(let i=0;i<3;i++)assert.equal(layer.group.getObjectByName(`habitable-crop-${i}`)!.visible,i===stage);assert.equal(JSON.stringify(current),before);}
  layer.update(current,20000);for(let i=0;i<3;i++)assert.equal(layer.group.getObjectByName(`habitable-crop-${i}`)!.visible,false);planter.visual={state:'idle'};layer.update(current,21000);assert.equal(layer.group.getObjectByName('player-built-facility-planter')!.userData.habitableLabel,'Bancal · Disponible');layer.dispose();
});

test('functional details remain inside existing rotated footprints even when the store is full and crops have grown',()=>{
  const{state}=fixture();for(const template of HABITABLE_BUILDING_TEMPLATES)for(const rotation of[0,1,2,3]as const){const building={...facility(template.id,{state:'working'as const,operation:template.id==='planter'?'grow'as const:'craft'as const,startsAt:1000,endsAt:10000,storedUnits:80,capacity:80}),rotation},current={...state,buildings:[building]},layer=createHabitableBuildingLayer({state:current});layer.update(current,9000);const bounds=new THREE.Box3().setFromObject(layer.group),size=bounds.getSize(new THREE.Vector3()),expected=habitableBuildingDimensions(building);assert.ok(size.x<=expected.width+.001,`${template.id}/${rotation} X`);assert.ok(size.z<=expected.depth+.001,`${template.id}/${rotation} Z`);layer.dispose();}
});

test('clicking a persistent facility selects its exact id without moving the avatar or submitting a resource order',()=>{
  const{input,state}=fixture(),current={...state,buildings:[facility('workbench')]},selected:string[]=[],district=createHabitableDistrict({input,state:current,groundHeight:()=>2,onMove(){assert.fail('building selection cannot walk');},onPlace(){assert.fail('building selection cannot construct');},onInteract:id=>selected.push(id)}),before=JSON.stringify(current);const hit=district.pickables().find(o=>o.userData.habitableBuilding==='facility-workbench');assert.ok(hit);district.pointer({object:hit}as THREE.Intersection,null);assert.deepEqual(selected,['building:facility-workbench']);assert.equal(JSON.stringify(current),before);district.update(input,{...current,buildings:[]});assert.ok(!district.pickables().includes(hit));district.dispose();district.dispose();
});

test('empty storage removes exactly the two decorative legacy crates while preserving the original village asset',()=>{
  const original=createBuilding('warehouse',1,'cartographers'),indexCount=(group:THREE.Object3D)=>{let count=0;group.traverse(object=>{if(object instanceof THREE.Mesh)count+=object.geometry.index?.count??0;});return count;},before=indexCount(original),library=createHabitableBuildingLibrary(),empty=library.get('shed').children[0];assert.equal(before-indexCount(empty),10*36,'two five-part voxel crates are removed; walls, ornament and windows remain');assert.equal(indexCount(createBuilding('warehouse',1,'cartographers')),before);library.dispose();assert.equal(indexCount(original),before);
});

test('facility labels reuse their GPU texture until status changes and dispose exactly once when removed',()=>{
  const globals=globalThis as typeof globalThis&{document?:Document},previous=globals.document;let canvases=0,repaints=0;const context={clearRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},fillText(){repaints++;}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){canvases++;return{width:0,height:0,getContext(){return context;}};}}});
  try{const{state}=fixture(),shed=facility('shed',{state:'idle',storedUnits:0,capacity:80}),current={...state,buildings:[shed]},layer=createHabitableBuildingLayer({state:current,labels:true,interactive:true});layer.update(current,2000);const sprite=layer.group.getObjectByName('habitable-building-label')as THREE.Sprite,material=sprite.material,texture=material.map!;let freedTexture=0,freedMaterial=0;texture.addEventListener('dispose',()=>freedTexture++);material.addEventListener('dispose',()=>freedMaterial++);for(let now=2001;now<2100;now++)layer.update(current,now);assert.equal(canvases,1);assert.equal(repaints,1);assert.equal((layer.group.getObjectByName('habitable-building-label')as THREE.Sprite).material.map,texture);shed.visual!.storedUnits=30;layer.update(current,2200);assert.equal(repaints,2);layer.update({...current,buildings:[]},2300);assert.equal(layer.pickables().length,0);assert.equal(freedTexture,1);assert.equal(freedMaterial,1);layer.dispose();layer.dispose();assert.equal(freedTexture,1);assert.equal(freedMaterial,1);}finally{if(previous===undefined)Reflect.deleteProperty(globalThis,'document');else Object.defineProperty(globalThis,'document',{configurable:true,value:previous});}
});
