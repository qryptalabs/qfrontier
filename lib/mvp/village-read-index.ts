import type {PartitionD1Database,PartitionD1Statement} from './partitioned-store.ts';
import type {WorldRecord} from './partitioned-codec.ts';
import {hashRecord,splitUtf8,worldRecordKey} from './partitioned-codec.ts';
import type {ReadModelWriteGuard} from './player-read-model.ts';
import type {MvpWorld} from './types.ts';
import type {VillageReadQuery,VillageSnapshot,VillageIdentity,VillageExtractionFact,VillageReadReason,VillageLeaseRef} from './village-snapshot.ts';
import {decodeVillageRecords} from './village-snapshot.ts';
import {attachVillageEvidence} from './village-evidence.ts';
import {plotForIndex} from './settlements.ts';

export interface IndexedRecord extends WorldRecord {hash:string;parts:string[]}
interface IndexRow {collection:string;entity_id:string;record_hash:string;owner_id:string|null;player_id:string|null;kind:string|null;status:string|null;resource_key:string|null;from_id:string|null;to_id:string|null;due_at:number|null;facts_json:string}
interface Part {collection:string;entity_id:string;part_index:number;part_count:number;ordinal:number;record_hash:string;body:string}
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const SHARED="(i.collection LIKE 'social/%' AND i.collection NOT IN ('social/accounts','social/activity','social/ledger'))";
export function createVillageReadIndex(db:PartitionD1Database,realm:string,chunkBytes:number){
  async function mutations(world:MvpWorld,previous:Map<string,IndexedRecord>,next:Map<string,IndexedRecord>,token:string,authority?:ReadModelWriteGuard):Promise<PartitionD1Statement[]>{
    const guard=authority??{sql:'EXISTS (SELECT 1 FROM world_partition_heads WHERE realm_id=? AND commit_token=?)',bindings:[realm,token]},changed=[...next].filter(([key,value])=>previous.get(key)?.body!==value.body).map(([,value])=>value),removed=[...previous].filter(([key])=>!next.has(key)).map(([,value])=>value);
    const rows:unknown[][]=[],participants:unknown[][]=[],factRows:unknown[][]=[],playerChanges:string[]=[],ledgerChanges:string[]=[];
    const offers=new Map(world.social.offers.map(offer=>[offer.id,offer]));
    for(const record of changed){
      const value=JSON.parse(record.body) as Record<string,unknown>;let owner:string|null=null,player:string|null=null,kind:string|null=null,status:string|null=null,resource:string|null=null,from:string|null=null,to:string|null=null,due:number|null=null,facts:unknown={};
      if(record.collection==='players'){
        const p=world.players[record.entityId];owner=p.ownerId;player=p.id;status=p.faction;from=p.name;to=p.stationName;facts={id:p.id,ownerId:p.ownerId,name:p.name,stationName:p.stationName,faction:p.faction,plot:p.settlement??null};playerChanges.push(p.id);
        const district=p.habitable?.job,deadlines=[...(district?.status==='active'?[district.expiresAt]:[]),...(p.habitable?.commerce?.contracts??[]).flatMap(c=>c.status==='accepted'?[c.deadline]:c.status==='in_transit'&&c.caravan.delivery?[c.caravan.delivery.unloadsAt]:[])];if(deadlines.length)due=Math.min(...deadlines);
        const fleet=p.habitable?.commerce?.contracts??[];if(fleet.length){const body=JSON.stringify(fleet),pieces=splitUtf8(body,chunkBytes),hash=await hashRecord(body);facts={...facts as Record<string,unknown>,fleetCount:fleet.length,fleetHash:hash};pieces.forEach((part,index)=>factRows.push([realm,'fleet',p.id,index,pieces.length,hash,part]));}
      }else if(record.collection==='jobs'){
        const job=world.jobs[record.entityId];player=job.playerId;owner=world.players[player]?.ownerId??null;kind=job.kind;status=job.status;
        if(kind==='extract'){resource=`${String(job.payload.tileId)}:${String(job.payload.itemId)}`;if(status==='running'||status==='reserved'){due=job.endsAt;facts={id:job.id,playerId:player,ownerId:owner,kind:'extract',status,endsAt:job.endsAt,payload:{tileId:String(job.payload.tileId),itemId:String(job.payload.itemId),qty:Number(job.payload.qty)}};}}
      }else if(record.collection==='battles'){const battle=world.battles[record.entityId];player=battle.attackerId;from=battle.targetId;to=String(world.jobs[battle.jobId]?.payload.defenderPlayerId??'');status=battle.status;}
      else if(record.collection==='convoys'){const convoy=world.convoys[record.entityId];player=convoy.playerId;status=convoy.exposed?'public':'private';}
      else if(record.collection==='social/accounts'||record.collection==='social/activity'){player=record.entityId;owner=world.players[player]?.ownerId??null;}
      else if(record.collection==='receipts')owner=record.entityId.slice(0,record.entityId.lastIndexOf(':'));
      else if(record.collection==='social/clans'){facts={members:Object.keys(value.members as Record<string,string>)};}
      else if(record.collection==='social/ledger'){
        from=String(value.from);to=String(value.to);ledgerChanges.push(record.entityId);const related=new Set([from,to]),offer=offers.get(from);if(offer){related.add(offer.makerId);if(offer.takerId)related.add(offer.takerId);}for(const clan of world.social.clans)if(related.has(clan.id))for(const id of Object.keys(clan.members))related.add(id);for(const id of related)if(world.players[id])participants.push([realm,record.entityId,id]);
      }
      if(record.collection.startsWith('social/')&&!['social/accounts','social/activity','social/ledger'].includes(record.collection)){
        status=String(value.status??value.state??'');const deadlines:number[]=[];
        if(record.collection==='social/offers'&&status==='open'){deadlines.push(Number(value.expiresAt));for(const lot of value.lots as {expiresAt:number|null}[])if(lot.expiresAt!==null)deadlines.push(lot.expiresAt);}
        if(record.collection==='social/contracts'&&['published','accepted'].includes(status))deadlines.push(Number(value.deadline)+1);
        if(record.collection==='social/clans')for(const withdrawal of value.withdrawals as {status:string;expiresAt:number}[])if(withdrawal.status==='pending')deadlines.push(withdrawal.expiresAt+1);
        if(record.collection==='social/projects'&&status==='open')deadlines.push(Number(value.deadline)+1);
        if(record.collection==='social/alliances'&&status!=='ended')deadlines.push(Number(value.expiresAt)+1);
        if(record.collection==='social/funding'){if(status==='open')deadlines.push(Number(value.fundingDeadline));if(['funded','delivering'].includes(status))deadlines.push(Number(value.deliveryDeadline));}
        if(record.collection==='social/outposts'&&status!=='expired'){deadlines.push(Number(value.expiresAt));if(status==='active')deadlines.push(Number(value.maintenanceUntil));}
        if(deadlines.length)due=Math.min(...deadlines);
      }
      rows.push([realm,record.collection,record.entityId,record.hash,owner,player,kind,status,resource,from,to,due,JSON.stringify(facts)]);
    }
    const statements:PartitionD1Statement[]=[];
    const insertJson=(table:string,columns:string[],data:unknown[][])=>{
      const emit=(group:string[])=>{const update=columns.filter(c=>!['realm_id','collection','entity_id'].includes(c)).map(c=>`${c}=excluded.${c}`).join(',');statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?) WHERE ${guard.sql}${table==='world_village_record_index'?` ON CONFLICT(realm_id,collection,entity_id) DO UPDATE SET ${update}`:''}`).bind(`[${group.join(',')}]`,...guard.bindings));};
      let group:string[]=[],bytes=2;for(const row of data){const encoded=JSON.stringify(row),size=new TextEncoder().encode(encoded).byteLength;if(size>1_000_000)throw new Error('Un hecho del índice supera el presupuesto de lectura acotada. No se ha modificado el guardado.');if(group.length&&(group.length===256||bytes+size+1>1_000_000)){emit(group);group=[];bytes=2;}group.push(encoded);bytes+=size+1;}if(group.length)emit(group);
    };
    // SQL caps the merged chronicle, so a concurrent append can remove a row absent from this delta's removals.
    if(removed.length||changed.some(record=>record.collection==='events'))statements.push(db.prepare(`DELETE FROM world_village_record_index WHERE realm_id=? AND (collection='events' OR (collection,entity_id) IN (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?))) AND NOT EXISTS (SELECT 1 FROM world_partition_parts p WHERE p.realm_id=world_village_record_index.realm_id AND p.collection=world_village_record_index.collection AND p.entity_id=world_village_record_index.entity_id AND p.part_index=0) AND ${guard.sql}`).bind(realm,JSON.stringify(removed.map(record=>[record.collection,record.entityId])),...guard.bindings));
    insertJson('world_village_record_index',['realm_id','collection','entity_id','record_hash','owner_id','player_id','kind','status','resource_key','from_id','to_id','due_at','facts_json'],rows);
    if(ledgerChanges.length){statements.push(db.prepare(`DELETE FROM world_village_ledger_participants WHERE realm_id=? AND entity_id IN (SELECT value FROM json_each(?)) AND ${guard.sql}`).bind(realm,JSON.stringify(ledgerChanges),...guard.bindings));insertJson('world_village_ledger_participants',['realm_id','entity_id','player_id'],participants);}
    if(playerChanges.length){statements.push(db.prepare(`DELETE FROM world_village_fact_parts WHERE realm_id=? AND kind='fleet' AND entity_id IN (SELECT value FROM json_each(?)) AND ${guard.sql}`).bind(realm,JSON.stringify(playerChanges),...guard.bindings));insertJson('world_village_fact_parts',['realm_id','kind','entity_id','part_index','part_count','record_hash','body'],factRows);}
    statements.push(db.prepare(`INSERT INTO world_village_index_state(realm_id,source_revision,commit_token,record_count,participant_count,format) SELECT realm_id,revision,commit_token,(SELECT COUNT(*) FROM world_village_record_index i WHERE i.realm_id=h.realm_id),(SELECT COUNT(*) FROM world_village_ledger_participants lp WHERE lp.realm_id=h.realm_id),1 FROM world_partition_heads h WHERE realm_id=? AND ${guard.sql} ON CONFLICT(realm_id) DO UPDATE SET source_revision=excluded.source_revision,commit_token=excluded.commit_token,record_count=excluded.record_count,participant_count=excluded.participant_count`).bind(realm,...guard.bindings));return statements;
  }
  const selection=`(i.collection IN ('$root','tiles','regions','events') OR ${SHARED} OR i.collection='players' AND i.owner_id=? OR i.collection IN ('jobs','social/accounts','social/activity','convoys','battles') AND i.player_id IN (SELECT entity_id FROM world_village_record_index WHERE realm_id=? AND collection='players' AND owner_id=?) OR i.collection='receipts' AND i.entity_id=? OR i.collection='social/ledger' AND (i.entity_id IN (SELECT entity_id FROM world_village_ledger_participants WHERE realm_id=? AND player_id IN (SELECT entity_id FROM world_village_record_index WHERE realm_id=? AND collection='players' AND owner_id=?)) OR EXISTS(SELECT 1 FROM world_partition_parts prev JOIN world_village_ledger_participants lp ON lp.realm_id=prev.realm_id AND lp.entity_id=prev.entity_id WHERE prev.realm_id=i.realm_id AND prev.collection='social/ledger' AND prev.part_index=0 AND lp.player_id IN (SELECT entity_id FROM world_village_record_index WHERE realm_id=? AND collection='players' AND owner_id=?) AND prev.ordinal+1=(SELECT ordinal FROM world_partition_parts p0 WHERE p0.realm_id=i.realm_id AND p0.collection=i.collection AND p0.entity_id=i.entity_id AND p0.part_index=0))))`;
  const clanLedgerSelection="(i.collection='social/ledger' AND EXISTS (SELECT 1 FROM world_village_record_index c JOIN json_each(c.facts_json,'$.members') member WHERE c.realm_id=i.realm_id AND c.collection='social/clans' AND c.entity_id IN (i.from_id,i.to_id) AND member.value IN (SELECT entity_id FROM world_village_record_index WHERE realm_id=c.realm_id AND collection='players' AND owner_id=?)))";
  function statements(query:VillageReadQuery):PartitionD1Statement[]{
    const owner=query.ownerId,receipt=query.requestId?`${owner}:${query.requestId}`:'';
    return [
      db.prepare('SELECT h.*,m.actor_count,s.record_count AS indexed_count FROM world_partition_heads h JOIN world_read_model_state m ON m.realm_id=h.realm_id AND m.source_revision=h.revision AND m.commit_token=h.commit_token JOIN world_village_index_state s ON s.realm_id=h.realm_id AND s.source_revision=h.revision AND s.commit_token=h.commit_token AND s.format=1 WHERE h.realm_id=? AND s.record_count=h.record_count AND s.record_count=(SELECT COUNT(*) FROM world_village_record_index WHERE realm_id=h.realm_id) AND s.participant_count=(SELECT COUNT(*) FROM world_village_ledger_participants WHERE realm_id=h.realm_id) AND m.entity_count=(SELECT COUNT(*) FROM world_entity_versions WHERE realm_id=h.realm_id)').bind(realm),
      db.prepare("SELECT i.*,p.ordinal,p.record_hash AS actual_hash FROM world_village_record_index i CROSS JOIN world_partition_parts p ON p.realm_id=i.realm_id AND p.collection=i.collection AND p.entity_id=i.entity_id AND p.part_index=0 WHERE i.realm_id=? AND (i.collection='players' OR i.collection='jobs' AND i.kind='extract' AND i.status IN ('running','reserved') OR i.due_at IS NOT NULL OR i.collection='battles') ORDER BY i.collection,p.ordinal").bind(realm),
      db.prepare(`SELECT p.collection,p.entity_id,p.part_index,p.part_count,p.ordinal,p.record_hash,p.body FROM world_village_record_index i CROSS JOIN world_partition_parts p ON i.realm_id=p.realm_id AND i.collection=p.collection AND i.entity_id=p.entity_id AND i.record_hash=p.record_hash WHERE i.realm_id=? AND (${selection} OR ${clanLedgerSelection}) ORDER BY p.collection,p.entity_id,p.part_index`).bind(realm,owner,realm,owner,receipt,realm,realm,owner,realm,owner,owner),
      db.prepare("SELECT * FROM world_village_fact_parts WHERE realm_id=? AND kind='fleet' ORDER BY entity_id,part_index").bind(realm),
      db.prepare(`SELECT entity_key,version FROM world_entity_versions v WHERE realm_id=? AND (
        entity_key IN ('politicas','lectura:compartida','lectura:social','mapa:topologia','transporte:flota',?,?,?)
        OR entity_key LIKE 'recurso:%' OR entity_key LIKE 'npc:%' OR entity_key LIKE 'indice:extraccion:%'
        OR entity_key LIKE 'oferta:%' OR entity_key LIKE 'contrato:%' OR entity_key LIKE 'clan:%' OR entity_key LIKE 'retiro:%'
        OR entity_key LIKE 'proyecto:%' OR entity_key LIKE 'alianza:%' OR entity_key LIKE 'puesto:%' OR entity_key LIKE 'financiacion:%' OR entity_key LIKE 'temporada:%'
        OR entity_key LIKE 'indice:clanes:%' OR entity_key LIKE 'indice:alianzas:%' OR entity_key LIKE 'indice:puestos:%' OR entity_key LIKE 'indice:proyecto:%'
        OR EXISTS (SELECT 1 FROM world_village_record_index o WHERE o.realm_id=v.realm_id AND o.collection='players' AND o.owner_id=? AND v.entity_key IN ('aldea:'||o.entity_id,'trabajos:'||o.entity_id,'actividad:'||o.entity_id,'cartera:'||o.entity_id,'identidad:jugador:'||o.entity_id,'indice:ofertas-abiertas:'||o.entity_id,'indice:membresia:'||o.entity_id,'indice:batallas:'||o.entity_id)))`).bind(realm,`cuenta:${owner}`,`identidad:cuenta:${owner}`,`lectura:privada:${owner}`,owner),
      db.prepare(`SELECT COUNT(*) AS n FROM world_village_record_index i WHERE i.realm_id=? AND (${selection} OR ${clanLedgerSelection})`).bind(realm,owner,realm,owner,receipt,realm,realm,owner,realm,owner,owner),
      db.prepare("SELECT v.entity_key,v.version FROM world_entity_versions v JOIN world_village_record_index i ON i.realm_id=v.realm_id AND (i.collection='players' AND v.entity_key='identidad:jugador:'||i.entity_id OR i.collection='jobs' AND v.entity_key='trabajo:'||i.entity_id) WHERE i.realm_id=? AND i.owner_id=?").bind(realm,owner),
    ];
  }
  function maintenanceTarget(results:{success:boolean;results?:unknown[]}[],query:VillageReadQuery):{ownerId:string;playerId:string}|null{
    if(results.length<2||results.slice(0,2).some(result=>!result.success)||results[0].results?.length!==1)return null;
    const head=results[0].results[0] as {actor_count:number},index=results[1].results as (IndexRow&{ordinal:number;actual_hash:string})[];
    if(index.some(row=>row.record_hash!==row.actual_hash))return null;
    const players=index.filter(row=>row.collection==='players'),own=players.filter(row=>row.owner_id===query.ownerId),requester=query.playerId?own.find(row=>row.entity_id===query.playerId):own[0];
    if(!requester||own.length>2||players.length!==head.actor_count)return null;
    const due=index.filter(row=>row.due_at!==null&&row.due_at<=query.now&&row.player_id!==requester.entity_id);
    // Shared political/escrow deadlines keep the complete audited path. This
    // boundary only advances an actual participant's ordinary village read.
    const supported=(row:IndexRow)=>row.collection==='players'||row.collection==='jobs'&&row.kind==='extract'&&(row.status==='running'||row.status==='reserved');
    if(due.some(row=>!supported(row)))return null;
    const first=due.filter(supported).sort((a,b)=>a.due_at!-b.due_at!||a.entity_id.localeCompare(b.entity_id))[0];if(!first?.player_id)return null;
    const owner=players.find(row=>row.entity_id===first.player_id);if(!owner?.owner_id||first.owner_id!==null&&first.owner_id!==owner.owner_id)return null;
    return{ownerId:owner.owner_id,playerId:owner.entity_id};
  }
  function maintenanceLeases(snapshot:VillageSnapshot,now:number):VillageLeaseRef[]{
    const id=snapshot.scope.playerId,leases:VillageLeaseRef[]=[],player=snapshot.state.players[id];
    for(const job of Object.values(snapshot.state.jobs))if(job.playerId===id&&job.kind==='extract'&&(job.status==='running'||job.status==='reserved')&&job.endsAt<=now)leases.push({kind:'extract',id:job.id,playerId:id,dueAt:job.endsAt});
    const district=player?.habitable?.job;if(district?.status==='active'&&district.expiresAt<=now)leases.push({kind:'district',id:district.id,playerId:id,dueAt:district.expiresAt});
    for(const trade of player?.habitable?.commerce?.contracts??[]){const due=trade.status==='accepted'?trade.deadline:trade.status==='in_transit'?trade.caravan.delivery?.unloadsAt:undefined;if(due!==undefined&&due<=now)leases.push({kind:'trade',id:trade.id,playerId:id,dueAt:due});}
    return leases.sort((a,b)=>a.dueAt-b.dueAt||a.id.localeCompare(b.id));
  }
  async function decode(results:{success:boolean;results?:unknown[]}[],query:VillageReadQuery,options:{mode?:'maintenance';onFallback?:(reason:VillageReadReason)=>void}={}):Promise<{snapshot:VillageSnapshot;records:Map<string,IndexedRecord>}|null>{
    const reject=(reason:VillageReadReason)=>{options.onFallback?.(reason);return null;};
    if(results.length!==7||results.some(r=>!r.success)||results[0].results?.length!==1)return reject('index-unavailable');
    const head=results[0].results[0] as {revision:number;commit_token:string;actor_count:number},index=results[1].results as (IndexRow&{ordinal:number;actual_hash:string})[],parts=results[2].results as Part[];
    if(index.some(row=>row.record_hash!==row.actual_hash))return reject('index-unavailable');
    const players=index.filter(row=>row.collection==='players'),own=players.filter(row=>row.owner_id===query.ownerId);if(!own.length||own.length>2||players.length!==head.actor_count)return reject('ownership');if(parts.length>8192)return reject('size-budget');
    const target=query.playerId?own.find(row=>row.entity_id===query.playerId):own[0];if(!target)return reject('ownership');
    const ownIds=new Set(own.map(row=>row.entity_id));if(index.some(row=>row.collection==='battles'&&(row.status==='scheduled'&&[row.player_id,row.from_id,row.to_id].some(id=>id&&ownIds.has(id))||!ownIds.has(row.player_id!)&&[row.from_id,row.to_id].some(id=>id&&ownIds.has(id)))))return reject('battle');
    const foreignDue=index.filter(row=>row.due_at!==null&&row.due_at<=query.now&&(!row.player_id||row.player_id!==target.entity_id));
    const groups=new Map<string,Part[]>();let bytes=0;for(const part of parts){bytes+=new TextEncoder().encode(part.body).length;if(bytes>16_000_000)return reject('size-budget');const key=worldRecordKey(part.collection,part.entity_id),group=groups.get(key)??[];group.push(part);groups.set(key,group);}
    const records=new Map<string,IndexedRecord>();for(const[key,group]of groups){const first=group[0];if(!integer(first.part_count)||group.length!==first.part_count||group.some((part,i)=>part.part_index!==i||part.part_count!==group.length||part.record_hash!==first.record_hash||part.ordinal!==first.ordinal))return null;const body=group.map(part=>part.body).join('');if(await hashRecord(body)!==first.record_hash)throw new Error('El contexto de aldea contiene un registro alterado.');records.set(key,{collection:first.collection,entityId:first.entity_id,ordinal:first.ordinal,hash:first.record_hash,body,parts:group.map(part=>part.body)});}
    if(records.size!==Number((results[5].results?.[0] as {n:number})?.n))return reject('invalid-records');
    const state=decodeVillageRecords([...records.values()]);if(state.adminOwnerId===query.ownerId)return reject('administrator');
    // Historical clan-ledger membership has not been migrated to a permanent
    // relation index. Preserve the complete global read path for these owners.
    if(state.social.clans.some(clan=>[...ownIds].some(id=>Object.hasOwn(clan.members,id))))return reject('clan');
    const identities:Record<string,VillageIdentity>={},playerOrdinals:Record<string,number>={},usedPlots=new Set<number>();
    for(const row of players){const facts=JSON.parse(row.facts_json) as VillageIdentity&{plot?:ReturnType<typeof plotForIndex>};const plot=facts.plot;
      if(!plot||!integer(plot.index)||plot.index>1_000_000_000||usedPlots.has(plot.index)||Object.entries(plotForIndex(plot.index)).some(([key,value])=>plot[key as keyof typeof plot]!==value))return reject('plot-repair');
      usedPlots.add(plot.index);identities[row.entity_id]={id:facts.id,ownerId:facts.ownerId,name:facts.name,stationName:facts.stationName,faction:facts.faction};playerOrdinals[row.entity_id]=row.ordinal;}
    if(Object.keys(state.players).length!==own.length||Object.values(state.players).some(p=>p.ownerId!==query.ownerId)||Object.keys(state.tiles).length!==81||Object.keys(state.regions).length!==9)return reject('ownership');
    const fleet:VillageSnapshot['scope']['commerceFleet']=[],factGroups=new Map<string,{part_index:number;part_count:number;record_hash:string;body:string}[]>();for(const raw of results[3].results??[]){const row=raw as {entity_id:string;part_index:number;part_count:number;record_hash:string;body:string},group=factGroups.get(row.entity_id)??[];group.push(row);factGroups.set(row.entity_id,group);}
    const expectedFleet=new Map(players.flatMap(row=>{const facts=JSON.parse(row.facts_json) as {fleetCount?:number;fleetHash?:string};return facts.fleetCount?[[row.entity_id,facts] as const]:[];}));
    if(factGroups.size!==expectedFleet.size)return reject('fleet-incomplete');
    for(const[id,group]of factGroups){const expected=expectedFleet.get(id);if(!expected||group.length!==group[0].part_count||group[0].record_hash!==expected.fleetHash||group.some((row,i)=>row.part_index!==i||row.part_count!==group.length||row.record_hash!==group[0].record_hash))return null;const body=group.map(row=>row.body).join('');if(await hashRecord(body)!==group[0].record_hash)return null;const entries=JSON.parse(body) as typeof fleet;if(!Array.isArray(entries)||entries.length!==expected.fleetCount)return null;fleet.push(...entries);}
    const entityVersions:Record<string,number>={};for(const raw of [...results[4].results??[],...results[6].results??[]]){const row=raw as {entity_key:string;version:number};if(!integer(row.version)||row.version<1)return null;entityVersions[row.entity_key]=row.version;}
    if(!Object.hasOwn(entityVersions,'lectura:social'))return reject('index-unavailable');
    if(Object.keys(entityVersions).length>2048)return reject('version-budget');
    // Admission and complete coverage precede deadline assistance. A corrupt,
    // administrative or clan context cannot borrow a neighbor's authority first.
    if(options.mode!=='maintenance'&&foreignDue.length)return reject('shared-deadline');
    if(options.mode==='maintenance'&&foreignDue.some(row=>row.collection!=='players'&&!(row.collection==='jobs'&&row.kind==='extract'&&(row.status==='running'||row.status==='reserved'))))return reject('unsupported-closure');
    const ledgerOrdinals:Record<string,number>={};for(const record of records.values())if(record.collection==='social/ledger'){const entry=JSON.parse(record.body) as {id:string};ledgerOrdinals[entry.id]=record.ordinal;}
    const extractionJobs=index.filter(row=>row.collection==='jobs'&&row.kind==='extract'&&!ownIds.has(row.player_id!)).map(row=>JSON.parse(row.facts_json) as VillageExtractionFact),future=index.flatMap(row=>row.due_at!==null&&row.due_at>query.now?[row.due_at]:[]),sharedNextDueAt=future.length?Math.min(...future):null;
    const scope:VillageSnapshot['scope']={...(options.mode?{mode:options.mode}:{}),ownerId:query.ownerId,playerId:target.entity_id,profileIds:[...ownIds],totalPlayerCount:players.length,recordKeys:[...records.keys()],ledgerOrdinals,identities,commerceFleet:fleet,extractionJobs,sharedNextDueAt,nextSharedDueAt:sharedNextDueAt,playerOrdinals,readVersions:{...entityVersions},dependencyKeys:Object.keys(entityVersions),sharedComplete:true,complete:{profiles:true,ownJobs:true,ownLedger:true,ownAccounts:true,resources:true,extractionJobs:true,sharedSocial:true,ownBattles:true,fleet:true}};
    const snapshot:VillageSnapshot={kind:'village',revision:head.revision,token:head.commit_token,state,entityVersions,scope,facts:{identityDirectory:identities,extractionClosure:true}};attachVillageEvidence(state,scope);return{snapshot,records};
  }
  return{mutations,statements,decode,maintenanceTarget,maintenanceLeases};
}
