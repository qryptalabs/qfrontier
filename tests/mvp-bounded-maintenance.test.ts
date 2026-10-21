import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {executeMvp,quoteMvp,readMvpView,validateMvpQuote} from '../lib/mvp/engine.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {dispatchProduction,settleProduction} from '../lib/mvp/production.ts';
import {dispatchSocial,settleSocial} from '../lib/mvp/social.ts';
import {getTestBoostsView} from '../lib/mvp/test-boosts.ts';
import {HABITABLE_POINTS,habitableBuildingEntrance} from '../lib/mvp/habitable-data.ts';
import {cloneOperationWorld} from '../lib/mvp/operation-ids.ts';
import {assertVillageExecutionClosure} from '../lib/mvp/village-semantics.ts';
import {MemoryStore} from './fixtures/manager-operator.ts';
import type {MvpStore} from '../lib/mvp/store.ts';
import type {MvpCommand,MvpWorld,Player} from '../lib/mvp/types.ts';

const NOW=Date.parse('2026-10-16T03:30:00Z');
const schemas=['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'];
function add(world:MvpWorld,ownerId:string,name:string,at=NOW){return createPlayer(world,{ownerId,now:at,requestId:crypto.randomUUID(),actor:null},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});}
function order(world:MvpWorld,p:Player,command:MvpCommand,at=NOW){dispatchProduction(world,{...command,playerId:p.id},{ownerId:p.ownerId,now:at,requestId:crypto.randomUUID(),actor:p});}
function forest(world:MvpWorld,p:Player){const tile=Object.values(world.tiles).find(t=>t.terrain==='firm'&&t.deposits.some(d=>d.itemId==='timber'))!;p.position=tile.id;p.surveyed.push(tile.id);return tile;}
const qty=(p:Player,itemId:string)=>p.inventory.filter(lot=>lot.itemId===itemId).reduce((sum,lot)=>sum+lot.qty,0);

/** The full adapter below is a comparison oracle only. Every application request
 * uses a cold bounded adapter whose global read entry point throws. */
async function fixture(seed:MvpWorld,viewer:Player){
  const bindings=[createSqliteD1(),createSqliteD1()];
  for(const binding of bindings){for(const path of schemas)binding.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));await createPartitionedMvpStore(binding,{metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:900}).insert(structuredClone(seed));binding.clearTrace();}
  const metrics={globalReads:0,maintenanceReads:0,maintenanceCommits:0,ordinaryCommits:0,projections:0};
  const factory=(index=0):MvpStore=>{
    const raw=createPartitionedMvpStore(bindings[index],{metadataVersioning:true,playerReads:true,villageWrites:true,...(index===0?{villageReads:true}:{}),maxBatchStatements:40});
    if(index!==0)return raw;
    return new Proxy(raw,{get(base,key,receiver){
      if(key==='read')return()=>{metrics.globalReads++;throw new Error('QA_MAINTENANCE_GLOBAL_READ_FORBIDDEN');};
      if(key==='readVillageMaintenance')return async(...args:Parameters<NonNullable<MvpStore['readVillageMaintenance']>>)=>{const record=await base.readVillageMaintenance!(...args);if(record)metrics.maintenanceReads++;return record;};
      if(key==='commitVillageMaintenance')return async(...args:Parameters<NonNullable<MvpStore['commitVillageMaintenance']>>)=>{const result=await base.commitVillageMaintenance!(...args);if(result)metrics.maintenanceCommits++;return result;};
      if(key==='commitVillage')return async(...args:Parameters<NonNullable<MvpStore['commitVillage']>>)=>{const result=await base.commitVillage!(...args);if(result)metrics.ordinaryCommits++;return result;};
      if(key==='projectVillageView')return async(...args:Parameters<NonNullable<MvpStore['projectVillageView']>>)=>{metrics.projections++;return base.projectVillageView!(...args);};
      const value=Reflect.get(base,key,receiver);return typeof value==='function'?value.bind(base):value;
    }});
  };
  function entity<T>(collection:string,id:string,index=0):T{const parts=bindings[index].sqlite.prepare('SELECT body FROM world_partition_parts WHERE collection=? AND entity_id=? ORDER BY part_index').all(collection,id);assert.ok(parts.length);return JSON.parse(parts.map(part=>String(part.body)).join('')) as T;}
  const read=(at:number,index=0)=>readMvpView(factory(index),viewer.ownerId,viewer.id,at);
  const expected=async(at:number)=>{await read(at,1);const record=await factory(1).read();assert.ok(record);return record.world;};
  const evidence=()=>{assert.equal(metrics.globalReads,0);assert.ok(metrics.maintenanceCommits>0);assert.ok(bindings[0].calls.filter(call=>call.method==='batch').every(call=>call.sql.length<=40));};
  return{bindings,metrics,factory,entity,read,expected,evidence,close:()=>bindings.forEach(binding=>binding.close())};
}

