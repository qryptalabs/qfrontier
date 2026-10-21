import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSqliteD1} from './support/d1-sqlite.ts';
import {createPartitionedMvpStore} from '../lib/mvp/partitioned-store.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {settleSocial} from '../lib/mvp/social.ts';
import {dispatchHabitable} from '../lib/mvp/habitable.ts';
import {dispatchProduction} from '../lib/mvp/production.ts';
import {auditReadD1} from './support/read-audit-d1.ts';
import {readMvpView} from '../lib/mvp/engine.ts';
import {deriveEntityValues} from '../lib/mvp/entity-versions.ts';
import type {MvpStore} from '../lib/mvp/store.ts';

const NOW=Date.parse('2026-10-22T12:00:00Z'),OWNER='projection-owner',OTHER='projection-neighbor';
const options={metadataVersioning:true,playerReads:true,villageWrites:true,villageReads:true,maxBatchStatements:40}as const;
async function fixture(withAlternate=false){
  const db=createSqliteD1();for(const path of['drizzle/0000_odd_warlock.sql','db/partitioned-world.sql','db/player-read-model.sql','db/village-writes.sql','db/bounded-village-reads.sql'])db.sqlite.exec(readFileSync(new URL(`../${path}`,import.meta.url),'utf8'));
  const world=createMvpWorld('projection-admin',NOW);
  const add=(ownerId:string,name:string)=>createPlayer(world,{ownerId,now:NOW,actor:null,requestId:crypto.randomUUID()},{type:'player.create',name,stationName:`Aldea ${name}`,faction:'cartographers'});
  const own=add(OWNER,'Alba'),neighbor=add(OTHER,'Beto'),alternate=withAlternate?add(OWNER,'Celia'):undefined;settleSocial(world,NOW);
  for(const player of[own,neighbor,...(alternate?[alternate]:[])])dispatchHabitable(world,{type:'habitat.profile',playerId:player.id,appearance:'pine',profession:'carrier'},{ownerId:player.ownerId,actor:player,now:NOW,requestId:crypto.randomUUID()});
  if(alternate)dispatchProduction(world,{type:'craft.start',playerId:alternate.id,recipeId:'plank',qty:1},{ownerId:OWNER,actor:alternate,now:NOW,requestId:crypto.randomUUID()});
  const alternateJob=alternate?Object.values(world.jobs).find(job=>job.playerId===alternate.id):undefined;
  await createPartitionedMvpStore(db,{...options,maxBatchStatements:900}).insert(world);
  const audit=auditReadD1(db);
  let projections=0;
  const store=()=>{
    const raw=createPartitionedMvpStore(audit.database,options);
    return new Proxy(raw,{get(target,key,receiver){if(key==='read')return()=>{throw new Error('GLOBAL_READ_FORBIDDEN');};const value=Reflect.get(target,key,receiver);if(key==='projectVillageView')return(...args:Parameters<NonNullable<MvpStore['projectVillageView']>>)=>{projections++;return target.projectVillageView!(...args);};return typeof value==='function'?value.bind(target):value;}})as MvpStore;
  };
  const update=async(change:(record:NonNullable<Awaited<ReturnType<MvpStore['read']>>>)=>void)=>{const full=createPartitionedMvpStore(db,{...options,maxBatchStatements:900}),record=await full.read();assert.ok(record);change(record);assert.equal(await full.compareAndSwap(record.revision,record.world,{ownerId:OTHER,playerId:neighbor.id,now:NOW+1}),true);};
  return{db,audit,own,neighbor,alternate,alternateJob,store,update,projections:()=>projections};
}

