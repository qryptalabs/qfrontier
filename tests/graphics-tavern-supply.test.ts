import test from 'node:test';import assert from 'node:assert/strict';
import {createRoyalOldTown} from '../lib/graphics/royal-old-town.ts';
import {tavernSupplySchedule,tavernSupplyPose} from '../lib/graphics/tavern-supply-route.ts';
test('the actual quarter renders a courier only for a real schedule, carries during transport and returns empty; pantry props reflect confirmed deliveries',()=>{
 const t=createRoyalOldTown();try{const actor=t.group.getObjectByName('ribera-supply-courier')!,load=actor.getObjectByName('actor-load')!;t.update(1,false);assert.equal(actor.visible,false);
 const s=tavernSupplySchedule('server-operation',1000);let now=s.departsAt+3000;t.setSupply({worker:s,batches:0},now);t.update(4,false);const expected=tavernSupplyPose(s,now);assert(actor.visible);assert(load.visible);assert(Math.hypot(actor.position.x-expected.x,actor.position.z-expected.z)<.1);assert.equal(t.group.getObjectByName('tavern-real-supply-0')!.visible,false);
 now=s.deliversAt+3000;t.setSupply({worker:s,batches:1},now);t.update(8,false);assert.equal(load.visible,false);assert(t.group.getObjectByName('tavern-real-supply-0')!.visible);assert.equal(t.group.getObjectByName('tavern-real-supply-1')!.visible,false);assert(t.colliders().some(c=>Math.abs(c.x-actor.position.x)<.01));
 t.setSupply({worker:s,batches:0},1000);assert(t.group.getObjectByName('tavern-real-supply-0')!.visible,'old network responses cannot erase a confirmed delivery');t.setSupply({worker:null,batches:1},s.endsAt+1);t.update(9,false);assert.equal(actor.visible,false);
 }finally{t.dispose();}
});