test('an expired foreign extractor is settled with its real account closure, frees the slot once and invalidates an older resource quote',async()=>{
  const seed=createMvpWorld('qa-maintenance-admin',NOW),viewer=add(seed,'maintenance-viewer','Alba'),producer=add(seed,'maintenance-owner','Beto'),alternate=add(seed,producer.ownerId,'Bruma'),decoy=add(seed,'maintenance-unrelated','Cora');
  settleSocial(seed,NOW);const tile=forest(seed,producer);forest(seed,viewer);
  order(seed,producer,{type:'mining.reserve',tileId:tile.id,itemId:'timber',qty:3});
  order(seed,alternate,{type:'craft.start',recipeId:'plank',qty:1,useTestBoost:true});
  order(seed,decoy,{type:'craft.start',recipeId:'plank',qty:1});
  const extract=Object.values(seed.jobs).find(job=>job.playerId===producer.id)!,boost=Object.values(seed.jobs).find(job=>job.playerId===alternate.id)!,unrelated=Object.values(seed.jobs).find(job=>job.playerId===decoy.id)!,f=await fixture(seed,viewer);
  try{
    const requestId=crypto.randomUUID(),command:MvpCommand={type:'mining.reserve',playerId:viewer.id,tileId:tile.id,itemId:'timber',qty:1};
    const quote=await quoteMvp(f.factory(),viewer.ownerId,command,requestId,NOW);
    const at=extract.endsAt+1,view=await f.read(at),expected=await f.expected(at);
    assert.equal(view.player!.id,viewer.id);assert.ok(view.people.some(p=>p.id===producer.id));
    assert.ok(view.players.every(p=>p.id===viewer.id));assert.ok(view.jobs.every(job=>job.playerId===viewer.id));
    const actual=f.entity<Player>('players',producer.id),actualTile=f.entity<typeof tile>('tiles',tile.id);
    assert.deepEqual(actual,expected.players[producer.id]);assert.deepEqual(actualTile,expected.tiles[tile.id]);
    assert.equal(qty(actual,'timber'),qty(producer,'timber')+3);
    const output=actual.inventory.find(lot=>lot.provenance.source===`deposit:${tile.id}:${extract.payload.layerId}:${extract.id}`)!;
    assert.equal(output.qty,3);assert.equal(output.bound,false);
    assert.equal(f.entity<typeof extract>('jobs',extract.id).status,'completed');
    assert.deepEqual(f.entity<Player>('players',alternate.id),alternate,'The second profile is loaded for account quotas, not advanced.');
    assert.deepEqual(f.entity<typeof boost>('jobs',boost.id),boost);
    const ownerSlice=await f.factory().readVillage!({ownerId:producer.ownerId,playerId:producer.id,now:at});assert.ok(ownerSlice);
    assert.equal(getTestBoostsView(ownerSlice.state,producer.ownerId,at).usedSeconds,60);assert.equal(getTestBoostsView(ownerSlice.state,producer.ownerId,at).passes.spent,1);
    const auth=await validateMvpQuote(f.factory(),viewer.ownerId,command,requestId,quote.revision,quote.token,quote.expiresAt,at);
    await assert.rejects(executeMvp(f.factory(),viewer.ownerId,command,requestId,quote.revision,at,auth),/recurso|cambi/i);
    const saved=JSON.stringify(actual),commits=f.metrics.maintenanceCommits;await f.read(at+1);
    assert.equal(JSON.stringify(f.entity<Player>('players',producer.id)),saved);assert.equal(f.metrics.maintenanceCommits,commits);
    await f.read(unrelated.endsAt+1);
    assert.deepEqual(f.entity<typeof unrelated>('jobs',unrelated.id),unrelated,'An unrelated expired private recipe is not a shared lease.');
    assert.deepEqual(f.entity<Player>('players',decoy.id),decoy);
    f.evidence();
  }finally{f.close();}
});

