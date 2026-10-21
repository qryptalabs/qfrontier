import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createLandDevelopmentLayer,landDevelopmentActive} from '../lib/graphics/land-development.ts';
import {landCellGeometry,landTerrainHeight,type LandTerrainStateLike} from '../lib/graphics/land-terrain.ts';
import {buildWorldTerrainGeometry,continuousTerrainHeight} from '../lib/graphics/world-terrain-renderer.ts';
import {createHabitableDistrict} from '../lib/graphics/habitable-district.ts';
import {islandContains} from '../lib/graphics/settlement-layout.ts';
import {sampleWorld} from '../lib/graphics/world-geography.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {HabitableState} from '../lib/mvp/habitable-data.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';

const work={id:'clear-one',kind:'clear' as const,cells:['land_12_0'],startsAt:1000,endsAt:16000,stand:{x:0,y:0}};

test('own private cells coexist with public work schedules without early terrain or duplicated workers',()=>{
 const state={land:{centerLevel:2,cells:{}},landVisual:{centerLevel:2,cells:{},works:[work]}},before=JSON.stringify(state),layer=createLandDevelopmentLayer({groundHeight:()=>2});
 layer.update(state,999,true);assert.equal(layer.group.userData.activePreparations,0);assert.equal(landDevelopmentActive(state,999),false);
 layer.update(state,8500,true);assert.equal(landDevelopmentActive(state,8500),true);const marker=layer.group.getObjectByName('land-work-clear-one')!;assert.ok(marker);assert.equal(marker.userData.progress,.5);assert.equal(layer.group.userData.preparedCells,0);assert.equal(layer.group.getObjectByName('claimed-land-connected-support'),undefined);assert.ok(!layer.group.children.some(c=>c.name.includes('worker')),'contracted clearing is stakes and progress, never a phantom axe actor at default stand');
 layer.update(state,9000,false);assert.equal(layer.group.getObjectByName('land-work-clear-one'),marker);layer.update(state,16000,true);assert.equal(layer.group.getObjectByName('land-work-clear-one'),undefined);assert.equal(landDevelopmentActive(state,16000),false);assert.equal(JSON.stringify(state),before);layer.dispose();layer.dispose();
});

test('confirmed adjacent cells form finite connected voxel support only outside the original island',()=>{
 let current:LandTerrainStateLike={land:{cells:{land_12_0:{clearedAt:1}}}},samples=0;const layer=createLandDevelopmentLayer({groundHeight:(x,y)=>{samples++;return landTerrainHeight(current,x,y,9);}});
 layer.update(current,2);assert.equal(layer.group.getObjectByName('claimed-land-connected-support'),undefined);
 current={land:{cells:{land_12_0:{clearedAt:1,claimedAt:2},land_13_0:{clearedAt:1,claimedAt:2},land_24_16:{clearedAt:1,claimedAt:2}}}};layer.update(current,3);const support=layer.group.getObjectByName('claimed-land-connected-support')as THREE.InstancedMesh;assert.ok(support);assert.equal(support.count,98,'two dry 7x7 cells are supported while the downstream pool stays wet');const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();for(let i=0;i<support.count;i++){support.getMatrixAt(i,matrix);matrix.decompose(position,quat,scale);assert.equal(islandContains(position.x,position.z),false);assert.ok(Math.abs(position.y+scale.y/2-2.025)<1e-6);assert.ok(Array.from(matrix.elements).every(Number.isFinite));}
 let freed=0;support.addEventListener('dispose',()=>freed++);layer.setPresentation({visible:true,selection:['land_12_0']});const grid=layer.group.getObjectByName('land-cadastral-grid')as THREE.InstancedMesh;assert.equal(grid.visible,true);assert.equal(grid.count,625);const after=samples;for(let i=0;i<20;i++)layer.setPresentation({visible:true,hover:'land_13_0',selection:['land_12_0']});assert.equal(samples,after,'hover only recolors existing matrices, without resampling or rebuilding terrain');layer.setPresentation({visible:false});assert.equal(grid.visible,false);layer.dispose();layer.dispose();assert.equal(freed,1);
});

