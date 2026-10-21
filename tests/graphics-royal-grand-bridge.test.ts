import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ROYAL_GRAND_BRIDGE as B,ROYAL_SEA_ROUTE,royalRiver,royalBridgeClearance,royalSeaTrafficPose} from '../lib/graphics/royal-canal-layout.ts';
import {royalRegionalTerrain,royalVegetationAllowed} from '../lib/graphics/royal-regional-terrain.ts';
import {ROYAL_WORLD_LOCATION as site} from '../lib/graphics/royal-world-location.ts';
import {ROYAL_PORT_OFFSET as O} from '../lib/graphics/royal-proportions.ts';
import {sampleWorld} from '../lib/graphics/world-geography.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';
import {createRoyalGrandBridge} from '../lib/graphics/royal-grand-bridge.ts';
import {disposeRoyalHarborCastleResources} from '../lib/graphics/royal-harbor-castle.ts';
import {readOfflineGlb} from './helpers/glb-offline.ts';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';

test('full Tripo galleon clears the seven-arch bridge with its rig intact, not only its center point',async()=>{
 const {gltf}=await readOfflineGlb('public/models/tripo-v1/galleon.glb');let minimum=Infinity,count=0;
 gltf.scene.updateMatrixWorld(true);
 for(let z=75;z<=125;z+=.5)gltf.scene.traverse(o=>{if(!(o instanceof T.Mesh))return;const p=o.geometry.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);const x=-v.x,zz=z-v.z;if(Math.abs(zz-B.z)>B.width/2+.2)continue;const clearance=royalBridgeClearance(x)-v.y;minimum=Math.min(minimum,clearance);assert(clearance>1.25,`mast/sail at ${x},${v.y},${zz}: ${clearance}`);count++;}});
 assert(count>1000);assert(minimum>1.25);
 // The stern clears the north facade before the ship starts its western turn.
 for(let j=1;j<ROYAL_SEA_ROUTE.length;j++){const a=ROYAL_SEA_ROUTE[j-1],b=ROYAL_SEA_ROUTE[j];if(a.z<40)break;const yaw=Math.atan2(b.x-a.x,b.z-a.z),c=Math.cos(yaw),s=Math.sin(yaw);for(let t=0;t<=1;t+=.1)gltf.scene.traverse(o=>{if(!(o instanceof T.Mesh))return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=a.x+(b.x-a.x)*t+p.getX(i)*c+p.getZ(i)*s,z=a.z+(b.z-a.z)*t-p.getX(i)*s+p.getZ(i)*c;if(Math.abs(z-B.z)<=B.width/2+.2)assert(royalBridgeClearance(x)-p.getY(i)>1.25,'full rig also clears on the actual turning route');}});}
});

test('the entire route has a broad submerged bed, clear vegetation and joins the existing ocean behind the palace',()=>{
 for(let i=1;i<ROYAL_SEA_ROUTE.length;i++){const a=ROYAL_SEA_ROUTE[i-1],b=ROYAL_SEA_ROUTE[i],yaw=Math.atan2(b.x-a.x,b.z-a.z);for(let t=0;t<=1;t+=.04)for(const dx of[-4.5,0,4.5])for(const dz of[-15,0,15]){const x=a.x+(b.x-a.x)*t+Math.cos(yaw)*dx+Math.sin(yaw)*dz,z=a.z+(b.z-a.z)*t-Math.sin(yaw)*dx+Math.cos(yaw)*dz,r=royalRiver(x,z);const native=sampleWorld(site.x+x,site.y+O+z);assert(r.water||native.water,`dry hull corner ${x},${z}`);if(r.water){assert(royalRegionalTerrain(site.x+x,site.y+O+z,30,1)<=-2.49);assert(!royalVegetationAllowed(x,z,6));}}}
 const end=ROYAL_SEA_ROUTE.at(-1)!;assert(end.z< -500);const sea=sampleWorld(site.x+end.x,site.y+O+end.z);assert(sea.water&&!sea.river,'actual geographic ocean, no invented disconnected destination');
});

test('the bridge meets level landing squares and the obsolete central drop is closed by real masonry',()=>{
 const nav=royalNavigation();for(const sign of[-1,1]){let p:{x:number;y:number;z:number}={x:sign*B.rampEnd,z:B.z,y:nav.surface.walk(sign*B.rampEnd,B.z)!};for(const x of[sign*150,sign*80,0]){const q=nav.line(p,{x,z:B.z});assert(q,JSON.stringify(p));p=q;}assert.equal(nav.line(p,{x:0,z:80}),null,'the old steep central descent is closed; the graded avenues use the bridge ends');}
 const bridge=createRoyalGrandBridge(()=>-3.5);try{bridge.group.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(0,B.deck+1.3,101),new T.Vector3(0,0,-1),0,12);assert(ray.intersectObject(bridge.group,true).length>0,'the visible north parapet matches its collision');}finally{bridge.dispose();disposeRoyalHarborCastleResources();}
});

test('traffic turns in open water and returns along the same channel without a reset across the map',()=>{
 let previous=royalSeaTrafficPose(0);for(let t=.25;t<620;t+=.25){const p=royalSeaTrafficPose(t);assert(Math.hypot(p.x-previous.x,p.z-previous.z)<=1.251,'bounded continuous boat velocity');const native=sampleWorld(site.x+p.x,site.y+O+p.z);assert(royalRiver(p.x,p.z).water||native.water);previous=p;}
});

test('the same UTC gives the same vessel pose in both viewers and reduced motion freezes it',()=>{
 const layer=createRoyalWorldLayer(1);try{layer.animate(0,false,1792500000);const a={...layer.seaTrafficPose()};layer.animate(97,false,1792500000);assert.deepEqual(layer.seaTrafficPose(),a,'local animation uptime cannot move shared traffic');layer.animate(98,true,1792500010);assert.deepEqual(layer.seaTrafficPose(),a);layer.animate(98,false,1792500001);assert(Math.hypot(layer.seaTrafficPose().x-a.x,layer.seaTrafficPose().z-a.z)<=5.001);}finally{layer.dispose();}
});