async function districtSeed(extract:boolean){
  const store=new MemoryStore(),owner='maintenance-district-owner';
  const created=await executeMvp(store,owner,{type:'player.create',name:'Beto',stationName:'Distrito con reserva',faction:'cartographers'},crypto.randomUUID(),undefined,NOW),id=created.player!.id;
  const viewer=(await executeMvp(store,'maintenance-district-viewer',{type:'player.create',name:'Alba',stationName:'Consulta vecina',faction:'cartographers'},crypto.randomUUID(),undefined,NOW)).player!;
  await executeMvp(store,'maintenance-district-viewer',{type:'habitat.profile',playerId:viewer.id,appearance:'pine',profession:'carrier'},crypto.randomUUID(),undefined,NOW);
  let at=NOW;
  const act=(command:MvpCommand)=>executeMvp(store,owner,{...command,playerId:id},crypto.randomUUID(),undefined,at);
  const player=()=>store.record!.world.players[id];
  await act({type:'habitat.profile',appearance:'pine',profession:'carrier'});await act({type:'habitat.job.accept'});
  if(extract){const point=HABITABLE_POINTS.find(p=>p.id==='wood')!;await act({type:'habitat.walk',x:point.x,y:point.y});at=player().habitable!.movement!.endsAt;await readMvpView(store,owner,id,at);await act({type:'habitat.job.extract'});}
  const seed=structuredClone(store.record!.world);seed.adminOwnerId='qa-maintenance-admin';
  return{seed,producer:seed.players[id],viewer:seed.players[viewer.id],at};
}

test('district expiry releases an unused reservation, but settles an already finished extraction before refunding the same real escrow',async()=>{
  for(const hasExtraction of[false,true]){
    const s=await districtSeed(hasExtraction),contract=s.producer.habitable!.job!,at=contract.expiresAt+1,f=await fixture(s.seed,s.viewer);
    try{
      const view=await f.read(at),expected=await f.expected(at),p=f.entity<Player>('players',s.producer.id),job=p.habitable!.job!;
      assert.equal(view.player!.id,s.viewer.id);assert.deepEqual(p,expected.players[p.id]);assert.equal(job.status,'cancelled');assert.equal(job.escrow,0);assert.equal(job.reservedTimber,0);
      const source=f.entity<MvpWorld['tiles'][string]>('tiles',job.sourceTileId),expectedSource=expected.tiles[job.sourceTileId];assert.deepEqual(source,expectedSource);
      const layer=source.deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.layerId)!,initial=s.seed.tiles[job.sourceTileId].deposits.find(d=>d.itemId==='timber')!.layers.find(l=>l.id===job.layerId)!;
      assert.equal(layer.reserved,initial.reserved-4);assert.equal(layer.remaining,initial.remaining-(hasExtraction?4:0));assert.equal(layer.extracted,initial.extracted+(hasExtraction?4:0));
      assert.equal(qty(p,'timber'),qty(s.producer,'timber')+(hasExtraction?4:0));assert.equal(job.harvested,hasExtraction);
      if(hasExtraction)assert.equal(f.entity<{status:string}>('jobs',job.extractionJobId!).status,'completed');
      const snapshot=await f.factory().readVillage!({ownerId:p.ownerId,playerId:p.id,now:at});assert.ok(snapshot);assert.equal(snapshot.state.social.npc.remaining,s.seed.social.npc.remaining+16);
      assert.equal(snapshot.state.social.accounts[p.id].credits,s.seed.social.accounts[p.id].credits);
      // This internal escrow-to-NPC refund has no player endpoint, so it is not
      // part of the player's historical ledger projection. Check its real SQL
      // append rather than inventing a new UI/history rule in this regression.
      const refund=f.bindings[0].sqlite.prepare("SELECT COUNT(*) AS n,SUM(json_extract(body,'$.amount')) AS amount,MIN(json_extract(body,'$.at')) AS at FROM world_partition_parts WHERE collection='social/ledger' AND part_index=0 AND json_extract(body,'$.from')=? AND json_extract(body,'$.reason')='Devolución del encargo del distrito'").get(job.id)!;
      assert.equal(refund.n,1);assert.equal(refund.amount,16);assert.equal(refund.at,at);
      const saved=JSON.stringify(p),count=f.metrics.maintenanceCommits;await f.read(at+1);assert.equal(JSON.stringify(f.entity<Player>('players',p.id)),saved);assert.equal(f.metrics.maintenanceCommits,count);
      f.evidence();
    }finally{f.close();}
  }
});

