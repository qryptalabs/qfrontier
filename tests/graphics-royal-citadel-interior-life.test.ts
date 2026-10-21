import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createRoyalCitadelInteriorLife,royalCitadelInteriorRoutePose} from '../lib/graphics/royal-citadel-interior-life.ts';
import {ROYAL_INTERIOR_POSTS,ROYAL_INTERIOR_PATROLS,ROYAL_INTERIOR_SERVICE_ROUTES,ROYAL_INTERIOR_TOWER,royalInteriorWalkHeight} from '../lib/graphics/royal-citadel-interior-layout.ts';

test('the royal interior has fourteen human guards and two attendants on the authored floor levels',()=>{
  const life=createRoyalCitadelInteriorLife();
  try{
    assert.deepEqual(life.group.userData.royalCitadelInteriorLife,{guards:14,attendants:2,simulation:false,actorScale:1.55});assert.equal(life.group.userData.visualOnly,true);assert.equal(life.colliders().length,16);
    for(const post of ROYAL_INTERIOR_POSTS){const body=life.colliders().find(b=>b.id===post.id)!;assert.equal(body.x,post.x);assert.equal(body.z,post.z);assert.ok(Math.abs(body.y-post.y)<1e-8);assert.ok(body.height<4&&body.radius<1);const actor=life.group.getObjectByName(post.id)!;assert.equal(actor.scale.x,1.55);}
    const lookout=life.colliders().find(b=>b.id==='lookout')!;assert.equal(lookout.y,ROYAL_INTERIOR_TOWER.endY);assert.notEqual(royalInteriorWalkHeight(lookout.x,lookout.z,lookout.y),null);
    const elite=life.colliders().find(b=>b.id==='throne-elite-1')!;assert.ok(elite.y>ROYAL_INTERIOR_POSTS.find(p=>p.id==='throne-door-1')!.y,'throne sentinels retain the raised royal dais height');
  }finally{life.dispose();}
});

test('royal armor is articulated, shared and equipped with exactly one shield and spear per guard',()=>{
  const life=createRoyalCitadelInteriorLife();
  try{
    const first=life.group.getObjectByName(ROYAL_INTERIOR_POSTS[0].id)!,second=life.group.getObjectByName(ROYAL_INTERIOR_POSTS[1].id)!;
    for(const name of['gilded-steel-cuirass','blue-gold-ceremonial-cape','plumed-great-helm','sun-emblem-shield','gilded-spear']){
      const suffix='royal-interior-guard-'+name,a=first.getObjectByName(suffix)as THREE.Mesh,b=second.getObjectByName(suffix)as THREE.Mesh;assert.ok(a&&b,name);assert.equal(a.geometry,b.geometry,'guard equipment uses a shared pool');assert.equal(a.material,b.material);
    }
    assert.equal(first.getObjectByName('actor-left-forearm')!.visible,false,'old integrated shield is hidden');assert.equal(first.getObjectByName('actor-right-forearm')!.visible,false,'old integrated spear is hidden');
    assert.equal(first.getObjectByName('royal-interior-guard-sun-emblem-shield')!.parent?.name,'actor-left-elbow');assert.equal(first.getObjectByName('royal-interior-guard-gilded-spear')!.parent?.name,'actor-right-elbow');
    assert.ok(life.group.getObjectByName('royal-steward')!.getObjectByName('royal-interior-attendant-golden-serving-tray'));assert.ok(life.group.getObjectByName('lamp-keeper')!.getObjectByName('royal-interior-attendant-brass-lantern'));
  }finally{life.dispose();}
});

