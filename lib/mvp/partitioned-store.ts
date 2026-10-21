import type { MvpStore,MvpRecord,MvpVillageCommitContext } from './store.ts';
import type { MvpWorld } from './types.ts';
import { readD1WithRetry, writeD1Once } from './storage-availability.ts';
import { decodeWorldRecords, hashRecord, serializeWorldRecords, splitUtf8, worldRecordKey } from './partitioned-codec.ts';
import type { WorldRecord } from './partitioned-codec.ts';
import { advanceEntityVersions, deriveEntityValues, selectPlayerViewVersionKeys } from './entity-versions.ts';
import type { EntityVersions } from './entity-versions.ts';
import { createPlayerReadModel, guardedReadModelRows } from './player-read-model.ts';
import {createVillageReadIndex} from './village-read-index.ts';
import {decodeVillageRecords} from './village-snapshot.ts';
import type {VillageSnapshot,VillageReadQuery,VillageReadReason,VillageReadOutcome,VillageMaintenanceRecord,VillageMaintenanceQuery} from './village-snapshot.ts';
import {attachVillageEvidence,copyVillageEvidence} from './village-evidence.ts';
import {deriveVillageVersionChanges,assertVillageExecutionClosure,supportsVillageCommand} from './village-semantics.ts';

export interface PartitionD1Result<T=Record<string,unknown>> {success:boolean;error?:string;meta:{changes:number};results?:T[]}
export interface PartitionD1Statement {
  bind(...values:unknown[]):PartitionD1Statement;
  first<T=Record<string,unknown>>():Promise<T|null>;
  all<T=Record<string,unknown>>():Promise<PartitionD1Result<T>>;
  run<T=Record<string,unknown>>():Promise<PartitionD1Result<T>>;
}
export interface PartitionD1Database {
  prepare(sql:string):PartitionD1Statement;
  batch<T=Record<string,unknown>>(statements:PartitionD1Statement[]):Promise<PartitionD1Result<T>[]>;
}
export interface PartitionedStoreOptions {realmId?:string;chunkBytes?:number;maxBatchStatements?:number;metadataVersioning?:boolean;playerReads?:boolean;villageWrites?:boolean;villageReads?:boolean;onVillageReadOutcome?:(outcome:VillageReadOutcome)=>void}
interface Head {realm_id:string;revision:number;format:number;commit_token:string;record_count:number;part_count:number;updated_at:string}
interface Part {collection:string;entity_id:string;part_index:number;part_count:number;ordinal:number;record_hash:string;body:string}
interface SavedRecord extends WorldRecord {hash:string;parts:string[]}
interface VillageObservation {snapshot:VillageSnapshot;records:Map<string,SavedRecord>;query:VillageReadQuery}
interface VersionRow {entity_key:string;version:number;fingerprint:string}
interface Snapshot {revision:number;token:string;records:Map<string,SavedRecord>;source:'partitioned'|'legacy';world:MvpWorld;versions:EntityVersions;fingerprints:Map<string,string>;metadataCurrent:boolean;publicCurrent:boolean;indexCurrent:boolean}

const REALM_ID='frontier-pdf-mvp-v2';
const fail=():never=>{throw new Error('El guardado dividido tiene un formato inválido o incompleto.');};
const integer=(value:unknown,min=0):value is number=>Number.isSafeInteger(value)&&Number(value)>=min;
const assertResult=(result:PartitionD1Result):void=>{if(!result?.success)throw new Error(result?.error??'La escritura D1 no confirmó su resultado.');};
function assertBatch(results:PartitionD1Result[],count:number):void {
  if(!Array.isArray(results)||results.length!==count)fail();
  results.forEach(assertResult);
}
/** Per-request work queue: preserve all hashes without creating hundreds of
 * pending crypto jobs for each concurrent request. No state is shared globally. */
async function mapBounded<T,R>(values:readonly T[],operation:(value:T,index:number)=>Promise<R>):Promise<R[]>{
  const results=new Array<R>(values.length);let cursor=0;
  const worker=async()=>{while(cursor<values.length){const index=cursor++;results[index]=await operation(values[index],index);}};
  await Promise.all(Array.from({length:Math.min(8,values.length)},worker));
  return results;
}

/** Experimental opt-in adapter, NOT selected by getMvpStore.
 * Removes the 2 MB single-row ceiling while retaining ONE atomic economic CAS.
 * It intentionally still reconstructs the entire world; it is not a 500-player
 * certification or a distributed transaction implementation.
 */