async function tradeSeed(dispatch:boolean){
  const s=await districtSeed(true),store=new MemoryStore();store.record={revision:0,world:structuredClone(s.seed)};const id=s.producer.id,owner=s.producer.ownerId;let at=s.at;
  const p=()=>store.record!.world.players[id];
  const act=(command:MvpCommand)=>executeMvp(store,owner,{...command,playerId:id},crypto.randomUUID(),undefined,at);
  const read=()=>readMvpView(store,owner,id,at);
  const walk=async(point:{x:number;y:number})=>{await act({type:'habitat.walk',...point});at=p().habitable!.movement!.endsAt+1;await read();};
  at=store.record.world.jobs[p().habitable!.job!.extractionJobId!].endsAt+1;await read();
  const point=HABITABLE_POINTS.find(p=>p.id==='sawmill')!;await walk({x:point.x,y:point.y});await act({type:'habitat.job.craft'});
  at=store.record!.world.jobs[p().habitable!.job!.craftJobId!].endsAt+1;await read();
  await act({type:'habitat.build',templateId:'shed',x:7,y:3,rotation:0});at=p().habitable!.buildings.at(-1)!.endsAt+1;await read();
  const shed=p().habitable!.buildings[0];await walk(habitableBuildingEntrance(p().habitable!,shed)!);
  for(const lot of structuredClone(p().inventory).filter(l=>l.itemId==='plank'&&!l.bound))await act({type:'habitat.storage.deposit',buildingId:shed.id,lotId:lot.id,qty:lot.qty});
  await act({type:'habitat.trade.accept',buildingId:shed.id});
  if(dispatch){at=p().habitable!.commerce!.contracts[0].caravan.approachEndsAt+1;await read();await walk({x:5.8,y:5.9});await act({type:'habitat.trade.dispatch',buildingId:shed.id});}
  const seed=structuredClone(store.record!.world),producer=seed.players[id],trade=producer.habitable!.commerce!.contracts[0];
  return{seed,producer,viewer:seed.players[s.viewer.id],trade,at};
}

