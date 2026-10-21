import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CITY_STABLE as S,cityStableObstacles,stableInside} from '../lib/graphics/city-shop-stable-layout.ts';
import {createCityStable} from '../lib/graphics/city-shop-stable.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';
import {shopHandlingSchedule} from '../lib/graphics/shop-handling-motion.ts';
import {ROYAL_SHOP,shopAssetPosition} from '../lib/graphics/city-shop-layout.ts';
import {readOfflineGlb} from './helpers/glb-offline.ts';
import {shopDrivingAllowed} from '../lib/graphics/city-shop-driving.ts';
import {moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';

test('the stable has two real walkable bays, solid walls and headroom for a horse and harness',()=>{
 const n=royalNavigation();
 for(const x of[-132,-124,-116])assert(n.line({x,y:S.y,z:157},{x,z:148.4},S.y,.45),'clear approach '+x);
 assert(n.line(S.entrance,S.inside,S.y));
 assert(shopDrivingAllowed(S.garage.x,S.garage.z));
 assert(n.line({x:-120,y:S.y,z:174},S.garage,S.y,1.3),'a carriage fits through the right bay');
 assert.equal(n.line(S.inside,{x:-137,z:150},S.y),null,'stone side wall');
 assert.equal(n.line(S.inside,{x:-131,z:143},S.y),null,'back wall');
 assert.equal(n.line(S.inside,{x:-126,z:150},S.y),null,'bay divider');
 assert(stableInside(S.inside.x,S.inside.z));assert(!stableInside(-123,174));
 assert(cityStableObstacles().some(o=>o.minY===5.32),'roof clearance');
 for(let i=0;i<6;i++){const p=shopAssetPosition(i);assert(Math.abs(n.surface.walk(p.x,p.z)!-p.y)<1e-6,'same saved equipment parking floor');}
 const escaped=moveRoyalWalker({x:-135,z:152,y:S.y},1,0,cityStableObstacles(),.4,n.surface.walk);assert(escaped.x>-134.1,'a pre-existing saved position can leave a newly added wall');
});

test('the actual Tripo module is self-contained and only occupies the roof above the authored openings',async()=>{
 const{bytes,source,gltf}=await readOfflineGlb(new URL('../public/models/tripo-v1/stable.glb',import.meta.url));
 assert(bytes.length<900000);assert.equal(source.meshes.length,1);assert.equal(source.images.length,1);assert.equal(source.materials.length,1);assert(!source.images[0].uri);assert(!source.buffers[0].uri);assert(!source.animations?.length);
 const b=new THREE.Box3().setFromObject(gltf.scene),size=b.getSize(new THREE.Vector3());assert(b.min.y>=4.3999);assert(b.max.y<=7.0001);assert(size.x<=24.001&&size.z<=8.001);assert(gltf.scene.getObjectByName('stable-roof'));
 let triangles=0;gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});assert(triangles>1000&&triangles<12000);
});

test('the loader and two shop aisles remain open alongside the new stable',()=>{
 const n=royalNavigation(),s=shopHandlingSchedule('stable-test','collect','corona-del-alba',{...ROYAL_SHOP.pickup,yaw:Math.PI},4,1000);
 for(const leg of s.legs)for(let i=1;i<leg.points.length;i++)assert(n.line(leg.points[i-1],leg.points[i],leg.points[i].y,.35));
 assert(n.route(ROYAL_SHOP.counter,'pickup'));
 assert(n.route(S.inside,'pickup'),'stable interior reaches the pickup');
});

test('SSR and disposal use authored geometry without a download or a new renderer',()=>{
 const a=createCityStable();assert(a.group.getObjectByName('stable-water-trough'));assert.equal(a.group.userData.stable.status,'idle');a.setFocus(-131,.92,150);assert.equal(a.group.userData.stable.status,'idle');
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();a.group.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});let released=0;geometry.forEach(g=>g.addEventListener('dispose',()=>released++));a.dispose();assert.equal(released,geometry.size);a.dispose();assert.equal(released,geometry.size);assert.equal(a.group.children.length,0);
});
