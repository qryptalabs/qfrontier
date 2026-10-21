import assert from 'node:assert/strict';
import {test} from 'node:test';
import {clipRoyalCameraBoom,royalRiverEdge,royalQuayLane,royalWalkHeight,moveRoyalWalker} from '../lib/graphics/royal-harbor-layout.ts';

test('the visitor stays on continuous quay paving and the physical unloading pier rather than walking across water',()=>{
 for(let z=-30;z<355;z+=.5){assert.equal(royalWalkHeight(royalQuayLane(z),z),4.3);assert.equal(royalWalkHeight(0,z),null);}
 assert.equal(royalWalkHeight(royalRiverEdge(220)-20,220),4.5);assert.equal(royalWalkHeight(royalRiverEdge(215)-20,215),null);
 let p={x:royalQuayLane(280),z:280};for(let i=0;i<300;i++)p=moveRoyalWalker(p,-.1,0,[]);assert.ok(p.x>=royalRiverEdge(p.z)+3,'the bank blocks movement before the water');
});
test('long frames cannot tunnel through a solid building and blocked diagonal input slides along its wall',()=>{
 const x=royalQuayLane(150),obstacles=[{x:x+8,z:150,halfWidth:2,halfDepth:6}];const direct=moveRoyalWalker({x,z:150},50,0,obstacles);assert.ok(direct.x<x+5);const diagonal=moveRoyalWalker({x,z:150},12,4,obstacles);assert.ok(diagonal.x<x+5&&diagonal.z>153);assert.ok(Number.isFinite(diagonal.y));
});
test('the following camera shortens its boom before a facade while leaving open sight lines unchanged',()=>{
 const head={x:100,y:7,z:160},desired={x:112,y:12,z:160},wall={x:108,z:160,halfWidth:2,halfDepth:8};const clipped=clipRoyalCameraBoom(head,desired,[wall]);assert.ok(clipped.x<105.4&&clipped.x>100);assert.deepEqual(clipRoyalCameraBoom(head,desired,[]),desired);
});
