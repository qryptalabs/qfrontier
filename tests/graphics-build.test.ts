import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {runGraphicsBuild,createTerrainHeightCache,type GraphicsBuildEnvironment} from '../lib/graphics/graphics-build.ts';
import {createPlanetSurface,createPlanetSurfaceAsync} from '../lib/graphics/planet-surface.ts';
import {createSettlement,createSettlementAsync} from '../lib/graphics/settlement.ts';
import {habitableLandscapeShape,stationLandscapeSignature} from '../lib/graphics/scene-structure.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import type {SceneInput} from '../lib/graphics/scene-data.ts';
import type {HabitableState} from '../lib/mvp/habitable-data.ts';
function environment(){let clock=0,id=0;const tasks=new Map<number,(remaining:()=>number)=>void>();const env:GraphicsBuildEnvironment={now:()=>clock,schedule:callback=>{const key=++id;tasks.set(key,callback);return()=>{tasks.delete(key);};}};return{env,tasks,advance(){clock++;},tick(){const entry=tasks.entries().next().value;if(!entry)return false;tasks.delete(entry[0]);entry[1](()=>4);return true;},drain(){let slices=0;while(this.tick()){slices++;assert.ok(slices<10000);}return slices;}};}
function fingerprint(group:THREE.Object3D){const hash=createHash('sha256');group.updateMatrixWorld(true);group.traverse(object=>{hash.update(object.type+object.name);hash.update(JSON.stringify(object.matrix.elements));if(object instanceof THREE.Mesh){for(const name of Object.keys(object.geometry.attributes).sort()){const data=object.geometry.attributes[name].array;hash.update(name);hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength));}if(object.geometry.index){const data=object.geometry.index.array;hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength));}if(object instanceof THREE.InstancedMesh)for(const attribute of[object.instanceMatrix,object.instanceColor])if(attribute){const data=attribute.array;hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength));}for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial){hash.update(JSON.stringify([material.color.getHex(),material.roughness,material.opacity]));for(const map of[material.map,material.bumpMap,material.roughnessMap,material.emissiveMap])if(map instanceof THREE.DataTexture){const data=map.image.data;assert.ok(data);hash.update(Buffer.from(data.buffer,data.byteOffset,data.byteLength));}}}});return hash.digest('hex');}