test('center work shows timed scaffold without duplicating the authoritative builder',()=>{
 const layer=createLandDevelopmentLayer({groundHeight:()=>2}),state={land:{cells:{},centerLevel:1},landVisual:{cells:{},centerLevel:1,works:[{...work,id:'center',kind:'center' as const,cells:[]}]}};layer.update(state,2000,true);const marker=layer.group.getObjectByName('land-work-center')!;assert.ok(marker.getObjectByName('habitable-construction-scaffold'));assert.equal(marker.getObjectByName('habitable-construction-frame')?.visible,false);assert.ok(!marker.getObjectByName('functional-worker'));layer.update(state,16000,true);assert.equal(layer.group.getObjectByName('land-work-center'),undefined);layer.dispose();
});

test('real terrain geometry supports cell boundaries at every LOD and keeps legacy terrain unchanged before completion',()=>{
 const center={x:0,y:0},base=sampleWorld(0,0).height,cell=landCellGeometry('land_6_24')!,pending={...center,land:{cells:{[cell.id]:{clearedAt:1}}}},complete={...center,land:{cells:{[cell.id]:{clearedAt:1,claimedAt:2}}}};
 assert.equal(continuousTerrainHeight(cell.x,cell.y,complete),3.65+base-2);for(const step of[2,4,8]){
  const legacy=buildWorldTerrainGeometry(0,-1,step,center),waiting=buildWorldTerrainGeometry(0,-1,step,pending),built=buildWorldTerrainGeometry(0,-1,step,complete);assert.deepEqual(waiting.terrain.attributes.position.array,legacy.terrain.attributes.position.array);assert.deepEqual(waiting.water.attributes.position.array,legacy.water.attributes.position.array);
  for(const geometry of[built.terrain,built.water])for(const value of geometry.attributes.position.array)assert.ok(Number.isFinite(value),'prepared boundaries must not use undefined per-cell dimensions in the lattice cache');
  const vertices=built.terrain.attributes.position;for(let first=0;first<vertices.count;first+=3){const x=(vertices.getX(first)+vertices.getX(first+1)+vertices.getX(first+2))/3,y=(vertices.getZ(first)+vertices.getZ(first+1)+vertices.getZ(first+2))/3-64,flat=Math.abs(vertices.getY(first)-vertices.getY(first+1))<1e-6&&Math.abs(vertices.getY(first)-vertices.getY(first+2))<1e-6;if(flat)assert.ok(!(x>cell.minX+1e-5&&x<cell.maxX-1e-5&&y>cell.minY+1e-5&&y<cell.maxY-1e-5),'coarse native top faces cannot intersect the claimed fine cell');}
  for(const item of[legacy,waiting,built]){item.terrain.dispose();item.water.dispose();}
 }
});

test('land canvas selects a stable cell without issuing walking, building or interaction actions',()=>{
 const now=1000,world=createMvpWorld('owner',now),player=createPlayer(world,{ownerId:'owner',requestId:'land-graphics',now,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',now,player.id),input:SceneInput={view,player:view.player,selected:player.position,mode:'settlement',quality:'performance',reducedMotion:true},state:HabitableState={version:1,appearance:'pine',profession:'carpenter',position:{x:0,y:1.5},buildings:[]};
 const plot=player.settlement;assert.ok(plot);const selected:string[]=[],actions:string[]=[],district=createHabitableDistrict({input,state,landMode:true,groundHeight:()=>2,onLandCell:id=>selected.push(id),onMove:()=>actions.push('move'),onPlace:()=>actions.push('build'),onInteract:()=>actions.push('interact')});const before=JSON.stringify(state);district.pointer(null,{x:plot.x-16.8,y:plot.y});district.key?.({key:'w',preventDefault(){actions.push('prevented');}}as KeyboardEvent);assert.deepEqual(selected,['land_12_0']);assert.deepEqual(actions,[]);assert.equal(JSON.stringify(state),before);assert.equal(district.group.getObjectByName('land-cadastral-grid')!.visible,true);district.update(input,state,null,{landMode:false});district.pointer(null,{x:plot.x+1,y:plot.y+1.5});assert.deepEqual(actions,['move']);district.dispose();
});
