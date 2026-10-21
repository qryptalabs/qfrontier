import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createLoadStore} from '../scripts/load-test-partitioned.mjs';
import {createMvpWorld} from '../lib/mvp/world.ts';
import {executeMvp} from '../lib/mvp/engine.ts';

const NOW=Date.parse('2026-10-22T12:00:00Z');
type RequestContext={ownerId:string;partitionedStore?:unknown;storeOperations?:Record<string,number>;storeDiagnostics?:{villageFallbackReasons?:Record<string,number>;maintenanceFallbackReasons?:Record<string,number>}};

test('load observer attributes actual covered and fallback decisions without extra full reads or cross-request leakage',async()=>{
  const context=new AsyncLocalStorage<RequestContext>(),bundle=await createLoadStore({context,playerReads:true,villageWrites:true,villageReads:true});
  try{
    await bundle.store.insert(createMvpWorld('observer-admin',NOW));
    // Populate via genuine commands within the same 40-statement budget; a
    // prebuilt multi-profile import is a different, larger fixture operation.
    const add=(ownerId:string,name:string)=>context.run({ownerId},async()=>{const view=await executeMvp(bundle.store,ownerId,{type:'player.create',name,stationName:name,faction:'cartographers'},crypto.randomUUID(),undefined,NOW);return{id:view.player!.id,ownerId};});
    const own=await add('observer-own','Alba'),admin=await add('observer-admin','Beto');bundle.resetMetrics();
    const seen=await context.run({ownerId:own.ownerId},async()=>{
      const snapshot=await bundle.store.readVillage!({ownerId:own.ownerId,playerId:own.id,now:NOW});assert.ok(snapshot,JSON.stringify(context.getStore()!.storeDiagnostics));
      assert.equal(await bundle.store.readVillage!({ownerId:own.ownerId,playerId:own.id,now:NOW,command:{type:'market.fill',playerId:own.id,offerId:'no-audited-counterparty'}}),null);
      const current=context.getStore()!;return{storeOperations:structuredClone(current.storeOperations),storeDiagnostics:structuredClone(current.storeDiagnostics)};
    });
    assert.equal(seen!.storeOperations!.readVillage,2);assert.equal(seen!.storeOperations!.readVillageFallbacks,1);assert.equal(seen!.storeOperations!.read??0,0);assert.ok(seen!.storeOperations!.sqlStatements>0);
    assert.deepEqual(seen!.storeDiagnostics!.villageFallbackReasons,{'unsupported-command':1});
    const results=await Promise.all([
      context.run({ownerId:own.ownerId},async()=>{assert.equal(await bundle.store.readVillage!({ownerId:own.ownerId,playerId:own.id,now:NOW,command:{type:'market.fill',playerId:own.id}}),null);return structuredClone(context.getStore()!.storeDiagnostics);}),
      context.run({ownerId:admin.ownerId},async()=>{assert.equal(await bundle.store.readVillage!({ownerId:admin.ownerId,playerId:admin.id,now:NOW}),null);return structuredClone(context.getStore()!.storeDiagnostics);}),
    ]);
    assert.deepEqual(results[0]!.villageFallbackReasons,{'unsupported-command':1});assert.deepEqual(results[1]!.villageFallbackReasons,{administrator:1});
    assert.equal(bundle.metrics.readVillage.calls,4);assert.equal(bundle.metrics.readVillage.fallbacks,3);assert.equal(bundle.metrics.readVillage.coveredOutcomes,1);assert.deepEqual(bundle.metrics.readVillage.fallbackReasons,{'unsupported-command':2,administrator:1});assert.equal(bundle.metrics.read.calls,0);
    assert.equal(JSON.stringify(results).includes(own.id),false);assert.equal(JSON.stringify(results).includes(admin.ownerId),false,'Diagnostics contain fixed reason enums rather than account identities.');
    const maintenance=await context.run({ownerId:own.ownerId},async()=>{assert.equal(await bundle.store.readVillageMaintenance!({ownerId:own.ownerId,playerId:own.id,now:NOW}),null);return structuredClone(context.getStore()!.storeDiagnostics);});
    assert.deepEqual(maintenance!.maintenanceFallbackReasons,{'maintenance-unavailable':1});assert.equal(maintenance!.villageFallbackReasons,undefined,'Maintenance must not be reported as an ordinary read fallback.');
    assert.equal(bundle.metrics.readVillageMaintenance.calls,1);assert.equal(bundle.metrics.readVillageMaintenance.fallbacks,1);assert.equal(bundle.metrics.readVillageMaintenance.retries,0);assert.equal(bundle.metrics.readVillage.calls,4);assert.equal(bundle.metrics.projectVillageView.calls,0);assert.equal(bundle.metrics.read.calls,0);
  }finally{bundle.close();}
});