test('real NPC trade maintenance refunds an uncollected contract or pays its produced cargo only at unloading, without duplicating either',async()=>{
  for(const delivery of[false,true]){
    const s=await tradeSeed(delivery),at=delivery?s.trade.caravan.delivery!.unloadsAt:s.trade.deadline,f=await fixture(s.seed,s.viewer);
    try{
      const before=s.seed.social.accounts[s.producer.id].credits,first=await f.read(at);const expected=await f.expected(at),p=f.entity<Player>('players',s.producer.id),trade=p.habitable!.commerce!.contracts[0];
      assert.equal(first.habitable.commerce.available,false);assert.match(first.habitable.commerce.reason!,/carreta|regreso/i);
      assert.deepEqual(p,expected.players[p.id]);assert.equal(trade.status,delivery?'completed':'expired');assert.equal(trade.escrow,0);assert.equal(trade.cargo.length,0);
      const snapshot=await f.factory().readVillage!({ownerId:p.ownerId,playerId:p.id,now:at});assert.ok(snapshot);
      assert.equal(snapshot.state.social.accounts[p.id].credits,before+(delivery?12:0));assert.equal(snapshot.state.social.npc.remaining,s.seed.social.npc.remaining+(delivery?0:12));assert.equal(snapshot.state.social.npc.demand.plank!.remaining,s.seed.social.npc.demand.plank!.remaining+(delivery?0:2));
      if(delivery){assert.equal(trade.paidAt,at);assert.equal(trade.deliveredUnits,2);assert.deepEqual(trade.deliveredLots!.map(lot=>lot.provenance),s.trade.cargo.map(lot=>lot.provenance));assert.equal(snapshot.state.social.ledger.filter(entry=>entry.reason===`Entrega forestal ${trade.id}`).length,1);}
      else{assert.ok(trade.caravan.returnTrip);assert.equal(trade.caravan.returnTrip.startsAt,Math.max(at,trade.caravan.approachEndsAt)+1000);assert.equal(p.habitable!.buildings[0].storage!.reduce((sum,lot)=>sum+lot.qty,0),2);}
      const count=f.metrics.maintenanceCommits,saved=JSON.stringify(p);await f.read(at+1);assert.equal(f.metrics.maintenanceCommits,count);assert.equal(JSON.stringify(f.entity<Player>('players',p.id)),saved);
      const tail=delivery?trade.caravan.delivery!.unloadsAt+6000:trade.caravan.returnTrip!.endsAt+3000,projections=f.metrics.projections;
      const held=await f.read(tail-1);assert.equal(held.habitable.commerce.available,false);assert.equal(f.metrics.projections,projections,'The private view can be reused while the last visible cart still reserves its route.');
      const free=await f.read(tail);assert.equal(free.habitable.commerce.available,true,free.habitable.commerce.reason??'The completed cart must release the route at its exact visual deadline.');assert.equal(f.metrics.projections,projections+1);
      assert.equal(f.metrics.maintenanceCommits,count,'A visual wakeup must reproject, not settle another lease or refund twice.');assert.equal(JSON.stringify(f.entity<Player>('players',p.id)),saved);f.evidence();
    }finally{f.close();}
  }
});

test('a maintenance grant cannot execute a command, be projected as a user village, or overwrite a competing settlement',async()=>{
  const seed=createMvpWorld('qa-maintenance-admin',NOW),viewer=add(seed,'maintenance-race-viewer','Alba'),producer=add(seed,'maintenance-race-owner','Beto');settleSocial(seed,NOW);const tile=forest(seed,producer);order(seed,producer,{type:'mining.reserve',tileId:tile.id,itemId:'timber',qty:1});
  const job=Object.values(seed.jobs)[0],at=job.endsAt+1,f=await fixture(seed,viewer);
  try{
    const store=f.factory(),grant=await store.readVillageMaintenance!({ownerId:viewer.ownerId,playerId:viewer.id,now:at});assert.ok(grant?.kind==='village-maintenance');assert.equal(grant.snapshot.scope.mode,'maintenance');assert.equal(grant.snapshot.scope.ownerId,producer.ownerId);
    const trial=cloneOperationWorld(grant.snapshot.state);assert.throws(()=>assertVillageExecutionClosure(trial,{type:'craft.start',playerId:producer.id,recipeId:'plank',qty:1},at),/no autoriza/);
    await assert.rejects(async()=>store.projectVillageView!(grant.snapshot,viewer.ownerId,at,viewer.id),/cobertura|cuenta|autoridad|aldea|interno/i);
    settleProduction(trial,at,undefined,producer.id);
    await f.read(at);
    const before=f.entity<Player>('players',producer.id);assert.equal(await store.commitVillageMaintenance!(grant,trial),false,'An already committed competing settlement revokes the old grant.');
    assert.deepEqual(f.entity<Player>('players',producer.id),before);assert.equal(qty(before,'timber'),qty(producer,'timber')+1);assert.equal(f.entity<typeof job>('jobs',job.id).status,'completed');f.evidence();
  }finally{f.close();}
});

