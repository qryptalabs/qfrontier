import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createLoadStore} from '../scripts/load-test-partitioned.mjs';
import {createMvpWorld} from '../lib/mvp/world.ts';
import {executeMvp,readMvpView} from '../lib/mvp/engine.ts';
import type {MvpRecord} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-17T12:30:00Z');
type RequestContext={ownerId:string;partitionedStore?:unknown;storeOperations?:Record<string,number>};

test('load bridge exposes per-village commits with isolated request snapshots and genuine SQL metrics',async()=>{
  const context=new AsyncLocalStorage<RequestContext>();
  const bundle=await createLoadStore({context,playerReads:true,villageWrites:true});
  const request=<T>(ownerId:string,run:()=>Promise<T>)=>context.run({ownerId},run);
  try{
    await bundle.store.insert(createMvpWorld('synthetic-load-admin',NOW));
    const [own,other]=await (async()=>{
      const players=[];
      for(const [ownerId,name] of [['synthetic-load-first','First'],['synthetic-load-second','Second']]){
        const view=await request(ownerId,()=>executeMvp(bundle.store,ownerId,{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'},crypto.randomUUID(),undefined,NOW));
        assert.ok(view.player);players.push({ownerId,id:view.player.id});
        await request(ownerId,()=>readMvpView(bundle.store,ownerId,view.player!.id,NOW));
      }
      return players;
    })();
    assert.equal(bundle.store.capabilities?.villageWrites,true);
    assert.equal(typeof bundle.store.compareAndSwapVillage,'function');
    bundle.resetMetrics();
    let first:MvpRecord|null=null,second:MvpRecord|null=null;
    const ready=Promise.withResolvers<void>(),bothRead=Promise.withResolvers<void>();
    let readers=0;
    const commit=(actor:typeof own,suffix:string)=>request(actor.ownerId,async()=>{
      const record=await bundle.store.read();assert.ok(record?.entityVersions);
      assert.ok((context.getStore()?.storeOperations?.sqlStatements??0)>0,'Actual SQL statements must be counted per request, not inferred from batch size.');
      if(suffix==='A')first=record;else second=record;
      if(++readers===2)bothRead.resolve();
      await bothRead.promise;await ready.promise;
      const world=structuredClone(record.world);world.players[actor.id].name+=suffix;
      const readVersions=Object.fromEntries(['politicas',`aldea:${actor.id}`,`cuenta:${actor.ownerId}`].map(key=>[key,record.entityVersions![key]??0]));
      return bundle.store.compareAndSwapVillage!(record,world,{ownerId:actor.ownerId,playerId:actor.id,now:NOW,readVersions});
    });
    const pending=[commit(own,'A'),commit(other,'B')];await bothRead.promise;ready.resolve();
    const saved=await Promise.all(pending);
    assert.ok(saved.every(Boolean),'Disjoint village writes must both commit.');
    assert.notEqual(first,second,'A per-request observed snapshot cannot be shared.');
    const final=await bundle.snapshot();assert.ok(final);
    assert.equal(final.world.players[own.id].name,'FirstA');
    assert.equal(final.world.players[other.id].name,'SecondB');
    assert.equal(bundle.metrics.villageCas.calls,2);
    assert.equal(bundle.metrics.villageCas.committed,2);
    assert.equal(bundle.metrics.villageCas.conflicts,0);
    assert.equal(bundle.metrics.cas.calls,0,'A scoped commit must not be counted as a successful global CAS.');
    assert.equal(bundle.metrics.read.calls,2,'Cold operation reads remain explicit in this phase.');
    assert.equal(bundle.adapterInfo.options.maxBatchStatements,40);
    assert.equal(bundle.adapterInfo.requestScopedStore,true);
  }finally{bundle.close();}
});
