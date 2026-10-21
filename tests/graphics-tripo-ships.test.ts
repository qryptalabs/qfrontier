import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {readOfflineGlb} from './helpers/glb-offline.ts';
import {createRoyalSurface} from '../lib/graphics/royal-world-surface.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';
import {royalRiver} from '../lib/graphics/royal-regional-terrain.ts';
import {ROYAL_WORKING_WATER_ROUTE,ROYAL_GALLEON_WALK_ROUTE,royalMaritimeObstacles,royalMaritimeWalkHeight,royalWorkingFleetPose} from '../lib/graphics/royal-maritime-layout.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {royalHarborSnapshot} from '../lib/mvp/royal-harbor.ts';
import {clipTripoShipCamera} from '../lib/graphics/ship-camera.ts';
import {createRoyalWorldActivity} from '../lib/graphics/royal-world-activity.ts';
import {TRIPO_SHIP_ASSETS} from '../lib/graphics/tripo-ship-assets.ts';

test('the same sailor walks off and reboards without a duplicated body or a teleport at phase boundaries',()=>{
 const start=Date.parse('2026-10-19T18:00:00Z'),owner='crew-test',world=createMvpWorld(owner,start),player=createPlayer(world,{ownerId:owner,requestId:crypto.randomUUID(),now:start,actor:null},{type:'player.create',name:'Marina',stationName:'Puerto',faction:'cartographers'}),activity=createRoyalWorldActivity(()=>.8);
 try{for(const at of[66,112,120]){const positions=[];for(const seconds of[at-.001,at]){const snapshot=royalHarborSnapshot(world,player,1,start+seconds*1000);activity.update((start+seconds*1000)/1000,snapshot);activity.group.updateMatrixWorld(true);const matches:T.Object3D[]=[];activity.group.traverse(o=>{if(o.name==='royal-fishing-sailor-1')matches.push(o);});assert.equal(matches.length,1);positions.push(matches[0].getWorldPosition(new T.Vector3()));}assert(positions[0].distanceTo(positions[1])<.09,JSON.stringify({at,positions}));}}
 finally{activity.dispose();}
});

test('stern camera clips against the actual imported sail before entering its mesh',async()=>{
 const{gltf}=await readOfflineGlb('public/models/tripo-v1/galleon.glb');gltf.scene.position.set(9,0,185);
 const head={x:11.4,y:6.45,z:196},desired={x:11.4,y:7.95,z:191.5},clipped=clipTripoShipCamera(gltf.scene,head,desired);
 assert(clipped.z>desired.z+.3&&clipped.z<head.z);const origin=new T.Vector3(head.x,head.y,head.z),point=new T.Vector3(clipped.x,clipped.y,clipped.z),direction=point.clone().sub(origin).normalize(),ray=new T.Raycaster(origin,direction,.05,origin.distanceTo(point)+.15);assert.equal(ray.intersectObject(gltf.scene,true).length,0,'the complete boom ends before the cloth');
});
test('camera ignores an invisible fallback and respects the visible model',()=>{
 const group=new T.Group(),g=new T.PlaneGeometry(10,10),m=new T.MeshBasicMaterial({side:T.DoubleSide}),hidden=new T.Mesh(g,m),visible=new T.Mesh(g,m);hidden.position.z=-1;hidden.visible=false;visible.position.z=-3;group.add(hidden,visible);
 assert(Math.abs(clipTripoShipCamera(group,{x:0,y:0,z:0},{x:0,y:0,z:-5}).z+2.7)<1e-6);group.visible=false;assert.equal(clipTripoShipCamera(group,{x:0,y:0,z:0},{x:0,y:0,z:-5}).z,-5);g.dispose();m.dispose();
});