export function createPartitionedMvpStore(db:PartitionD1Database,options:PartitionedStoreOptions={}):MvpStore {
  const realm=options.realmId??REALM_ID,chunkBytes=options.chunkBytes??65_536,maxBatch=options.maxBatchStatements??40;
  if(typeof realm!=='string'||!realm||realm.length>160||!integer(chunkBytes,1024)||chunkBytes>262_144||!integer(maxBatch,1)||maxBatch>900)throw new Error('La configuración del guardado dividido no es válida.');
  // A store is request-scoped. No world or write authority lives in module globals.
  let observed:Snapshot|null=null;
  let villageObserved:VillageObservation|null=null;
  let maintenanceObserved:{record:VillageMaintenanceRecord;local:VillageObservation;context:MvpVillageCommitContext}|null=null;
  let lastVillageRead:{query:VillageMaintenanceQuery;reason:VillageReadReason;metadata:PartitionD1Result[]}|null=null;
  const observeVillage=(operation:VillageReadOutcome['operation'],result:VillageReadOutcome['result'],reason:VillageReadReason)=>{try{options.onVillageReadOutcome?.({operation,result,reason});}catch{/* Diagnostics cannot grant authority or change a game operation. */}};
  if(options.villageReads&&(!options.villageWrites||!options.playerReads))throw new Error('Las lecturas por aldea requieren sus escrituras y proyecciones transaccionales.');
  const metadata=options.metadataVersioning===true||options.playerReads===true||options.villageWrites===true;
  const readPlane=options.playerReads===true?createPlayerReadModel(db,{realmId:realm,chunkBytes,maxBatchStatements:maxBatch,boundedReads:options.villageReads===true}):null;
  const villageIndex=options.villageReads?createVillageReadIndex(db,realm,chunkBytes):null;
  const guard='EXISTS (SELECT 1 FROM world_partition_heads WHERE realm_id = ? AND commit_token = ?)';

  async function versionFingerprints(world:MvpWorld,versions:EntityVersions,values=deriveEntityValues(world)):Promise<Map<string,string>>{
    return new Map(await mapBounded(Object.keys(versions),async key=>[key,await hashRecord(Object.hasOwn(values,key)?values[key]:`deleted:${key}`)] as const));
  }
  async function commitFingerprints(world:MvpWorld,versions:EntityVersions,snapshot:Snapshot):Promise<Map<string,string>>{
    // A repaired snapshot contains rotated versions with old persisted hashes.
    // Reuse is safe only when the entire observed metadata stamp was current.
    if(!snapshot.metadataCurrent)return versionFingerprints(world,versions);
    const fingerprints=new Map(snapshot.fingerprints),changed=Object.keys(versions).filter(key=>versions[key]!==snapshot.versions[key]||!fingerprints.has(key));
    if(!changed.length)return fingerprints;
    const values=deriveEntityValues(world);
    const updates=await mapBounded(changed,async key=>[key,await hashRecord(Object.hasOwn(values,key)?values[key]:`deleted:${key}`)] as const);
    for(const[key,fingerprint]of updates)fingerprints.set(key,fingerprint);
    return fingerprints;
  }
  function metadataMutations(versions:EntityVersions,fingerprints:Map<string,string>,previous:Snapshot|null,revision:number,token:string,actorCount:number):PartitionD1Statement[]{
    const rows=Object.entries(versions).filter(([key,version])=>previous?.versions[key]!==version||previous.fingerprints.get(key)!==fingerprints.get(key)).map(([key,version])=>[realm,key,version,fingerprints.get(key)!]);
    return [...guardedReadModelRows(db,realm,token,'world_entity_versions',['realm_id','entity_key','version','fingerprint'],rows,['realm_id','entity_key']),...guardedReadModelRows(db,realm,token,'world_read_model_state',['realm_id','source_revision','commit_token','public_revision','public_token','actor_count','entity_count'],[[realm,revision,token,readPlane?revision:null,readPlane?token:null,actorCount,Object.keys(versions).length]],['realm_id'])];
  }
  function changedPublicPlayers(previous:Map<string,SavedRecord>,next:Map<string,SavedRecord>,world:MvpWorld):string[]{
    const ids=new Set<string>(),owners=new Set<string>();let clansChanged=false;
    for(const key of new Set([...previous.keys(),...next.keys()])){
      const before=previous.get(key),after=next.get(key);if(before===after)continue;
      const record=after??before!;
      if(record.collection==='players'){
        ids.add(record.entityId);
        for(const entry of[before,after])if(entry)owners.add((JSON.parse(entry.body) as {ownerId:string}).ownerId);
      }
      if(record.collection==='jobs')for(const entry of[before,after])if(entry)ids.add((JSON.parse(entry.body) as {playerId:string}).playerId);
      if(record.collection==='social/clans')clansChanged=true;
    }
    for(const p of Object.values(world.players))if(clansChanged||owners.has(p.ownerId))ids.add(p.id);
    return [...ids];
  }

  async function read():ReturnType<MvpStore['read']>{
    // A failed/corrupt read must never leave an older snapshot writable.
    const previous=observed;observed=null;
    const statements=[
      db.prepare('SELECT * FROM world_partition_heads WHERE realm_id = ?').bind(realm),
      db.prepare('SELECT collection, entity_id, part_index, part_count, ordinal, record_hash, body FROM world_partition_parts WHERE realm_id = ? ORDER BY collection, entity_id, part_index').bind(realm),
      db.prepare('SELECT revision, state FROM world_state WHERE id = ? AND NOT EXISTS (SELECT 1 FROM world_partition_heads WHERE realm_id = ?)').bind(realm,realm),
    ];
    if(metadata)statements.push(db.prepare('SELECT entity_key, version, fingerprint FROM world_entity_versions WHERE realm_id = ?').bind(realm),db.prepare('SELECT source_revision, commit_token, public_revision, public_token, actor_count, entity_count FROM world_read_model_state WHERE realm_id = ?').bind(realm));
    if(villageIndex)statements.push(db.prepare('SELECT source_revision,commit_token,record_count FROM world_village_index_state s WHERE realm_id=? AND record_count=(SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=s.realm_id) AND participant_count=(SELECT COUNT(*) FROM world_village_ledger_participants lp WHERE lp.realm_id=s.realm_id)').bind(realm));
    const results=await readD1WithRetry(()=>db.batch(statements));
    assertBatch(results,statements.length);
    const heads=results[0].results as unknown as Head[],parts=results[1].results as unknown as Part[],legacy=results[2].results as unknown as {revision:number;state:string}[];
    if(!Array.isArray(heads)||!Array.isArray(parts)||!Array.isArray(legacy)||heads.length>1||legacy.length>1)fail();
    if(heads.length===0){
      if(parts.length)fail();
      const row=legacy[0];
      if(!row){observed=null;return null;}
      if(!integer(row.revision)||typeof row.state!=='string')fail();
      const world=JSON.parse(row.state) as MvpWorld;
      if(world?.schemaVersion!==2)fail();
      observed={revision:row.revision,token:'',source:'legacy',records:new Map(),world,versions:{},fingerprints:new Map(),metadataCurrent:false,publicCurrent:false,indexCurrent:false};
      return{revision:row.revision,world};
    }
    const head=heads[0];
    if(!integer(head.revision)||head.format!==1||typeof head.commit_token!=='string'||!head.commit_token||!integer(head.record_count,1)||!integer(head.part_count,head.record_count)||head.part_count!==parts.length)fail();
    const grouped=new Map<string,Part[]>();
    for(const part of parts){
      if(typeof part.collection!=='string'||typeof part.entity_id!=='string'||!integer(part.part_index)||!integer(part.part_count,1)||!integer(part.ordinal)||typeof part.body!=='string'||!/^([a-f0-9]{64})$/.test(part.record_hash))fail();
      const key=worldRecordKey(part.collection,part.entity_id),group=grouped.get(key)??[];
      group.push(part);grouped.set(key,group);
    }
    if(grouped.size!==head.record_count)fail();
    const records=new Map<string,SavedRecord>();
    await mapBounded(Array.from(grouped),async([key,group])=>{
      const first=group[0];
      if(group.length!==first.part_count)fail();
      for(let index=0;index<group.length;index++)if(group[index].part_index!==index||group[index].part_count!==group.length||group[index].ordinal!==first.ordinal||group[index].record_hash!==first.record_hash)fail();
      const bodies=group.map(part=>part.body),body=bodies.join('');
      const trusted=previous?.source==='partitioned'?previous.records.get(key):undefined;
      if(!(trusted?.body===body&&trusted.hash===first.record_hash)&&await hashRecord(body)!==first.record_hash)fail();
      records.set(key,{collection:first.collection,entityId:first.entity_id,ordinal:first.ordinal,body,parts:bodies,hash:first.record_hash});
    });
    const world=decodeWorldRecords([...records.values()]);
    const versions:EntityVersions={},savedFingerprints=new Map<string,string>();let metadataCurrent=false,publicCurrent=false;
    if(metadata){
      const rows=results[3].results as unknown as VersionRow[];
      if(!Array.isArray(rows))fail();
      for(const row of rows){if(typeof row.entity_key!=='string'||!integer(row.version,1)||!/^(?:delta:)?[a-f0-9]{64}$/.test(row.fingerprint)||Object.hasOwn(versions,row.entity_key))fail();Object.defineProperty(versions,row.entity_key,{value:row.version,writable:true,enumerable:true,configurable:true});savedFingerprints.set(row.entity_key,row.fingerprint);}
      const model=results[4].results as unknown as {source_revision:number;commit_token:string;public_revision:number|null;public_token:string|null;actor_count:number;entity_count:number}[];
      const stampMatches=Array.isArray(model)&&model.length===1&&model[0].source_revision===head.revision&&model[0].commit_token===head.commit_token;
      metadataCurrent=stampMatches;
      publicCurrent=stampMatches&&model[0].public_revision===head.revision&&model[0].public_token===head.commit_token&&model[0].actor_count===Object.keys(world.players).length;
      if(stampMatches){
        // These rows and this stamp were committed in the same atomic batch.
        // Re-deriving and re-hashing the complete world here defeats scoped reads.
        if(!integer(model[0].entity_count,1)||model[0].entity_count!==rows.length)fail();
      }else{
        const values=deriveEntityValues(world);for(const key of Object.keys(values))if(!Object.hasOwn(versions,key))Object.defineProperty(versions,key,{value:1,writable:true,enumerable:true,configurable:true});
        const currentFingerprints=await versionFingerprints(world,versions,values);
        for(const[key,fingerprint]of currentFingerprints)if(savedFingerprints.get(key)!==fingerprint&&savedFingerprints.has(key)){if(versions[key]===Number.MAX_SAFE_INTEGER)fail();versions[key]++;}
        // An older writer may have changed A→B→A without updating these rows.
        // Rotate every persisted version before repairing that unknown interval.
        if(savedFingerprints.size)for(const key of savedFingerprints.keys()){if(versions[key]===Number.MAX_SAFE_INTEGER)fail();versions[key]++;}
      }
    }
    const indexStamp=villageIndex?results[5].results?.[0] as {source_revision:number;commit_token:string;record_count:number}|undefined:undefined;
    const indexCurrent=!!indexStamp&&indexStamp.source_revision===head.revision&&indexStamp.commit_token===head.commit_token&&indexStamp.record_count===head.record_count;
    observed={revision:head.revision,token:head.commit_token,source:'partitioned',records,world,versions,fingerprints:savedFingerprints,metadataCurrent,publicCurrent,indexCurrent};
    return{revision:head.revision,world,...(metadata&&metadataCurrent?{entityVersions:versions}:{})};
  }

  async function encode(world:MvpWorld,previous:Map<string,SavedRecord>,preserveOrdinals=false):Promise<Map<string,SavedRecord>>{
    return new Map(await mapBounded(serializeWorldRecords(world),async record=>{
      const key=worldRecordKey(record.collection,record.entityId),old=previous.get(key);
      if(preserveOrdinals&&old)record.ordinal=old.ordinal;
      if(old?.body===record.body)return[key,old.ordinal===record.ordinal?old:{...old,ordinal:record.ordinal}] as const;
      return[key,{...record,hash:await hashRecord(record.body),parts:splitUtf8(record.body,chunkBytes)}] as const;
    }));
  }

  function changes(previous:Map<string,SavedRecord>,next:Map<string,SavedRecord>,token:string):PartitionD1Statement[]{
    const removed=[...previous].filter(([key,old])=>next.get(key)!==old).map(([,record])=>record);
    const added=[...next].filter(([key,record])=>previous.get(key)!==record).map(([,record])=>record);
    const statements:PartitionD1Statement[]=[];
    // 1 realm + 48*(collection,id) + 2 guard bindings = 99 (< D1's 100).
    for(let index=0;index<removed.length;index+=48){
      const group=removed.slice(index,index+48);
      statements.push(db.prepare(`DELETE FROM world_partition_parts WHERE realm_id = ? AND (${group.map(()=>'(collection = ? AND entity_id = ?)').join(' OR ')}) AND ${guard}`).bind(realm,...group.flatMap(record=>[record.collection,record.entityId]),realm,token));
    }
    const rows=added.flatMap(record=>record.parts.map((body,index)=>[realm,record.collection,record.entityId,index,record.parts.length,record.ordinal,record.hash,body]));
    // 12*8 data bindings + 2 guard bindings = 98. Every insert is guarded.
    for(let index=0;index<rows.length;index+=12){
      const group=rows.slice(index,index+12);
      // VALUES avoids the runtime's stricter compound-SELECT term limit; a
      // twelve-term UNION can pass stock SQLite and fail in Workers D1.
      const values=group.map(()=>'(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      statements.push(db.prepare(`INSERT INTO world_partition_parts (realm_id, collection, entity_id, part_index, part_count, ordinal, record_hash, body) SELECT * FROM (VALUES ${values}) WHERE ${guard}`).bind(...group.flat(),realm,token));
    }
    return statements;
  }
  function checkBudget(statements:PartitionD1Statement[]):void {
    if(statements.length>maxBatch)throw new Error('El cambio supera el presupuesto de escrituras atómicas. No se ha modificado el guardado.');
  }
  const counts=(records:Map<string,SavedRecord>):[number,number]=>[records.size,[...records.values()].reduce((sum,record)=>sum+record.parts.length,0)];

  const api:MvpStore={
    ...(metadata?{capabilities:{entityVersions:true as const,...(readPlane?{playerReads:true as const}:{}),...(options.villageWrites?{villageWrites:true as const}:{}),...(villageIndex?{villageReads:true as const}:{})}}:{}),
    read,
    async insert(world){
      const next=await encode(world,new Map()),token=crypto.randomUUID(),[records,parts]=counts(next);
      const statements=[db.prepare('INSERT INTO world_partition_heads (realm_id, revision, format, commit_token, record_count, part_count, updated_at) SELECT ?, 0, 1, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM world_state WHERE id = ?) ON CONFLICT (realm_id) DO NOTHING').bind(realm,token,records,parts,new Date().toISOString(),realm),...changes(new Map(),next,token)];
      if(metadata){const values=deriveEntityValues(world),versions=Object.fromEntries(Object.keys(values).map(key=>[key,1]));statements.push(...metadataMutations(versions,await versionFingerprints(world,versions,values),null,0,token,Object.keys(world.players).length));if(readPlane)statements.push(...await readPlane.publicMutations(world,0,versions,world.createdAt,token,Object.keys(world.players)));}
      if(villageIndex)statements.push(...await villageIndex.mutations(world,new Map(),next,token));
      checkBudget(statements);
      await writeD1Once('insert',async()=>{
        const results=await db.batch(statements);assertBatch(results,statements.length);
        if(![0,1].includes(results[0].meta?.changes))fail();
        // The next operation must observe a committed revision via read().
        observed=null;
      });
    },
    async compareAndSwap(revision,world,context){
      if(!integer(revision)||revision===Number.MAX_SAFE_INTEGER)throw new Error('La revisión del guardado no es válida.');
      const snapshot=observed;
      if(!snapshot||snapshot.revision!==revision)return false;
      if(snapshot.source==='legacy')throw new Error('El guardado original requiere una migración explícita y verificada.');
      const next=await encode(world,snapshot.records),token=crypto.randomUUID(),[records,parts]=counts(next);
      const statements=[db.prepare('UPDATE world_partition_heads SET revision = revision + 1, commit_token = ?, record_count = ?, part_count = ?, updated_at = ? WHERE realm_id = ? AND revision = ? AND commit_token = ?').bind(token,records,parts,new Date().toISOString(),realm,revision,snapshot.token),...changes(snapshot.records,next,token)];
      const versions=metadata?advanceEntityVersions(decodeWorldRecords([...snapshot.records.values()]),world,snapshot.versions):{};
      const fingerprints=metadata?await commitFingerprints(world,versions,snapshot):new Map<string,string>();
      if(metadata){statements.push(...metadataMutations(versions,fingerprints,snapshot.metadataCurrent?snapshot:null,revision+1,token,Object.keys(world.players).length));if(readPlane)statements.push(...await readPlane.publicMutations(world,revision+1,versions,context?.now??Date.now(),token,snapshot.metadataCurrent&&snapshot.publicCurrent?changedPublicPlayers(snapshot.records,next,world):Object.keys(world.players)));}
      // An unknown writer interval cannot be repaired by indexing only this
      // delta. Keep bounded reads unavailable until an explicit full rebuild.
      if(villageIndex&&snapshot.indexCurrent)statements.push(...await villageIndex.mutations(world,snapshot.records,next,token));
      checkBudget(statements);
      // No retry after an ambiguous write; the engine's stable requestId/receipt
      // resolves a client retry after a fresh, authoritative read.
      return writeD1Once('compareAndSwap',async()=>{
        let results:PartitionD1Result[];
        try{results=await db.batch(statements);}finally{observed=null;}
        assertBatch(results,statements.length);
        if(![0,1].includes(results[0].meta?.changes))fail();
        if(results[0].meta.changes===0)return false;
        observed={revision:revision+1,token,source:'partitioned',records:next,world,versions,fingerprints,metadataCurrent:metadata,publicCurrent:!!readPlane,indexCurrent:snapshot.indexCurrent};
        return true;
      });
    },
  };
  async function commitDelta(record:MvpRecord|VillageSnapshot,world:MvpWorld,context:MvpVillageCommitContext,local?:VillageObservation):Promise<MvpRecord|VillageSnapshot|null>{
    const snapshot=local?{revision:local.snapshot.revision,token:local.snapshot.token,records:local.records,source:'partitioned' as const,world:local.snapshot.state,versions:local.snapshot.entityVersions,fingerprints:new Map<string,string>(),metadataCurrent:true,publicCurrent:true,indexCurrent:true}:observed,player=context.playerId?world.players[context.playerId]:undefined;
    if(!snapshot||snapshot.source!=='partitioned'||snapshot.revision!==record.revision||!snapshot.metadataCurrent||readPlane&&!snapshot.publicCurrent)return null;
    if(!player||player.ownerId!==context.ownerId||!integer(context.now))throw new Error('La escritura por aldea no tiene un propietario válido.');
    const readVersions=context.readVersions,readEntries=Object.entries(readVersions);
    if(!readEntries.length||readEntries.length>2048||readEntries.some(([key,version])=>!key||key.length>1024||!integer(version))||!Object.hasOwn(readVersions,'politicas')||!Object.hasOwn(readVersions,`cuenta:${context.ownerId}`)||!Object.hasOwn(readVersions,`aldea:${player.id}`))throw new Error('La escritura por aldea requiere su conjunto completo de lecturas.');
    if(readEntries.some(([key,version])=>(snapshot.versions[key]??0)!==version))return null;
    const next=await encode(world,snapshot.records,!!local),changed:SavedRecord[]=[],removed:SavedRecord[]=[],added:SavedRecord[]=[],guards:{collection:string;entityId:string;hash:string|null}[]=[];
    const structural=new Set<string>();
    for(const key of new Set([...snapshot.records.keys(),...next.keys()])){
      const before=snapshot.records.get(key),after=next.get(key);
      if(before?.body===after?.body)continue;
      // The chronicle is a bounded projection. A stale village must not erase
      // another village's newly appended events while applying its own cap.
      if(before&&!after&&before.collection==='events')continue;
      if(before&&!after&&before.collection==='social/ledger')throw new Error('Una escritura por aldea no puede borrar el libro contable.');
      const entry=after??before!;guards.push({collection:entry.collection,entityId:entry.entityId,hash:before?.hash??null});
      if(before)removed.push(before);
      if(after)changed.push(after);
      if(!before&&after){added.push(after);structural.add(after.collection);}
      if(before&&!after)structural.add(before.collection);
    }
    if(!guards.length)return local?local.snapshot:read();
    const token=crypto.randomUUID(),operationGuard={sql:'EXISTS (SELECT 1 FROM world_village_write_operations WHERE realm_id = ? AND operation_id = ?)',bindings:[realm,token]};
    let semanticAfter:Record<string,string>,versionKeys:string[];
    if(local){const before=decodeVillageRecords([...snapshot.records.values()]);attachVillageEvidence(before,local.snapshot.scope);copyVillageEvidence(before,world);const change=deriveVillageVersionChanges(before,world);semanticAfter=change.values;versionKeys=change.changedKeys;}
    else{const semanticBefore=deriveEntityValues(decodeWorldRecords([...snapshot.records.values()]));semanticAfter=deriveEntityValues(world);versionKeys=[...new Set([...Object.keys(semanticBefore),...Object.keys(semanticAfter)])].filter(key=>semanticBefore[key]!==semanticAfter[key]);}
    if(versionKeys.some(key=>snapshot.versions[key]===Number.MAX_SAFE_INTEGER))throw new Error('Se agotó la versión de la entidad.');
    // A scoped delta may append to a shared chronicle while another village
    // commits. Its lineage fingerprint is explicitly NOT a materialized hash
    // of that shared aggregate. Atomic versions are the authorization guard;
    // legacy-gap repair treats lineage markers as unknown and rotates safely.
    const versionRows=await mapBounded(versionKeys,async key=>[realm,key,1,`delta:${await hashRecord(`${snapshot.fingerprints.get(key)??''}:${token}:${Object.hasOwn(semanticAfter,key)?semanticAfter[key]:`deleted:${key}`}`)}`]);
    const nextVersions={...snapshot.versions};for(const key of versionKeys)nextVersions[key]=(nextVersions[key]??0)+1;
    const statements:PartitionD1Statement[]=[db.prepare(`INSERT INTO world_village_write_operations (realm_id, operation_id, owner_id, player_id)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM world_partition_heads h JOIN world_read_model_state m ON m.realm_id=h.realm_id AND m.source_revision=h.revision AND m.commit_token=h.commit_token WHERE h.realm_id=? AND h.format=1 AND h.revision<${Number.MAX_SAFE_INTEGER} AND m.entity_count=(SELECT COUNT(*) FROM world_entity_versions v WHERE v.realm_id=h.realm_id) ${local?"AND EXISTS (SELECT 1 FROM world_village_index_state s WHERE s.realm_id=h.realm_id AND s.source_revision=h.revision AND s.commit_token=h.commit_token AND s.record_count=h.record_count AND s.record_count=(SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id) AND s.participant_count=(SELECT COUNT(*) FROM world_village_ledger_participants lp WHERE lp.realm_id=h.realm_id))":''} ${readPlane?"AND m.public_revision=h.revision AND m.public_token=h.commit_token AND m.actor_count=(SELECT COUNT(*) FROM world_public_actor_heads a WHERE a.realm_id=h.realm_id) AND m.actor_count=(SELECT COUNT(*) FROM world_partition_parts p WHERE p.realm_id=h.realm_id AND p.collection='players' AND p.part_index=0)":''})
      AND NOT EXISTS (SELECT 1 FROM json_each(?) d LEFT JOIN world_entity_versions v ON v.realm_id=? AND v.entity_key=json_extract(d.value,'$[0]') WHERE COALESCE(v.version,0)<>json_extract(d.value,'$[1]'))
      AND NOT EXISTS (SELECT 1 FROM json_each(?) d LEFT JOIN world_partition_parts p ON p.realm_id=? AND p.collection=json_extract(d.value,'$.collection') AND p.entity_id=json_extract(d.value,'$.entityId') AND p.part_index=0 WHERE COALESCE(p.record_hash,'')<>COALESCE(json_extract(d.value,'$.hash'),''))
      AND NOT EXISTS (SELECT 1 FROM json_each(?) k JOIN world_entity_versions v ON v.realm_id=? AND v.entity_key=k.value WHERE v.version>=?)`)
      .bind(realm,token,context.ownerId,player.id,realm,JSON.stringify(readEntries),realm,JSON.stringify(guards),realm,JSON.stringify(versionKeys),realm,Number.MAX_SAFE_INTEGER)];
    for(let index=0;index<removed.length;index+=48){const group=removed.slice(index,index+48);statements.push(db.prepare(`DELETE FROM world_partition_parts WHERE realm_id=? AND (${group.map(()=>'(collection=? AND entity_id=?)').join(' OR ')}) AND ${operationGuard.sql}`).bind(realm,...group.flatMap(entry=>[entry.collection,entry.entityId]),...operationGuard.bindings));}
    const rows=changed.flatMap(entry=>entry.parts.map((body,index)=>[realm,entry.collection,entry.entityId,index,entry.parts.length,entry.ordinal,entry.hash,body]));
    statements.push(...guardedReadModelRows(db,realm,token,'world_partition_parts',['realm_id','collection','entity_id','part_index','part_count','ordinal','record_hash','body'],rows,[],operationGuard));
    // The ordinal is only a serialization order. Concurrent appended IDs may
    // choose the same ordinal; normalize them inside this transaction without
    // using that global order as economic write authority.
    for(const collection of structural){
      const newIds=added.filter(entry=>entry.collection===collection).map(entry=>entry.entityId),appendOrder=`CASE WHEN entity_id IN (SELECT value FROM json_each(?)) THEN ${collection==='events'?'0 ELSE 1':'1 ELSE 0'} END, `;
      // Preserve each operation's append block. In particular an NPC item debit
      // and its following credit payment must remain adjacent for reward proof.
      statements.push(db.prepare(`WITH ranked AS (SELECT entity_id, ROW_NUMBER() OVER (ORDER BY ${appendOrder}ordinal, entity_id)-1 AS new_ordinal FROM world_partition_parts WHERE realm_id=? AND collection=? AND part_index=0) UPDATE world_partition_parts SET ordinal=(SELECT new_ordinal FROM ranked WHERE ranked.entity_id=world_partition_parts.entity_id) WHERE realm_id=? AND collection=? AND ordinal<>(SELECT new_ordinal FROM ranked WHERE ranked.entity_id=world_partition_parts.entity_id) AND ${operationGuard.sql}`).bind(JSON.stringify(newIds),realm,collection,realm,collection,...operationGuard.bindings));
      if(collection==='events')statements.push(db.prepare(`DELETE FROM world_partition_parts WHERE realm_id=? AND collection='events' AND ordinal>=150 AND ${operationGuard.sql}`).bind(realm,...operationGuard.bindings));
    }
    // Shared semantic indexes use an atomic increment, not the stale snapshot's
    // proposed number. They invalidate caches without serializing unrelated work.
    for(let index=0;index<versionRows.length;index+=24){const group=versionRows.slice(index,index+24);statements.push(db.prepare(`INSERT INTO world_entity_versions (realm_id,entity_key,version,fingerprint) SELECT * FROM (VALUES ${group.map(()=>'(?,?,?,?)').join(',')}) WHERE ${operationGuard.sql} ON CONFLICT (realm_id,entity_key) DO UPDATE SET version=world_entity_versions.version+1,fingerprint=excluded.fingerprint`).bind(...group.flat(),...operationGuard.bindings));}
    statements.push(db.prepare(`UPDATE world_partition_heads SET revision=revision+1,commit_token=?,record_count=(SELECT COUNT(*) FROM world_partition_parts WHERE realm_id=? AND part_index=0),part_count=(SELECT COUNT(*) FROM world_partition_parts WHERE realm_id=?),updated_at=? WHERE realm_id=? AND revision<? AND ${operationGuard.sql}`).bind(token,realm,realm,new Date().toISOString(),realm,Number.MAX_SAFE_INTEGER,...operationGuard.bindings));
    const publicIds=new Set<string>();
    for(const entry of [...removed,...changed]){
      if(entry.collection==='players')publicIds.add(entry.entityId);
      if(entry.collection==='jobs')publicIds.add((JSON.parse(entry.body) as {playerId:string}).playerId);
      if(entry.collection==='social/clans')throw new Error('Los cambios de clan requieren la liquidación global verificada.');
    }
    if(readPlane){
      statements.push(...await readPlane.publicMutations(world,record.revision+1,nextVersions,context.now,token,[...publicIds],operationGuard));
      statements.push(db.prepare(`UPDATE world_public_actor_heads SET source_revision=(SELECT revision FROM world_partition_heads WHERE realm_id=?) WHERE realm_id=? AND player_id IN (SELECT value FROM json_each(?)) AND ${operationGuard.sql}`).bind(realm,realm,JSON.stringify([...publicIds]),...operationGuard.bindings));
    }
    statements.push(db.prepare(`UPDATE world_read_model_state SET source_revision=(SELECT revision FROM world_partition_heads WHERE realm_id=?),commit_token=?,public_revision=${readPlane?'(SELECT revision FROM world_partition_heads WHERE realm_id=?)':'NULL'},public_token=?,actor_count=(SELECT COUNT(*) FROM world_partition_parts WHERE realm_id=? AND collection='players' AND part_index=0),entity_count=(SELECT COUNT(*) FROM world_entity_versions WHERE realm_id=?) WHERE realm_id=? AND ${operationGuard.sql}`).bind(realm,token,...(readPlane?[realm]:[]),readPlane?token:null,realm,realm,realm,...operationGuard.bindings));
    if(villageIndex&&snapshot.indexCurrent)statements.push(...await villageIndex.mutations(world,snapshot.records,next,token,operationGuard));
    const ledgerReadIndex=statements.length;
    if(local)statements.push(db.prepare(`SELECT p.collection,p.entity_id,p.ordinal FROM json_each(?) k CROSS JOIN world_partition_parts p ON p.realm_id=? AND p.collection=json_extract(k.value,'$[0]') AND p.entity_id=json_extract(k.value,'$[1]') AND p.part_index=0 WHERE ${operationGuard.sql}`).bind(JSON.stringify([...next.values()].map(entry=>[entry.collection,entry.entityId])),realm,...operationGuard.bindings));
    const headReadIndex=statements.length;
    statements.push(db.prepare(`SELECT revision FROM world_partition_heads WHERE realm_id=? AND ${operationGuard.sql}`).bind(realm,...operationGuard.bindings));
    statements.push(db.prepare('DELETE FROM world_village_write_operations WHERE realm_id=? AND operation_id=?').bind(realm,token));
    checkBudget(statements);
    const result=await writeD1Once('compareAndSwap',async()=>{try{const results=await db.batch(statements);assertBatch(results,statements.length);if(![0,1].includes(results[0].meta?.changes))fail();return results[0].meta.changes===1?results:null;}finally{observed=null;}});
    if(!result)return null;
    if(local){
      const head=result[headReadIndex].results?.[0] as {revision:number}|undefined;if(!head||!integer(head.revision))fail();const ledgerOrdinals={...local.snapshot.scope.ledgerOrdinals};for(const row of result[ledgerReadIndex].results??[]){const entry=row as {collection:string;entity_id:string;ordinal:number};const saved=next.get(worldRecordKey(entry.collection,entry.entity_id));if(saved){saved.ordinal=entry.ordinal;if(entry.collection==='social/ledger'){const id=(JSON.parse(saved.body) as {id:string}).id;ledgerOrdinals[id]=entry.ordinal;}}}
      const scope={...local.snapshot.scope,ledgerOrdinals,recordKeys:[...next.keys()],readVersions:{...nextVersions},dependencyKeys:Object.keys(nextVersions)};const output:VillageSnapshot={...local.snapshot,revision:head!.revision,token,state:world,entityVersions:nextVersions,scope};attachVillageEvidence(world,scope);villageObserved={snapshot:output,records:next,query:local.query};return output;
    }
    // A fresh SQL snapshot merges all already committed villages. Reuse hashes
    // only for byte-identical trusted records, never caller-mutated objects.
    observed={...snapshot,records:next,world,token};
    return read();
  }
  if(options.villageWrites)api.compareAndSwapVillage=async(record,world,context)=>{const result=await commitDelta(record,world,context);return result&&'kind'in result?null:result;};
  if(villageIndex&&readPlane){
    api.readVillage=async query=>{
      observed=null;villageObserved=null;maintenanceObserved=null;lastVillageRead=null;
      if(!query.ownerId||query.ownerId.length>256||!integer(query.now)){observeVillage('village','fallback','invalid-query');return null;}
      if(query.command&&!supportsVillageCommand(query.command)){lastVillageRead={query:{ownerId:query.ownerId,playerId:query.playerId,now:query.now},reason:'unsupported-command',metadata:[]};observeVillage('village','fallback','unsupported-command');return null;}
      const statements=villageIndex.statements(query);checkBudget(statements);const results=await readD1WithRetry(()=>db.batch(statements));let reason:VillageReadReason='invalid-records';
      const loaded=await villageIndex.decode(results,query,{onFallback:value=>{reason=value;}});
      if(!loaded){lastVillageRead={query:{ownerId:query.ownerId,playerId:query.playerId,now:query.now},reason,metadata:results.slice(0,2)};observeVillage('village','fallback',reason);return null;}
      try{assertVillageExecutionClosure(loaded.snapshot.state,query.command,query.now);}catch{reason=query.command?'unsupported-command':'unsupported-closure';lastVillageRead={query:{ownerId:query.ownerId,playerId:query.playerId,now:query.now},reason,metadata:results.slice(0,2)};observeVillage('village','fallback',reason);return null;}
      villageObserved={...loaded,query};observeVillage('village','covered','covered');return loaded.snapshot;
    };
    api.commitVillage=async(record,state,context)=>{const local=villageObserved;if(record.scope.mode==='maintenance'||!local||local.snapshot!==record)return null;const readVersions={...record.scope.readVersions};delete readVersions['lectura:compartida'];const result=await commitDelta(record,state,{...context,playerId:record.scope.playerId,readVersions},local);return result&&'kind'in result?result:null;};
    api.readVillageMaintenance=async query=>{
      const previous=lastVillageRead;observed=null;villageObserved=null;maintenanceObserved=null;lastVillageRead=null;
      const reject=(reason:VillageReadReason)=>{observeVillage('maintenance','fallback',reason);return null;};
      if(!query.ownerId||query.ownerId.length>256||!integer(query.now))return reject('invalid-query');
      if(Object.hasOwn(query,'command')||Object.hasOwn(query,'requestId'))return reject('unsupported-command');
      const sameRequest=previous&&previous.query.ownerId===query.ownerId&&previous.query.playerId===query.playerId&&previous.query.now===query.now;
      if(sameRequest&&previous.reason!=='shared-deadline')return reject(previous.reason);
      let metadata:PartitionD1Result[];
      if(sameRequest)metadata=previous.metadata;
      else{
        // A cold maintenance lookup first proves the requesting village's normal
        // admission. These are scoped records, never an implicit global read.
        const originalStatements=villageIndex.statements(query);checkBudget(originalStatements);const original=await readD1WithRetry(()=>db.batch(originalStatements));let originalReason:VillageReadReason='invalid-records';
        const admitted=await villageIndex.decode(original,query,{onFallback:value=>{originalReason=value;}});
        if(admitted)return reject('maintenance-unavailable');if((originalReason as VillageReadReason)!=='shared-deadline')return reject(originalReason);metadata=original.slice(0,2);
      }
      const target=villageIndex.maintenanceTarget(metadata,query);if(!target)return reject('maintenance-unavailable');
      const participantQuery:VillageReadQuery={...target,now:query.now},statements=villageIndex.statements(participantQuery);checkBudget(statements);let reason:VillageReadReason='invalid-records';
      const loaded=await villageIndex.decode(await readD1WithRetry(()=>db.batch(statements)),participantQuery,{mode:'maintenance',onFallback:value=>{reason=value;}});if(!loaded)return reject(reason);
      try{assertVillageExecutionClosure(loaded.snapshot.state,undefined,query.now);}catch{return reject('unsupported-closure');}
      const leases=villageIndex.maintenanceLeases(loaded.snapshot,query.now);if(!leases.length){observeVillage('maintenance','retry','maintenance-race');return Object.freeze({kind:'village-maintenance-retry' as const});}
      const record:VillageMaintenanceRecord={kind:'village-maintenance',snapshot:loaded.snapshot,leases},readVersions={...loaded.snapshot.scope.readVersions};delete readVersions['lectura:compartida'];
      maintenanceObserved={record,local:{...loaded,query:participantQuery},context:{ownerId:target.ownerId,playerId:target.playerId,now:query.now,readVersions}};
      observeVillage('maintenance','covered','covered');return record;
    };
    api.commitVillageMaintenance=async(record,state)=>{
      const grant=maintenanceObserved;maintenanceObserved=null;villageObserved=null;observed=null;
      if(!grant||grant.record!==record||grant.local.snapshot!==record.snapshot)return false;
      if(Object.keys(state.receipts).length)throw new Error('El mantenimiento interno no puede confirmar un recibo de acción.');
      try{return!!await commitDelta(grant.local.snapshot,state,grant.context,grant.local);}finally{villageObserved=null;observed=null;maintenanceObserved=null;}
    };
    api.projectVillageView=(record,ownerId,now,playerId)=>{if(record.scope.mode==='maintenance')throw new Error('Un contexto interno de mantenimiento no se puede proyectar.');return readPlane.projectVillage(record,ownerId,now,playerId);};
  }
  if(readPlane){
    api.readPlayerView=(ownerId,playerId,now)=>readPlane.read(ownerId,playerId,now);
    api.projectPlayerView=async(record,ownerId,now,playerId)=>{
      const snapshot=observed;
      if(!snapshot||snapshot.source!=='partitioned'||snapshot.revision!==record.revision)return readPlane.project(record,ownerId,now,playerId,'',[]);
      if(!snapshot.metadataCurrent||!snapshot.publicCurrent){
        const fingerprints=snapshot.metadataCurrent?snapshot.fingerprints:await versionFingerprints(record.world,snapshot.versions);
        const statements=[...metadataMutations(snapshot.versions,fingerprints,snapshot.metadataCurrent?snapshot:null,record.revision,snapshot.token,Object.keys(record.world.players).length),...await readPlane.publicMutations(record.world,record.revision,snapshot.versions,now,snapshot.token,Object.keys(record.world.players))];
        if(statements.length>maxBatch)return readPlane.project(record,ownerId,now,playerId,'',[]);
        await writeD1Once('compareAndSwap',async()=>{const results=await db.batch(statements);assertBatch(results,statements.length);});
        snapshot.fingerprints=fingerprints;snapshot.metadataCurrent=true;snapshot.publicCurrent=true;
      }
      return readPlane.project({...record,entityVersions:snapshot.versions},ownerId,now,playerId,snapshot.token,Object.keys(selectPlayerViewVersionKeys(record.world,ownerId,snapshot.versions)));
    };
  }
  return api;
}
