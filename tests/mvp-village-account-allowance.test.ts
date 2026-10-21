import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer,weatherFor} from '../lib/mvp/world.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {getTestBoostsView} from '../lib/mvp/test-boosts.ts';
import type {MvpCommand} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-18T08:00:00Z'),owner='village-shared-allowance';

test('initialized villages of one account cannot both reserve its final nine seconds of boost allowance',async()=>{
  const world=createMvpWorld(owner,NOW),players=['Alba','Bruma'].map(name=>createPlayer(world,{ownerId:owner,now:NOW,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name,stationName:name,faction:'cartographers'}));
  world.jobs.history={id:'history',playerId:players[0].id,kind:'craft',status:'cancelled',createdAt:NOW-1000,startsAt:NOW-1000,endsAt:NOW-1000+7209*1000,ruleVersion:world.rulesVersion,weather:weatherFor('r_1_1',NOW-1000),route:[players[0].position],costs:[],payload:{recipeId:'plank',qty:1,building:'workshop',testBoost:{version:1,mode:'test',reservedAt:NOW-1000,baseSeconds:9000,durationSeconds:7209,savedSeconds:1791}},report:[]};
  const binding=createSqliteD1();
  try{
    for(const path of ['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql'])binding.sqlite.exec(await readFile(path,'utf8'));
    const factory=()=>createPartitionedMvpStore(binding,{metadataVersioning:true,villageWrites:true,maxBatchStatements:900});
    await factory().insert(world);
    // Village reads settle only their selected profile. Initialize both explicitly.
    for(const player of players)await readMvpView(factory(),owner,player.id,NOW);
    const before=(await factory().read())!,regionId=before.world.tiles[players[0].position].regionId;
    const prepared=await Promise.all(players.map(async player=>{const command:MvpCommand={type:'farm.start',playerId:player.id,useTestBoost:true},requestId=crypto.randomUUID(),quote=await quoteMvp(factory(),owner,command,requestId,NOW),authorization=await validateMvpQuote(factory(),owner,command,requestId,quote.revision,quote.token,quote.expiresAt,NOW);return{command,requestId,quote,authorization};}));
    assert.equal(prepared[0].quote.revision,prepared[1].quote.revision);for(const item of prepared)assert.equal(item.quote.boost!.savedSeconds,9);
    const results=await Promise.allSettled(prepared.map(item=>executeMvp(factory(),owner,item.command,item.requestId,item.quote.revision,NOW,item.authorization)));
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
    const saved=(await factory().read())!;assert.equal(getTestBoostsView(saved.world,owner,NOW).usedSeconds,1800);
    assert.equal(Object.values(saved.world.jobs).filter(job=>job.createdAt===NOW&&job.kind==='farm').length,1);
    assert.equal(saved.world.regions[regionId].farmRemaining,before.world.regions[regionId].farmRemaining-1);
    for(const itemId of ['seed','nutrient','water']){const total=(value:typeof world)=>Object.values(value.players).flatMap(player=>player.inventory).filter(lot=>lot.itemId===itemId).reduce((sum,lot)=>sum+lot.qty,0);assert.equal(total(before.world)-total(saved.world),itemId==='water'?2:1);}
  }finally{binding.close();}
});
