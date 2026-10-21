import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import type {InventoryLot,MvpCommand} from '../lib/mvp/types.ts';
import {HABITABLE_SPAWN,habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import {takeLot} from '../lib/mvp/helpers.ts';

const NOW=Date.parse('2026-10-18T08:00:00Z'),owner='village-boost-identity';

test('scoped boosted and ordinary crafting preserve economics while each output references its own unique completed job',async()=>{
  for(const faction of ['cartographers','forgers']as const){
    const world=createMvpWorld(owner,NOW),player=createPlayer(world,{ownerId:owner,now:NOW,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name:'Alba',stationName:'Tiempos reales',faction});
    const bindings=[createSqliteD1(),createSqliteD1()];
    try{
      for(const binding of bindings)for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql'])binding.sqlite.exec(await readFile(path,'utf8'));
      // Large batches are fixture import only, explicitly separate from load budgets.
      const stores=bindings.map(binding=>createPartitionedMvpStore(binding,{metadataVersioning:true,villageWrites:true,maxBatchStatements:900}));
      for(const store of stores){await store.insert(structuredClone(world));await readMvpView(store,owner,player.id,NOW);}
      const run=async(index:number,useTestBoost:boolean)=>{
        const store=stores[index],requestId=crypto.randomUUID(),command:MvpCommand={type:'craft.start',playerId:player.id,recipeId:'plank',qty:1,...(useTestBoost?{useTestBoost:true}:{})};
        const quote=await quoteMvp(store,owner,command,requestId,NOW),authorization=await validateMvpQuote(store,owner,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW);
        const started=await executeMvp(store,owner,command,requestId,quote.revision,NOW,authorization),job=started.jobs.find(job=>job.playerId===player.id&&job.kind==='craft')!;
        assert.ok(job.id.startsWith('job_v_'),'Both cases must use actual village allocation.');
        const completed=await readMvpView(store,owner,player.id,job.endsAt);
        assert.equal(completed.jobs.find(saved=>saved.id===job.id)!.status,'completed');
        const output=completed.player!.inventory.filter(lot=>lot.itemId==='plank');assert.equal(output.length,1);assert.equal(output[0].provenance.source,`recipe:plank:${job.id}`);
        return{quote,job,completed,output};
      };
      const plain=await run(0,false),boosted=await run(1,true),base=faction==='forgers'?270:300,saved=Math.floor(base/5);
      assert.notEqual(plain.job.id,boosted.job.id,'Separate operations may not reuse a global job ID.');
      assert.deepEqual(plain.job.costs,boosted.job.costs);
      assert.deepEqual(plain.quote.changes,boosted.quote.changes);assert.deepEqual(plain.quote.expectedOutputs,boosted.quote.expectedOutputs);
      assert.equal(plain.job.endsAt-plain.job.startsAt,base*1000);assert.equal(boosted.job.endsAt-boosted.job.startsAt,(base-saved)*1000);
      assert.equal(boosted.completed.boosts.usedSeconds,saved);assert.equal(boosted.completed.boosts.remainingSeconds,1800-saved);
      const normalize=(lots:InventoryLot[],jobId:string)=>lots.map(lot=>({...lot,provenance:{...lot.provenance,source:lot.provenance.source===`recipe:plank:${jobId}`?'recipe:plank:OWN_COMPLETED_JOB':lot.provenance.source}}));
      assert.deepEqual(normalize(plain.completed.player!.inventory,plain.job.id),normalize(boosted.completed.player!.inventory,boosted.job.id));
      assert.equal(plain.completed.activity!.progression.xp,10);assert.equal(boosted.completed.activity!.progression.xp,10);assert.equal(boosted.output[0].bound,true);
    }finally{for(const binding of bindings)binding.close();}
  }
});

test('scoped manual supply preserves worker routes, cargo and delivery while boosted processing keeps independent valid job references',async()=>{
  for(const kind of ['workbench','planter']as const){
    const world=createMvpWorld(owner,NOW),player=createPlayer(world,{ownerId:owner,now:NOW,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name:'Alba',stationName:'Suministro',faction:'cartographers'});
    player.habitable={version:1,appearance:'pine',profession:'carpenter',position:{...HABITABLE_SPAWN},buildings:[{id:'bench',templateId:'workbench',x:-2,y:-8,rotation:1,startsAt:NOW-60000,endsAt:NOW-30000,bound:true},{id:'shed',templateId:'shed',x:7,y:3,rotation:0,startsAt:NOW-60000,endsAt:NOW-30000,bound:true,storage:[]},{id:'field',templateId:'planter',x:8,y:6,rotation:0,startsAt:NOW-60000,endsAt:NOW-30000,bound:true}]};
    const state=player.habitable,building=state.buildings.find(building=>building.templateId===kind)!,shed=state.buildings.find(building=>building.templateId==='shed')!;
    const inputs=kind==='workbench'?[['timber',2]as const]:[['seed',1]as const,['water',2]as const,['nutrient',1]as const];
    for(const [itemId,qty]of inputs){const lot=player.inventory.find(lot=>lot.itemId===itemId)!,cargo=takeLot(player,lot.id,qty,NOW);cargo.location='habitat:shed';shed.storage!.push(cargo);}
    state.position=kind==='planter'?{x:8,y:9.2}:habitableBuildingEntrance(state,building)!;
    const bindings=[createSqliteD1(),createSqliteD1()];
    try{
      for(const binding of bindings)for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql'])binding.sqlite.exec(await readFile(path,'utf8'));
      const stores=bindings.map(binding=>createPartitionedMvpStore(binding,{metadataVersioning:true,villageWrites:true,maxBatchStatements:900}));
      for(const store of stores){await store.insert(structuredClone(world));await readMvpView(store,owner,player.id,NOW);}
      const run=async(index:number,useTestBoost:boolean)=>{
        const store=stores[index],requestId=crypto.randomUUID(),command:MvpCommand={type:kind==='workbench'?'habitat.workbench.start':'habitat.planter.start',playerId:player.id,buildingId:building.id,supplyShedId:shed.id,...(kind==='workbench'?{recipeId:'plank'}:{}),...(useTestBoost?{useTestBoost:true}:{})};
        const quote=await quoteMvp(store,owner,command,requestId,NOW),authorization=await validateMvpQuote(store,owner,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW),started=await executeMvp(store,owner,command,requestId,quote.revision,NOW,authorization),job=started.jobs[0],supply=started.habitable.state!.buildings.find(saved=>saved.id===building.id)!.supply!;
        assert.ok(job.id.startsWith('job_v_'));assert.equal(supply.jobId,job.id);assert.equal(supply.id,`supply:${job.id}`);assert.equal(job.startsAt,supply.unloadsAt);
        const early=await readMvpView(store,owner,player.id,job.endsAt-1);assert.equal(early.jobs[0].status,'running');
        // Fixture-only relocation clears the worker's final path; no cargo or cost changes.
        const record=(await store.read())!,next=structuredClone(record.world);next.players[player.id].habitable!.position={...HABITABLE_SPAWN};
        const readVersions=Object.fromEntries(['politicas',`aldea:${player.id}`,`cuenta:${owner}`].map(key=>[key,record.entityVersions![key]??0]));
        assert.ok(await store.compareAndSwapVillage!(record,next,{ownerId:owner,playerId:player.id,now:job.endsAt-1,readVersions}));
        const done=await readMvpView(store,owner,player.id,job.endsAt+200000),source=done.habitable.state!.buildings.find(saved=>saved.id===building.id)!,stored=done.habitable.state!.buildings.find(saved=>saved.id===shed.id)!.storage!;
        assert.equal(source.shipment!.deliveredQuantity,kind==='workbench'?1:4);assert.equal(stored.reduce((sum,lot)=>sum+lot.qty,0),kind==='workbench'?1:4);assert.equal(source.shipment!.cargo.length,0);assert.equal(source.pending!.length,0);
        for(const lot of stored)assert.equal(lot.provenance.source,kind==='workbench'?`recipe:plank:${job.id}`:`farm:${job.id}`);
        const saved=await store.read();await readMvpView(store,owner,player.id,job.endsAt+200001);assert.deepEqual(await store.read(),saved,'A second read cannot duplicate delivered outputs.');
        return{job,supply,quote,done,stored};
      };
      const plain=await run(0,false),boosted=await run(1,true),withoutJobReferences=(supply:typeof plain.supply)=>{const copy=structuredClone(supply);copy.id='supply:OWN_JOB';copy.jobId='OWN_JOB';return copy;};
      assert.deepEqual(withoutJobReferences(plain.supply),withoutJobReferences(boosted.supply));assert.equal(plain.job.startsAt,boosted.job.startsAt);
      assert.equal(boosted.job.endsAt-boosted.job.startsAt,(kind==='workbench'?240:36)*1000);assert.equal(boosted.quote.boost!.savedSeconds,kind==='workbench'?60:9);assert.deepEqual(plain.quote.changes,boosted.quote.changes);
      assert.deepEqual(plain.stored.map(lot=>[lot.itemId,lot.qty,lot.bound,lot.quality,lot.wear]),boosted.stored.map(lot=>[lot.itemId,lot.qty,lot.bound,lot.quality,lot.wear]));assert.equal(plain.done.activity!.progression.xp,boosted.done.activity!.progression.xp);
    }finally{for(const binding of bindings)binding.close();}
  }
});