test('CPU preparation starts asynchronously, yields its bounded slice to input, and cancellation finalizes partial resources once',async()=>{
 const e=environment(),abort=new AbortController();let operations=0,disposed=0;
 function* task(){try{for(let i=0;i<20;i++){operations++;e.advance();yield;}return 42;}finally{disposed++;}}
 const result=runGraphicsBuild(task(),{signal:abort.signal,environment:e.env});assert.equal(operations,0);assert.equal(e.tasks.size,1);e.tick();assert.equal(operations,4);assert.equal(disposed,0);assert.equal(e.tasks.size,1);abort.abort();await assert.rejects(result,{name:'AbortError'});assert.equal(disposed,1);assert.equal(e.tasks.size,0);e.drain();assert.equal(operations,4);
 const completed=runGraphicsBuild(task(),{environment:e.env});assert.ok(e.drain()>1);assert.equal(await completed,42);assert.equal(disposed,2);
});
test('incrementally prepared planet preserves every map pixel, relief vertex, atmosphere and material',async()=>{
 const expected=createPlanetSurface('performance'),e=environment(),pending=createPlanetSurfaceAsync('performance',{environment:e.env});assert.ok(e.drain()>4,'texture rows and relief do not form one monolithic CPU task');const actual=await pending;assert.equal(fingerprint(actual.group),fingerprint(expected.group));actual.dispose();expected.dispose();
});
test('incrementally prepared settlement preserves all voxel instances, detailed buildings, vegetation and the connected valley',async()=>{
 const options={player:null,quality:'performance' as const,showcase:false},expected=createSettlement(options),e=environment(),pending=createSettlementAsync(options,{environment:e.env});assert.ok(e.drain()>4);const actual=await pending;assert.equal(fingerprint(actual.group),fingerprint(expected.group));assert.deepEqual(actual.group.userData,expected.group.userData);actual.dispose();actual.dispose();expected.dispose();
});
test('cancelling an unfinished settlement releases allocated private geometry without disposing shared model materials',async()=>{
 const e=environment(),abort=new AbortController(),disposed:string[]=[];const original=THREE.BufferGeometry.prototype.dispose,spy=mock.method(THREE.BufferGeometry.prototype,'dispose',function(this:THREE.BufferGeometry){disposed.push(this.uuid);original.call(this);});
 try{const pending=createSettlementAsync({player:null,quality:'performance',showcase:false},{signal:abort.signal,environment:e.env});e.tick();abort.abort();await assert.rejects(pending,{name:'AbortError'});assert.ok(disposed.length>0);assert.equal(new Set(disposed).size,disposed.length,'each partial private allocation is released once');assert.equal(e.tasks.size,0);}finally{spy.mock.restore();}
});
test('chunk lattice cache eliminates repeated side samples while preserving exact world heights and finite scope',()=>{
 for(const step of[2,4,8]){let calls=0;const sample=(x:number,z:number)=>{calls++;return Math.sin(x*.17)+Math.cos(z*.13)+x*.01;},cached=createTerrainHeightCache(64,step,sample);for(let x=0;x<64;x+=step)for(let z=0;z<64;z+=step)for(const[dx,dz]of[[0,0],[-step,0],[step,0],[0,-step],[0,step]])assert.equal(cached(x+dx,z+dz),Math.sin((x+dx)*.17)+Math.cos((z+dz)*.13)+(x+dx)*.01);const naive=(64/step)**2*5;assert.ok(calls<naive*.35);const count=calls;cached(-step,-step);cached(-step,-step);assert.equal(calls,count+1);cached(1000,1000);cached(1000,1000);assert.equal(calls,count+3,'out-of-lattice requests cannot grow a global cache');}
});
test('storage, food and production updates leave landscape shape stable while a real placement change invalidates it',()=>{
 const state:HabitableState={version:1,appearance:'amber',profession:'carpenter',position:{x:0,y:0},buildings:[{id:'shed-1',templateId:'shed',x:7,y:3,rotation:0,startsAt:1,endsAt:2,bound:false}]};const initial=habitableLandscapeShape(state);state.buildings[0].visual={state:'working',operation:'craft',storedUnits:11,capacity:160,startsAt:20,endsAt:30};state.buildings[0].storage=[{id:'stored',itemId:'timber',qty:11,bound:false,quality:1,expiresAt:null,wear:0,location:'shed',provenance:{source:'test',creatorId:'owner',seasonId:'test',inputs:[]}}];state.buildings[0].level=2;state.buildings[0].upgrade={fromLevel:1,toLevel:2,startsAt:2,endsAt:3,constructionStand:{x:5,y:3}};assert.deepEqual(habitableLandscapeShape(state),initial);state.buildings[0].rotation=1;assert.notDeepEqual(habitableLandscapeShape(state),initial);state.buildings[0].rotation=0;state.buildings[0].x=8;assert.notDeepEqual(habitableLandscapeShape(state),initial);
});

test('a running or completed server job does not recreate station scenery; a real original-building upgrade does',()=>{
 const now=1_780_000_000_000,world=createMvpWorld('owner',now),player=createPlayer(world,{ownerId:'owner',requestId:'signature',now,actor:null},{type:'player.create',name:'Ana',stationName:'Alba',faction:'cartographers'}),view=buildMvpView(world,0,'owner',now,player.id);const input:SceneInput={view,player:view.player,selected:player.position,mode:'station',quality:'performance',reducedMotion:false},before=stationLandscapeSignature(input);
 input.view={...view,now:now+1000,jobs:[{id:'new-craft',kind:'craft',playerId:player.id,status:'running',createdAt:now,startsAt:now,endsAt:now+10000,ruleVersion:'test',weather:{regionId:'center',state:'clear',startsAt:now,endsAt:now+10000,movementFactor:1,waterFactor:1},costs:[],route:[],payload:{},report:[]}]};assert.equal(stationLandscapeSignature(input),before);input.player={...input.player!,buildings:{...input.player!.buildings,workshop:2}};assert.notEqual(stationLandscapeSignature(input),before);
});
