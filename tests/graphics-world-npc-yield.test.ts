import assert from 'node:assert/strict';
import {test} from 'node:test';
import {capsuleAxis,capsulesOverlap,terrainLineClear} from '../lib/graphics/kinematic-physics.ts';
import {physicalDeckHeightAt,physicalNpcCapsulesNear,physicalNpcPose,physicalTerrainSample} from '../lib/graphics/world-collision.ts';

test('rotating a confirmed cart at the same coordinates invalidates the shared NPC body cache',()=>{
  const now=1792289300000,target=physicalNpcCapsulesNear({x:-408,y:-312},now,100).find(p=>p.radius<.4)!;
  const cart={id:'turning-cart',x:target.x-3.5,y:target.y,radius:1.15,height:3,length:5.2,offset:1.55,yaw:0};
  const before=physicalNpcPose(target.id,now,[cart])!,turned={...cart,yaw:Math.PI/2};
  assert.ok(capsulesOverlap(before,turned),'the old pose is inside the rotated horse and shafts');
  const after=physicalNpcPose(target.id,now,[turned]);
  assert.ok(!after||!capsulesOverlap(after,turned));
  assert.deepEqual(after,physicalNpcPose(target.id,now,[turned]));
  // Length and forward offset also affect a capsule without moving its origin.
  const longer={...cart,length:10,offset:5,yaw:Math.PI/2},extended=physicalNpcPose(target.id,now,[longer]);
  assert.ok(!extended||!capsulesOverlap(extended,longer));
});

test('an actual Areneros river crossing keeps the whole yielding body and its displacement on supported ground',()=>{
  const id='world-ciudad-areneros-resident-34',raw=physicalNpcPose(id,0)!;
  assert.notEqual(physicalDeckHeightAt(raw),null);
  for(const dx of[-1,-.5,0,.5,1])for(const dy of[-1,-.5,0,.5,1]){
    const player={id:'bridge-player',x:raw.x+dx,y:raw.y+dy,radius:.65,height:1.6},pose=physicalNpcPose(id,0,[player]);
    if(!pose)continue;
    const[a,b]=capsuleAxis(pose);
    assert.equal(capsulesOverlap(pose,player),false);
    assert.equal(terrainLineClear(a,b,physicalTerrainSample,pose.radius),true,'full body stays on the deck');
    assert.equal(terrainLineClear(raw,pose,physicalTerrainSample,pose.radius),true,'yield never jumps across unsupported water');
  }
});

test('a fully blocked narrow bridge cannot rewind its resident metres down the route',()=>{
  const id='world-ciudad-areneros-resident-34',raw=physicalNpcPose(id,0)!;
  const cart={id:'blocking-bridge-cart',x:raw.x,y:raw.y,radius:.9,height:2,length:3.5,offset:1,yaw:0};
  // No supported adjacent pose exists; the former 12-second rewind returned a distant body.
  assert.equal(physicalNpcPose(id,0,[cart]),null);
  assert.ok(physicalNpcPose(id,0),'removing the blocker restores the authored deterministic position');
});