test('each ship is a distinct embedded Tripo GLB within the mobile budget',async()=>{
 // Validate the distributed assets themselves, without private generation logs.
 assert.notEqual(TRIPO_SHIP_ASSETS.galleon.sha256,TRIPO_SHIP_ASSETS.fishing.sha256);
 for(const kind of['galleon','fishing'] as const){const{source,bytes,gltf}=await readOfflineGlb(`public/models/tripo-v1/${kind}.glb`);const metadata=TRIPO_SHIP_ASSETS[kind];assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);assert.equal(bytes.length,metadata.bytes);assert.equal(source.meshes.length,2);assert.equal(source.images.length,1);assert(source.images.every((i:{uri?:string})=>!i.uri));assert(bytes.length<1_300_000);let count=0;gltf.scene.traverse(o=>{if(o instanceof T.Mesh)count+=o.geometry.index!.count/3;});assert.equal(count,metadata.triangles);assert(count>10000&&count<15000);const b=new T.Box3().setFromObject(gltf.scene);assert(b.min.y< -1);assert(b.max.y>5);assert.equal(source.samplers[0].magFilter,9728);}
});
test('fishing route has hull clearance in continuous water, outside bridges and moored ships',()=>{
 const moored=[[-8,151],[-8,210],[-19,255],[23,261],[-22,286],[9,185]];
 for(let i=1;i<ROYAL_WORKING_WATER_ROUTE.length;i++){const a=ROYAL_WORKING_WATER_ROUTE[i-1],b=ROYAL_WORKING_WATER_ROUTE[i];for(let j=0;j<=40;j++){const t=j/40,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,r=royalRiver(x,z);assert(r.water);assert(Math.abs(x-r.center)+2.5<r.halfWidth);assert(z>210);for(const [mx,mz]of moored)assert(Math.abs(x-mx)>7||Math.abs(z-mz)>14);}}
});
test('real authority walks from quay to deck, stern stairs, upper deck and back',()=>{
 const nav=royalNavigation();let p={...ROYAL_GALLEON_WALK_ROUTE[0],y:nav.surface.walk(32,185)!};
 for(const q of ROYAL_GALLEON_WALK_ROUTE.slice(1)){const next=nav.line(p,q);assert(next,JSON.stringify({from:p,to:q}));p=next;}
 assert.equal(p.y,4.85);for(const q of [...ROYAL_GALLEON_WALK_ROUTE].reverse().slice(1)){const next=nav.line(p,q);assert(next,JSON.stringify({return:p,to:q}));p=next;}assert(Math.abs(p.y-.92)<.01);
});
test('holding forward from the deck visit spawn clears the stair crest without hitting the cabin ceiling',()=>{
 const nav=royalNavigation(),from={x:11,y:1.55,z:185},end=nav.line(from,{x:11,z:196},4.85);assert(end,'the same straight input used by the mobile advance button must climb completely');assert.equal(end.y,4.85);
});
test('cabins, masts, railings and water block movement instead of clipping or teleporting decks',()=>{
 const nav=royalNavigation();assert.equal(nav.surface.walk(0,224),null);assert.equal(royalMaritimeWalkHeight(9,196,1.55),1.55);assert.equal(royalMaritimeWalkHeight(9,196,4.85),4.85);
 assert.equal(nav.line({x:9,y:1.55,z:192},{x:9,z:190}),null);assert.equal(nav.line({x:7,y:1.55,z:183},{x:4,z:183}),null);assert(royalMaritimeObstacles().length>10);
});
test('rendered fishing phases are read-only and stop at the authoritative boundary',()=>{
 const start=Date.parse('2026-10-19T18:00:00Z'),owner='ship-test',world=createMvpWorld(owner,start),player=createPlayer(world,{ownerId:owner,requestId:crypto.randomUUID(),now:start,actor:null},{type:'player.create',name:'Marina',stationName:'Puerto de pruebas',faction:'cartographers'}),before=JSON.stringify(world);
 for(const offset of[0,8,17,40,55,61,67,75,90,113]){const snapshot=royalHarborSnapshot(world,player,1,start+offset*1000),copy=JSON.stringify(snapshot);const pose=royalWorkingFleetPose(snapshot,(start+offset*1000)/1000);assert.equal(pose.phase,snapshot.cycle.phase);const later=royalWorkingFleetPose(snapshot,(start+1000000)/1000);assert.equal(later.now,snapshot.cycle.nextTransitionAt);assert.equal(JSON.stringify(snapshot),copy);}
 assert.equal(JSON.stringify(world),before);
});
