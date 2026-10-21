import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createRoyalWorldLayer} from '../lib/graphics/royal-world-layer.ts';
import {OLD_TOWN_VENUES,OLD_TOWN_HOUSES,OLD_TOWN_RESIDENT_LOOP,oldTownInside} from '../lib/graphics/royal-old-town-plan.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';
import {moveRoyalWalker,clipRoyalCameraBoom} from '../lib/graphics/royal-harbor-layout.ts';
import {ROYAL_PORT_OFFSET} from '../lib/graphics/royal-proportions.ts';
import {shopDrivingAllowed} from '../lib/graphics/city-shop-driving.ts';

test('freight keeps its wide roads while interiors and narrow alleys remain pedestrian',()=>{
 assert.equal(shopDrivingAllowed(85,157),false);
 assert.equal(shopDrivingAllowed(87,186),false);
 assert.equal(shopDrivingAllowed(84,142),false);
 assert.equal(shopDrivingAllowed(58,134),true);
 assert.equal(shopDrivingAllowed(132,100),true);
});

test('the compact quarter actually renders its 24 authored buildings and preserves public alley clearance',()=>{
 const l=createRoyalWorldLayer(1);try{const built=l.group.userData.royalCity.buildings.filter((b:{oldTown?:true})=>b.oldTown);assert.equal(built.length,OLD_TOWN_HOUSES.length);assert.equal(built.length+OLD_TOWN_VENUES.length,24);assert(built.some((b:{kind:string})=>b.kind==='market'));
 const nav=royalNavigation();for(const path of[OLD_TOWN_RESIDENT_LOOP,[...OLD_TOWN_RESIDENT_LOOP].reverse()]){let p={...path[0]};for(const q of path.slice(1)){const next=nav.line(p,q);assert(next,`alley blocked: ${JSON.stringify(p)} -> ${JSON.stringify(q)}`);p=next;}}
 }finally{l.dispose();}
});

test('three new premises have open rendered doors, collision-free entrances and solid furnished rooms',()=>{
 const l=createRoyalWorldLayer(1);try{const nav=royalNavigation(),visits=[{id:'tavern',from:{x:84,z:152},to:{x:84,z:140.7}},{id:'smithy',from:{x:126,z:190},to:{x:134,z:190}},{id:'warehouse',from:{x:35.8,z:154},to:{x:46,z:154}}]as const;
 l.group.updateMatrixWorld(true);for(const v of visits){const start={...v.from,y:.92},inside=nav.line(start,v.to);assert(inside,v.id+' doorway is walkable');assert.equal(oldTownInside(inside.x,inside.z)?.id,v.id);assert(nav.line(inside,v.from),v.id+' has a real exit');
 const direction=new T.Vector3(v.to.x-v.from.x,0,v.to.z-v.from.z),length=direction.length(),ray=new T.Raycaster(new T.Vector3(v.from.x,3.2,v.from.z+ROYAL_PORT_OFFSET),direction.normalize(),0,length);assert.equal(ray.intersectObject(l.oldTown.group,true).length,0,v.id+' visible entrance matches authority');
 }
 assert.equal(nav.line({x:84,y:.92,z:140.7},{x:84,z:137}),null,'the bar counter blocks the player');
 assert.equal(nav.line({x:134,y:.92,z:190},{x:138,z:189}),null,'the anvil is a physical object');
 assert.equal(nav.line({x:46,y:.92,z:154},{x:46,z:145}),null,'the warehouse back wall is solid');
 const p=moveRoyalWalker({x:84,y:.92,z:140.7},9,0,l.obstacles,.4,l.surface.walk);assert(p.x<92,'walls and furniture block manual walking');
 const clipped=clipRoyalCameraBoom({x:84,y:2.52,z:147},{x:84,y:3.17,z:153},l.obstacles,.24);assert(Number.isFinite(clipped.x+clipped.y+clipped.z));
 }finally{l.dispose();}
});

test('interior roofs reveal the room only on entry and hosts have bodies and relaxed non-carrying poses',()=>{
 const l=createRoyalWorldLayer(1);try{l.animate(3,false);for(const v of OLD_TOWN_VENUES){l.oldTown.setFocus(v.x,v.z,true);assert.equal(l.group.getObjectByName('old-town-roof-'+v.id)?.visible,false);assert(l.oldTown.colliders().length>=8);l.oldTown.setFocus(v.x,v.z);assert.equal(l.group.getObjectByName('old-town-roof-'+v.id)?.visible,true,'normal walking keeps a real ceiling');l.oldTown.setFocus(0,0);assert.equal(l.group.getObjectByName('old-town-roof-'+v.id)?.visible,true);}
 for(const name of['old-town-host-tavern','old-town-host-warehouse']){const actor=l.group.getObjectByName(name)!;assert.equal(actor.getObjectByName('actor-load')?.visible,false);assert(Math.abs(actor.getObjectByName('actor-left-shoulder')!.rotation.x)<.3);}
 const smith=l.group.getObjectByName('old-town-host-smithy')!,before=smith.getObjectByName('actor-right-shoulder')!.rotation.x;l.animate(3.3,false);assert.notEqual(smith.getObjectByName('actor-right-shoulder')!.rotation.x,before);
 }finally{l.dispose();}
});