test('patrol polylines preserve their physical corners and walk at a human speed',()=>{
  const path=[{x:0,y:10,z:0},{x:0,y:10,z:10},{x:10,y:10,z:10},{x:10,y:10,z:0},{x:0,y:10,z:0}];
  assert.deepEqual(royalCitadelInteriorRoutePose(path,15),{x:5,y:10,z:10,yaw:Math.PI/2,moving:true,working:false});assert.deepEqual(royalCitadelInteriorRoutePose(path,55),royalCitadelInteriorRoutePose(path,15));
  assert.deepEqual(royalCitadelInteriorRoutePose(path,NaN),royalCitadelInteriorRoutePose(path,0));assert.equal(royalCitadelInteriorRoutePose([path[0]],10).moving,false);
  const life=createRoyalCitadelInteriorLife();
  try{life.update(0);const before=life.colliders().find(b=>b.id===ROYAL_INTERIOR_PATROLS[0].id)!;life.update(.1);const after=life.colliders().find(b=>b.id===before.id)!;assert.ok(Math.abs(Math.hypot(after.x-before.x,after.z-before.z)-.145)<1e-8);}finally{life.dispose();}
});

test('all authored patrols and service routes remain on real floor levels and separated over twenty minutes',()=>{
  const life=createRoyalCitadelInteriorLife();
  try{
    for(let seconds=0;seconds<=1200;seconds+=.5){
      life.update(seconds);const bodies=life.colliders();
      for(let i=0;i<bodies.length;i++){const a=bodies[i],floor=royalInteriorWalkHeight(a.x,a.z,a.y);assert.ok(floor!==null&&Math.abs(a.y-floor)<1e-8,a.id+' remains on its authored floor');for(const b of bodies.slice(i+1))if(Math.abs(a.y-b.y)<3.9)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius,a.id+' clears '+b.id);}
    }
    life.update(NaN);for(const body of life.colliders())assert.ok(Number.isFinite(body.x)&&Number.isFinite(body.y)&&Number.isFinite(body.z));
    for(const route of[...ROYAL_INTERIOR_PATROLS,...ROYAL_INTERIOR_SERVICE_ROUTES])for(const point of route.route)assert.equal(royalInteriorWalkHeight(point.x,point.z,point.y),point.y);
  }finally{life.dispose();}
});

test('attendants pause at their service station and distant royal equipment stays pooled across LOD switches',()=>{
  const life=createRoyalCitadelInteriorLife();
  try{
    const guard=life.group.getObjectByName(ROYAL_INTERIOR_POSTS[0].id)!;assert.equal(guard.getObjectByName('actor-distant-body')!.visible,true);life.setFocus(guard.position.x,guard.position.y+2,guard.position.z+2);life.update(1);assert.equal(guard.getObjectByName('actor-distant-body')!.visible,false);assert.equal(guard.getObjectByName('actor-torso')!.visible,true);
    const route=ROYAL_INTERIOR_SERVICE_ROUTES[0],length=route.route.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b.x-route.route[i].x,b.z-route.route[i].z),0),seconds=length/1.35+1;
    life.update(seconds);const first=life.colliders().find(b=>b.id===route.id)!;life.update(seconds+1);const second=life.colliders().find(b=>b.id===route.id)!;assert.equal(first.x,second.x);assert.equal(first.z,second.z);
    life.setFocus(NaN,NaN,NaN);life.update(Infinity);for(const b of life.colliders())assert.ok(Number.isFinite(b.y));
  }finally{life.dispose();}
});

test('interior viewers own their resources and dispose every visible or pooled geometry exactly once',()=>{
  const first=createRoyalCitadelInteriorLife(),other=createRoyalCitadelInteriorLife(),resources=new Set<THREE.BufferGeometry|THREE.Material>(),counts=new Map<object,number>();
  first.group.traverse(node=>{if(!(node instanceof THREE.Mesh))return;resources.add(node.geometry);for(const m of Array.isArray(node.material)?node.material:[node.material])resources.add(m);});for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)??0)+1));
  first.dispose();first.dispose();for(const resource of resources)assert.equal(counts.get(resource),1,'a viewer resource is disposed once');assert.equal(first.group.children.length,0);assert.equal(first.colliders().length,0);first.update(30);assert.equal(first.colliders().length,0);other.update(500);assert.equal(other.colliders().length,16);other.dispose();
});