test('a neighbor chronicle append reuses the private projection and returns fresh public news',async()=>{
  const f=await fixture();try{
    const first=await readMvpView(f.store(),OWNER,f.own.id,NOW);assert.equal(f.projections(),1);
    assert.deepEqual(first.player!.habitable,first.habitable.state);
    assert.notEqual(first.player,first.players.find(player=>player.id===first.player!.id));
    assert.notEqual(first.player!.habitable,first.habitable.state,'Client slices keep separate mutable objects despite sharing calculation.');
    const oldName=first.players[0].name;first.player!.name='client mutation';assert.equal(first.players[0].name,oldName);
    await f.update(record=>{
      const before=deriveEntityValues(record.world);record.world.players[f.neighbor.id].name='Beto del Bosque';
      record.world.events.push({id:'projection-fresh-event',playerId:f.neighbor.id,playerName:'Beto del Bosque',text:'Construyó su primer aserradero.',at:NOW+1});
      const after=deriveEntityValues(record.world);assert.equal(after['lectura:social'],before['lectura:social']);assert.notEqual(after['lectura:compartida'],before['lectura:compartida']);
    });
    const hot=await readMvpView(f.store(),OWNER,f.own.id,NOW+2);
    assert.equal(f.projections(),1,'A public news/neighbor identity update must not rebuild private paths, manager forecast or workforce.');
    assert.equal(hot.events.at(-1)!.id,'projection-fresh-event');assert.equal(hot.people.find(person=>person.id===f.neighbor.id)!.name,'Beto del Bosque');assert.equal(hot.player!.name,oldName);
    const body=f.db.sqlite.prepare('SELECT body FROM world_player_view_parts WHERE owner_id=? ORDER BY part_index').all(OWNER).map(row=>row.body).join('');assert.deepEqual(JSON.parse(body).events,[],'Fresh news is composed in SQL, never retained as a stale private copy.');
  }finally{f.db.close();}
});

test('private invalidation avoids loading the public directory and shared resource changes still rebuild the view',async()=>{
  const f=await fixture();try{
    await readMvpView(f.store(),OWNER,f.own.id,NOW);
    await f.update(record=>{record.world.social.npc.remaining-=1;});
    f.audit.reset();
    const miss=await createPartitionedMvpStore(f.audit.database,options).readPlayerView!(OWNER,f.own.id,NOW+2);
    const publicRows=f.audit.traces.filter(trace=>/FROM world_public_actor_(heads|parts)/.test(trace.sql)).reduce((sum,trace)=>sum+trace.returnedRows,0);
    assert.equal(miss,null);assert.equal(publicRows,0,'A known-invalid private cache cannot return and hash every public actor before rebuilding.');
    await readMvpView(f.store(),OWNER,f.own.id,NOW+2);assert.equal(f.projections(),2);
  }finally{f.db.close();}
});

test('a corrupt chronicle fragment cannot be served through an otherwise valid private cache',async()=>{
  const f=await fixture();try{
    await f.update(record=>{record.world.events.push({id:'projection-corrupt-event',playerId:f.neighbor.id,playerName:'Beto',text:'Original',at:NOW+1});});
    await readMvpView(f.store(),OWNER,f.own.id,NOW+2);
    f.db.sqlite.prepare("UPDATE world_partition_parts SET body=? WHERE collection='events' AND entity_id=? AND part_index=0").run('{"id":"forged"}','id:projection-corrupt-event');
    assert.equal(await createPartitionedMvpStore(f.db,options).readPlayerView!(OWNER,f.own.id,NOW+3),null);
    f.db.sqlite.prepare("DELETE FROM world_village_record_index WHERE collection='events' AND entity_id=?").run('id:projection-corrupt-event');
    assert.equal(await createPartitionedMvpStore(f.db,options).readPlayerView!(OWNER,f.own.id,NOW+3),null,'Removing the index row cannot hide the corrupt event as an empty valid chronicle.');
  }finally{f.db.close();}
});

test('an overdue private job on an alternate profile does not force repeated projection of the selected village',async()=>{
  const f=await fixture(true);try{
    const at=f.alternateJob!.endsAt+1;
    const first=await readMvpView(f.store(),OWNER,f.own.id,at);assert.equal(f.projections(),1);
    assert.equal(first.jobs.find(job=>job.id===f.alternateJob!.id)!.status,'running');
    await readMvpView(f.store(),OWNER,f.own.id,at+1);assert.equal(f.projections(),1,'The alternate profile is shown as last confirmed, not a permanently-expired private cache.');
    const other=await readMvpView(f.store(),OWNER,f.alternate!.id,at+2);
    assert.equal(other.jobs.find(job=>job.id===f.alternateJob!.id)!.status,'completed');
    assert.equal(other.player!.inventory.filter(lot=>lot.itemId==='plank').reduce((sum,lot)=>sum+lot.qty,0),1);
    assert.equal(other.players.find(player=>player.id===f.own.id)!.inventory.filter(lot=>lot.itemId==='plank').reduce((sum,lot)=>sum+lot.qty,0),0);
  }finally{f.db.close();}
});