test('an unreviewed expired offer cannot be hidden behind the supported extractor maintenance path',async()=>{
  const seed=createMvpWorld('qa-maintenance-admin',NOW),viewer=add(seed,'maintenance-offer-viewer','Alba'),maker=add(seed,'maintenance-offer-owner','Beto'),other=add(seed,'maintenance-offer-other','Cora');settleSocial(seed,NOW);const tile=forest(seed,maker);order(seed,maker,{type:'mining.reserve',tileId:tile.id,itemId:'timber',qty:1});settleProduction(seed,NOW+10001,undefined,maker.id);
  dispatchSocial(seed,{type:'market.publish',playerId:maker.id,itemId:'timber',qty:1,mode:'credits',price:2},{ownerId:maker.ownerId,now:NOW+10001,requestId:crypto.randomUUID(),actor:maker});
  const otherTile=forest(seed,other);order(seed,other,{type:'mining.reserve',tileId:otherTile.id,itemId:'timber',qty:1},NOW+10001);
  const offer=seed.social.offers[0],f=await fixture(seed,viewer);
  try{
    const store=f.factory(),query={ownerId:viewer.ownerId,playerId:viewer.id,now:offer.expiresAt};
    assert.equal(await store.readVillage!(query),null);assert.equal(await store.readVillageMaintenance!(query),null,'Unsupported multilateral maintenance must preserve the declared global path.');
    assert.equal(f.metrics.maintenanceCommits,0);assert.equal(f.entity<typeof offer>('social/offers',`id:${offer.id}`).status,'open');
  }finally{f.close();}
});

test('the eight-participant budget returns a retryable failure without a global read, then the next request finishes the remaining lease',async()=>{
  const seed=createMvpWorld('qa-maintenance-admin',NOW),viewer=add(seed,'maintenance-budget-viewer','Alba'),sources=Object.values(seed.tiles).filter(tile=>tile.terrain!=='water'&&tile.deposits.some(d=>d.itemId==='timber'));
  for(let index=0;index<9;index++){
    const p=add(seed,`maintenance-budget-${index}`,`Vecino ${index}`),tile=sources[Math.floor(index/2)];p.position=tile.id;p.surveyed.push(tile.id);
    order(seed,p,{type:'mining.reserve',tileId:tile.id,itemId:'timber',qty:1});
  }
  settleSocial(seed,NOW);const at=NOW+10001,f=await fixture(seed,viewer);
  try{
    await assert.rejects(f.read(at),error=>(error as {status?:number}).status===503);
    assert.equal(f.metrics.globalReads,0);assert.equal(f.metrics.maintenanceCommits,8);
    const count=()=>Number(f.bindings[0].sqlite.prepare("SELECT COUNT(*) AS n FROM world_village_record_index WHERE collection='jobs' AND kind='extract' AND status='completed'").get()!.n);
    assert.equal(count(),8,'Every committed participant must be complete even when the request budget is exhausted.');
    const view=await f.read(at);assert.equal(view.player!.id,viewer.id);assert.equal(f.metrics.maintenanceCommits,9);assert.equal(count(),9);f.evidence();
  }finally{f.close();}
});

test('an administrator, clan requester or unaudited command retains its declared fallback before a foreign lease can receive maintenance authority',async()=>{
  for(const role of['administrator','clan','unsupported-command']){
    const seed=createMvpWorld('qa-maintenance-admin',NOW),viewer=add(seed,`maintenance-admission-${role}`,'Alba'),producer=add(seed,'maintenance-admission-owner','Beto');settleSocial(seed,NOW);
    if(role==='administrator')seed.adminOwnerId=viewer.ownerId;
    else if(role==='clan')dispatchSocial(seed,{type:'clan.create',playerId:viewer.id,name:'Custodios del Valle'},{ownerId:viewer.ownerId,now:NOW,requestId:crypto.randomUUID(),actor:viewer});
    const tile=forest(seed,producer);order(seed,producer,{type:'mining.reserve',tileId:tile.id,itemId:'timber',qty:1});const job=Object.values(seed.jobs)[0],f=await fixture(seed,viewer);
    try{
      const store=f.factory(),query={ownerId:viewer.ownerId,playerId:viewer.id,now:job.endsAt+1};
      assert.equal(await store.readVillage!({...query,...(role==='unsupported-command'?{command:{type:'market.fill',playerId:viewer.id,offerId:'not-a-covered-operation'}}:{})}),null);
      assert.equal(await store.readVillageMaintenance!(query),null,`${role} cannot silently advance a neighbor before its unaudited fallback.`);
      assert.equal(f.metrics.maintenanceCommits,0);assert.equal(f.entity<typeof job>('jobs',job.id).status,'running');
    }finally{f.close();}
  }
});
